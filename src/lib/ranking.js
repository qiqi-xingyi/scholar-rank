/** Shared venue lookup, truncation handling and English badge descriptions. Local aliases disambiguate source names; supplemental venues never acquire invented rankings. */
(function (root) {
  'use strict';

  const { normalizeName, nameTokens, venueCandidates, conferenceKey } = root.SRNorm;

  function tokensOf(name) {
    const raw = String(name || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!raw) return [];
    const stop = new Set(['the', 'of', 'a', 'an', 'and', 'for', 'on', 'in']);
    return raw.split(' ').filter((t) => t && !stop.has(t));
  }

  const FIELD_NAMES = {
    '计算机体系结构': 'Computer Architecture', '并行与分布计算': 'Parallel & Distributed Computing',
    '存储系统': 'Storage Systems', '计算机网络': 'Computer Networks',
    '网络与信息安全': 'Network & Information Security', '软件工程': 'Software Engineering',
    '系统软件': 'Systems Software', '程序设计语言': 'Programming Languages',
    '数据库': 'Databases', '数据挖掘': 'Data Mining', '内容检索': 'Information Retrieval',
    '计算机科学理论': 'Theoretical Computer Science', '计算机图形学与多媒体': 'Computer Graphics & Multimedia',
    '人工智能': 'Artificial Intelligence', '人机交互与普适计算': 'Human-Computer Interaction & Ubiquitous Computing',
    '交叉': 'Interdisciplinary', '综合': 'General', '新兴': 'Emerging Fields',
    '分布式计算与系统软件': 'Distributed Computing & Systems Software', '人机交互': 'Human-Computer Interaction',
    '数据管理与数据科学': 'Data Management & Data Science', '机器学习': 'Machine Learning',
    '网络空间安全': 'Cybersecurity', '计算理论': 'Theory of Computation', '应用计算': 'Applied Computing',
    '计算机科学与工程（旧分类）': 'Computer Science & Engineering (legacy)',
    '图形学、增强现实与游戏': 'Graphics, Augmented Reality & Games',
    '计算机视觉与多媒体计算': 'Computer Vision & Multimedia Computing',
    '信息系统': 'Information Systems', '图书情报学': 'Library & Information Science',
  };
  const englishField = (field) => String(field || '').split('/').map((part) => FIELD_NAMES[part.trim()] || part.trim()).join(' / ');

  const DEFAULTS = {
    showPreprint: true,
    showJournalName: true,
    showConferenceName: true,
    showCcf: true,
    showCore: true,
    showCas: true,
    showTop: true,
    showIf: true,
    showJcr: true,
    minKeyLength: 5,
    minPrefixLength: 14,
    fuzzyConf: true,
  };

  const SECONDARY_TRACK_MARKERS = [
    { raw: /\bworkshops?\b/i, official: /\bworkshops?\b/i, label: 'workshop' },
    { raw: /\bfindings\b/i, official: /\bfindings\b/i, label: 'findings' },
    { raw: /\bcompanion\b/i, official: /\bcompanion\b/i, label: 'companion' },
    { raw: /\b(?:demo|demonstration)s?(?:\s+track)?\b/i, official: /\b(?:demo|demonstration)s?\b/i, label: 'demo' },
    { raw: /\bextended\s+abstracts?\b/i, official: /\bextended\s+abstracts?\b/i, label: 'extended abstracts' },
    { raw: /\bdoctoral\s+consortium\b/i, official: /\bdoctoral\s+consortium\b/i, label: 'doctoral consortium' },
    { raw: /\bshort\s+papers?\b/i, official: /\bshort\s+papers?\b/i, label: 'short papers' },
    { raw: /\badjunct\b/i, official: /\badjunct\b/i, label: 'adjunct' },
  ];

  const OFFICIAL_WORKSHOP_EXCEPTIONS = new Set(['HOTSTORAGE']);

  function secondaryTrackReason(raw, entry) {
    if (!entry) return null;
    const officialName = String(entry.name || '');
    const abbr = String(entry.abbr || '').toUpperCase();
    for (const marker of SECONDARY_TRACK_MARKERS) {
      if (!marker.raw.test(raw)) continue;
      if (marker.official.test(officialName)) continue;
      if (marker.label === 'workshop' && OFFICIAL_WORKSHOP_EXCEPTIONS.has(abbr)) continue;
      return marker.label;
    }
    return null;
  }

  const CORE_BADGE = {
    'A*': { text: 'A*', slug: 'astar' },
    A: { text: 'A', slug: 'a' },
    B: { text: 'B', slug: 'b' },
    C: { text: 'C', slug: 'c' },
    'Australasian A': { text: 'Australasian A', slug: 'aus' },
    'Australasian B': { text: 'Australasian B', slug: 'aus' },
    'Australasian C': { text: 'Australasian C', slug: 'aus' },
  };

  class Ranking {

    constructor(data, options) {
      const aliasData = data.aliases || {};
      this.options = Object.assign({}, DEFAULTS, options);
      this.displayAcronyms = new Map(Object.entries(aliasData.displayAcronyms || {}).map(([from, to]) => [from.toUpperCase(), to]));
      this.extraConferences = new Map();
      this.extraConferenceTitles = new Map();
      for (const entry of aliasData.extraConferences || []) {
        for (const name of [entry.name, entry.abbr, ...(entry.names || [])]) {
          this.extraConferences.set(normalizeName(name), entry);
          this.extraConferenceTitles.set(conferenceKey(name), entry);
        }
      }

      const journalData = data.journals;
      this.journals = (journalData && journalData.journals) || {};
      this.journalAliases = Object.assign({}, journalData && journalData.aliases);
      this.journalLabels = new Map();
      this.explicitJournalKeys = new Set();
      this.missingJournalAliases = [];
      for (const entry of aliasData.journalNames || []) {
        const nameKey = normalizeName(entry.name);
        const target = this.journals[nameKey] ? nameKey : this.journalAliases[nameKey];
        const record = this.journals[target];
        if (!record) { this.missingJournalAliases.push(entry.name); continue; }
        this.journalLabels.set(record, entry.abbr);
        for (const name of [entry.name, entry.abbr, ...(entry.names || [])]) {
          const key = normalizeName(name);
          const existing = this.journals[key] || this.journals[this.journalAliases[key]];
          if (existing && existing !== record) { this.missingJournalAliases.push(name); continue; }
          this.journalAliases[key] = target;
          this.explicitJournalKeys.add(key);
        }
      }
      this.journalMeta = { generatedAt: journalData && journalData.generatedAt, count: journalData && journalData.count };
      this.ccfMeta = { version: data.ccf && data.ccf.version, count: data.ccf && data.ccf.count };
      this.coreMeta = { version: data.core && data.core.version, count: data.core && data.core.count };

      this.missingAliases = [];
      this.ccf = this.buildConfIndex(data.ccf, aliasData, null, true);
      this.core = this.buildConfIndex(data.core, aliasData, aliasData.ccfToCore || {}, false, aliasData.coreNames);

      this.cache = new Map();
    }

    buildConfIndex(confData, aliasData, abbrMap, report, extraNames) {
      const byAbbr = new Map();
      const byAbbrAll = new Map();
      const byKey = new Map();
      const fuzzy = [];
      const named = [];
      const titlePairs = [];
      const addKey = (name, entry) => {
        const key = normalizeName(name);
        if (key && key.length >= 4 && !byKey.has(key)) byKey.set(key, entry);
      };

      for (const e of (confData && confData.entries) || []) {
        const abbr = (e.abbr || '').toUpperCase();
        if (abbr && !byAbbr.has(abbr)) byAbbr.set(abbr, e);
        if (abbr) {
          if (!byAbbrAll.has(abbr)) byAbbrAll.set(abbr, []);
          byAbbrAll.get(abbr).push(e);
        }
        addKey(e.name, e);
        const bare = String(e.name || '').replace(/\s*\([^()]*\)\s*$/, '');
        if (bare !== e.name) addKey(bare, e);
        named.push([bare, e]);
        addKey(e.abbr, e);
        if (e.type !== 'journal') {
          const label = this.conferenceLabel(e);
          addKey(label, e);
          if (!byAbbr.has(label.toUpperCase())) byAbbr.set(label.toUpperCase(), e);
        }

        if (e.type !== 'journal') titlePairs.push([conferenceKey(bare), e]);
        const toks = tokensOf(bare);
        if (toks.length >= 4) fuzzy.push({ entry: e, set: new Set(toks) });
      }

      const resolve = (abbr, hintName) => {
        const reference = typeof abbr === 'string' ? { abbr } : abbr;
        const target = abbrMap ? (abbrMap[reference.abbr] ?? reference.abbr) : reference.abbr;
        hintName = reference.name || hintName;
        const list = byAbbrAll.get(String(target).toUpperCase());
        if (!list || !list.length) return null;
        if (list.length === 1 || !hintName) return list[0];
        const set = new Set(tokensOf(hintName));
        let best = list[0];
        let bestScore = -1;
        for (const e of list) {
          const score = Ranking.containment(set, new Set(tokensOf(e.name)));
          if (score > bestScore) { bestScore = score; best = e; }
        }
        return best;
      };

      for (const [name, abbr] of Object.entries(aliasData.names || {})) {
        const e = resolve(abbr, name);
        if (!e) { if (report) this.missingAliases.push(`names/${name} -> ${abbr}`); continue; }
        const key = normalizeName(name);
        if (key) byKey.set(key, e);
        named.push([name, e]);
        if (e.type !== 'journal') titlePairs.push([conferenceKey(name), e]);
      }
      for (const [from, abbr] of Object.entries(aliasData.acronyms || {})) {
        const e = resolve(abbr, null);
        if (!e) { if (report) this.missingAliases.push(`acronyms/${from} -> ${abbr}`); continue; }
        if (!byAbbr.has(from.toUpperCase())) byAbbr.set(from.toUpperCase(), e);
      }
      for (const [name, abbr] of Object.entries(extraNames || {})) {
        const list = byAbbrAll.get(String(abbr).toUpperCase());
        if (!list || !list.length) { this.missingAliases.push(`coreNames/${name} -> ${abbr}`); continue; }
        const key = normalizeName(name);
        if (key) byKey.set(key, list[0]);
        named.push([name, list[0]]);
        titlePairs.push([conferenceKey(name), list[0]]);
      }

      return {
        byAbbr, byKey, fuzzy, titlePairs,
        prefixPairs: Ranking.prefixPairs(byKey),
        infixItems: Ranking.infixItems(named, (e) => e.type === 'journal'),
      };
    }

    static infixItems(pairs, isJournal) {
      const out = [];
      for (const [name, entry] of pairs) {
        const tokens = nameTokens(name);
        if (tokens.length) out.push({ tokens, entry, minStart: isJournal(entry) ? 1 : 0 });
      }
      return out;
    }

    static prefixPairs(pairs) {
      const out = [...pairs];
      const seen = new Set();
      for (const [, entry] of out.slice()) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        const name = String(entry.name || entry.n || '');
        const short = name.replace(/^(?:(?:IEEE|ACM)(?:\s*\/\s*(?:IEEE|ACM))?\s+)?(?:Transactions|Trans\.?|Journal|J\.?|Proceedings|Proc\.?|Letters)\s+(?:on|of|in)\s+/i, '');
        if (short !== name) out.push([normalizeName(short), entry]);
      }
      return out;
    }

    static containment(a, b) {
      const [small, big] = a.size <= b.size ? [a, b] : [b, a];
      let hit = 0;
      for (const t of small) if (big.has(t)) hit++;
      return hit / small.size;
    }

    static uniquePrefixMatch(pairs, key) {
      let hit = null;
      for (const [k, e] of pairs) {
        if (!k.startsWith(key)) continue;
        if (hit && hit !== e) return null;
        hit = e;
      }
      return hit;
    }

    static infixMatches(items, frag, openEnd) {
      const n = frag.length;
      const out = [];
      for (const { tokens, entry, minStart } of items) {
        const last = tokens.length - n;
        let found = false;
        for (let p = openEnd ? minStart : Math.max(minStart, last); p <= last && !found; p++) {
          found = true;
          for (let i = 0; i < n && found; i++) {
            found = openEnd && i === n - 1 ? tokens[p + i].startsWith(frag[i]) : tokens[p + i] === frag[i];
          }
        }
        if (found && !out.some((e) => e === entry || (e.issn && e.issn === entry.issn))) out.push(entry);
      }
      return out;
    }

    findFragment(names, openEnd) {
      if (!this.journalInfix) {
        const pairs = Object.values(this.journals).map((rec) => [rec.n, rec]);
        for (const [name, target] of Object.entries(this.journalAliases)) {
          const rec = this.journals[target];
          if (rec) pairs.push([name, rec]);
        }
        this.journalInfix = Ranking.infixItems(pairs, () => true);
      }
      const pick = (list) => (list.length === 1 ? { entry: list[0], via: 'Truncated fragment match' } : null);
      for (const n of names) {
        if (normalizeName(n).length < this.options.minPrefixLength) continue;
        const frag = nameTokens(n);
        const [ccf, core, journal] = [this.ccf.infixItems, this.core.infixItems, this.journalInfix]
          .map((items) => Ranking.infixMatches(items, frag, openEnd));
        if (ccf.length > 1 || core.length > 1 || journal.filter((rec) => rec.issn).length > 1) continue;
        const hit = { ccf: pick(ccf), core: pick(core), journal: pick(journal) };
        if (hit.ccf || hit.core || hit.journal) return hit;
      }
      return null;
    }

    static sameVenue(index, entry, rec) {
      if (index.byKey.get(normalizeName(rec.n)) === entry) return true;
      return Ranking.containment(new Set(tokensOf(rec.n)), new Set(tokensOf(entry.name))) >= 0.85;
    }

    findConf(index, names, acronyms, cut) {
      if (!index) return null;
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minKeyLength) continue;
        const e = index.byKey.get(key);
        if (!e) continue;
        if (cut && cut.head && e.type === 'journal') continue;
        if (cut && cut.name && Ranking.uniquePrefixMatch(index.prefixPairs, key) !== e) continue;
        return { entry: e, via: 'Exact name match' };
      }
      for (const a of acronyms) {
        const e = index.byAbbr.get(a);
        if (e) return { entry: e, via: `Acronym ${a}` };
      }
      // Keep all candidates so publisher/edition removal cannot hide collisions.
      if (!(cut && cut.head)) for (const n of names) {
        const key = conferenceKey(n);
        if (key.length < this.options.minPrefixLength) continue;
        const candidates = index.titlePairs.filter(([k]) => cut ? k.startsWith(key) : k === key);
        const entries = new Set(candidates.map(([, entry]) => entry));
        if (entries.size > 1) return null;
        if (entries.size === 1) return { entry: entries.values().next().value, via: 'Conference title without edition metadata' };
      }
      if (cut) {
        for (const n of cut.head ? [] : names) {
          const key = normalizeName(n);
          if (key.length < this.options.minPrefixLength) continue;
          const e = Ranking.uniquePrefixMatch(index.prefixPairs, key);
          if (e) return { entry: e, via: 'Truncated prefix match' };
        }
        return null;
      }
      if (!this.options.fuzzyConf) return null;
      const matches = new Map();
      for (const n of names) {
        const set = new Set(tokensOf(n));
        if (set.size < 4) continue;
        for (const cand of index.fuzzy) {
          const score = Ranking.containment(set, cand.set);
          const shared = [...set].filter(t => cand.set.has(t)).length;
          const similarity = shared / (set.size + cand.set.size - shared);
          if (score >= 0.85 && similarity >= 0.65 && similarity > (matches.get(cand.entry)?.similarity || 0)) matches.set(cand.entry, { entry: cand.entry, score, similarity, via: 'Fuzzy name match' });
        }
      }
      const best = [...matches.values()].sort((a, b) => b.similarity - a.similarity);
      return best.length && (!best[1] || best[0].similarity - best[1].similarity >= 0.08) ? best[0] : null;
    }

    findJournal(names, cut) {
      if (cut && cut.head) return null;
      if (cut && !this.journalPairs) {
        const pairs = Object.entries(this.journals);
        for (const [name, target] of Object.entries(this.journalAliases)) {
          const rec = this.journals[target];
          if (rec) pairs.push([name, rec]);
        }
        this.journalPairs = Ranking.prefixPairs(pairs);
      }
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minKeyLength && !this.explicitJournalKeys.has(key) && !/[\u3400-\u9fff]{2}/.test(key)) continue;
        const rec = this.journals[key] || this.journals[this.journalAliases[key]];
        if (!rec) continue;
        if (cut && cut.name && Ranking.uniquePrefixMatch(this.journalPairs, key) !== rec) continue;
        return { entry: rec, matchedName: n, via: 'Exact name match' };
      }
      if (!cut) return null;
      for (const n of names) {
        const key = normalizeName(n);
        if (key.length < this.options.minPrefixLength) continue;
        const rec = Ranking.uniquePrefixMatch(this.journalPairs, key);
        if (rec) return { entry: rec, matchedName: rec.n || n, via: 'Truncated prefix match' };
      }
      return null;
    }

    conferenceLabel(entry) {
      const raw = String(entry.abbr || '').trim();
      return this.displayAcronyms.get(raw.toUpperCase()) || raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || entry.name;
    }

    findExtraConference(names, acronyms, cut) {
      // Truncated text is insufficient; a retained explicit acronym can still identify the venue.
      const candidates = cut ? acronyms : [...names, ...acronyms];
      for (const candidate of candidates) {
        const entry = this.extraConferences.get(normalizeName(candidate)) || this.extraConferenceTitles.get(conferenceKey(candidate));
        if (entry) return entry;
      }
      return null;
    }

    lookup(venue) {
      const raw = String(venue || '').trim();
      if (this.cache.has(raw)) return this.cache.get(raw);

      const { names, acronyms, kind, truncated, truncatedHead, truncatedTail, truncatedName, preprintName } = venueCandidates(raw);
      const result = { kind, raw, truncated, preprintName };
      const cut = truncated ? { head: truncatedHead, tail: truncatedTail, name: truncatedName } : null;
      if (kind === 'normal') {
        const extra = this.findExtraConference(names, acronyms, cut);
        if (extra && !secondaryTrackReason(raw, extra)) {
          result.conference = extra;
          result.matchedName = extra.name;
          result.via = 'Verified conference name';
          this.cache.set(raw, result);
          return result;
        }
        const frag = (cut && cut.head && this.findFragment(names, cut.tail)) || {};
        let ccf = this.findConf(this.ccf, names, acronyms, cut) || frag.ccf;
        const ccfSecondary = ccf && secondaryTrackReason(raw, ccf.entry);
        if (ccfSecondary) {
          result.secondaryTrack = ccfSecondary;
          ccf = null;
        }
        let core = this.findConf(this.core, names, acronyms, cut) || frag.core;
        // Once CCF identifies a conference, its exact canonical name can join the
        // CORE directory even when the original citation uses a historical title.
        // Do not join by acronym alone: different conferences can share one.
        if (ccf && ccf.entry.type === 'conference') {
          const entry = this.core.byKey.get(normalizeName(ccf.entry.name));
          if (!core && entry) core = { entry, via: 'Canonical CCF conference name' };
          // An exact CORE title outranks a conflicting fuzzy CCF guess. For
          // example, HiPC's full title must not acquire SC's CCF A ranking.
          if (core && entry && core.entry !== entry && ccf.via === 'Fuzzy name match' && core.via === 'Exact name match') ccf = null;
        }
        if (ccf) { result.ccf = ccf.entry; result.via = ccf.via; }
        const coreSecondary = core && secondaryTrackReason(raw, core.entry);
        if (coreSecondary) {
          result.secondaryTrack = result.secondaryTrack || coreSecondary;
          core = null;
        }
        if (core) { result.core = core.entry; result.coreVia = core.via; }
        let jr = this.findJournal(names, cut);
        if (!jr && frag.journal
          && (!ccf || Ranking.sameVenue(this.ccf, ccf.entry, frag.journal.entry))
          && (!core || Ranking.sameVenue(this.core, core.entry, frag.journal.entry))) {
          jr = { entry: frag.journal.entry, matchedName: frag.journal.entry.n, via: frag.journal.via };
        }
        if (jr) { result.journal = jr.entry; result.matchedName = jr.matchedName; result.via = result.via || jr.via; }
        if (!result.ccf && !result.core) {
          const extra = this.findExtraConference(names, acronyms, cut);
          if (extra && !secondaryTrackReason(raw, extra)) {
            result.conference = extra;
            result.matchedName = extra.name;
            result.via = 'Verified conference name';
          }
        }
        if (!result.matchedName) {
          const hit = ccf || core;
          if (hit) result.matchedName = hit.entry.abbr || hit.entry.name;
          if (!result.via && core) result.via = core.via;
        }
      }
      this.cache.set(raw, result);
      return result;
    }

    badges(result) {
      const o = this.options;
      const out = [];
      if (!result) return out;
      if (result.kind === 'preprint') {
        if (o.showPreprint) out.push({
          key: 'preprint', text: result.preprintName || 'Preprint', cls: 'sr-preprint',
          title: `Preprint${result.preprintName ? ` (${result.preprintName})` : ''}\nNot peer reviewed; excluded from rankings`,
        });
        return out;
      }
      if (result.kind !== 'normal') return out;

      const ccf = result.ccf;
      const core = result.core;
      const conference = (ccf && ccf.type === 'conference' ? ccf : core) || result.conference;
      if (o.showConferenceName && conference) out.push({
        key: 'conference', text: this.conferenceLabel(conference), cls: 'sr-conference',
        title: conference.name,
      });
      if (o.showCcf && ccf && ccf.type === 'conference') out.push({
        key: 'ccf', text: `CCF ${ccf.rank}`, cls: `sr-ccf sr-ccf-${ccf.rank.toLowerCase()}`,
        title: `CCF ${ccf.rank} ${ccf.type === 'journal' ? 'journal' : 'conference'}\n${ccf.abbr} — ${ccf.name}\nField: ${englishField(ccf.field)}`,
      });
      if (o.showCore && core && CORE_BADGE[core.rank]) {
        const badge = CORE_BADGE[core.rank];
        out.push({
          key: 'core', text: `CORE ${badge.text}`, cls: `sr-core sr-core-${badge.slug}`,
          title: `CORE ${core.rank} (${core.source || 'CORE'})\n${core.abbr} — ${core.name}${core.field ? `\nField: ${englishField(core.field)}` : ''}`,
        });
      }

      // A conference proceedings record in the journal database must not acquire journal badges.
      const j = conference ? null : result.journal;
      if (j) {
        const shortName = this.journalLabels.get(j);
        if (o.showJournalName && shortName) out.push({
          key: 'journal', text: shortName, cls: 'sr-journal', title: j.n,
        });
        if (o.showJcr && /^Q[1-4]$/.test(j.q)) out.push({
          key: 'jcr', text: `JCR ${j.q}`, cls: `sr-jcr sr-${j.q.toLowerCase()}`,
          title: `JCR 2025 quartile: ${j.q}\n${j.n}`,
        });
        if (o.showCas && j.zone && j.cat) out.push({
          key: 'cas', text: `CAS ${j.zone}`, cls: `sr-cas sr-zone-${j.zone}`,
          title: `Chinese Academy of Sciences journal tiers 2025\nBroad category: ${j.cat}, Tier ${j.zone}\nIndexed in: ${j.wos || 'Unknown'}`,
        });
        if (o.showIf && j.if != null) out.push({
          key: 'if', text: `IF ${j.if}`, cls: 'sr-if', title: `JCR 2025 impact factor: ${j.if}\n${j.n}`,
        });
        if (o.showTop && j.top != null) out.push({
          key: 'top', text: j.top ? 'TOP' : 'Non-TOP', cls: j.top ? 'sr-top' : 'sr-non-top',
          title: `CAS 2025 TOP journal: ${j.top ? 'Yes' : 'No'}\n${j.n}`,
        });
      }

      return out;
    }

  }

  Ranking.DEFAULTS = DEFAULTS;
  Ranking.englishField = englishField;
  root.SRRanking = Ranking;
})(typeof globalThis !== 'undefined' ? globalThis : this);
