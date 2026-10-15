(async function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const inputs = [...document.querySelectorAll('[data-key]')];

  const settings = await SRSettings.load();
  const backendConfig = await SRBackend.config();
  const localPairing = chrome.storage.local ? await chrome.storage.local.get({ backendToken: '' }) : {};
  backendConfig.backendToken = localPairing.backendToken || '';
  $('#backendEnabled').checked = !!backendConfig.backendEnabled;
  $('#backendToken').value = backendConfig.backendToken || '';
  $('#backendStatus').textContent = backendConfig.backendEnabled ? 'Automatic completion enabled on this device' : 'Automatic completion disabled';
  $('#connectBackend').addEventListener('click', async () => {
    const button = $('#connectBackend'); button.disabled = true;
    try {
      if (!chrome.storage.local) throw new Error('Open the installed extension settings to connect');
      const token = $('#backendToken').value.trim();
      const enabled = $('#backendEnabled').checked;
      if (enabled && !/^[a-f0-9]{64}$/.test(token)) throw new Error('Paste the pairing token from the local dashboard');
      await chrome.storage.local.set({ backendEnabled: enabled, backendToken: token });
      if (!enabled) { $('#backendStatus').textContent = 'Automatic completion disabled on this device'; return; }
      const health = await SRBackend.health();
      if (enabled && !health.paired) throw new Error('Invalid pairing token');
      $('#backendStatus').textContent = `Connected · Backend ${health.version} · ${enabled ? 'Automatic completion enabled' : 'Automatic completion disabled'}`;
    } catch (error) { $('#backendStatus').textContent = error.message + ' · Start the server with npm run backend'; }
    finally { button.disabled = false; }
  });
  async function directApi(action, input) {
    if (!chrome.runtime.sendMessage) throw new Error('Open the installed extension settings to configure completion');
    const result = await chrome.runtime.sendMessage({ type: 'sr-direct-admin', action, input });
    if (result?.error) throw new Error(result.error);
    return result;
  }
  async function paintDirect() {
    const { config } = await directApi('status');
    $('#directEnabled').checked = config.directEnabled;
    $('#agentEnabled').checked = config.agentEnabled;
    $('#dailyLimit').value = config.dailyLimit;
    $('#directStatus').textContent = `${config.directEnabled ? 'Browser-only mode enabled' : 'Browser-only mode disabled'} · DeepSeek key ${config.hasDeepseekKey ? 'saved' : 'not configured'} · No local server needed`;
    return config;
  }
  async function saveDirect(input) {
    await directApi('config', input);
    $('#deepseekKey').value = '';
    const config = await paintDirect();
    if (config.hasDeepseekKey && config.agentEnabled) {
      await directApi('check-key');
      $('#directStatus').textContent = 'DeepSeek key verified · deepseek-flash · Browser-only mode ready. Refresh Scholar to start.';
    }
  }
  $('#saveDirect').onclick = async () => {
    const button = $('#saveDirect'); button.disabled = true;
    try { await saveDirect({ directEnabled: $('#directEnabled').checked, agentEnabled: $('#agentEnabled').checked, deepseekKey: $('#deepseekKey').value.trim(), dailyLimit: Number($('#dailyLimit').value) }); }
    catch (error) { $('#directStatus').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#setupFile').onchange = async () => {
    const input = $('#setupFile'); input.disabled = true;
    try { const file = input.files[0]; if (!file) return; if (file.size > 8192) throw new Error('Setup file must be smaller than 8 KB'); await saveDirect(JSON.parse(await file.text())); }
    catch { $('#directStatus').textContent = 'Unable to import or verify setup. Use a valid private setup JSON file and check the network connection.'; }
    finally { input.value = ''; input.disabled = false; }
  };
  paintDirect().catch(error => { $('#directStatus').textContent = error.message; });
  let theme = settings.theme;

  for (const el of inputs) {
    const key = el.dataset.key;
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key] ?? '';
    el.addEventListener('change', onChange);
    el.addEventListener('input', onChange);
  }

  function currentValues() {
    const out = { theme };
    for (const el of inputs) {
      if (el.type === 'checkbox') out[el.dataset.key] = el.checked;
      else if (el.type === 'range') out[el.dataset.key] = Number(el.value);
      else out[el.dataset.key] = el.value;
    }
    return out;
  }

  function onChange() {
    const values = currentValues();
    $('#scaleOut').textContent = values.badgeScale + '%';
    SRSettings.save(values);
    syncThemeCards();
    if (ranking) {
      ranking.options = Object.assign({}, ranking.options, values);
      renderProbe();
    }
  }
  $('#scaleOut').textContent = settings.badgeScale + '%';

  const SAMPLE = [
    ['CVPR', 'sr-conference'],
    ['Nat. Commun.', 'sr-journal'],
    ['JCR Q1', 'sr-q1'],
    ['TOP', 'sr-top'],
    ['CCF A', 'sr-ccf-a'],
    ['CORE A*', 'sr-core-astar'],
    ['CAS 1', 'sr-zone-1'],
    ['IF 18.1', 'sr-if'],
  ];

  function sampleBadges(themeId, bold) {
    const box = document.createElement('div');
    box.className = 'sr-badges ' + SRSettings.themeClass(themeId) + (bold ? ' sr-bold' : '');
    SRSettings.applyBadgeScale(box, currentValues().badgeScale);
    for (const [text, cls] of SAMPLE) {
      const span = document.createElement('span');
      span.className = 'sr-badge ' + cls;
      span.textContent = text;
      box.appendChild(span);
    }
    return box;
  }

  const grid = $('#themeGrid');
  for (const t of SRSettings.THEMES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.dataset.theme = t.id;
    card.setAttribute('aria-pressed', String(t.id === theme));

    const name = document.createElement('div');
    name.className = 'theme-name';
    name.textContent = t.name;
    const desc = document.createElement('div');
    desc.className = 'theme-desc';
    desc.textContent = t.desc;

    card.append(name, desc, sampleBadges(t.id, settings.boldBadges));
    card.addEventListener('click', () => { theme = t.id; onChange(); });
    grid.appendChild(card);
  }

  function syncThemeCards() {
    const bold = currentValues().boldBadges;
    for (const card of grid.querySelectorAll('.theme-card')) {
      const id = card.dataset.theme;
      card.setAttribute('aria-pressed', String(id === theme));
      card.querySelector('.sr-badges').replaceWith(sampleBadges(id, bold));
    }
  }

  const load = (p) => fetch(chrome.runtime.getURL(p)).then((r) => r.json());
  let ranking = null;

  const [ccf, core, journals, aliases] = await Promise.all([
    load('src/data/ccf.json'),
    load('src/data/core.json'),
    load('src/data/journals.json'),
    load('src/data/aliases.json'),
  ]);
  ranking = new SRRanking({ ccf, core, journals, aliases }, currentValues());

  const info = $('#datasetInfo');
  info.innerHTML = '';
  const lines = [
    ['CCF recommended list', `${ccf.count} entries from ${ccf.source} (${ccf.generatedAt})`],
    [`CORE conference rankings (${core.version})`, `${core.count} entries from portal.core.edu.au (${core.generatedAt})`],
    ['Journal dataset', `${journals.count} entries, built on ${journals.generatedAt}`],
    ...['cas', 'jcr'].filter((key) => journals.sources?.[key]).map((key) => ['Source', journals.sources[key]]),
  ];
  for (const [k, v] of lines) {
    const div = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = k + ': ';
    div.appendChild(b);
    div.appendChild(document.createTextNode(v));
    info.appendChild(div);
  }

  const probe = $('#probe');
  const probeResult = $('#probeResult');

  function renderProbe() {
    const raw = probe.value.trim();
    probeResult.textContent = '';
    if (!raw) return;
    const result = ranking.lookup(raw);
    const badges = ranking.badges(result);

    const meta = document.createElement('div');
    if (result.kind !== 'normal') meta.textContent = `Recognized as ${result.kind}; excluded from rankings`;
    else if (result.matchedName) meta.textContent = `Matched: ${result.matchedName}${result.via ? ` (${result.via})` : ''}`;
    else meta.textContent = 'No matching entry found';
    probeResult.appendChild(meta);

    if (!badges.length) return;
    const values = currentValues();
    const box = document.createElement('div');
    box.className = 'sr-badges ' + SRSettings.themeClass(values.theme) + (values.boldBadges ? ' sr-bold' : '');
    SRSettings.applyBadgeScale(box, values.badgeScale);
    for (const b of badges) {
      const span = document.createElement('span');
      span.className = `sr-badge ${b.cls}`;
      span.textContent = b.text;
      span.title = b.title;
      box.appendChild(span);
    }
    probeResult.appendChild(box);
  }

  probe.addEventListener('input', renderProbe);
})();
