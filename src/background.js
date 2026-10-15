import { createDirectService } from './lib/metadata/direct-service.js';
import { createMessageHandler } from './lib/metadata/bridge.js';
// Protect API keys from content scripts. Only extension pages/service workers
// can access local settings; content scripts receive a non-secret status view.
const trusted = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const direct = createDirectService();
const handle = createMessageHandler(chrome, fetch, direct);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['sr-backend-config','sr-backend-resolve','sr-backend-health','sr-direct-admin'].includes(message?.type)) return;
  trusted.then(() => handle(message,sender)).then(respond, error => respond({ error: /^(?:DeepSeek key check failed|This key does not list|Enter a DeepSeek|Invalid |Daily limit|Expected settings|Open the extension)/.test(error.message || '') ? error.message : 'Metadata request failed. Open Settings → Metadata completion to check the connection.' }));
  return true;
});
