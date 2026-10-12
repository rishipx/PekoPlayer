import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [, , rootArg, port = '8123', headersFile] = process.argv;
const root = path.resolve(rootArg);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
};
function readHeaders(file) {
  if (!file || !fs.existsSync(file)) return {};
  const block = fs
    .readFileSync(file, 'utf8')
    .split(/\n\s*\n/)[0]
    .split('\n')
    .slice(1);
  return Object.fromEntries(
    block
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf(':');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}
const extra = readHeaders(headersFile);
http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', ...extra };
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  })
  .listen(+port, '127.0.0.1', () => console.log('serving', root, port));
