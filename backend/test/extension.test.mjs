import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createMessageHandler } from '../../src/lib/metadata/bridge.js';
const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function worker(config, fetcher) {
  const chrome = { storage: { local: { get: async defaults => ({ ...defaults, ...config }) } }, runtime: { getURL: path => 'chrome-extension://test/' + path } };
  const handle = createMessageHandler(chrome,fetcher,{ run: () => { throw new Error('Unexpected direct call'); } });
  return message => handle(message,{}).catch(error => ({error:error.message}));
}
test('Service worker uses fixed loopback address and local pairing token', async () => {
  let request;
  const send = worker({ backendEnabled: true, backendToken: 'test-pairing' }, async (url, options) => { request = { url, options }; return Response.json({ status: 'partial' }); });
  assert.equal((await send({ type: 'sr-backend-resolve', publication: { title: 'Example title' }, url: 'https://untrusted.example' })).status, 'partial');
  assert.equal(request.url, 'http://127.0.0.1:8124/api/resolve');
  assert.equal(request.options.headers['X-Scholar-Token'], 'test-pairing');
  assert.deepEqual(JSON.parse(request.options.body), { title: 'Example title' });
});
test('Disabled backend and absent pairing token cannot make requests', async () => {
  for (const config of [{ backendEnabled: false, backendToken: 'token' }, { backendEnabled: true }]) {
    let calls = 0;
    const send = worker(config, async () => { calls++; });
    assert.equal((await send({ type: 'sr-backend-resolve', publication: { title: 'Example' } })).disabled, true);
    assert.equal(calls, 0);
  }
});
test('Worker errors return an ordinary offline response', async () => {
  const send = worker({ backendEnabled: true, backendToken: 'token' }, async () => { throw new Error('Backend offline'); });
  assert.equal((await send({ type: 'sr-backend-resolve', publication: {} })).error, 'Backend offline');
});
test('Content completion queue is bounded to two requests and drains', async () => {
  const releases = []; let active = 0, max = 0;
  const context = { chrome: { storage: { local: { get: async () => ({ backendEnabled: true, backendToken: 'token' }) } }, runtime: { sendMessage: message => message.type === 'sr-backend-config' ? Promise.resolve(undefined) : new Promise(resolve => { active++; max = Math.max(max, active); releases.push(() => { active--; resolve({ identity: { name: 'Example' } }); }); }) } } };
  vm.runInNewContext(source('src/lib/backend.js'), context);
  const jobs = Array.from({ length: 6 }, () => context.SRBackend.resolve({ title: 'Example' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 2);
  while (releases.length) { releases.shift()(); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal((await Promise.all(jobs)).length, 6);
  assert.equal(max, 2);
});
test('Content client backs off after offline failure and can be reset', async () => {
  let calls = 0;
  const context = { chrome: { storage: { local: { get: async () => ({ backendEnabled: true, backendToken: 'token' }) } }, runtime: { sendMessage: async message => { if (message.type === 'sr-backend-config') return undefined; calls++; return { error: 'Backend offline' }; } } } };
  vm.runInNewContext(source('src/lib/backend.js'), context);
  assert.equal(await context.SRBackend.resolve({ title: 'One' }), null);
  assert.equal(await context.SRBackend.resolve({ title: 'Two' }), null);
  assert.equal(calls, 1);
  context.SRBackend.reset(); await context.SRBackend.resolve({ title: 'Three' });
  assert.equal(calls, 2);
});
test('Offline preview without Chrome APIs remains usable', async () => {
  const context = {};
  vm.runInNewContext(source('src/lib/backend.js'), context);
  assert.equal(await context.SRBackend.resolve({ title: 'Example' }), null);
});
