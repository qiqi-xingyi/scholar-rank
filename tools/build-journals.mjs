/** Build the offline journal dataset from CAS/JCR sources and supplemental lists. Cache downloads; reuse the same title normalization as the extension. */
//
//   EI Compendex Source List           -> github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST
//   ABDC 2025 / AJG 2024               -> github.com/P-M-Ferreira/ranking
//   ABS(AJG) 2021 / FT50                -> github.com/jusi-aalto/biz-journals
//

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV, toObjects, casMetadata } from './cas-data.mjs';
import { ECON_TOP5, NATURE_INDEX_2026, NSFC_MANAGEMENT, UTD24 } from './journal-lists.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(__dirname, '..', 'src', 'data', 'journals.json'));
const CACHE_DIR = process.env.CACHE_DIR ?? join(__dirname, '.cache');

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
  process.stderr.write(`Downloading ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text, 'utf8');
  return text;
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

const db = new Map();
function slot(name) {
  const key = normalizeName(name);
  if (!key) return null;
  let rec = db.get(key);
  if (!rec) { rec = { n: name }; db.set(key, rec); }
  return rec;
}

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
  Object.assign(rec, casMetadata(r));
  casCount++;
}

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

let warnCount = 0;
for (const r of toObjects(parseCSV(warnText))) {
  const name = r['Journal'];
  if (!name) continue;
  const rec = slot(name);
  if (!rec) continue;
  rec.warn = Object.values(r)[1] === '论文工厂' ? 'Paper mill' : 'Flagged journal';
  warnCount++;
}

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
    cas: 'CAS journal tiers 2025 (github.com/hitfyd/ShowJCR)',
    jcr: 'JCR impact factors and quartiles 2025 (github.com/hitfyd/ShowJCR)',
    warn: 'Journal warning list 2025 (github.com/hitfyd/ShowJCR)',
    ei: 'EI Compendex Source List 2019 (github.com/HiddenStrawberry/EI-COMPENDEX-SOURCE-LIST)',
    abdc: `ABDC Journal Quality List 2025 (${abdcCount} entries)`,
    abs: `ABS / Academic Journal Guide 2021 (${absCount} entries)`,
    ajg: `Academic Journal Guide 2024 (${ajgCount} entries)`,
    utd24: `UT Dallas 24 (${UTD24.length} journals)`,
    ft50: `Financial Times FT50 (${ft50Count} journals)`,
    nsfcManagement: `NSFC management journals (${nsfcCount} journals)`,
    managementEcon: `Management and economics: UTD24 + Econ Top 5 (${UTD24.length + ECON_TOP5.length} journals)`,
    natureIndex: `Nature Index 2026 (${natureCount} journals)`,
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
console.log(`Wrote ${OUT}`);
console.log(`  Total records ${db.size} (CAS ${casCount} / JCR ${jcrCount} / warnings ${warnCount} / EI ${eiCount})`);
console.log(`  ABDC ${abdcCount} / ABS ${absCount} / AJG ${ajgCount} / UTD24 ${UTD24.length} / FT50 ${ft50Count}`);
console.log(`  NSFC management ${nsfcCount} / UTD24+Econ5 ${UTD24.length + ECON_TOP5.length} / Nature Index ${natureCount}`);
console.log(`  With CAS tiers ${withZone}; with impact factors ${withIf}; with EI flags ${withEi}`);
console.log(`  File size ${(readFileSync(OUT).length / 1024 / 1024).toFixed(2)} MB`);
