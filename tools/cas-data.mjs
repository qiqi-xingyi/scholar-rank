/** Parse source CSV rows and translate CAS broad-category metadata to English. Source-language column names are retained for compatibility. */
export function parseCSV(text) {
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

export function toObjects(rows) {
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1 && r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** "3 [168/495]" -> 3 */
export function zoneOf(s) {
  const m = /^\s*([1-4])\b/.exec(s ?? '');
  return m ? Number(m[1]) : 0;
}

// Display names for the broad categories used by CAS.
const CATEGORIES = {
  '历史学': 'History', '材料科学': 'Materials Science', '生物学': 'Biology',
  '管理学': 'Management', '工程技术': 'Engineering', '计算机科学': 'Computer Science',
  '医学': 'Medicine', '文学': 'Literature', '农林科学': 'Agriculture & Forestry',
  '艺术学': 'Arts', '社会学': 'Sociology', '地球科学': 'Earth Sciences',
  '数学': 'Mathematics', '教育学': 'Education', '经济学': 'Economics',
  '心理学': 'Psychology', '哲学': 'Philosophy', '化学': 'Chemistry',
  '物理与天体物理': 'Physics & Astrophysics',
  '环境科学与生态学': 'Environmental Science & Ecology', '综合性期刊': 'Multidisciplinary',
};

export function casMetadata(row) {
  const record = {};
  const category = row['大类'];
  if (category) {
    // Never silently invent a translation if the source adds a new broad category.
    if (!CATEGORIES[category]) throw new Error(`Unknown CAS category: ${category}`);
    record.cat = CATEGORIES[category];
  }
  const zone = zoneOf(row['大类分区']);
  if (zone) record.zone = zone;
  if (row.Top === '是') record.top = 1;
  else if (row.Top === '否') record.top = 0;
  return record;
}
