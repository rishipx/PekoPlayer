'use strict';
// Minimal static file server for the desktop app. It serves the built web app from a folder, only on the loopback
// interface, with the security headers that the web build generates in _headers.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];

// Reads the security headers of the catch-all (/*) block of a Netlify/Cloudflare style _headers file.
function readSecurityHeaders(file) {
  const headers = {};
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return headers;
  }
  let inCatchAll = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (inCatchAll) break;
      continue;
    }
    if (!/^\s/.test(line)) {
      inCatchAll = line.trim() === '/*';
      continue;
    }
    if (!inCatchAll) continue;
    const split = line.indexOf(':');
    const name = line.slice(0, split).trim().toLowerCase();
    if (SECURITY_HEADERS.includes(name)) headers[name] = line.slice(split + 1).trim();
  }
  return headers;
}

function createHandler(root, getHost) {
  const base = path.resolve(root);
  const security = readSecurityHeaders(path.join(base, '_headers'));

  return (req, res) => {
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { ...security, 'Cache-Control': 'no-cache', ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    };

    // Rejecting unexpected Host headers stops DNS-rebinding attacks from web pages in other browsers.
    if (req.headers.host !== getHost()) return send(403, 'Forbidden');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed', { Allow: 'GET, HEAD' });

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(400, 'Bad request');
    }
    if (pathname.includes('\0')) return send(400, 'Bad request');
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = path.resolve(base, `.${pathname}`);
    if (file !== base && !file.startsWith(base + path.sep)) return send(403, 'Forbidden');
    if (path.basename(file) === '_headers') return send(404, 'Not found');

    fs.readFile(file, (error, data) => {
      if (error) return send(404, 'Not found');
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const immutable = /[\\/](assets|fonts)[\\/]/.test(file);
      send(200, data, {
        'Content-Type': type,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    });
  };
}

// Starts the server on `port`. With `fallback` it uses any free port when `port` is taken.
function startServer({ root, port = 0, fallback = false }) {
  return new Promise((resolve, reject) => {
    let host = '';
    const server = http.createServer(createHandler(root, () => host));
    const listen = (candidate) => {
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && fallback && candidate !== 0) listen(0);
        else reject(error);
      });
      server.listen(candidate, '127.0.0.1', () => {
        const actual = server.address().port;
        host = `127.0.0.1:${actual}`;
        resolve({ server, port: actual, origin: `http://${host}` });
      });
    };
    listen(port);
  });
}

module.exports = { startServer, readSecurityHeaders };
