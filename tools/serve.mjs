/** Local static preview server with a Chrome API shim and simulated Scholar citation responses. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const SHIM = '<script src="/test/chrome-shim.js"></script>';

createServer(async (req, res) => {
  const [path, query = ''] = req.url.split('?');
  let url = decodeURIComponent(path);
  const cite = url === '/scholar' && /(?:^|&)q=info:([\w-]+):/.exec(decodeURIComponent(query));
  if (cite) url = `/test/cite/${cite[1]}.html`;
  if (url === '/') url = '/test/fixture.html';
  if (!/^\/(?:test\/|src\/|icons\/|manifest\.json$)/.test(url)) { res.writeHead(404).end('Not found'); return; }
  const rel = normalize(url === '/' ? '/test/fixture.html' : url).replace(/^([/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT + '/') || !/^(?:test|src|icons)\//.test(rel) && rel !== 'manifest.json') { res.writeHead(403).end('forbidden'); return; }
  try {
    let body = await readFile(file);
    if (extname(file) === '.html' && /(^|&)shim=1(&|$)/.test(query)) {
      body = Buffer.from(body.toString('utf8').replace(/<head>/i, '<head>' + SHIM), 'utf8');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 ' + rel);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Publication preview: http://localhost:${PORT}/test/fixture.html`);
  console.log(`Settings preview:   http://localhost:${PORT}/src/options/options.html?shim=1`);
  console.log(`Popup preview:     http://localhost:${PORT}/src/popup/popup.html?shim=1`);
});
