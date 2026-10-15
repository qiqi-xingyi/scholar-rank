import { doi, issn, keyName } from './imports.js';
const clean = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
export class Providers {
  constructor({ config = () => ({}), fetcher = fetch, gap = 1100, userAgent = true } = {}) { this.config = config; this.fetcher = fetcher; this.gap = gap; this.userAgent = userAgent; this.tail = Promise.resolve(); this.last = 0; }
  async json(url, options = {}) {
    const run = async () => {
      const delay = this.last + this.gap - Date.now(); if (delay > 0) await new Promise(r => setTimeout(r, delay));
      this.last = Date.now();
      for (let attempt = 0; attempt < 2; attempt++) {
        const fetcher = this.fetcher;
        const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(10000), headers: { ...(this.userAgent ? { 'User-Agent': 'ScholarRank/1.4 (metadata resolver)' } : {}), ...options.headers } });
        if (response.ok) return response.json();
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          const seconds = Number(response.headers.get('retry-after'));
          if (seconds > 5) throw new Error(`Provider rate limited (HTTP ${response.status})`);
          await new Promise(r => setTimeout(r, Math.max(1000, seconds * 1000 || 1000))); continue;
        }
        if (response.status === 404) return null;
        throw new Error(`Provider request failed (HTTP ${response.status})`);
      }
    };
    const job = this.tail.then(run, run); this.tail = job.catch(() => {}); return job;
  }
  async crossref(input) {
    const config = this.config();
    const url = new URL(input.doi ? `https://api.crossref.org/works/${encodeURIComponent(input.doi)}` : 'https://api.crossref.org/works');
    if (!input.doi) { url.searchParams.set('query.bibliographic', [input.title, input.venue, input.year].filter(Boolean).join(' ')); url.searchParams.set('rows', '5'); }
    if (config.email) url.searchParams.set('mailto', config.email);
    const data = await this.json(url); const rows = input.doi ? (data?.message ? [data.message] : []) : data?.message?.items || [];
    return rows.map(r => ({ provider: 'Crossref', doi: doi(r.DOI), title: clean(r.title?.[0]), name: clean(r['container-title']?.[0] || r.event?.name), abbr: clean(r['short-container-title']?.[0]), issns: [...new Set((r.ISSN || []).map(issn).filter(Boolean))], type: r.type === 'journal-article' ? 'journal' : r.type === 'proceedings-article' ? 'conference' : 'other', year: r.issued?.['date-parts']?.[0]?.[0], authors: (r.author || []).map(a => clean(`${a.given || ''} ${a.family || ''}`)), url: r.DOI ? `https://doi.org/${r.DOI}` : '' }));
  }
  async openalex(input) {
    const url = new URL(input.doi ? `https://api.openalex.org/works/https://doi.org/${input.doi}` : 'https://api.openalex.org/works');
    if (!input.doi) { url.searchParams.set('search', input.title || input.venue); url.searchParams.set('per-page', '5'); }
    if (this.config().openalexKey) url.searchParams.set('api_key', this.config().openalexKey);
    const data = await this.json(url); const rows = input.doi ? (data ? [data] : []) : data?.results || [];
    return rows.map(r => {
      const locations = [r.primary_location, ...(r.locations || [])].filter(Boolean);
      const source = locations.map(l => l.source).find(s => ['journal', 'conference'].includes(s?.type)) || r.primary_location?.source || {};
      return { provider: 'OpenAlex', doi: doi(r.doi), title: clean(r.title || r.display_name), name: clean(source.display_name), abbr: '', issns: [...new Set([source.issn_l, ...(source.issn || [])].map(issn).filter(Boolean))], type: ['journal', 'conference'].includes(source.type) ? source.type : r.type === 'proceedings-article' ? 'conference' : 'other', year: r.publication_year, authors: (r.authorships || []).map(a => clean(a.author?.display_name)), url: r.id || '' };
    });
  }
}
export function similarity(a, b) {
  if (keyName(a) === keyName(b) && keyName(a)) return 1;
  const tokens = v => new Set(clean(v).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean));
  const x = tokens(a), y = tokens(b); if (!x.size || !y.size) return 0;
  return 2 * [...x].filter(t => y.has(t)).length / (x.size + y.size);
}
export function selectCandidate(input, rows) {
  const eligible = rows.filter(r => r.name && ['journal', 'conference'].includes(r.type)).map(r => {
    const titleScore = similarity(input.title, r.title);
    const yearOK = !input.year || !r.year || Math.abs(input.year - r.year) <= 1;
    const exactDoi = input.doi && input.doi === r.doi;
    const first = input.authors.split(/[,;，]/)[0].trim().split(/\s+/).filter(Boolean);
    const surname = first.length >= 2 ? keyName(first.at(-1)) : '';
    const authorOK = !surname || !r.authors?.length || r.authors.some(a => a.split(/\s+/).some(part => keyName(part) === surname));
    // A DOI is decisive. Title-only matching needs a long, near-exact title,
    // publication-year consistency and separation from other works.
    const valid = exactDoi || (!input.doi && input.title.length >= 24 && titleScore >= .94 && yearOK && authorOK);
    return { ...r, score: exactDoi ? 2 : titleScore, valid };
  }).filter(r => r.valid).sort((a, b) => b.score - a.score);
  if (!eligible.length) return { identity: null, ambiguous: false };
  const best = eligible[0];
  const conflict = eligible.find(r => (r.doi && best.doi ? r.doi !== best.doi : keyName(r.name) !== keyName(best.name)) && best.score - r.score < .04);
  if (conflict) return { identity: null, ambiguous: true };
  const same = eligible.filter(r => r.doi && r.doi === best.doi);
  // Crossref is the source of the published container name. Only combine ISSNs
  // when both providers agree on that container, even for the same article DOI.
  const identity = { ...best, issns: [...new Set(eligible.filter(r => (r === best || same.includes(r)) && keyName(r.name) === keyName(best.name)).flatMap(r => r.issns))] };
  delete identity.valid; delete identity.score;
  return { identity, ambiguous: false };
}
