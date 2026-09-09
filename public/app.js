const state = {
  weeks: [],
  currentWeek: null,
  slides: [],
  scripts: {},
  currentSlide: null,
  voices: [],
};

const el = (id) => document.getElementById(id);

function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function loadWeeks() {
  const data = await api('/api/weeks');
  state.weeks = data.weeks;
  renderWeekTabs();
  const first = state.weeks.find(w => w.hasFile) || state.weeks[0];
  if (first) selectWeek(first.id);
}

function renderWeekTabs() {
  const wrap = el('weekTabs');
  wrap.innerHTML = '';
  state.weeks.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'week-tab' + (w.id === state.currentWeek ? ' active' : '') + (!w.hasFile ? ' no-file' : '');
    btn.textContent = w.label + (w.hasFile ? '' : '（資料未登録）');
    btn.onclick = () => selectWeek(w.id);
    wrap.appendChild(btn);
  });
}

async function selectWeek(weekId) {
  state.currentWeek = weekId;
  renderWeekTabs();
  const week = state.weeks.find(w => w.id === weekId);

  el('uploadBox').style.display = week && week.hasFile ? 'none' : 'block';
  el('slideEditor').style.display = 'none';
  el('slideList').innerHTML = '';

  if (!week || !week.hasFile) return;

  const [slidesData, scriptsData] = await Promise.all([
    api(`/api/slides?week=${weekId}`),
    api(`/api/scripts?week=${weekId}`),
  ]);
  state.slides = slidesData.slides;
  state.scripts = scriptsData.scripts;
  renderSlideList();
  if (state.slides.length) selectSlide(state.slides[0].slideNumber);
}

function renderSlideList() {
  const list = el('slideList');
  list.innerHTML = '';
  state.slides.forEach(s => {
    const row = document.createElement('div');
    row.className = 'slide-thumb' + (s.slideNumber === state.currentSlide ? ' active' : '');
    row.innerHTML = `
      <img src="/preview/${state.currentWeek}/slide_${String(s.slideNumber).padStart(2, '0')}.png" loading="lazy" />
      <div class="meta">
        <div class="num">Slide ${s.slideNumber}</div>
        <div class="${state.scripts[s.slideNumber] ? 'has-script' : 'no-script'}">
          ${state.scripts[s.slideNumber] ? '台本あり' : '台本なし'}
        </div>
      </div>`;
    row.onclick = () => selectSlide(s.slideNumber);
    list.appendChild(row);
  });
}

function selectSlide(num) {
  state.currentSlide = num;
  renderSlideList();
  el('slideEditor').style.display = 'block';
  el('slideTitle').textContent = `スライド ${num}`;
  el('slideImg').src = `/preview/${state.currentWeek}/slide_${String(num).padStart(2, '0')}.png`;
  el('scriptInput').value = state.scripts[num] || '';
  el('editorStatus').textContent = '';
  el('previewAudioEl').style.display = 'none';
}

async function saveScript() {
  const num = state.currentSlide;
  state.scripts[num] = el('scriptInput').value;
  el('editorStatus').textContent = '保存中...';
  el('editorStatus').className = 'status-msg';
  try {
    await api('/api/scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: state.currentWeek, scripts: state.scripts }),
    });
    el('editorStatus').textContent = '保存しました';
    el('editorStatus').className = 'status-msg ok';
    renderSlideList();
  } catch (e) {
    el('editorStatus').textContent = '保存失敗: ' + e.message;
    el('editorStatus').className = 'status-msg err';
  }
}

