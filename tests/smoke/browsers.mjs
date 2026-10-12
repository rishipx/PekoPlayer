// Loads the built app in the browser named by BROWSER (chromium, firefox or webkit) and checks that it starts cleanly.
// Usage: BROWSER=firefox node tests/smoke/browsers.mjs   (run "npm run build" first)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '..', '..');
const dist = path.join(root, 'dist');
const name = process.env.BROWSER || 'chromium';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${label}${detail ? ` (${detail})` : ''}`);
};

if (!playwright[name]) {
  console.error(`Unknown browser "${name}"`);
  process.exit(2);
}
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run "npm run build" first.');
  process.exit(2);
}

(async () => {
  const server = spawn('node', [path.join(root, 'tools', 'serve.mjs'), dist, '4310', path.join(dist, '_headers')], {
    stdio: 'ignore',
  });
  await sleep(700);
  const browser = await playwright[name].launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
    const page = await ctx.newPage();
    const pageErrors = [];
    const violations = [];
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await page.goto('http://127.0.0.1:4310/', { waitUntil: 'load' });
    await sleep(1500);

    const state = await page.evaluate(() => ({
      player: !!window.pekoPlayer,
      multiView: !!window.multiView,
      controls: !!document.getElementById('controls'),
      title: document.title,
      violations: window.__csp,
    }));
    violations.push(...state.violations);
    check(
      'player and multi-view start',
      state.player && state.multiView && state.controls && state.title === 'PekoPlayer',
    );
    check(
      'no uncaught errors or CSP violations',
      pageErrors.length === 0 && violations.length === 0,
      [...pageErrors, ...violations].join(' | '),
    );

    await page.evaluate(() => document.getElementById('settingsBtn').click());
    await sleep(500);
    const settingsOpen = await page.evaluate(
      () =>
        !document.getElementById('settingsMenu').hidden &&
        getComputedStyle(document.getElementById('settingsMenu')).display !== 'none',
    );
    check('settings menu opens', settingsOpen);

    await page.evaluate(() => document.getElementById('multiviewOpenBtn').click());
    await sleep(600);
    const multiViewOpen = await page.evaluate(
      () => getComputedStyle(document.getElementById('mvView')).display !== 'none',
    );
    check('multi-view opens', multiViewOpen);

    const worker = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      try {
        return (await navigator.serviceWorker.ready).active ? 'active' : 'inactive';
      } catch {
        return 'error';
      }
    });
    check('service worker registers where supported', worker === 'active' || worker === 'unsupported', worker);

    await ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  process.exit(results.every(Boolean) ? 0 : 1);
})();
