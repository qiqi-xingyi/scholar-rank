/* The service worker is the only extension context allowed to call loopback.
   Provider API keys never enter extension storage or page messages. */
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['sr-backend-resolve', 'sr-backend-health'].includes(message?.type)) return;
  (async () => {
    const config = await chrome.storage.local.get({ backendEnabled: false, backendToken: '' });
    if (message.type === 'sr-backend-resolve' && (!config.backendEnabled || !config.backendToken)) return { disabled: true };
    const resolve = message.type === 'sr-backend-resolve';
    const response = await fetch('http://127.0.0.1:8124/api/' + (resolve ? 'resolve' : 'health'), {
      method: resolve ? 'POST' : 'GET', signal: AbortSignal.timeout(95000),
      headers: { 'Content-Type': 'application/json', 'X-Scholar-Token': config.backendToken },
      body: resolve ? JSON.stringify(message.publication) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Local backend request failed');
    return result;
  })().then(respond, error => respond({ error: error.message || 'Local backend unavailable' }));
  return true;
});
