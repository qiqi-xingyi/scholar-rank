// 构建离线期刊数据集：中科院 / JCR / EI，以及经管与 Nature Index 期刊目录。
//
// 数据来源（均为公开仓库/公开目录，见 README「数据来源与免责声明」）：
//   中科院分区表升级版 2025 / JCR 2025 / 预警名单 2025 -> github.com/hitfyd/ShowJCR
//   EI Compendex Source List           -> github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST
//   ABDC 2025 / AJG 2024               -> github.com/P-M-Ferreira/ranking
//   ABS(AJG) 2021 / FT50                -> github.com/jusi-aalto/biz-journals
//   UTD24 / Nature Index 2026           -> 官方清单（见 README）
//
// 用法: node tools/build-journals.mjs [输出路径]
//   环境变量 CACHE_DIR 可指定原始文件缓存目录，避免重复下载。

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ECON_TOP5, NATURE_INDEX_2026, NSFC_MANAGEMENT, UTD24 } from './journal-lists.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(__dirname, '..', 'src', 'data', 'journals.json'));
const CACHE_DIR = process.env.CACHE_DIR ?? join(__dirname, '.cache');

// 复用扩展里的归一化实现，保证建库 key 与查库 key 完全一致。
(0, eval)(readFileSync(join(__dirname, '..', 'src', 'lib', 'normalize.js'), 'utf8'));
const { normalizeName } = globalThis.SRNorm;

const SHOWJCR = 'https://raw.githubusercontent.com/hitfyd/ShowJCR/master/'
  + encodeURIComponent('中科院分区表及JCR原始数据文件') + '/';

const SOURCES = {
  cas: SHOWJCR + 'FQBJCR2025-UTF8.csv',
  jcr: SHOWJCR + 'JCR2025-UTF8.csv',
  warn: SHOWJCR + 'GJQKYJMD2025.csv',
  ei: 'https://raw.githubusercontent.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST/master/readme.md',
  abdc: 'https://raw.githubusercontent.com/P-M-Ferreira/ranking/refs/heads/main/'
    + 'journal-ranking-app/data/abdc-2025.json',
  abs: 'https://raw.githubusercontent.com/jusi-aalto/biz-journals/master/data/ajg.json',
  ajg: 'https://raw.githubusercontent.com/P-M-Ferreira/ranking/refs/heads/main/'
    + 'journal-ranking-app/data/abs-ajg-2024.json',
  ft50: 'https://raw.githubusercontent.com/jusi-aalto/biz-journals/master/data/ft50.json',
};

