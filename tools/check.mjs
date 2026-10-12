// Static checks that need no dependencies: JavaScript syntax, CSS brace balance, file naming and leftover markers.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = (dir, ext) =>
  readdirSync(join(root, dir))
    .filter((name) => name.endsWith(ext))
    .sort()
    .map((name) => join(root, dir, name));
const rel = (file) => relative(root, file);
const problems = [];

const scriptDirs = readdirSync(join(root, 'src/scripts'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `src/scripts/${entry.name}`);
// Browser files are classic scripts, so they are parsed as scripts (not modules).
for (const file of [
  ...scriptDirs.flatMap((dir) => files(dir, '.js')),
  ...files('src/workers', '.js'),
  ...files('src/shared', '.js'),
  join(root, 'src/sw.template.js'),
]) {
  const source = readFileSync(file, 'utf8').replace(/__PRECACHE__/g, '[]');
  try {
    new vm.Script(source, { filename: rel(file) });
  } catch (error) {
    problems.push(`${rel(file)}: ${error.message}`);
  }
}

// Node tooling and tests are ES modules, checked with node's own parser.
for (const file of [...files('tools', '.mjs'), ...files('tests/smoke', '.mjs'), ...files('tests/unit', '.mjs')]) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    problems.push(
      `${rel(file)}: ${
        String(error.stderr)
          .split('\n')
          .find((line) => /Error/.test(line)) ?? 'syntax error'
      }`,
    );
  }
}

for (const file of files('src/styles', '.css')) {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0;
  for (const char of source) {
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) problems.push(`${rel(file)}: unbalanced braces`);
}

const prefix = /^\d{2}-/;
for (const dir of [...scriptDirs, 'src/styles']) {
  for (const file of readdirSync(join(root, dir))) {
    if (!prefix.test(file)) problems.push(`${dir}/${file}: name must start with a two-digit order prefix`);
  }
}

const markers = [/FIX #\d/, /\bTODO\b/, /\bFIXME\b/, /={5,}/];
const sourceOnly = [/console\.log\(/, /\bdebugger\b/];
const textFile = /\.(js|cjs|mjs|css|html|json|webmanifest)$/;

const skipDirs = new Set(['node_modules', 'web']);
function scan(dir, patterns) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (skipDirs.has(name)) continue;
    if (statSync(path).isDirectory()) {
      scan(path, patterns);
      continue;
    }
    if (!textFile.test(name) || name === 'check.mjs') continue;
    const text = readFileSync(path, 'utf8');
    for (const pattern of patterns) if (pattern.test(text)) problems.push(`${rel(path)}: matches ${pattern}`);
  }
}
scan(join(root, 'src'), [...markers, ...sourceOnly]);

// Privacy guard: the app may only talk to the hosts below, and only on user action (YouTube tiles, subtitle search link).
// Network APIs that exist mainly for telemetry are not allowed in the sources at all.
const allowedHosts = new Set(['www.youtube.com', 'www.youtube-nocookie.com', 'www.opensubtitles.org', 'www.w3.org']);
const forbiddenApis = [
  /\bsendBeacon\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bdocument\.cookie\b/,
  /\bgtag\b/,
  /\bdataLayer\b/,
];
function scanPrivacy(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      scanPrivacy(path);
      continue;
    }
    if (!/\.(js|css|html)$/.test(name)) continue;
    const text = readFileSync(path, 'utf8');
    for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      if (!allowedHosts.has(host)) problems.push(`${rel(path)}: unapproved host ${host}`);
    }
    for (const pattern of forbiddenApis)
      if (pattern.test(text)) problems.push(`${rel(path)}: forbidden API ${pattern}`);
  }
}
scanPrivacy(join(root, 'src'));
for (const dir of ['public', 'tools', 'tests/smoke', 'tests/unit', 'desktop']) scan(join(root, dir), markers);

const versionOf = (file) => JSON.parse(readFileSync(join(root, file), 'utf8')).version;
if (versionOf('package.json') !== versionOf('desktop/package.json'))
  problems.push('desktop/package.json: version differs from package.json');

if (problems.length) {
  console.error(problems.map((line) => `  ${line}`).join('\n'));
  process.exit(1);
}
console.log('check passed');
