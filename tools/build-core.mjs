/** Download the CORE portal export and build offline conference rankings. CORE_SOURCE selects the source version; nonacademic rank categories are not displayed. */
//
//

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(__dirname, '..', 'src', 'data', 'core.json'));
const SOURCE = process.env.CORE_SOURCE ?? 'ICORE2026';
const URL_ = `https://portal.core.edu.au/conf-ranks/?search=&by=all&source=${SOURCE}&sort=atitle&page=1&do=Export`;

const FOR_NAMES = {
  4601: 'Applied Computing',
  4602: 'Artificial Intelligence',
  4603: 'Computer Vision & Multimedia Computing',
  4604: 'Cybersecurity',
  4605: 'Data Management & Data Science',
  4606: 'Distributed Computing & Systems Software',
  4607: 'Graphics, Augmented Reality & Games',
  4608: 'Human-Computer Interaction',
  4609: 'Information Systems',
  4610: 'Library & Information Science',
  4611: 'Machine Learning',
  4612: 'Software Engineering',
  4613: 'Theory of Computation',
  CSE: 'Computer Science & Engineering (legacy)',
};

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

function normalizeRank(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (/^a\*$/i.test(s)) return 'A*';
  if (/^a$/i.test(s)) return 'A';
  if (/^b$/i.test(s)) return 'B';
  if (/^c$/i.test(s)) return 'C';
  const aus = /^australasian\s*([abc])$/i.exec(s);
  if (aus) return 'Australasian ' + aus[1].toUpperCase();
  if (/^national/i.test(s)) return 'National';
  if (/^regional/i.test(s)) return 'Regional';
  if (/^(unranked|journal published|multiconference)/i.test(s)) return 'Unranked';
  return 'Other';
}

const res = await fetch(URL_);
if (!res.ok) throw new Error(`${URL_} -> HTTP ${res.status}`);
const csv = await res.text();

// id, Title, Acronym, Source, Rank, DBLP(Yes/No), FoR1, FoR2, FoR3
const entries = [];
const rankCount = {};
for (const cols of parseCSV(csv)) {
  if (cols.length < 5) continue;
  const [, title, acronym, source, rawRank, , ...fors] = cols;
  const name = (title ?? '').trim();
  const abbr = (acronym ?? '').trim();
  const r = (rawRank ?? '').trim();
  if (!name || !r) continue;
  const rank = normalizeRank(r);
  rankCount[rank] = (rankCount[rank] ?? 0) + 1;
  const fields = fors
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => FOR_NAMES[f] ?? FOR_NAMES[Number(f)] ?? f);
  const entry = { abbr, name, rank, source: (source ?? '').trim(), field: fields.join('/') };
  if (rank !== r) entry.rankRaw = r;
  entries.push(entry);
}

if (!entries.length) throw new Error('Empty CORE export; the source endpoint may have changed');

const payload = {
  source: `https://portal.core.edu.au/conf-ranks/ (${SOURCE})`,
  version: SOURCE,
  generatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  entries,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload), 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`  ${entries.length} entries (${SOURCE})`);
console.log('  Rank distribution:', Object.entries(rankCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '));
