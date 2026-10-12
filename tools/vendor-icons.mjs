// Copies the Lucide icons listed in src/icons/lucide/manifest.json from the official `lucide-static` package.
//
//   npm install && npm run icons:lucide
//   node tools/vendor-icons.mjs --source <dir-with-icons> --out <dir>   (used by tests)
//
// Add an icon name to the manifest, run the script, and use {{icon:name}} or {{icon:name:size}} in src/index.html.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const packageDir = resolve(option('--source') ?? join(root, 'node_modules', 'lucide-static'));
const iconSource = existsSync(join(packageDir, 'icons')) ? join(packageDir, 'icons') : packageDir;
const outDir = resolve(option('--out') ?? join(root, 'src', 'icons', 'lucide'));
const manifestPath = join(outDir, 'manifest.json');

if (!existsSync(iconSource)) {
  console.error(
    `Lucide icons not found at ${iconSource}. Run "npm install" first (lucide-static is a dev dependency).`,
  );
  process.exit(1);
}

const names = JSON.parse(readFileSync(manifestPath, 'utf8'));
const missing = names.filter((name) => !existsSync(join(iconSource, `${name}.svg`)));
if (missing.length) {
  console.error(`Not found in the Lucide package (renamed or removed?): ${missing.join(', ')}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const name of names)
  writeFileSync(join(outDir, `${name}.svg`), readFileSync(join(iconSource, `${name}.svg`), 'utf8'));
const license = join(packageDir, 'LICENSE');
if (existsSync(license)) copyFileSync(license, join(outDir, '..', 'LICENSE.lucide'));
console.log(`Vendored ${names.length} Lucide icons into ${outDir}`);
