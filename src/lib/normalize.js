/** Venue normalization and candidate generation, shared by the extension and Node tools. Preserve source spellings so build-time and lookup keys stay identical. */
(function (root) {
  'use strict';

  const ABBREV = new Map(Object.entries({
    trans: 'transactions',
    tran: 'transactions',
    j: 'journal',
    jnl: 'journal',
    int: 'international',
    intl: 'international',
    natl: 'national',
    proc: 'proceedings',
    conf: 'conference',
    symp: 'symposium',
    sci: 'science',
    tech: 'technology',
    technol: 'technology',
    comput: 'computer',
    eng: 'engineering',
    res: 'research',
    lett: 'letters',
    rev: 'review',
    appl: 'applied',
    ann: 'annals',
    arch: 'archives',
    bull: 'bulletin',
    med: 'medicine',
    biol: 'biology',
    chem: 'chemistry',
    phys: 'physics',
    math: 'mathematics',
    syst: 'systems',
    sys: 'systems',
    mag: 'magazine',
    assoc: 'association',
  }));

  const STOPWORDS = new Set(['the', 'of', 'a', 'an', 'and', 'for', 'on', 'in']);

  function deburr(s) {
    return s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐-―−]/g, '-');
  }

  function normalizeName(input) {
    return nameTokens(input).filter((t) => !STOPWORDS.has(t)).join('');
  }

  function nameTokens(input) {
    if (!input) return [];
    let s = deburr(String(input)).toLowerCase();
    s = s.replace(/&/g, ' and ');
    // Keep CJK characters so Chinese journal titles can use the same exact-match path.
    s = s.replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').trim();
    if (!s) return [];
    return s.split(' ').map((t) => ABBREV.get(t) ?? t).filter(Boolean);
  }

  const PREFIXES = [
    /^proceedings\s+of\s+the\s+/i,
    /^proceedings\s+of\s+/i,
    /^proceedings\s+/i,
    /^proc\.?\s+of\s+the\s+/i,
    /^proc\.?\s+of\s+/i,
    /^in\s+proceedings\s+of\s+the\s+/i,
    /^in\s+/i,
    /^the\s+/i,
  ];

  const LEAD_ACRONYM_YEAR = /^([A-Za-z][A-Za-z0-9'&.-]{1,13})\s+((19|20)\d{2})\b/;

  function isAcronymToken(t) {
    return /^[A-Z]/.test(t) && /[A-Z][^A-Z]*[A-Z]/.test(t);
  }

  function stripWrappers(s) {
    let out = String(s).trim();
    let changed = true;
    while (changed) {
      changed = false;
      for (const re of PREFIXES) {
        const next = out.replace(re, '');
        if (next !== out) { out = next.trim(); changed = true; }
      }
      const lead = LEAD_ACRONYM_YEAR.exec(out);
      if (lead && isAcronymToken(lead[1])) {
        out = out.slice(lead[0].length).trim();
        changed = true;
      }
      const next = out
        .replace(/^\s*[-]\s*/, '')
        .replace(/^(19|20)\d{2}(\s*[-/]\s*(19|20)?\d{2})?\s+/, '')
        .replace(/^\d{1,3}(st|nd|rd|th)\s+/i, '')
        .trim();
      if (next !== out) { out = next; changed = true; }
    }
    return out;
  }

  function stripTrailingNumerics(s) {
    let out = String(s).trim();
    let prev = null;
    while (prev !== out) {
      prev = out;
      out = out
        .replace(/[\s,;:]+$/, '')
        // "30 (6), 351" / "44 (11)" / "1-10"
        .replace(/[\s,]+\(?\d+[\d\s\-/]*\)?$/, '')
        .replace(/[\s,]+\(\s*\d+[^()]*\)$/, '')
        .replace(/[\s,]+(vol|volume|no|issue|pp|p)\.?\s*\d+.*$/i, '')
        .replace(/\s+PP$/, '')
        .trim();
    }
    return out;
  }

  const PREPRINT_RE = /\b(arxiv|biorxiv|medrxiv|chemrxiv|ssrn|preprint|techrxiv|research\s*square|working\s+paper)\b/i;

  const PREPRINT_SERVERS = [
    [/\bbiorxiv\b/i, 'bioRxiv'],
    [/\bmedrxiv\b/i, 'medRxiv'],
    [/\bchemrxiv\b/i, 'ChemRxiv'],
    [/\btechrxiv\b/i, 'TechRxiv'],
    [/\barxiv\b/i, 'arXiv'],
    [/\bssrn\b/i, 'SSRN'],
    [/\bresearch\s*square\b/i, 'Research Square'],
    [/\bosf\b/i, 'OSF Preprints'],
    [/\bworking\s+paper\b/i, 'Working paper'],
  ];

  function preprintSource(raw) {
    const s = String(raw || '');
    for (const [re, name] of PREPRINT_SERVERS) if (re.test(s)) return name;
    return 'Preprint';
  }
  const THESIS_RE = /(\bphd\s+thesis\b|\bmaster'?s?\s+thesis\b|\bdissertation\b|学位论文|博士论文|硕士论文)/i;
  const PATENT_RE = /(\bpatent\b|专利)/i;

  function classifyVenue(raw) {
    if (!raw || !String(raw).trim()) return 'empty';
    if (PREPRINT_RE.test(raw)) return 'preprint';
    if (THESIS_RE.test(raw)) return 'thesis';
    if (PATENT_RE.test(raw)) return 'patent';
    return 'normal';
  }

  function venueCandidates(raw) {
    const kind = classifyVenue(raw);
    const src = String(raw || '');
    const body = src.replace(/^\s*(?:…|\.{3})/, '');
    const truncated = /…|\.{3}/.test(src);
    const truncatedHead = body !== src;
    const truncatedTail = /…|\.{3}/.test(body);
    const truncatedName = /\p{L}\s*(?:…|\.{3})/u.test(body);
    const result = { names: [], acronyms: [], kind, truncated, truncatedHead, truncatedTail, truncatedName };
    if (kind === 'preprint') result.preprintName = preprintSource(raw);
    if (kind !== 'normal') return result;

    const names = [];
    const acronyms = [];
    const pushName = (s) => {
      const v = s && String(s).trim().replace(/[\s,;:.\-]+$/, '').trim();
      if (v && v.length >= 3 && !names.includes(v)) names.push(v);
    };
    const pushAcronym = (s) => {
      const v = s && String(s).trim().toUpperCase();
      if (v && v.length >= 2 && v.length <= 12 && !acronyms.includes(v)) acronyms.push(v);
    };

    const text = String(raw).replace(/…/g, '').replace(/\.\.\./g, '').replace(/\s+/g, ' ').trim();

    for (const m of text.matchAll(/\(([A-Za-z][A-Za-z0-9'&-]{1,11})\)/g)) {
      if (isAcronymToken(m[1])) pushAcronym(m[1]);
    }

    const lead = LEAD_ACRONYM_YEAR.exec(text);
    if (lead && isAcronymToken(lead[1])) pushAcronym(lead[1]);

    // Proceedings often use compact edition labels such as SC18 or SC'23.
    // The ranking indexes still require the extracted acronym to be listed.
    const compactLead = /^([A-Za-z][A-Za-z&-]{1,11})['’]?(?:(?:19|20)\d{2}|\d{2})(?=[:\s]|$)/.exec(stripWrappers(text));
    if (compactLead && isAcronymToken(compactLead[1])) pushAcronym(compactLead[1]);

    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length; i >= 1; i--) {
      const prefix = parts.slice(0, i).join(', ');
      for (const base of [stripTrailingNumerics(prefix), prefix]) {
        if (!base) continue;
        pushName(base);
        pushName(base.replace(/\s*\([^()]*\)\s*$/, ''));
        const stripped = stripWrappers(base);
        pushName(stripped);
        pushName(stripped.replace(/\s*\([^()]*\)\s*$/, ''));
      }
    }

    const first = parts[0] || '';
    if (!truncated && /^[A-Za-z][A-Za-z0-9'&-]{1,11}$/.test(first)) pushAcronym(first);

    result.names = names;
    result.acronyms = acronyms;
    return result;
  }

  const SITE_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

  function venuesFromByline(text) {
    const parts = String(text || '')
      .replace(/ /g, ' ')
      .split(/\s+-\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) return [];

    const stripYear = (s) => s.replace(/,?\s*(19|20)\d{2}\s*$/, '').replace(/[\s,]+$/, '').trim();
    const out = [];
    const push = (s) => {
      const v = stripYear(s);
      if (v && v.length >= 3 && !out.includes(v)) out.push(v);
    };

    const body = parts.slice(1).filter((s) => !SITE_RE.test(s));
    if (!body.length) return [];
    push(body.join(' - '));
    for (const p of body) push(p);
    return out;
  }

  function completesTruncated(full, truncated) {
    const part = normalizeName(truncated);
    return part.length >= 3 && normalizeName(full).includes(part);
  }

  root.SRNorm = {
    normalizeName, nameTokens, venueCandidates, venuesFromByline, completesTruncated,
    classifyVenue, preprintSource, stripWrappers, stripTrailingNumerics,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
