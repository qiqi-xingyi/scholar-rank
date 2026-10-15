const $ = s => document.querySelector(s);
async function api(path, body) {
  const [action, query] = path.split('?');
  const input = body === undefined ? Object.fromEntries(new URLSearchParams(query || '')) : body;
  const result = await chrome.runtime.sendMessage({ type: 'sr-direct-admin', action, input });
  if (result?.error) throw new Error(result.error);
  return result;
}
function message(text) { $('#message').textContent = text; $('#message').style.display = 'block'; clearTimeout(message.timer); message.timer = setTimeout(() => { $('#message').style.display = 'none'; }, 8000); }
function show(node, data) { node.hidden = false; node.textContent = JSON.stringify(data, null, 2); }
function resolution(data) {
  const box = $('#resolution'); box.hidden = false; box.replaceChildren();
  const title = document.createElement('h3'); title.textContent = data.identity?.name || 'Source not yet identified';
  const note = document.createElement('p'); note.textContent = data.identity
    ? `${data.identity.provider} · ${data.cacheHit ? 'From local cache' : 'Fresh lookup'}${data.identity.doi ? ' · DOI ' + data.identity.doi : ''}`
    : 'Try adding a DOI or the full publication title.';
  const badges = document.createElement('div'); badges.className = 'result-badges';
  for (const badge of data.badges || []) { const span = document.createElement('span'); span.textContent = badge.text; span.title = badge.title; badges.append(span); }
  const missing = document.createElement('p'); missing.textContent = data.missing?.length
    ? `Still missing: ${data.missing.map(s => ({jcr:'JCR quartile',cas:'CAS tier',if:'impact factor',top:'TOP status',ccf:'CCF rank',core:'CORE rank',venue_identity:'source identity'}[s] || s)).join(', ')}. These fields are saved for follow-up.`
    : 'All requested ranking fields are available.';
  box.append(title,note,badges,missing);
  if (data.warnings?.length) { const warnings = document.createElement('p'); warnings.textContent = data.warnings.join(' · '); box.append(warnings); }
  $('#rawResult').hidden = false; show($('#result'), data);
}
async function task(button, fn) { button.disabled = true; try { await fn(); } catch (e) { message(e.message); } finally { button.disabled = false; } }
async function status() {
  const data = await api('status'); $('#stats').replaceChildren();
  for (const [value, label] of [[data.records,'Publications checked'],[data.missing,'Missing or partial'],[data.metrics,'Imported metrics'],[data.usage.calls,'Agent calls today']]) {
    const card = document.createElement('div'); card.className = 'stat'; const n = document.createElement('strong'), l = document.createElement('span'); n.textContent = value; l.textContent = label; card.append(n,l); $('#stats').append(card);
  }
  return data;
}
async function loadConfig() { const { config } = await status(); const form = $('#config'); for (const key of ['directEnabled','agentEnabled','dailyLimit','email']) { const el = form.elements[key]; if (el.type === 'checkbox') el.checked = config[key]; else el.value = config[key] ?? ''; } $('#keyState').textContent = `DeepSeek key: ${config.hasDeepseekKey ? 'saved' : 'not configured'} · OpenAlex key: ${config.hasOpenalexKey ? 'saved' : 'not configured'}`; }
let offset = 0;
async function records(append = false) {
  if (!append) { offset = 0; $('#records').replaceChildren(); }
  const rows = await api(`records?status=missing&limit=50&offset=${offset}`); offset += rows.length; $('#more').hidden = rows.length < 50;
  if (!rows.length && !append) $('#records').textContent = 'No missing records yet.';
  for (const row of rows) {
    const div = document.createElement('div'); div.className = 'record';
    const title = document.createElement('strong'); title.textContent = row.request.title || row.request.doi || row.request.venue;
    const info = document.createElement('small'); info.textContent = `${row.result.identity?.name || row.request.venue || 'Unknown venue'} · ${row.status} · Missing: ${row.result.missing.join(', ')} · ${row.hits} checks`;
    const notes = document.createElement('small'); notes.textContent = [...row.result.warnings, `Last checked: ${row.last_seen}`, `Agent: ${row.result.agent}`].join(' · ');
    const retry = document.createElement('button'); retry.textContent = 'Retry now'; retry.onclick = () => task(retry, async () => { const data = await api('retry', { key: row.key }); resolution(data); await status(); await records(); message('Record refreshed'); });
    div.append(title,info,notes,retry); $('#records').append(div);
  }
}
$('#resolve').onsubmit = event => { event.preventDefault(); task(event.submitter, async () => { const data = await api('resolve', Object.fromEntries(new FormData(event.target))); resolution(data); await status(); await records(); }); };
let validated = null;
$('#file').onchange = () => { validated = null; $('#import').disabled = true; };
$('#preview').onclick = () => task($('#preview'), async () => { const file = $('#file').files[0]; if (!file) throw new Error('Choose a CSV or JSON file'); if (file.size > 7 * 1024 * 1024) throw new Error('File must be smaller than 7 MB'); validated = null; $('#import').disabled = true; const text = await file.text(); show($('#importResult'), await api('import', { data: text, preview: true })); validated = { data: text, filename: file.name }; $('#import').disabled = false; });
$('#import').onclick = () => task($('#import'), async () => { if (!validated) throw new Error('Validate a file first'); show($('#importResult'), await api('import', { ...validated, preview: false })); validated = null; await status(); message('Rankings imported. Retry missing records or refresh Scholar to update badges.'); }).finally(() => { $('#import').disabled = !validated; });
$('#config').onsubmit = event => { event.preventDefault(); task(event.submitter, async () => { const form = event.target, data = Object.fromEntries(new FormData(form)); for (const field of ['directEnabled','agentEnabled','removeDeepseekKey','removeOpenalexKey']) data[field] = form.elements[field].checked; await api('config', data); for (const field of ['deepseekKey','openalexKey']) form.elements[field].value = ''; form.elements.removeDeepseekKey.checked = false; form.elements.removeOpenalexKey.checked = false; await loadConfig(); message('Settings saved in this browser'); }); };
$('#refresh').onclick = () => task($('#refresh'), async () => { await status(); await records(); });
$('#more').onclick = () => task($('#more'), () => records(true));
$('#export').onclick = () => task($('#export'), async () => { const rows = await api('records?status=missing&limit=1000'); const url = URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)], { type:'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'scholar-rank-missing.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
loadConfig().then(() => records()).catch(e => message(e.message));
