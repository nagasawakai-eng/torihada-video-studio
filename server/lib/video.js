const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const tts = require('./tts');
const { ensureSlideImages } = require('./render');
const store = require('./store');

const jobs = new Map();
const CACHE_ROOT = path.join(os.tmpdir(), 'tvs-segment-cache');

function ffmpegRun(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-500)}`));
    });
    proc.on('error', e => reject(new Error(`FFmpeg起動失敗: ${e.message}`)));
  });
}

function segmentCacheKey(weekId, slideNum, script, voiceId, speed) {
  const h = crypto.createHash('sha1')
    .update(JSON.stringify({ script, voiceId: voiceId || '', speed: speed || 1 }))
    .digest('hex')
    .slice(0, 16);
  return path.join(CACHE_ROOT, weekId, `slide_${String(slideNum).padStart(2, '0')}_${h}.mp4`);
}

// 台本1枚分だけ試聴用の音声を生成する
async function previewAudio(text, opts) {
  return tts.synthesize(text, opts);
}

async function buildSegment({ weekId, slideNum, slidePng, script, voiceId, speed }) {
  const cacheFile = segmentCacheKey(weekId, slideNum, script, voiceId, speed);
  if (fs.existsSync(cacheFile)) return cacheFile;

  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  // 古いキャッシュ(このスライド番号の別バージョン)は削除
  const dir = path.dirname(cacheFile);
  const prefix = `slide_${String(slideNum).padStart(2, '0')}_`;
  fs.readdirSync(dir).forEach(f => {
    if (f.startsWith(prefix) && path.join(dir, f) !== cacheFile) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    }
  });

  const tmpAudio = cacheFile + '.tmp.mp3';
  try {
    if (script && script.trim()) {
      const audioBuf = await tts.synthesize(script, { voiceId, speed });
      fs.writeFileSync(tmpAudio, audioBuf);
      await ffmpegRun([
        '-loop', '1', '-i', slidePng,
        '-i', tmpAudio,
        '-c:v', 'libx264', '-tune', 'stillimage',
        '-c:a', 'aac', '-b:a', '128k',
        '-pix_fmt', 'yuv420p', '-shortest',
        '-y', cacheFile,
      ]);
    } else {
      await ffmpegRun([
        '-loop', '1', '-i', slidePng,
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-c:v', 'libx264', '-tune', 'stillimage',
        '-c:a', 'aac', '-b:a', '64k',
        '-pix_fmt', 'yuv420p', '-t', '3',
        '-y', cacheFile,
      ]);
    }
  } finally {
    if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio);
  }
  return cacheFile;
}

async function runExportJob(job, { weekId, voiceId, speed }) {
  const week = store.getWeek(weekId);
  if (!week || !week.hasFile) throw new Error(`資料が未登録です (${weekId})`);

  const pptxPath = store.materialPath(weekId);
  const previewDir = store.previewDir(weekId);
  job.message = 'スライド画像を確認中...';
  const slideFiles = await ensureSlideImages(pptxPath, previewDir);
  const scripts = store.getScripts(weekId);

  job.total = slideFiles.length;
  const segments = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideNum = i + 1;
    job.progress = i;
    job.message = `スライド ${slideNum}/${slideFiles.length} を処理中...`;
    const slidePng = path.join(previewDir, slideFiles[i]);
    const script = scripts[String(slideNum)] || '';
    try {
      const seg = await buildSegment({ weekId, slideNum, slidePng, script, voiceId, speed });
      segments.push(seg);
    } catch (e) {
      job.message = `スライド ${slideNum} でエラー、無音で代替します (${e.message})`;
      const seg = await buildSegment({ weekId, slideNum, slidePng, script: '', voiceId, speed });
      segments.push(seg);
    }
  }

  job.message = '動画を結合中...';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvs-export-'));
  const concatFile = path.join(tmpDir, 'concat.txt');
  fs.writeFileSync(concatFile, segments.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  const outputFile = path.join(tmpDir, 'output.mp4');
  await ffmpegRun(['-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', '-y', outputFile]);

  job.outputFile = outputFile;
  job.tmpDir = tmpDir;
  job.weekId = weekId;
  job.status = 'done';
  job.progress = slideFiles.length;
  job.message = '完成しました';
}

function startExportJob(opts) {
  const jobId = crypto.randomBytes(8).toString('hex');
  const job = { id: jobId, status: 'running', progress: 0, total: 0, message: '準備中...', outputFile: null, tmpDir: null };
  jobs.set(jobId, job);
  runExportJob(job, opts).catch(e => {
    job.status = 'error';
    job.message = e.message;
  });
  return jobId;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function cleanupJob(jobId) {
  const job = jobs.get(jobId);
  if (job && job.tmpDir) {
    try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  jobs.delete(jobId);
}

module.exports = { startExportJob, getJob, cleanupJob, previewAudio, ensureSlideImages };
