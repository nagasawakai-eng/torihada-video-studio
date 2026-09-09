const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function findSoffice() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
    return candidates.find(p => fs.existsSync(p)) || 'soffice';
  }
  return 'soffice';
}

function convertToPdf(pptxPath, outDir) {
  return new Promise((resolve, reject) => {
    const soffice = findSoffice();
    execFile(
      soffice,
      ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, pptxPath],
      { timeout: 120000 },
      (err) => {
        if (err) return reject(new Error(`PPTX→PDF変換に失敗しました: ${err.message}`));
        const pdfPath = path.join(outDir, path.basename(pptxPath).replace(/\.pptx$/i, '.pdf'));
        if (!fs.existsSync(pdfPath)) return reject(new Error('PDFが生成されませんでした'));
        resolve(pdfPath);
      }
    );
  });
}

// 同じpreviewDirへの同時変換リクエストを1本化するためのロック
const inFlight = new Map();

// スライド画像をpreviewDirに生成する（既にあれば何もしない。forceで強制再生成）
async function ensureSlideImages(pptxPath, previewDir, { force = false } = {}) {
  fs.mkdirSync(previewDir, { recursive: true });

  if (!force) {
    const existing = fs.readdirSync(previewDir).filter(f => /^slide_\d+\.png$/i.test(f));
    if (existing.length > 0) return existing.sort();
  }

  if (inFlight.has(previewDir)) return inFlight.get(previewDir);

  const task = (async () => {
    // 既存の生成物をクリア
    fs.readdirSync(previewDir).forEach(f => {
      if (/^slide_\d+\.png$/i.test(f)) fs.unlinkSync(path.join(previewDir, f));
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvs-render-'));
    try {
      const pdfPath = await convertToPdf(pptxPath, tmpDir);
      const { pdf } = require('pdf-to-img');
      const doc = await pdf(pdfPath, { scale: 2 });
      let i = 1;
      const files = [];
      for await (const page of doc) {
        const name = `slide_${String(i).padStart(2, '0')}.png`;
        fs.writeFileSync(path.join(previewDir, name), page);
        files.push(name);
        i++;
      }
      return files;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  })();

  inFlight.set(previewDir, task);
  try {
    return await task;
  } finally {
    inFlight.delete(previewDir);
  }
}

module.exports = { ensureSlideImages };
