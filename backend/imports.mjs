import { createHash } from 'node:crypto';
export const keyName = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
export function issn(value) {
  const v = String(value || '').toUpperCase().replace(/[^\dX]/g, '');
  if (!/^\d{7}[\dX]$/.test(v)) return null;
  const sum = [...v.slice(0, 7)].reduce((s, n, i) => s + Number(n) * (8 - i), 0) + (v[7] === 'X' ? 10 : Number(v[7]));
  return sum % 11 === 0 ? v.slice(0, 4) + '-' + v.slice(4) : null;
}
export function doi(value) {
  const text = String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(text) && text.length <= 300 ? text : '';
}
export function requestInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected a publication object');
  const input = {};
  for (const [key, max] of Object.entries({ title: 1200, venue: 1200, authors: 800, doi: 350 })) {
    if (raw[key] != null && typeof raw[key] !== 'string') throw new Error(`${key} must be text`);
    input[key] = String(raw[key] || '').trim().slice(0, max);
  }
  if (input.doi && !doi(input.doi)) throw new Error('Invalid DOI');
  input.doi = doi(input.doi);
  for (const field of ['year', 'metricYear']) {
    const value = raw[field];
    input[field] = value === '' || value == null ? null : Number(value);
    if (input[field] !== null && (!Number.isInteger(input[field]) || input[field] < 1800 || input[field] > 2100)) throw new Error(`Invalid ${field}`);
  }
  if (!input.title && !input.venue && !input.doi) throw new Error('Provide a title, venue or DOI');
  return input;
}
export function requestKey(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
export function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) { if (c === '"' && input[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') { if (field) throw new Error('Invalid CSV quoting'); quoted = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift()?.map(h => h.trim());
  if (!headers || new Set(headers).size !== headers.length) throw new Error('CSV requires unique headers');
  return rows.map((r, i) => { if (r.length !== headers.length) throw new Error(`CSV row ${i + 2} has the wrong number of columns`); return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()])); });
}
function top(value) {
  if ([true, 1, '1', 'true', 'yes', 'Yes', '是'].includes(value)) return true;
  if ([false, 0, '0', 'false', 'no', 'No', '否'].includes(value)) return false;
  throw new Error('TOP must be true/false or 1/0');
}
export function parseImport(raw) {
  const input = typeof raw === 'string' ? (raw.trim().startsWith('[') || raw.trim().startsWith('{') ? JSON.parse(raw) : csv(raw)) : raw;
  const rows = Array.isArray(input) ? input : input?.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 50000) throw new Error('Import requires 1–50,000 rows');
  const output = [], seen = new Map();
  const add = row => {
    const key = [row.kind, row.identity, row.scheme, row.year].join(':');
    if (seen.has(key) && JSON.stringify(seen.get(key)) !== JSON.stringify(row.value)) throw new Error('Conflicting values in import: ' + key);
    seen.set(key, row.value); output.push(row);
  };
  for (const [i, source] of rows.entries()) {
    try {
      const kind = source.type || source.kind;
      if (!['journal', 'conference'].includes(kind)) throw new Error('type must be journal or conference');
      const year = Number(source.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error('year must identify the metric edition');
      const name = String(source.name || '').trim().slice(0, 500), provenance = String(source.source || '').trim().slice(0, 1000);
      if (!name || !provenance) throw new Error('name and source are required');
      const id = kind === 'journal' ? issn(source.issn) : keyName(name);
      if (!id) throw new Error('A valid ISSN is required for journals');
      const base = { kind, identity: id, name, abbr: String(source.abbr || '').trim().slice(0, 60), year, source: provenance };
      let added = 0;
      const put = (scheme, value) => { add({ ...base, scheme, value }); added++; };
      const has = key => source[key] !== '' && source[key] != null;
      if (kind === 'journal') {
        if (has('jcr')) { if (!/^Q[1-4]$/.test(source.jcr)) throw new Error('jcr must be Q1–Q4'); put('jcr', source.jcr); }
        if (has('if')) { const v = Number(source.if); if (!Number.isFinite(v) || v < 0 || v > 10000) throw new Error('Invalid impact factor'); put('if', v); }
        if (has('cas')) { const v = Number(source.cas); if (![1, 2, 3, 4].includes(v)) throw new Error('cas must be 1–4'); put('cas', { zone: v, category: String(source.category || '').slice(0, 200) }); }
        if (has('top')) put('top', top(source.top));
      } else {
        if (has('ccf')) { if (!['A', 'B', 'C'].includes(source.ccf)) throw new Error('ccf must be A/B/C'); put('ccf', source.ccf); }
        if (has('core')) { if (!['A*', 'A', 'B', 'C', 'Australasian A', 'Australasian B', 'Australasian C', 'National', 'Regional', 'Unranked'].includes(source.core)) throw new Error('Invalid CORE rank'); put('core', source.core); }
      }
      if (!added) throw new Error('No supported metric fields');
    } catch (err) { throw new Error(`Row ${i + 1}: ${err.message}`); }
  }
  return output;
}
