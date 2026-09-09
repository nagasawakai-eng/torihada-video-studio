const AdmZip = require('adm-zip');

function escapeText(t) {
  return t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// スライドごとのテキスト内容を抽出する（参照表示専用・編集はしない）
function parseSlideTexts(pptxPath) {
  const zip = new AdmZip(pptxPath);
  const entries = zip.getEntries()
    .filter(e => /^ppt\/slides\/slide(\d+)\.xml$/.test(e.entryName))
    .map(e => ({ num: parseInt(e.entryName.match(/slide(\d+)\.xml/)[1], 10), entry: e }))
    .sort((a, b) => a.num - b.num);

  return entries.map(({ num, entry }) => {
    const xml = entry.getData().toString('utf8');
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => escapeText(m[1]));
    return { slideNumber: num, text: texts.join(' ').trim() };
  });
}

function countSlides(pptxPath) {
  const zip = new AdmZip(pptxPath);
  return zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).length;
}

module.exports = { parseSlideTexts, countSlides };
