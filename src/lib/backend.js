/* Bounded asynchronous completion. Offline failures leave local badges usable. */
(function(root) {
  let active = 0, pausedUntil = 0, generation = 0; const queue = [];
  async function config() {
    if (!root.chrome?.storage?.local || !chrome.runtime?.sendMessage) return { backendEnabled: false };
    const status = await chrome.runtime.sendMessage({ type: 'sr-backend-config' });
    if (status && typeof status.directEnabled === 'boolean') return status;
    return chrome.storage.local.get({ directEnabled: false, backendEnabled: false, backendToken: '' });
  }
  function drain() {
    while (active < 2 && queue.length) {
      active++; const { publication, resolve } = queue.shift(); const ticket = generation;
      (async () => {
        if (Date.now() < pausedUntil) return null;
        try {
          const data = await chrome.runtime.sendMessage({ type: 'sr-backend-resolve', publication });
          if (data?.error) { if (ticket === generation) pausedUntil = Date.now() + 60000; return null; }
          return data?.disabled ? null : data;
        } catch { if (ticket === generation) pausedUntil = Date.now() + 60000; return null; }
      })().then(resolve).finally(() => { active--; drain(); });
    }
  }
  root.SRBackend = {
    config,
    async resolve(publication) { const c = await config(); if (!c.directEnabled && (!c.backendEnabled || !(c.backendPaired || c.backendToken))) return null; return new Promise(resolve => { queue.push({ publication, resolve }); drain(); }); },
    reset() { generation++; pausedUntil = 0; for (const job of queue.splice(0)) job.resolve(null); },
    async health() { if (!chrome.runtime?.sendMessage) throw new Error('Open the installed extension settings to connect'); const result = await chrome.runtime.sendMessage({ type: 'sr-backend-health' }); if (result?.error) throw new Error(result.error); return result; },
  };
})(globalThis);
