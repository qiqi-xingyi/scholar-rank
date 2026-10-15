/** Annotate Scholar profiles, search/cited-by results and publication details. Render profile statistics and observe newly loaded rows. */
(function () {
  'use strict';

  const MARK = 'srDone';
  const PENDING = 'srPending';
  const CONTAINER_CLASS = 'sr-badges';
  const STATS_PANEL_CLASS = 'sr-stats-panel';

  let ranking = null;
  let settings = null;
  let activeProfileFilter = null;
  let loadAllRunning = false;
  let loadAllCancelled = false;
  let loadAllState = '';
  let backendGeneration = 0;
  let remoteResults = new WeakMap();

  async function loadJson(path) {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) throw new Error(`Unable to read ${path}: HTTP ${res.status}`);
    return res.json();
  }

  function venueTextOf(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.gs_oph, .' + CONTAINER_CLASS).forEach((el) => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  const BADGE_OPTIONS = { journal: 'showJournalName', conference: 'showConferenceName', jcr: 'showJcr', cas: 'showCas', if: 'showIf', top: 'showTop', ccf: 'showCcf', core: 'showCore' };

  function buildBadges(venue, remote) {
    const result = ranking.lookup(venue);
    const badges = remote?.identity ? remote.badges.filter(b => settings[BADGE_OPTIONS[b.key]]) : ranking.badges(result);
    if (!badges.length) {
      if (remote?.identity) return null;
      if (!settings.showUnmatched || result.kind !== 'normal') return null;
      badges.push({ key: 'none', text: 'Unmatched', cls: 'sr-none', title: `No local dataset match: ${venue}` });
    }
    const box = document.createElement('div');
    box.className = CONTAINER_CLASS + ' ' + SRSettings.themeClass(settings.theme)
      + (settings.boldBadges ? ' sr-bold' : '');
    SRSettings.applyBadgeScale(box, settings.badgeScale);
    for (const b of badges) {
      const span = document.createElement('span');
      span.className = `sr-badge ${b.cls}`;
      span.textContent = b.text;
      span.title = b.title;
      box.appendChild(span);
    }
    return box;
  }

  function publicationOf(host, venues) {
    const profile = host.matches?.('tr.gsc_a_tr') ? host : host.closest?.('tr.gsc_a_tr');
    const search = host.closest?.('.gs_r');
    const titleNode = profile?.querySelector('.gsc_a_at') || search?.querySelector('.gs_rt') || document.querySelector('#gsc_oci_title, #gsc_vcd_title');
    const title = titleNode ? venueTextOf(titleNode) : '';
    const yearText = profile?.querySelector('.gsc_a_y')?.textContent || (search ? venues.join(' ') : '');
    const year = /\b(18|19|20)\d{2}\b/.exec(yearText)?.[0];
    const authors = profile ? profileRowData(profile)?.authors : search?.querySelector('.gs_a') ? venueTextOf(search.querySelector('.gs_a')).split(' - ')[0] : '';
    const links = [...(search || host).querySelectorAll('a[href]')];
    const doi = links.map(a => a.href.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^?#]+)/i)?.[1]).find(Boolean) || '';
    return { title, venue: venues[0] || '', authors: authors || '', year: year ? Number(year) : null, doi };
  }

  function inject(host, venues, anchor, before, skipLocal = false) {
    if (host.dataset[MARK]) return;
    host.dataset[MARK] = '1';
    const list = Array.isArray(venues) ? venues : [venues];
    let box = null;
    if (!skipLocal) for (const v of list) { box = buildBadges(v); if (box) break; }
    const place = () => { if (!box || !anchor.parentNode) return; if (before) anchor.parentNode.insertBefore(box, anchor); else anchor.parentNode.insertBefore(box, anchor.nextSibling); };
    place();
    if (!globalThis.SRBackend || !list.some(v => ranking.lookup(v).kind === 'normal')) return;
    const publication = publicationOf(host, list);
    if (!publication.title && !publication.doi) return;
    const generation = backendGeneration;
    SRBackend.resolve(publication).then(remote => {
      if (!remote?.identity || !host.isConnected || generation !== backendGeneration || !settings.enabled) return;
      remoteResults.set(host, remote);
      if (box) box.remove();
      box = buildBadges(list[0], remote); place();
      if (host.matches?.('tr.gsc_a_tr')) renderProfileStats();
    }).catch(() => {});
  }

  function remoteStatResult(remote) {
    const result = { kind: 'normal' };
    const metric = key => remote.metrics.find(m => m.scheme === key)?.value;
    if (remote.identity.type === 'conference') {
      if (metric('ccf')) result.ccf = { type: 'conference', rank: metric('ccf') };
      result.conference = { name: remote.identity.name };
    } else result.journal = { n: remote.identity.name, zone: metric('cas')?.zone };
    return result;
  }

  function profileRowData(row) {
    const cell = row.querySelector('.gsc_a_t');
    if (!cell) return null;
    const grays = cell.querySelectorAll(':scope > .gs_gray');
    const venueEl = grays.length >= 2 ? grays[1] : null;
    return {
      venueEl,
      rawVenue: venueEl ? venueTextOf(venueEl) : '',
      venue: row.dataset.srUnverified ? '' : row.dataset.srResolvedVenue || (venueEl ? venueTextOf(venueEl) : ''),
      authors: grays.length ? venueTextOf(grays[0]) : '',
    };
  }

  function annotateProfile() {
    if (!settings.showOnProfile) return;
    for (const row of document.querySelectorAll('#gsc_a_b tr.gsc_a_tr')) {
      if (row.dataset[MARK]) continue;
      const data = profileRowData(row);
      if (!data) continue;
      if (!data.venueEl) { const title = row.querySelector('.gsc_a_at'); if (title) inject(row, '', title, false, true); continue; }
      if (!data.venue) { if (data.rawVenue) inject(row, data.rawVenue, data.venueEl, true, true); continue; }
      const match = ranking.lookup(data.venue);
      // A hidden suffix may be a workshop or a different conference. Validate
      // truncated conference sources even when a shorter title has a local hit.
      const detail = settings.resolveTruncated && match.kind === 'normal' && match.truncated && (!match.journal || !ranking.badges(match).length || match.ccf?.type === 'conference' || match.core || match.conference) && profileDetailUrl(row);
      if (!detail) { inject(row, data.venue, data.venueEl, true); continue; }
      row.dataset[MARK] = '1';
      const ticket = row.dataset[PENDING] = String(++pendingSeq);
      cachedVenueOf('profile:' + detail.searchParams.get('citation_for_view'), () => fetchProfileVenue(detail)).then(full => {
        if (!row.isConnected || row.dataset[PENDING] !== ticket || !settings.enabled || !settings.showOnProfile || !settings.resolveTruncated) return;
        delete row.dataset[PENDING];
        delete row.dataset[MARK];
        const usable = full && SRNorm.venueCandidates(data.venue).names.some(v => SRNorm.completesTruncated(full, v));
        if (usable) {
          row.dataset.srResolvedVenue = full;
          inject(row, full, data.venueEl, true);
        } else {
          row.dataset.srUnverified = '1';
          inject(row, data.venue, data.venueEl, true, true);
        }
        renderProfileStats();
      });
    }
  }

  function citationStatsHost() {
    const anchors = [
      document.querySelector('#gsc_rsb_st'),
      document.querySelector('#gsc_g'),
      document.querySelector('#gsc_rsb_cit'),
    ].filter(Boolean);

    for (const node of anchors) {
      const section = node.closest('.gsc_rsb_s');
      if (section) return section;
      if (node.parentElement && node.parentElement !== document.body) return node.parentElement;
    }

    const rail = document.querySelector('#gsc_rsb');
    if (rail) return rail.querySelector('.gsc_rsb_s') || rail;

    for (const heading of document.querySelectorAll('.gsc_rsb_h, .gsc_rsb_hdr')) {
      const label = heading.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (label.includes('引用次数') || label === 'cited by' || label === 'citations') {
        return heading.closest('.gsc_rsb_s') || heading.parentElement;
      }
    }
    return null;
  }

  function ensureStatsPanel() {
    const host = citationStatsHost();
    let panel = document.querySelector('.' + STATS_PANEL_CLASS);
    if (!host) {
      if (panel) panel.remove();
      return null;
    }
    if (!panel) {
      panel = document.createElement('aside');
      panel.className = STATS_PANEL_CLASS;
      panel.setAttribute('aria-label', 'Publication statistics');
      panel.innerHTML = `
        <div class="sr-stats-header">
          <span>Publication statistics</span>
          <span class="sr-stats-toggle" role="button" tabindex="0" aria-label="Collapse publication statistics" aria-expanded="true">−</span>
        </div>
        <div class="sr-stats-body">
          <div class="sr-stats-total">
            Loaded <strong data-stat="total">0</strong> publications
            <span data-stat-wrap="visible" hidden> · Showing <strong data-stat="visible">0</strong></span>
          </div>
          <div class="sr-stats-title">CCF rankings</div>
          <div class="sr-stats-grid sr-stats-grid-ccf">
            <span class="sr-stat sr-stat-a" data-filter="ccf-a" role="button" tabindex="0" aria-pressed="false"><span>A</span><strong data-stat="ccf-a">0</strong></span>
            <span class="sr-stat sr-stat-b" data-filter="ccf-b" role="button" tabindex="0" aria-pressed="false"><span>B</span><strong data-stat="ccf-b">0</strong></span>
            <span class="sr-stat sr-stat-c" data-filter="ccf-c" role="button" tabindex="0" aria-pressed="false"><span>C</span><strong data-stat="ccf-c">0</strong></span>
          </div>
          <div class="sr-stats-title">CAS tiers</div>
          <div class="sr-stats-grid sr-stats-grid-zone">
            <span class="sr-stat sr-stat-z1" data-filter="zone-1" role="button" tabindex="0" aria-pressed="false"><span>Tier 1</span><strong data-stat="zone-1">0</strong></span>
            <span class="sr-stat sr-stat-z2" data-filter="zone-2" role="button" tabindex="0" aria-pressed="false"><span>Tier 2</span><strong data-stat="zone-2">0</strong></span>
            <span class="sr-stat sr-stat-z3" data-filter="zone-3" role="button" tabindex="0" aria-pressed="false"><span>Tier 3</span><strong data-stat="zone-3">0</strong></span>
            <span class="sr-stat sr-stat-z4" data-filter="zone-4" role="button" tabindex="0" aria-pressed="false"><span>Tier 4</span><strong data-stat="zone-4">0</strong></span>
          </div>
          <span class="sr-stats-first" data-filter="first" role="button" tabindex="0" aria-pressed="false"><span>First-author papers</span><strong data-stat="first">0</strong></span>
          <button type="button" class="sr-load-all">Load all publications</button>
          <div class="sr-load-status" data-stat="load-status" role="status"></div>
          <div class="sr-stats-note" data-stat="note">Click a category to filter · Includes marked co-first authors</div>
        </div>`;
      const toggleStats = (event) => {
        const collapsed = panel.classList.toggle('sr-stats-collapsed');
        event.currentTarget.textContent = collapsed ? '+' : '−';
        event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
        event.currentTarget.setAttribute('aria-label', collapsed ? 'Expand publication statistics' : 'Collapse publication statistics');
      };
      const toggle = panel.querySelector('.sr-stats-toggle');
      toggle.addEventListener('click', toggleStats);
      toggle.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleStats(event);
      });
      panel.querySelectorAll('[data-filter]').forEach((button) => {
        const activateFilter = () => {
          if (button.getAttribute('aria-disabled') === 'true') return;
          const filter = button.dataset.filter;
          activeProfileFilter = activeProfileFilter === filter ? null : filter;
          renderProfileStats();
        };
        button.addEventListener('click', activateFilter);
        button.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          activateFilter();
        });
      });
      panel.querySelector('.sr-load-all').addEventListener('click', () => {
        if (loadAllRunning) {
          loadAllCancelled = true;
          loadAllState = 'Stopping…';
          updateLoadAllControl(panel);
        } else {
          void loadAllPapers();
        }
      });
    }

    if (panel.parentNode !== host) host.appendChild(panel);
    panel.classList.add('sr-stats-integrated');
    return panel;
  }

  function setStat(panel, key, value) {
    const node = panel.querySelector(`[data-stat="${key}"]`);
    const text = String(value);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function profileAuthorNames() {
    const profileName = (document.querySelector('#gsc_prf_in') || {}).textContent || '';
    return SRStats.profileNames([profileName, settings.authorAliases || '']);
  }

  function profileEntries() {
    const entries = [];
    for (const row of document.querySelectorAll('#gsc_a_b tr.gsc_a_tr')) {
      const data = profileRowData(row);
      entries.push({
        row,
        authors: data ? data.authors : '',
        result: remoteResults.has(row) ? remoteStatResult(remoteResults.get(row)) : data && data.venue ? ranking.lookup(data.venue) : null,
      });
    }
    return entries;
  }

  function moreButton() {
    return document.querySelector('#gsc_bpf_more');
  }

  function canLoadMore() {
    const button = moreButton();
    if (!button) return false;
    const style = getComputedStyle(button);
    return !button.disabled
      && button.getAttribute('aria-disabled') !== 'true'
      && !button.classList.contains('gs_dis')
      && style.display !== 'none'
      && style.visibility !== 'hidden';
  }

  function updateLoadAllControl(panel) {
    const button = panel && panel.querySelector('.sr-load-all');
    if (!button) return;

    let label = 'Load all publications';
    let disabled = false;
    if (loadAllRunning) label = loadAllCancelled ? 'Stopping…' : `Stop loading (${profileEntries().length} publications)`;
    else if (!canLoadMore()) { label = 'All publications loaded'; disabled = true; }
    else if (loadAllState) label = 'Continue loading';

    if (button.textContent !== label) button.textContent = label;
    button.disabled = disabled;
    setStat(panel, 'load-status', loadAllState);
  }

  function waitForRowGrowth(before, timeout = 15000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const count = document.querySelectorAll('#gsc_a_b tr.gsc_a_tr').length;
        if (loadAllCancelled || count > before || Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve(count);
        }
      }, 250);
    });
  }

  function shortDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadAllPapers() {
    if (loadAllRunning || !canLoadMore()) return;
    loadAllRunning = true;
    loadAllCancelled = false;
    loadAllState = 'Loading publications; click the button to stop';
    renderProfileStats();

    let pages = 0;
    try {
      while (!loadAllCancelled && canLoadMore() && pages < 200) {
        const button = moreButton();
        const before = document.querySelectorAll('#gsc_a_b tr.gsc_a_tr').length;
        button.click();
        pages++;
        const after = await waitForRowGrowth(before);
        if (loadAllCancelled) break;
        if (after <= before) {
          loadAllState = 'Loading timed out. Check your connection and retry.';
          break;
        }
        annotateAll();
        await shortDelay(500);
      }

      if (loadAllCancelled) loadAllState = 'Loading stopped';
      else if (pages >= 200) loadAllState = 'Reached the limit of 200 pages per run';
      else if (!canLoadMore()) loadAllState = 'All publications loaded';
    } catch (err) {
      loadAllState = 'Loading failed. Please retry.';
      console.error('[Scholar Rank] Auto-loading failed:', err);
    } finally {
      loadAllRunning = false;
      loadAllCancelled = false;
      renderProfileStats();
    }
  }

  function renderProfileStats() {
    const entries = profileEntries();
    if (!settings.enabled || !settings.showOnProfile || !entries.length || !globalThis.SRStats) return;

    const names = profileAuthorNames();
    const summary = SRStats.summarize(entries, names);
    if (activeProfileFilter === 'first' && !summary.firstAuthorAvailable) activeProfileFilter = null;
    const panel = ensureStatsPanel();
    if (!panel) {
      activeProfileFilter = null;
      for (const item of entries) item.row.classList.remove('sr-row-filtered-out');
      return;
    }
    let visible = 0;
    for (const item of entries) {
      const matches = SRStats.matchesFilter(item, activeProfileFilter, names);
      item.row.classList.toggle('sr-row-filtered-out', !matches);
      if (matches) visible++;
    }
    setStat(panel, 'total', summary.total);
    setStat(panel, 'visible', visible);
    panel.querySelector('[data-stat-wrap="visible"]').hidden = !activeProfileFilter;
    setStat(panel, 'ccf-a', summary.ccf.A);
    setStat(panel, 'ccf-b', summary.ccf.B);
    setStat(panel, 'ccf-c', summary.ccf.C);
    for (const zone of [1, 2, 3, 4]) setStat(panel, `zone-${zone}`, summary.zones[zone]);
    setStat(panel, 'first', summary.firstAuthorAvailable ? summary.firstAuthor : '—');
    for (const button of panel.querySelectorAll('[data-filter]')) {
      const selected = button.dataset.filter === activeProfileFilter;
      const disabled = button.dataset.filter === 'first' && !summary.firstAuthorAvailable;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-disabled', String(disabled));
      button.tabIndex = disabled ? -1 : 0;
    }
    setStat(panel, 'note', summary.firstAuthorAvailable
      ? 'Click a category to filter · Includes marked co-first authors'
      : 'Profile name unavailable. Add an author alias in Settings.');
    updateLoadAllControl(panel);
  }

  function annotateSearch() {
    if (!settings.showOnSearch) return;
    for (const meta of document.querySelectorAll('.gs_a')) {
      if (meta.dataset[MARK]) continue;
      const venues = SRNorm.venuesFromByline(venueTextOf(meta));
      if (!venues.length) { inject(meta, '', meta, false, true); continue; }
      const cid = settings.resolveTruncated && truncatedUnmatched(venues) && citeIdOf(meta);
      if (!cid) { inject(meta, venues, meta, false); continue; }

      meta.dataset[MARK] = '1';
      const ticket = meta.dataset[PENDING] = String(++pendingSeq);
      fullVenueOf(cid).then((full) => {
        if (!meta.isConnected || meta.dataset[PENDING] !== ticket) return;
        delete meta.dataset[PENDING];
        delete meta.dataset[MARK];
        const usable = full && venues.some((v) => ranking.lookup(v).truncated && SRNorm.completesTruncated(full, v));
        inject(meta, usable ? [full, ...venues] : venues, meta, false);
      });
    }
  }

  const CITE_GAP_MS = 400;
  const CITE_STORE_PREFIX = 'sr-cite:';
  const citeJobs = new Map();
  let citeTail = Promise.resolve();
  let citeBlocked = false;
  let pendingSeq = 0;

  function truncatedUnmatched(venues) {
    let truncated = false;
    for (const v of venues) {
      const r = ranking.lookup(v);
      if (r.kind !== 'normal' || r.ccf || r.core || r.journal || r.conference) return false;
      if (r.truncated) truncated = true;
    }
    return truncated;
  }

  function citeIdOf(meta) {
    const result = meta.closest('[data-cid]');
    const cid = result ? result.dataset.cid : '';
    return /^[\w-]+$/.test(cid) ? cid : '';
  }

  async function fetchCiteVenue(cid) {
    if (citeBlocked) return '';
    try {
      const res = await fetch(`/scholar?q=info:${cid}:scholar.google.com/&output=cite&scirp=0&hl=en`, { credentials: 'same-origin' });
      const doc = res.ok ? new DOMParser().parseFromString(await res.text(), 'text/html') : null;
      const formats = doc ? [...doc.querySelectorAll('.gs_citr')] : [];
      if (!formats.length) { citeBlocked = true; return ''; }
      const italic = formats.map((f) => f.querySelector('i')).find(Boolean);
      return italic ? italic.textContent.replace(/\s+/g, ' ').trim() : '';
    } catch (err) {
      citeBlocked = true;
      return '';
    }
  }

  function fullVenueOf(cid) {
    return cachedVenueOf('cite:' + cid, () => fetchCiteVenue(cid));
  }

  function cachedVenueOf(cid, fetchVenue) {
    if (citeJobs.has(cid)) return citeJobs.get(cid);
    let stored = null;
    try { stored = sessionStorage.getItem(CITE_STORE_PREFIX + cid); } catch (err) {  }
    let job;
    if (stored !== null) {
      job = Promise.resolve(stored);
    } else {
      job = citeTail.then(() => citeBlocked || !settings.enabled || !settings.resolveTruncated ? '' : fetchVenue()).then((venue) => {
        if (venue && !citeBlocked) {
          try { sessionStorage.setItem(CITE_STORE_PREFIX + cid, venue); } catch (err) {  }
        }
        return venue;
      });
      citeTail = job.then(() => (citeBlocked ? null : shortDelay(CITE_GAP_MS)));
    }
    citeJobs.set(cid, job);
    return job;
  }

  const DETAIL_FIELDS = new Set([
    '期刊', '会议', '来源', '图书', '刊物',
    'journal', 'conference', 'source', 'book', 'publication',
  ]);

  function detailRows(doc) {
    return [...doc.querySelectorAll('#gsc_vcd_table .gs_scl, #gsc_oci_table .gs_scl')].map(row => ({
      row,
      field: row.querySelector('.gsc_vcd_field, .gsc_oci_field'),
      value: row.querySelector('.gsc_vcd_value, .gsc_oci_value'),
    })).filter(({ field, value }) => field && value && DETAIL_FIELDS.has(field.textContent.trim().toLowerCase()));
  }

  function profileDetailUrl(row) {
    const link = row.querySelector('.gsc_a_at[href]');
    if (!link) return null;
    const url = new URL(link.getAttribute('href'), location.href);
    if (url.origin !== location.origin || url.pathname !== '/citations' || url.searchParams.get('view_op') !== 'view_citation' || !url.searchParams.get('citation_for_view')) return null;
    url.searchParams.set('hl', 'en');
    return url;
  }

  async function fetchProfileVenue(url) {
    if (citeBlocked) return '';
    try {
      const res = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
      if (!res.ok || new URL(res.url).origin !== location.origin || new URL(res.url).pathname !== '/citations') { citeBlocked = true; return ''; }
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      if (doc.querySelector('#captcha-form, .g-recaptcha') || /\/sorry\//.test(res.url)) { citeBlocked = true; return ''; }
      return detailRows(doc).map(({ value }) => value.textContent.replace(/\s+/g, ' ').trim()).find(Boolean) || '';
    } catch (err) {
      citeBlocked = true;
      return '';
    }
  }

  function annotateDetail() {
    if (!settings.showOnDetail) return;
    for (const { row, value } of detailRows(document)) {
      if (row.dataset[MARK]) continue;
      const venue = venueTextOf(value);
      if (!venue) continue;
      inject(row, venue, value, false);
    }
  }

  function annotateAll() {
    if (!ranking || !settings || !settings.enabled) return;
    try {
      annotateProfile();
      renderProfileStats();
      annotateSearch();
      annotateDetail();
    } catch (err) {
      console.error('[Scholar Rank] Annotation failed:', err);
    }
  }

  function clearAll() {
    backendGeneration++; remoteResults = new WeakMap();
    globalThis.SRBackend?.reset();
    loadAllCancelled = true;
    activeProfileFilter = null;
    loadAllState = '';
    document.querySelectorAll('.' + CONTAINER_CLASS).forEach((el) => el.remove());
    document.querySelectorAll('.' + STATS_PANEL_CLASS).forEach((el) => el.remove());
    document.querySelectorAll('.sr-row-filtered-out').forEach((el) => el.classList.remove('sr-row-filtered-out'));
    document.querySelectorAll('[data-sr-done]').forEach((el) => delete el.dataset[MARK]);
    document.querySelectorAll('[data-sr-pending]').forEach((el) => delete el.dataset[PENDING]);
  }

  function observe() {
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(annotateAll, 60);
    };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  async function main() {
    settings = await SRSettings.load();
    if (!settings.enabled) return;

    const [ccf, core, journals, aliases] = await Promise.all([
      loadJson('src/data/ccf.json'),
      loadJson('src/data/core.json'),
      loadJson('src/data/journals.json'),
      loadJson('src/data/aliases.json'),
    ]);
    ranking = new SRRanking({ ccf, core, journals, aliases }, settings);

    annotateAll();
    observe();

    chrome.storage.onChanged.addListener(async (_changes, area) => {
      if (area !== 'sync' && !(area === 'local' && (_changes.directEnabled || _changes.backendEnabled || _changes.backendToken || _changes.srDirectConfig))) return;
      settings = await SRSettings.load();
      ranking.options = Object.assign({}, ranking.options, settings);
      ranking.cache.clear();
      clearAll();
      if (settings.enabled) annotateAll();
    });
  }

  main().catch((err) => console.error('[Scholar Rank] Initialization failed:', err));
})();
