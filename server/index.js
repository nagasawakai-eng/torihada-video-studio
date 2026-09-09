require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const store = require('./lib/store');
const pptx = require('./lib/pptx');
const { ensureSlideImages } = require('./lib/render');
const tts = require('./lib/tts');
const video = require('./lib/video');
const auth = require('./lib/auth');

store.ensureInit();

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---- Google認証（GOOGLE_CLIENT_ID未設定時は認証なしで公開） ----
app.get('/auth/config', (req, res) => {
  res.json({ clientId: auth.GOOGLE_CLIENT_ID });
});

app.post('/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const user = await auth.verifyGoogleIdToken(credential);
    auth.setSessionCookie(res, user);
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ success: false, error: e.message });
  }
});

app.post('/auth/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.use(auth.requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

app.get('/api/me', (req, res) => {
  res.json({ success: true, user: req.user || null });
});

// ---- Weeks ----
app.get('/api/weeks', (req, res) => {
  res.json({ success: true, weeks: store.getWeeks() });
});

app.post('/api/weeks/:weekId/material', upload.single('file'), (req, res) => {
  try {
    const { weekId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, error: 'ファイルがありません' });
    if (!/\.pptx$/i.test(req.file.originalname)) {
      return res.status(400).json({ success: false, error: 'pptxファイルを指定してください' });
    }
    fs.writeFileSync(store.materialPath(weekId), req.file.buffer);
    // 差し替え時は生成済みプレビューを破棄
    const pdir = store.previewDir(weekId);
    if (fs.existsSync(pdir)) fs.rmSync(pdir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- Slides (参照用テキスト) ----
app.get('/api/slides', (req, res) => {
  try {
    const weekId = req.query.week;
    const week = store.getWeek(weekId);
    if (!week || !week.hasFile) return res.json({ success: true, slides: [] });
    const slides = pptx.parseSlideTexts(store.materialPath(weekId));
    res.json({ success: true, slides });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- Slide preview images (オンデマンド生成) ----
app.get('/preview/:weekId/:file', async (req, res) => {
  try {
    const { weekId, file } = req.params;
    if (!/^slide_\d+\.png$/i.test(file)) return res.status(400).end();
    const week = store.getWeek(weekId);
    if (!week || !week.hasFile) return res.status(404).end();
    const pdir = store.previewDir(weekId);
    await ensureSlideImages(store.materialPath(weekId), pdir);
    const filePath = path.join(pdir, file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- Scripts (台本: 週ごとに独立して保存) ----
app.get('/api/scripts', (req, res) => {
  res.json({ success: true, scripts: store.getScripts(req.query.week) });
});

app.post('/api/scripts', (req, res) => {
  try {
    const { week, scripts } = req.body;
    if (!week || typeof scripts !== 'object') {
      return res.status(400).json({ success: false, error: 'week / scripts が不正です' });
    }
    store.saveScripts(week, scripts);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- TTS ----
app.get('/api/voices', async (req, res) => {
  try {
    res.json({ success: true, voices: await tts.listVoices() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 1枚分だけ試聴（保存はしない）
app.post('/api/preview-audio', async (req, res) => {
  try {
    const { text, voiceId, speed } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, error: '台本が空です' });
    const buf = await video.previewAudio(text, { voiceId, speed });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- Video export ----
app.post('/api/export/start', (req, res) => {
  try {
    const { week, voiceId, speed } = req.body;
    if (!week) return res.status(400).json({ success: false, error: 'week が必要です' });
    const jobId = video.startExportJob({ weekId: week, voiceId, speed: speed ? Number(speed) : 1 });
    res.json({ success: true, jobId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/export/progress/:jobId', (req, res) => {
  const job = video.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'ジョブが見つかりません' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => res.write(`data: ${JSON.stringify({
    status: job.status, progress: job.progress, total: job.total, message: job.message,
  })}\n\n`);
  send();
  const timer = setInterval(() => {
    send();
    if (job.status === 'done' || job.status === 'error') {
      clearInterval(timer);
      res.end();
    }
  }, 800);
  req.on('close', () => clearInterval(timer));
});

app.get('/api/export/download/:jobId', (req, res) => {
  const job = video.getJob(req.params.jobId);
  if (!job || job.status !== 'done' || !job.outputFile) {
    return res.status(404).json({ success: false, error: 'エクスポートが完了していません' });
  }
  const filename = `${job.weekId}_narration.mp4`;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(job.outputFile);
  stream.pipe(res);
  stream.on('close', () => video.cleanupJob(job.id));
  stream.on('error', () => res.status(500).end());
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`torihada-video-studio listening on port ${PORT}`);
});
