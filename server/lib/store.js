const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SEED_DIR = path.join(ROOT, 'seed');

// Railwayではデプロイ・再起動ごとにコンテナのファイルシステムが作り直されるため、
// ここに書き込む台本・資料はRailwayの永続ボリュームをマウントしたパスを
// DATA_DIR / MATERIALS_DIR で指定すること（ボリュームなしだと再デプロイで消える）。
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const SCRIPTS_DIR = path.join(DATA_DIR, 'scripts');
const MATERIALS_DIR = process.env.MATERIALS_DIR || path.join(ROOT, 'materials');
const WEEKS_FILE = path.join(DATA_DIR, 'weeks.json');

const DEFAULT_WEEKS = [
  { id: 'week1', label: 'マインド・規約・契約書概要（社内、コーポ連携）' },
  { id: 'week2', label: 'PRルール・薬事（社内 ディレクション）' },
  { id: 'week3', label: '進行フロー・ビジネス連絡（社内 ディレクション）' },
  { id: 'week4', label: '所属・選ばれるクリエイターとは（PPP・営業チーム）' },
];

// 永続ボリュームが空の初回起動時のみ、gitにコミットされた初期データ(seed/)を
// 実行時のDATA_DIR/MATERIALS_DIRにコピーする。既にデータがある場合（＝運用中に
// 誰かが編集・アップロードした内容がボリュームに残っている場合）は絶対に上書きしない。
function seedIfEmpty() {
  if (!fs.existsSync(WEEKS_FILE)) {
    const seedWeeksFile = path.join(SEED_DIR, 'weeks.json');
    fs.writeFileSync(
      WEEKS_FILE,
      fs.existsSync(seedWeeksFile) ? fs.readFileSync(seedWeeksFile) : JSON.stringify(DEFAULT_WEEKS, null, 2),
      'utf8'
    );
  }
  const seedScriptsDir = path.join(SEED_DIR, 'scripts');
  if (fs.existsSync(seedScriptsDir)) {
    for (const f of fs.readdirSync(seedScriptsDir)) {
      const dest = path.join(SCRIPTS_DIR, f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(seedScriptsDir, f), dest);
    }
  }
  const seedMaterialsDir = path.join(SEED_DIR, 'materials');
  if (fs.existsSync(seedMaterialsDir)) {
    for (const f of fs.readdirSync(seedMaterialsDir)) {
      const dest = path.join(MATERIALS_DIR, f);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(seedMaterialsDir, f), dest);
    }
  }
}

function ensureInit() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.mkdirSync(MATERIALS_DIR, { recursive: true });
  seedIfEmpty();
}

function materialPath(weekId) {
  return path.join(MATERIALS_DIR, `${weekId}.pptx`);
}

function previewDir(weekId) {
  return path.join(ROOT, 'preview', weekId);
}

function scriptsPath(weekId) {
  return path.join(SCRIPTS_DIR, `${weekId}.json`);
}

function getWeeks() {
  ensureInit();
  const weeks = JSON.parse(fs.readFileSync(WEEKS_FILE, 'utf8'));
  return weeks.map(w => ({ ...w, hasFile: fs.existsSync(materialPath(w.id)) }));
}

function getWeek(weekId) {
  return getWeeks().find(w => w.id === weekId) || null;
}

function getScripts(weekId) {
  ensureInit();
  const p = scriptsPath(weekId);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveScripts(weekId, scripts) {
  ensureInit();
  fs.writeFileSync(scriptsPath(weekId), JSON.stringify(scripts, null, 2), 'utf8');
}

module.exports = {
  ROOT,
  DATA_DIR,
  MATERIALS_DIR,
  ensureInit,
  materialPath,
  previewDir,
  getWeeks,
  getWeek,
  getScripts,
  saveScripts,
};
