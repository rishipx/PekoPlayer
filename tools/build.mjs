// Static build: concatenates sources in numeric order, fingerprints assets, and emits the service worker and headers.
//
// Flags:
//   --csp-meta           also embed the CSP as a <meta> tag, for hosts that cannot send response headers (e.g. GitHub Pages)
//
// Environment:
//   PEKO_DIST_DIR        output directory (default: dist/)
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const publicDir = join(root, 'public');
const dist = process.env.PEKO_DIST_DIR ? resolve(process.env.PEKO_DIST_DIR) : join(root, 'dist');
const embedCspMeta = process.argv.includes('--csp-meta');

const read = (path) => readFileSync(path, 'utf8');
const listFiles = (dir, ext) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort();
const fingerprint = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);
const concat = (dir, names) => names.map((name) => read(join(dir, name)).replace(/\s*$/, '\n')).join('\n');

// Scripts are classic (non-module) files. Each bundle concatenates the numbered files of its directories in order.
// Each bundle is a separate script, so an exception in one bundle does not stop the next from running.
// `shared` files (src/shared) are added in front of the bundle, and in front of the worker script that lists them.
const scriptBundles = [
  { name: 'player', dirs: ['player'], shared: ['config.js', 'transcript-index.js'] },
  { name: 'multiview', dirs: ['multiview'], shared: ['layout-math.js'] },
  { name: 'pwa', dirs: ['pwa'] },
  { name: 'debug', dirs: ['debug'] },
];
const workerScripts = [
  { id: 'transcriptWorkerSrc', file: 'transcript.worker.js', shared: ['transcript-index.js'] },
  { id: 'thumbnailWorkerSrc', file: 'thumbnail.worker.js' },
  { id: 'shaderWorkerSrc', file: 'shader.worker.js' },
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

const emitted = [];
function emitAsset(name, ext, text) {
  const file = `assets/${name}.${fingerprint(text)}.${ext}`;
  writeFileSync(join(dist, file), text);
  emitted.push(file);
  return file;
}

const cssFile = emitAsset('app', 'css', concat(join(src, 'styles'), listFiles(join(src, 'styles'), '.css')));

const scriptsRoot = join(src, 'scripts');
const knownDirs = new Set(scriptBundles.flatMap(({ dirs }) => dirs));
const strayDirs = readdirSync(scriptsRoot).filter((name) => !knownDirs.has(name));
if (strayDirs.length) throw new Error(`Script directories not assigned to a bundle: ${strayDirs.join(', ')}`);

const sharedRoot = join(src, 'shared');
const sharedParts = (names = []) => names.map((file) => join(sharedRoot, file));

const scriptFiles = scriptBundles.map(({ name, dirs, shared }) => {
  const parts = [
    ...sharedParts(shared),
    ...dirs.flatMap((dir) => listFiles(join(scriptsRoot, dir), '.js').map((file) => join(scriptsRoot, dir, file))),
  ];
  if (parts.length === 0) throw new Error(`No sources found for bundle "${name}"`);
  const text = parts.map((file) => read(file).replace(/\s*$/, '\n')).join('\n');
  return emitAsset(name, 'js', text);
});

const workerBlocks = workerScripts
  .map(({ id, file, shared }) => {
    // The directive comes first so that it also applies to the shared code in front of the worker file.
    const body = [...sharedParts(shared), join(src, 'workers', file)].map((part) => read(part).replace(/\s*$/, ''));
    return `<script type="text/worker" id="${id}">\n'use strict';\n\n${body.join('\n\n')}\n</script>`;
  })
  .join('\n');

const release = fingerprint(emitted.map((file) => read(join(dist, file))).join(''));

const iconDir = join(src, 'icons', 'lucide');
// {{icon:name}} or {{icon:name:size}} becomes the inline SVG of src/icons/lucide/<name>.svg, so the page makes no icon requests.
function inlineIcons(markup) {
  return markup.replace(/\{\{icon:([a-z0-9-]+)(?::(\d+))?\}\}/g, (_, name, size = '15') => {
    const file = join(iconDir, `${name}.svg`);
    if (!existsSync(file))
      throw new Error(`Unknown icon "${name}": add it to src/icons/lucide/manifest.json and run npm run icons:lucide`);
    const inner = read(file)
      .match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1]
      .trim()
      .replace(/\s*\n\s*/g, '');
    if (!inner) throw new Error(`Icon file is not an SVG: ${file}`);
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  });
}

const html = inlineIcons(read(join(src, 'index.html')))
  .replace('<!-- @styles -->', `<link rel="stylesheet" href="${cssFile}">`)
  .replace('<!-- @workers -->', workerBlocks)
  .replace('@RELEASE@', release)
  .replace('<!-- @scripts -->', scriptFiles.map((file) => `<script src="${file}"></script>`).join('\n'));
if (html.includes('<!-- @') || html.includes('@RELEASE@')) throw new Error('Unreplaced build marker in index.html');
writeFileSync(join(dist, 'index.html'), html);

if (existsSync(publicDir)) cpSync(publicDir, dist, { recursive: true });

const precache = [
  'index.html',
  'manifest.webmanifest',
  'icons/favicon-32.png',
  'icons/icon-64.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  ...emitted,
  ...readdirSync(join(dist, 'fonts'))
    .filter((name) => name.endsWith('.woff2'))
    .sort()
    .map((name) => `fonts/${name}`),
];
writeFileSync(
  join(dist, 'sw.js'),
  read(join(src, 'sw.template.js'))
    .replace('__VERSION__', release)
    .replace('__PRECACHE__', JSON.stringify(precache, null, 2)),
);

const csp = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob:",
  'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

if (embedCspMeta) {
  // frame-ancestors is ignored in <meta> policies, so it is left out there.
  const metaPolicy = csp
    .split('; ')
    .filter((directive) => !directive.startsWith('frame-ancestors'))
    .join('; ');
  const indexPath = join(dist, 'index.html');
  const withMeta = read(indexPath).replace(
    '<meta charset="UTF-8">',
    `<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="${metaPolicy}">`,
  );
  if (withMeta === read(indexPath)) throw new Error('Could not embed the CSP meta tag');
  writeFileSync(indexPath, withMeta);
}

writeFileSync(
  join(dist, '_headers'),
  `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/icons/*
  Cache-Control: public, max-age=604800

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
`,
);

console.log(`Built release ${release}: ${emitted.length} assets, ${precache.length} precached files`);
