/** Build the offline CCF directory from ccf.atom.im and preserve curated missing-acronym corrections. */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import '../src/lib/normalize.js';
import '../src/lib/ranking.js';

const SOURCE = 'https://ccf.atom.im/';
const aliases = JSON.parse(readFileSync(new URL('../src/data/aliases.json', import.meta.url), 'utf8'));
const OUT = resolve(process.argv[2] ?? 'src/data/ccf.json');

function decodeEntities(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const html = await (await fetch(SOURCE)).text();

const rows = html.match(/<tr class="item"[\s\S]*?<\/tr>/g) ?? [];
if (rows.length === 0) throw new Error('No CCF item rows found; the source page may have changed');

const entries = [];
for (const row of rows) {
  const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => decodeEntities(m[1]));
  if (cells.length < 6) continue;
  const [, abbr, name, rank, type, field] = cells;
  const url = (row.match(/<a href="([^"]+)"/) ?? [])[1] ?? '';
  if (!abbr && !name) continue;
  if (!/^[ABC]$/.test(rank)) continue;
  entries.push({
    abbr: abbr || aliases.missingAcronyms?.[name] || '',
    name,
    rank,
    type: type.includes('期刊') ? 'journal' : 'conference',
    field: globalThis.SRRanking.englishField(field),
    url,
  });
}

const payload = {
  source: SOURCE,
  version: 'CCF recommended list',
  generatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  entries,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 0) + '\n', 'utf8');

const stats = entries.reduce((acc, e) => {
  const k = `${e.type}-${e.rank}`;
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
console.log(`Wrote ${OUT}`);
console.log(`${entries.length} entries`, stats);
