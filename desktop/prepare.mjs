// Copies the web build (dist/) into desktop/web so the Electron app can serve and package it.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const web = join(root, 'desktop', 'web');

if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run `npm run build` first');
const versions = ['package.json', 'desktop/package.json'].map(
  (file) => JSON.parse(readFileSync(join(root, file), 'utf8')).version,
);
if (versions[0] !== versions[1])
  throw new Error(`Version mismatch: package.json ${versions[0]}, desktop/package.json ${versions[1]}`);

rmSync(web, { recursive: true, force: true });
cpSync(dist, web, { recursive: true });
console.log(`Copied ${dist} to ${web}`);