async function fetchCached(name, url) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  process.stderr.write(`下载 ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text, 'utf8');
  return text;
}

/** 最小 CSV 解析器：支持引号包裹、引号内逗号与换行、"" 转义。 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1 && r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** "3 [168/495]" -> 3 */
function zoneOf(s) {
  const m = /^\s*([1-4])\b/.exec(s ?? '');
  return m ? Number(m[1]) : 0;
}

/** " MATERIALS SCIENCE, MULTIDISCIPLINARY 材料科学：综合" -> "材料科学：综合" */
function chineseTail(s) {
  const m = /([一-龥][一-龥A-Za-z0-9：:·\-（）()]*)\s*$/.exec((s ?? '').trim());
  return m ? m[1].trim() : '';
}

function cleanIssn(s) {
  const v = (s ?? '').trim().toUpperCase();
  return /^\d{4}-\d{3}[\dX]$/.test(v) ? v : '';
}

function parseJSON(text) {
  return JSON.parse(text.replace(/^﻿/, ''));
}

const [casText, jcrText, warnText, eiText, abdcText, absText, ajgText, ft50Text] = await Promise.all(
  Object.entries(SOURCES).map(([k, u]) => fetchCached(`${k}.txt`, u)),
);

/** key -> 记录。同 key 冲突时保留信息更完整的一条。 */
const db = new Map();
function slot(name) {
  const key = normalizeName(name);
  if (!key) return null;
  let rec = db.get(key);
  if (!rec) { rec = { n: name }; db.set(key, rec); }
  return rec;
}

// ---- 中科院分区表升级版 ----
let casCount = 0;
for (const r of toObjects(parseCSV(casText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  const [issn, eissn] = (r['ISSN/EISSN'] ?? '').split('/');
  rec.n = name;
  if (cleanIssn(issn)) rec.issn = cleanIssn(issn);
  if (cleanIssn(eissn)) rec.eissn = cleanIssn(eissn);
  if (r['Web of Science']) rec.wos = r['Web of Science'];        // SCIE / SSCI / AHCI / ESCI
  if (r['大类']) rec.cat = r['大类'];                             // 大类中文名，如「计算机科学」
  const z = zoneOf(r['大类分区']);
  if (z) rec.zone = z;                                           // 1/2/3/4 区
  if (r['Top'] === '是') rec.top = 1;
  const sub = chineseTail(r['小类1']);
  const subZone = zoneOf(r['小类1分区']);
  if (sub && subZone) rec.sub = [sub, subZone];
  casCount++;
}

// ---- JCR 影响因子 ----
let jcrCount = 0;
for (const r of toObjects(parseCSV(jcrText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  if (!rec.n || rec.n === rec.n.toUpperCase()) rec.n = rec.n || name;
  const ifv = parseFloat(r['IF(2025)']);
  if (Number.isFinite(ifv)) rec.if = ifv;
  const q = r['IF Quartile(2025)_1'];
  if (/^Q[1-4]$/.test(q)) rec.q = q;
  if (!rec.wos && r['Web of Science']) rec.wos = r['Web of Science'];
  if (!rec.issn && cleanIssn(r['ISSN'])) rec.issn = cleanIssn(r['ISSN']);
  if (!rec.eissn && cleanIssn(r['EISSN'])) rec.eissn = cleanIssn(r['EISSN']);
  jcrCount++;
}

// ---- 国际期刊预警名单 ----
let warnCount = 0;
for (const r of toObjects(parseCSV(warnText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  rec.warn = Object.values(r)[1] || '预警';
  warnCount++;
}

// ---- EI Compendex 收录目录 ----
// readme.md 里是一段用 ``` 包住的纯列表，每行一个出版物名（右侧有制表符填充）。
let eiCount = 0;
{
  const block = /```([\s\S]*?)```/.exec(eiText);
  const lines = (block ? block[1] : eiText).split('\n');
  for (const line of lines) {
    const name = line.replace(/\t+/g, ' ').trim();
    if (!name || name.length < 3 || name.startsWith('#') || name.startsWith('http')) continue;
    const key = normalizeName(name);
    if (!key) continue;
    let rec = db.get(key);
    if (!rec) { rec = { n: name }; db.set(key, rec); }
    rec.ei = 1;
    eiCount++;
  }
}

// ---- 其它期刊分级 / 名单 ----
// 这些目录的刊名写法不同（例如 Accounting Review / The Accounting Review），优先用 ISSN，
// 再用规范化刊名和忽略开头 The 的刊名对齐。别名只保存 key -> 正式 key，不复制整条记录。
const journalAliases = new Map();
const canonicalKey = new Map();
const byIssn = new Map();
const byLooseTitle = new Map();

function looseTitleKey(name) {
  return normalizeName(name).replace(/^the(?=[a-z0-9])/, '');
}

function addUnique(index, key, rec) {
  if (!key) return;
  if (!index.has(key)) index.set(key, rec);
  else if (index.get(key) !== rec) index.set(key, null);
}

function indexRecord(key, rec) {
  if (!canonicalKey.has(rec)) canonicalKey.set(rec, key);
  addUnique(byLooseTitle, looseTitleKey(rec.n), rec);
  for (const value of [rec.issn, rec.eissn]) {
    const issn = cleanIssn(value);
    if (issn) addUnique(byIssn, issn, rec);
  }
}

for (const [key, rec] of db) indexRecord(key, rec);

function addJournalAlias(name, rec) {
  const key = normalizeName(name);
  const target = canonicalKey.get(rec);
  if (key && target && key !== target && !db.has(key)) journalAliases.set(key, target);
  addUnique(byLooseTitle, looseTitleKey(name), rec);
}

function rankedSlot(row) {
  const title = String(row.title || '').trim();
  if (!title) return null;
  const issns = [row.issn, row.eissn].map(cleanIssn).filter(Boolean);
  let rec = null;
  for (const issn of issns) {
    const hit = byIssn.get(issn);
    if (hit) { rec = hit; break; }
  }
  if (!rec) rec = db.get(normalizeName(title));
  if (!rec) rec = byLooseTitle.get(looseTitleKey(title)) || null;
  if (!rec) {
    rec = slot(title);
    indexRecord(normalizeName(title), rec);
  }
  if (!rec.issn && issns[0]) rec.issn = issns[0];
  if (!rec.eissn && issns[1]) rec.eissn = issns[1];
  indexRecord(canonicalKey.get(rec), rec);
  addJournalAlias(title, rec);
  return rec;
}

let abdcCount = 0;
for (const row of parseJSON(abdcText).records || []) {
  if (!/^(?:A\*|A|B|C)$/.test(row.abdc2025 || '')) continue;
  const rec = rankedSlot(row);
  if (rec) { rec.abdc = row.abdc2025; abdcCount++; }
}

let absCount = 0;
for (const row of parseJSON(absText)) {
  if (!/^(?:4\*|4|3|2|1)$/.test(row.grade || '')) continue;
  const rec = rankedSlot(row);
  if (rec) { rec.abs = row.grade; absCount++; }
}

let ajgCount = 0;
for (const row of parseJSON(ajgText).records || []) {
  if (!/^(?:4\*|4|3|2|1)$/.test(row.ajg2024 || '')) continue;
  const rec = rankedSlot(row);
  if (rec) { rec.ajg = row.ajg2024; ajgCount++; }
}

let ft50Count = 0;
for (const row of parseJSON(ft50Text)) {
  const rec = rankedSlot(row);
  if (rec) { rec.ft50 = 1; ft50Count++; }
}

for (const title of UTD24) rankedSlot({ title }).utd24 = 1;
for (const title of new Set([...UTD24, ...ECON_TOP5])) rankedSlot({ title }).managementEcon = 1;

let nsfcCount = 0;
for (const [grade, titles] of Object.entries(NSFC_MANAGEMENT)) {
  for (const title of titles) {
    const rec = rankedSlot({ title });
    rec.nsfcManagement = grade;
    nsfcCount++;
    if (title === '系统管理学报') addJournalAlias('系统工程理论方法应用', rec);
    if (title === '中国人口·资源与环境') addJournalAlias('中国人口资源与环境', rec);
  }
}

let natureCount = 0;
for (const title of NATURE_INDEX_2026) {
  const rec = rankedSlot({ title });
  rec.natureIndex = 1;
  natureCount++;
}

const journals = {};
for (const [k, v] of db) journals[k] = v;

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    cas: '中科院分区表升级版 2025（github.com/hitfyd/ShowJCR）',
    jcr: 'JCR 2025 影响因子（github.com/hitfyd/ShowJCR）',
    warn: '国际期刊预警名单 2025（github.com/hitfyd/ShowJCR）',
    ei: 'EI Compendex Source List 2019（github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST）',
    abdc: `ABDC Journal Quality List 2025（${abdcCount} 条）`,
    abs: `ABS / Academic Journal Guide 2021（${absCount} 条）`,
    ajg: `Academic Journal Guide 2024（${ajgCount} 条）`,
    utd24: `UT Dallas 24（${UTD24.length} 种期刊）`,
    ft50: `Financial Times FT50（${ft50Count} 种期刊）`,
    nsfcManagement: `国家自然科学基金委管理科学部重要期刊（${nsfcCount} 种）`,
    managementEcon: `管理经济期刊：UTD24 + 经济学五大刊（${UTD24.length + ECON_TOP5.length} 种）`,
    natureIndex: `Nature Index 2026（${natureCount} 种期刊）`,
  },
  count: db.size,
  aliases: Object.fromEntries(journalAliases),
  journals,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

const withZone = [...db.values()].filter((v) => v.zone).length;
const withIf = [...db.values()].filter((v) => v.if != null).length;
const withEi = [...db.values()].filter((v) => v.ei).length;
console.log(`写入 ${OUT}`);
console.log(`  记录总数 ${db.size}  (中科院 ${casCount} / JCR ${jcrCount} / 预警 ${warnCount} / EI ${eiCount})`);
console.log(`  ABDC ${abdcCount} / ABS ${absCount} / AJG ${ajgCount} / UTD24 ${UTD24.length} / FT50 ${ft50Count}`);
console.log(`  国自然管理学部 ${nsfcCount} / UTD24+Econ5 ${UTD24.length + ECON_TOP5.length} / Nature Index ${natureCount}`);
console.log(`  含大类分区 ${withZone}  含影响因子 ${withIf}  含 EI 标记 ${withEi}`);
console.log(`  文件大小 ${(readFileSync(OUT).length / 1024 / 1024).toFixed(2)} MB`);
