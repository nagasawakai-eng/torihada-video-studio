const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const SCRIPTS_DIR = path.join(DATA_DIR, 'scripts');
const MATERIALS_DIR = path.join(ROOT, 'materials');
const WEEKS_FILE = path.join(DATA_DIR, 'weeks.json');

const DEFAULT_WEEKS = [
  { id: 'week1', label: 'マインド・規約・契約書概要（社内、コーポ連携）' },
  { id: 'week2', label: 'PRルール・薬事（社内 ディレクション）' },
  { id: 'week3', label: '進行フロー・ビジネス連絡（社内 ディレクション）' },
  { id: 'week4', label: '所属・選ばれるクリエイターとは（PPP・営業チーム）' },
];

function ensureInit() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.mkdirSync(MATERIALS_DIR, { recursive: true });
  if (!fs.existsSync(WEEKS_FILE)) {
    fs.writeFileSync(WEEKS_FILE, JSON.stringify(DEFAULT_WEEKS, null, 2), 'utf8');
  }
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