async function previewAudio() {
  const text = el('scriptInput').value;
  if (!text.trim()) return toast('台本が空です');
  const btn = el('previewAudioBtn');
  btn.disabled = true;
  el('editorStatus').textContent = '音声を生成中...';
  el('editorStatus').className = 'status-msg';
  try {
    const res = await api('/api/preview-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId: el('voiceSelect').value, speed: Number(el('speedRange').value) }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audioEl = el('previewAudioEl');
    audioEl.src = url;
    audioEl.style.display = 'inline-block';
    audioEl.play();
    el('editorStatus').textContent = '';
  } catch (e) {
    el('editorStatus').textContent = '試聴失敗: ' + e.message;
    el('editorStatus').className = 'status-msg err';
  } finally {
    btn.disabled = false;
  }
}

async function loadVoices() {
  try {
    const data = await api('/api/voices');
    state.voices = data.voices;
    const sel = el('voiceSelect');
    data.voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.title;
      sel.appendChild(opt);
    });
  } catch (e) {
    // FISHAUDIO_API_KEY未設定でも画面は使えるようにする
    console.warn('ボイス一覧の取得に失敗:', e.message);
  }
}

async function startExport() {
  if (!state.currentWeek) return;
  const btn = el('exportBtn');
  btn.disabled = true;
  el('progressWrap').style.display = 'block';
  el('downloadLink').style.display = 'none';
  el('exportStatus').textContent = '';
  el('exportStatus').className = 'status-msg';

  try {
    const { jobId } = await api('/api/export/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week: state.currentWeek,
        voiceId: el('voiceSelect').value,
        speed: Number(el('speedRange').value),
      }),
    });
    const es = new EventSource(`/api/export/progress/${jobId}`);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      const pct = data.total ? Math.round((data.progress / data.total) * 100) : 0;
      el('progressLabel').textContent = data.message;
      el('progressBarInner').style.width = pct + '%';
      if (data.status === 'done') {
        es.close();
        el('exportStatus').textContent = '完成しました。ダウンロードしてください。';
        el('exportStatus').className = 'status-msg ok';
        const link = el('downloadLink');
        link.href = `/api/export/download/${jobId}`;
        link.style.display = 'block';
        btn.disabled = false;
      } else if (data.status === 'error') {
        es.close();
        el('exportStatus').textContent = 'エラー: ' + data.message;
        el('exportStatus').className = 'status-msg err';
        btn.disabled = false;
      }
    };
    es.onerror = () => {
      es.close();
    };
  } catch (e) {
    el('exportStatus').textContent = 'エラー: ' + e.message;
    el('exportStatus').className = 'status-msg err';
    btn.disabled = false;
  }
}

async function uploadMaterial(file, weekId, statusEl) {
  const fd = new FormData();
  fd.append('file', file);
  statusEl.textContent = 'アップロード中...';
  statusEl.className = 'status-msg';
  try {
    await api(`/api/weeks/${weekId}/material`, { method: 'POST', body: fd });
    statusEl.textContent = '登録しました';
    statusEl.className = 'status-msg ok';
    await loadWeeks();
    await selectWeek(weekId);
  } catch (e) {
    statusEl.textContent = '失敗: ' + e.message;
    statusEl.className = 'status-msg err';
  }
}

async function loadCurrentUser() {
  try {
    const { user } = await api('/api/me');
    if (user) {
      el('userEmail').textContent = user.email;
      el('userBox').hidden = false;
    }
  } catch (e) {
    // 認証無効時は/api/meが常にuser:nullを返すため何もしない
  }
}

function init() {
  el('saveScriptBtn').onclick = saveScript;
  el('previewAudioBtn').onclick = previewAudio;
  el('exportBtn').onclick = startExport;
  el('speedRange').oninput = () => { el('speedVal').textContent = Number(el('speedRange').value).toFixed(2); };
  el('logoutBtn').onclick = async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/login';
  };

  el('fileInput').onchange = (e) => {
    if (e.target.files[0]) uploadMaterial(e.target.files[0], state.currentWeek, el('replaceStatus'));
  };
  el('replaceFileInput').onchange = (e) => {
    if (e.target.files[0]) uploadMaterial(e.target.files[0], state.currentWeek, el('replaceStatus'));
  };

  loadCurrentUser();
  loadWeeks();
  loadVoices();
}

init();
