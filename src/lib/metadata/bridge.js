export function isAdminSender(sender, chromeApi) {
  const url = String(sender?.url || '').split(/[?#]/)[0];
  return ['src/options/options.html','src/manage/index.html'].some(path => url === chromeApi.runtime.getURL(path));
}
export function createMessageHandler(chromeApi, fetcher, direct) {
  return async (message, sender) => {
    if (!message || typeof message.type !== 'string') return undefined;
    if (message.type === 'sr-backend-config') {
      const config = await chromeApi.storage.local.get({ directEnabled: false, backendEnabled: false, backendToken: '' });
      return { directEnabled: !!config.directEnabled, backendEnabled: !!config.backendEnabled, backendPaired: !!config.backendToken };
    }
    if (message.type === 'sr-direct-admin') {
      if (!isAdminSender(sender, chromeApi)) throw new Error('Open the extension settings to manage metadata');
      return direct.run(message.action, message.input);
    }
    if (!['sr-backend-resolve','sr-backend-health'].includes(message.type)) return undefined;
    const config = await chromeApi.storage.local.get({ directEnabled: false, backendEnabled: false, backendToken: '' });
    if (message.type === 'sr-backend-resolve' && config.directEnabled) return direct.run('resolve', message.publication);
    if (message.type === 'sr-backend-resolve' && (!config.backendEnabled || !config.backendToken)) return { disabled: true };
    const resolving = message.type === 'sr-backend-resolve';
    const response = await fetcher('http://127.0.0.1:8124/api/' + (resolving ? 'resolve' : 'health'), {
      method: resolving ? 'POST' : 'GET', signal: AbortSignal.timeout(95000),
      headers: { 'Content-Type': 'application/json', 'X-Scholar-Token': config.backendToken },
      body: resolving ? JSON.stringify(message.publication) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Local backend request failed');
    return result;
  };
}
