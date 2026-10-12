// Smoke tests for the built app: PWA shell, privacy guarantees, CSP, YouTube loading and UI behavior.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from 'playwright';

const { chromium } = playwright;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '..', '..');
const build = (env, args = []) =>
  execFileSync('node', [path.join(root, 'tools', 'build.mjs'), ...args], {
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

function startStaticServer(dir, port) {
  const child = spawn(
    'node',
    [path.join(__dirname, '..', '..', 'tools', 'serve.mjs'), dir, String(port), path.join(dir, '_headers')],
    { stdio: 'ignore' },
  );
  return child;
}

async function pwaChecks(browser) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4301);
  await sleep(600);
  const ctx = await browser.newContext();
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4301/', { waitUntil: 'load' });

  const registration = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active };
  });
  check('service worker active', registration.active, registration.scope);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const shell = names.find((n) => n.startsWith('pekoplayer-shell-'));
    return shell ? (await (await caches.open(shell)).keys()).length : 0;
  });
  check('shell precached', cached >= 12, `${cached} entries`);

  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check(
    'manifest installable',
    installabilityErrors.length === 0,
    installabilityErrors.map((e) => e.errorId).join(','),
  );

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const offline = await page.evaluate(() => ({
    title: document.title,
    app: !!document.getElementById('app'),
    player: !!window.pekoPlayer,
  }));
  check('offline reload renders player', offline.title === 'PekoPlayer' && offline.app && offline.player);
  await ctx.setOffline(false);

  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function privacyChecks(browser) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const headers = fs.readFileSync(path.join(dist, '_headers'), 'utf8');
  const worker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  check('privacy: no font host in the page or the policy', !/fonts\.(googleapis|gstatic)\.com/.test(html + headers));
  check(
    'privacy: policy allows no third-party connections, styles or fonts',
    /connect-src 'self' blob:;/.test(headers) &&
      /style-src 'self';/.test(headers) &&
      /font-src 'self';/.test(headers) &&
      !/ytimg\.com/.test(headers),
  );
  check(
    'privacy: font files precached',
    worker.includes('"fonts/inter-latin.woff2"') && worker.includes('"fonts/ibm-plex-mono-latin.woff2"'),
  );

  const server = startStaticServer(dist, 4302);
  await sleep(600);
  const ctx = await browser.newContext();
  const external = [];
  ctx.on('request', (request) => {
    const url = request.url();
    if (!/^(http:\/\/127\.0\.0\.1:4302\/|data:|blob:)/.test(url)) external.push(url);
  });
  const page = await ctx.newPage();
  const fontStatus = [];
  page.on('response', (response) => {
    if (/\/fonts\/.*\.woff2$/.test(response.url())) fontStatus.push(response.status());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    window.__beacons = 0;
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
    navigator.sendBeacon = () => {
      window.__beacons++;
      return true;
    };
  });
  await page.goto('http://127.0.0.1:4302/', { waitUntil: 'load' });
  await page.keyboard.press('Shift+?');
  await sleep(1500);
  const state = await page.evaluate(() => ({ csp: window.__csp, beacons: window.__beacons }));
  check('privacy: startup makes no third-party request', external.length === 0, external.join(' ') || 'none');
  check(
    'privacy: fonts are served by the site itself',
    fontStatus.length > 0 && fontStatus.every((status) => status === 200),
    `${fontStatus.length} responses`,
  );
  check(
    'privacy: no beacons, no policy violations',
    state.beacons === 0 && state.csp.length === 0,
    state.csp.join(','),
  );
  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function desktopServerChecks() {
  const { createRequire } = await import('node:module');
  const { startServer } = createRequire(import.meta.url)(path.join(root, 'desktop', 'server.cjs'));
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-desktop-'));
  build({ PEKO_DIST_DIR: dist });
  const { server, port } = await startServer({ root: dist });
  const get = (urlPath, headers = {}) =>
    new Promise((resolve, reject) => {
      // A raw request keeps ".." segments that fetch() would normalize away.
      const req = http.request(
        { host: '127.0.0.1', port, path: urlPath, method: 'GET', headers: { Host: `127.0.0.1:${port}`, ...headers } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });
  const index = await get('/');
  check(
    'desktop: serves the app with the CSP and nosniff headers',
    index.status === 200 &&
      /default-src 'self'/.test(index.headers['content-security-policy'] ?? '') &&
      index.headers['x-content-type-options'] === 'nosniff',
  );
  const script = fs.readdirSync(path.join(dist, 'assets')).find((name) => name.endsWith('.js'));
  const asset = await get(`/assets/${script}`);
  check(
    'desktop: serves fingerprinted assets with the right type',
    asset.status === 200 && /javascript/.test(asset.headers['content-type']),
  );
  const traversal = await get('/../package.json');
  const encoded = await get('/%2e%2e/package.json');
  check(
    'desktop: refuses path traversal',
    traversal.status !== 200 && encoded.status !== 200,
    `${traversal.status}/${encoded.status}`,
  );
  check('desktop: does not expose the _headers file', (await get('/_headers')).status === 404);
  check('desktop: rejects a foreign Host header', (await get('/', { Host: 'evil.example' })).status === 403);
  const post = await new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/', method: 'POST', headers: { Host: `127.0.0.1:${port}` } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.end();
  });
  check('desktop: accepts only GET and HEAD', post === 405, String(post));
  server.close();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function fileOpenChecks(browser) {
  const clip = path.join(root, 'tests', 'fixtures', 'clip-a.webm');
  if (!fs.existsSync(clip)) throw new Error('Fixtures are missing. Run "npm run test:fixtures" first.');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  const handlers = manifest.file_handlers?.[0];
  check(
    'open with: the manifest registers video file handlers that stay in the app scope',
    handlers?.action === './' &&
      Object.keys(handlers.accept ?? {}).every((type) => type.startsWith('video/')) &&
      manifest.launch_handler?.client_mode?.[0] === 'focus-existing',
  );

  const server = startStaticServer(dist, 4314);
  await sleep(600);
  const ctx = await browser.newContext();
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  // Browsers that support file handling expose launchQueue; a stand-in lets the test deliver files to the page.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'launchQueue', {
      value: { setConsumer: (consumer) => (window.__launch = consumer) },
      configurable: true,
    });
  });
  await page.goto('http://127.0.0.1:4314/', { waitUntil: 'load' });
  const bytes = fs.readFileSync(clip).toString('base64');
  const launch = (names, unreadable = 0) =>
    page.evaluate(
      async ([data, names, unreadable]) => {
        const buffer = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const files = names.map((name) => ({ getFile: async () => new File([buffer], name, { type: 'video/webm' }) }));
        for (let i = 0; i < unreadable; i++)
          files.push({
            getFile: async () => {
              throw new Error('moved');
            },
          });
        await window.__launch({ files });
      },
      [bytes, names, unreadable],
    );
  const state = () =>
    page.evaluate(() => ({
      names: window.pekoPlayer.playlist.map((item) => item.name),
      current: window.pekoPlayer.playlist[window.pekoPlayer.currentIndex]?.name,
      playing: !document.getElementById('video').paused,
    }));

  await launch(['first.webm'], 1);
  await sleep(1500);
  const first = await state();
  check(
    'open with: a file from the launch queue is added and played; unreadable ones are skipped',
    first.names.join() === 'first.webm' && first.current === 'first.webm' && first.playing,
    first.names.join(),
  );
  await launch(['second.webm']);
  await sleep(1500);
  const second = await state();
  check(
    'open with: a later launch adds to the playlist and plays the new file',
    second.names.join() === 'first.webm,second.webm' && second.current === 'second.webm',
    second.names.join(),
  );
  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function debugPanelChecks(browser) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4315);
  await sleep(600);
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4315/', { waitUntil: 'load' });
  check('debug: the panel is not built until it is asked for', (await page.locator('.peko-debug').count()) === 0);
  await page.keyboard.press('Control+Shift+D');
  check('debug: Ctrl+Shift+D opens the panel', await page.locator('.peko-debug').isVisible());
  await page.click('[data-action="diagnostics"]');
  const report = await page.evaluate(() => navigator.clipboard.readText());
  check(
    'debug: diagnostics are copied and name no files',
    report.startsWith('PekoPlayer debug report') &&
      /Release: [0-9a-f]{10}/.test(report) &&
      report.includes('Missing player elements: none'),
    report.split('\n')[2],
  );
  await page.click('[data-action="tokens"]');
  check(
    'debug: theme tokens are copied',
    (await page.evaluate(() => navigator.clipboard.readText())).includes('--accent:'),
  );
  await page.click('[data-action="selectors"]');
  const selectors = await page.evaluate(() => navigator.clipboard.readText());
  check(
    'debug: the selector check lists the tile parts',
    selectors.includes('tile.scrub .mv-tile-scrub') &&
      selectors.includes('player elements missing from the page: none'),
  );
  await page.keyboard.press('Control+Shift+D');
  check('debug: the shortcut closes the panel again', await page.locator('.peko-debug').isHidden());
  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function wallChecks(browser) {
  const clip = path.join(root, 'tests', 'fixtures', 'clip-a.webm');
  if (!fs.existsSync(clip)) throw new Error('Fixtures are missing. Run "npm run test:fixtures" first.');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4316);
  await sleep(600);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4316/', { waitUntil: 'load' });
  await page.evaluate(() => document.getElementById('multiviewOpenBtn').click());
  const buffer = fs.readFileSync(clip);
  const add = async (names) => {
    await page.setInputFiles(
      '#mvFileInput',
      names.map((name) => ({ name: `${name}.webm`, mimeType: 'video/webm', buffer })),
    );
    await sleep(1800);
  };
  // Waiting on animation frames also gives the browser time to finish transitions after a drop.
  const settle = (ms = 900) =>
    page.evaluate(
      (duration) =>
        new Promise((resolve) => {
          const end = performance.now() + duration;
          const tick = () => (performance.now() < end ? requestAnimationFrame(tick) : resolve());
          tick();
        }),
      ms,
    );
  const order = () => page.evaluate(() => window.multiView.tiles.map((tile) => tile.name[0]).join(''));
  const geometry = () =>
    page.evaluate(() => {
      const canvas = document.getElementById('mvCanvas').getBoundingClientRect();
      const rects = window.multiView.tiles.map((tile) => {
        const r = tile.wrapper.getBoundingClientRect();
        return { x: r.left - canvas.left, y: r.top - canvas.top, w: r.width, h: r.height };
      });
      const overlap = rects.some((a, i) =>
        rects.some(
          (b, j) => j > i && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1,
        ),
      );
      const inside = rects.every(
        (r) => r.x >= -1 && r.y >= -1 && r.x + r.w <= canvas.width + 1 && r.y + r.h <= canvas.height + 1,
      );
      return { overlap, inside, rects };
    });
  // Tiles are picked by slot, because after a reorder the document order no longer matches the layout order.
  const dragTile = async (from, to) => {
    const { rects } = await geometry();
    const canvasBox = await page.locator('#mvCanvas').boundingBox();
    const tile = (await page.evaluateHandle((index) => window.multiView.tiles[index].wrapper, from)).asElement();
    await tile.hover();
    await sleep(250);
    const name = await (await tile.$('.mv-tile-header .mv-tile-name')).boundingBox();
    const startX = name.x + 8;
    const startY = name.y + name.height / 2;
    const targetX = canvasBox.x + rects[to].x + rects[to].w / 2;
    const targetY = canvasBox.y + rects[to].y + rects[to].h / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) {
      await page.mouse.move(startX + ((targetX - startX) * step) / 12, startY + ((targetY - startY) * step) / 12);
      await sleep(40);
    }
    await sleep(200);
    await page.mouse.up();
    await settle();
  };

  await add(['a', 'b', 'c', 'd']);
  for (const mode of ['grid', 'split']) {
    await page.click(`.mv-seg[data-layout="${mode}"]`);
    await sleep(500);
    const start = await order();
    await dragTile(0, 3);
    const dropped = await geometry();
    check(
      `wall ${mode}: dragging a tile onto the last slot reorders the tiles`,
      (await order()) === start.slice(1) + start[0],
      await order(),
    );
    check(`wall ${mode}: nothing overlaps or leaves the wall after the drop`, !dropped.overlap && dropped.inside);

    const handle = await page.locator('.mv-gutter-v').first().boundingBox();
    const y = handle.y + handle.height * 0.2;
    const before = (await geometry()).rects.map((r) => Math.round(r.w));
    await page.mouse.move(handle.x + handle.width / 2, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(handle.x + handle.width / 2 + step * 18, y);
      await sleep(30);
    }
    await page.mouse.up();
    await settle(600);
    const resized = await geometry();
    const after = resized.rects.map((r) => Math.round(r.w));
    check(
      `wall ${mode}: dragging a handle resizes the two neighbours without overlap`,
      after[0] > before[0] && after[1] < before[1] && !resized.overlap && resized.inside,
      `${before.slice(0, 2)} -> ${after.slice(0, 2)}`,
    );
    await page
      .locator('.mv-gutter-v')
      .first()
      .dblclick({ position: { x: 6, y: 24 } });
    await sleep(300);
  }
  const saved = await order();
  await sleep(600);
  await page.reload({ waitUntil: 'load' });
  await sleep(2500);
  check('wall: the tile order survives a reload', (await order()) === saved, `${saved} -> ${await order()}`);

  await page.evaluate(() => window.multiView.removeTile(window.multiView.tiles[1].id));
  await sleep(600);
  await add(['e']);
  const afterAdd = await order();
  await sleep(800);
  await page.reload({ waitUntil: 'load' });
  await sleep(2500);
  check(
    'wall: removing a tile and adding another keeps a stable saved order',
    (await order()) === afterAdd,
    `${afterAdd} -> ${await order()}`,
  );

  const tile = (await page.evaluateHandle(() => window.multiView.tiles[0].wrapper)).asElement();
  await tile.hover();
  await sleep(250);
  await (await tile.$('.mv-tile-fullscreen')).click();
  await sleep(900);
  if (await page.evaluate(() => Boolean(document.fullscreenElement))) {
    await page.mouse.move(300, 300);
    await sleep(3000);
    const idle = await page.evaluate(() => {
      const element = document.fullscreenElement;
      return {
        border: getComputedStyle(element).borderTopWidth,
        chrome: element.classList.contains('mv-tile-chrome-visible'),
        cursor: getComputedStyle(element).cursor,
      };
    });
    check(
      'wall: a fullscreen tile has no border, and its controls and pointer hide when idle',
      idle.border === '0px' && !idle.chrome && idle.cursor === 'none',
      JSON.stringify(idle),
    );
    await page.mouse.move(320, 320);
    await sleep(300);
    check(
      'wall: the controls of a fullscreen tile return when the pointer moves',
      await page.evaluate(() => document.fullscreenElement.classList.contains('mv-tile-chrome-visible')),
    );
  }
  check('wall: no page errors during any of this', errors.length === 0, errors.join('; '));
  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function cspMetaChecks(browser) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist }, ['--csp-meta']);
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  check(
    'csp meta tag embedded without frame-ancestors',
    /http-equiv="Content-Security-Policy"/.test(html) && !/content="[^"]*frame-ancestors/.test(html),
  );

  // Serve without the _headers file so only the meta policy is in effect.
  fs.rmSync(path.join(dist, '_headers'));
  const server = startStaticServer(dist, 4304);
  await sleep(600);
  const ctx = await browser.newContext();
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
  });
  await page.goto('http://127.0.0.1:4304/', { waitUntil: 'load' });
  await sleep(800);
  const state = await page.evaluate(() => ({
    player: !!window.pekoPlayer,
    multiView: !!window.multiView,
    violations: window.__csp,
  }));
  check(
    'meta-CSP build runs without violations',
    state.player && state.multiView && state.violations.length === 0,
    state.violations.join(','),
  );
  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function searchHighlightChecks(browser) {
  const clip = path.join(root, 'tests', 'fixtures', 'clip-a.webm');
  const subtitles = path.join(root, 'tests', 'fixtures', 'entities.srt');
  if (!fs.existsSync(clip)) throw new Error('Fixtures are missing. Run "npm run test:fixtures" first.');

  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4305);
  await sleep(600);
  const ctx = await browser.newContext();
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4305/', { waitUntil: 'load' });
  await page.setInputFiles('#fileInput', [
    { name: 'entities.webm', mimeType: 'video/webm', buffer: fs.readFileSync(clip) },
    { name: 'entities.srt', mimeType: 'text/plain', buffer: fs.readFileSync(subtitles) },
  ]);
  await sleep(2500);
  await page.evaluate(() => document.getElementById('searchToggleBtn').click());
  await sleep(300);

  const search = async (query) => {
    await page.fill('#searchInput', query);
    await sleep(1000);
    return page.evaluate(() =>
      [...document.querySelectorAll('.search-result-item .sr-text')].map((el) => ({
        html: el.innerHTML,
        text: el.textContent,
      })),
    );
  };

  // innerHTML serialises &quot; back to a plain quote, so only &amp;, &lt; and &gt; remain visible as entities.
  const RAW = 'The amp and lt, Fish & chips, 5 < 6, "quoted"';
  const amp = await search('amp');
  check(
    'highlight: "amp" does not break &amp;',
    amp.length === 1 &&
      amp[0].html === 'The <mark>amp</mark> and lt, Fish &amp; chips, 5 &lt; 6, "quoted"' &&
      amp[0].text === RAW,
    amp[0]?.html,
  );
  const lt = await search('lt');
  check(
    'highlight: "lt" does not break &lt;',
    lt.length === 1 &&
      lt[0].html === 'The amp and <mark>lt</mark>, Fish &amp; chips, 5 &lt; 6, "quoted"' &&
      lt[0].text === RAW,
    lt[0]?.html,
  );
  const quot = await search('quot');
  check(
    'highlight: "quot" does not break &quot;',
    quot.length === 1 &&
      quot[0].html === 'The amp and lt, Fish &amp; chips, 5 &lt; 6, "<mark>quoted</mark>"' &&
      quot[0].text === RAW,
    quot[0]?.html,
  );
  const both = await search('play mark');
  check(
    'highlight: "mark" does not match inside <mark>',
    both.length === 1 && both[0].text === 'Please play the mark.' && !/<<|&</.test(both[0].html),
    both[0]?.html,
  );
  const plain = await search('play');
  check(
    'highlight: ordinary query unchanged',
    plain.length === 1 && plain[0].html === 'Please <mark>play</mark> the mark.',
    plain[0]?.html,
  );

  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function youtubeCspChecks(browser) {
  // The YouTube API is replaced by local stubs that follow the real loading pattern: iframe_api loads
  // a second script from www.youtube.com, and the player creates an iframe on the nocookie host.
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4309);
  await sleep(600);
  const ctx = await browser.newContext();
  const requested = [];
  ctx.on('request', (request) => requested.push(request.url()));
  await ctx.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "var s=document.createElement('script');s.src='https://www.youtube.com/s/player/stub/www-widgetapi.vflset/www-widgetapi.js';document.head.appendChild(s);",
    }),
  );
  await ctx.route('https://www.youtube.com/s/player/stub/www-widgetapi.vflset/www-widgetapi.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.YT={Player:class{constructor(holder,opts){
      const frame=document.createElement('iframe');
      frame.src=opts.host+'/embed/'+opts.videoId+'?origin='+encodeURIComponent(opts.playerVars.origin);
      holder.appendChild(frame);
      setTimeout(()=>opts.events.onReady({}),30);
      return new Proxy(this,{get:(target,key)=>key in target?target[key]:()=>0});
    }}};
    if(window.onYouTubeIframeAPIReady)window.onYouTubeIframeAPIReady();`,
    }),
  );
  await ctx.route('https://www.youtube-nocookie.com/embed/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub embed</title>' }),
  );

  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto('http://127.0.0.1:4309/', { waitUntil: 'load' });
  await page.evaluate(() => document.getElementById('multiviewOpenBtn').click());
  await sleep(500);
  await page.fill('#mvYtInput', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.evaluate(() => document.getElementById('mvYtAddBtn').click());
  await sleep(1500);

  const state = await page.evaluate(() => ({
    frame: document.querySelector('.mv-tile iframe')?.src ?? null,
    tiles: document.querySelectorAll('.mv-tile').length,
    violations: window.__csp,
  }));
  check(
    'youtube: API and nested script load under the CSP',
    requested.includes('https://www.youtube.com/iframe_api') &&
      requested.some((url) => url.includes('www-widgetapi.js')) &&
      state.violations.length === 0,
    state.violations.join(','),
  );
  check(
    'youtube: tile iframe loads from the nocookie host',
    state.tiles === 1 && /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/.test(state.frame ?? ''),
    state.frame ?? 'no iframe',
  );

  // Control: the policy really blocks other hosts, so the checks above are meaningful.
  const blocked = await page.evaluate(
    () =>
      new Promise((resolve) => {
        document.addEventListener('securitypolicyviolation', (e) => resolve(e.blockedURI), { once: true });
        const script = document.createElement('script');
        script.src = 'https://cdn.example.org/not-allowed.js';
        document.head.appendChild(script);
        setTimeout(() => resolve(null), 1500);
      }),
  );
  check(
    'youtube: CSP still blocks other script hosts',
    blocked === 'https://cdn.example.org/not-allowed.js',
    String(blocked),
  );

  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function behaviorChecks(browser) {
  const clip = path.join(root, 'tests', 'fixtures', 'clip-a.webm');
  const subtitles = path.join(root, 'tests', 'fixtures', 'clip-a.srt');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4311);
  await sleep(600);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__pip = 0;
    Object.defineProperty(document, 'pictureInPictureEnabled', { get: () => true });
    HTMLVideoElement.prototype.requestPictureInPicture = function () {
      window.__pip++;
      return Promise.resolve({});
    };
  });
  await page.goto('http://127.0.0.1:4311/', { waitUntil: 'load' });
  await page.setInputFiles('#fileInput', [clip, subtitles]);
  await sleep(2500);
  const center = (selector) =>
    page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);

  // Picture-in-Picture button
  await page.mouse.move(640, 600);
  await sleep(300);
  const pip = await center('#pipQuickBtn');
  await page.mouse.click(pip.x, pip.y);
  await sleep(300);
  check('pip: clicking the button requests Picture-in-Picture', (await page.evaluate(() => window.__pip)) === 1);

  // Esc from search must leave keyboard shortcuts working
  await page.evaluate(() => document.getElementById('video').pause());
  await page.evaluate(() => document.getElementById('searchToggleBtn').click());
  await sleep(600);
  await page.fill('#searchInput', 'peko');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(500);
  const afterEsc = await page.evaluate(() => ({
    open: window.pekoPlayer.state.searchPanelOpen,
    active: document.activeElement.tagName,
    muted: window.pekoPlayer.isMuted,
  }));
  await page.keyboard.press('m');
  await sleep(200);
  const mutedAfter = await page.evaluate(() => window.pekoPlayer.isMuted);
  check(
    'focus: Esc closes search and shortcuts work without clicking the player',
    afterEsc.open === false && afterEsc.active === 'BODY' && mutedAfter !== afterEsc.muted,
    `focus on ${afterEsc.active}`,
  );
  await page.keyboard.press('m');
  await sleep(100);

  // Bookmark removal by right-click, including the worst case where the playhead sits on the marker
  const bookmarks = () =>
    page.evaluate(
      () => Object.values(JSON.parse(localStorage.getItem('pekoplayer:bookmarks') || '{}'))[0]?.length ?? 0,
    );
  await page.evaluate(() => {
    const v = document.getElementById('video');
    v.pause();
    v.currentTime = 6;
  });
  await sleep(700);
  await page.keyboard.press('b');
  await sleep(300);
  const added = await bookmarks();
  await page.mouse.move(640, 700);
  await sleep(300);
  const marker = await center('.bookmark-marker');
  await page.mouse.click(marker.x, marker.y, { button: 'right' });
  await sleep(400);
  const state = await page.evaluate(() => ({
    markers: document.querySelectorAll('.bookmark-marker').length,
    paused: document.getElementById('video').paused,
  }));
  check(
    'bookmark: right-click removes it, even under the playhead, without starting playback',
    added === 1 && (await bookmarks()) === 0 && state.markers === 0 && state.paused === true,
  );

  // Top bar hide and show
  const bar = () =>
    page.evaluate(() => ({
      height: Math.round(document.getElementById('topbar').getBoundingClientRect().height),
      visibility: getComputedStyle(document.getElementById('topbar')).visibility,
      stageTop: Math.round(document.getElementById('stage').getBoundingClientRect().top),
      revealHidden: document.getElementById('topbarRevealBtn').hidden,
      revealOpacity: getComputedStyle(document.getElementById('topbarRevealBtn')).opacity,
    }));
  const shown = await bar();
  const order = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.topbar-actions > button')].map((b) => b.id);
    return ids.indexOf('topbarHideBtn') === ids.indexOf('helpBtn') + 1;
  });
  check('topbar: hide arrow sits right after the help button', order);
  await page.click('#topbarHideBtn');
  await sleep(400);
  const hidden = await bar();
  check(
    'topbar: hide arrow collapses the bar and the stage fills the space',
    shown.height > 40 && hidden.height === 0 && hidden.visibility === 'hidden' && hidden.stageTop === 0,
  );
  await page.mouse.move(600, 400);
  await sleep(250);
  const away = await bar();
  await page.mouse.move(1100, 10);
  await sleep(350);
  const near = await bar();
  check(
    'topbar: down arrow appears only when the pointer nears the hidden bar',
    !away.revealHidden && away.revealOpacity === '0' && near.revealOpacity === '1',
  );
  await page.click('#topbarRevealBtn');
  await sleep(400);
  const restored = await bar();
  check(
    'topbar: down arrow restores the bar',
    restored.height === shown.height &&
      restored.visibility === 'visible' &&
      restored.stageTop === shown.stageTop &&
      restored.revealHidden === true,
  );
  await page.click('#topbarHideBtn');
  await sleep(300);
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);
  check('topbar: hidden state survives a reload', (await bar()).height === 0);

  // Shortcuts menu icons
  await page.mouse.move(1100, 8);
  await sleep(300);
  await page.click('#topbarRevealBtn');
  await sleep(300);
  await page.keyboard.press('?');
  await sleep(600);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.shortcut-item')].map((row) => {
      const icon = row.querySelector('.shortcut-label svg');
      const kbd = row.querySelector('kbd');
      const box = icon?.getBoundingClientRect();
      return {
        hasIcon: !!icon,
        size: box ? Math.round(box.width) : 0,
        kbdRight: kbd.getBoundingClientRect().left > (box?.right ?? 0),
      };
    }),
  );
  check(
    'shortcuts: every row has a 16px icon before its label and the key on the right',
    rows.length === 24 && rows.every((row) => row.hasIcon && row.size === 16 && row.kbdRight),
    `${rows.filter((row) => row.hasIcon).length}/${rows.length} rows with icons`,
  );

  await ctx.close();
  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function iconToolingChecks() {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-icons-'));
  for (const name of ['src', 'public', 'tools'])
    fs.cpSync(path.join(root, name), path.join(workdir, name), { recursive: true });
  const run = (script, args, env = {}) =>
    new Promise((resolve) => {
      const child = spawn('node', [path.join(workdir, 'tools', script), ...args], {
        cwd: workdir,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('exit', (code) => resolve({ code, stderr }));
    });

  // vendor-icons copies icons from a lucide-static layout and refuses to continue when one is missing.
  const manifest = JSON.parse(fs.readFileSync(path.join(workdir, 'src', 'icons', 'lucide', 'manifest.json'), 'utf8'));
  const source = path.join(workdir, 'fake-lucide');
  fs.mkdirSync(path.join(source, 'icons'), { recursive: true });
  for (const name of manifest)
    fs.writeFileSync(
      path.join(source, 'icons', `${name}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h1" data-from="${name}"/></svg>\n`,
    );
  const ok = await run('vendor-icons.mjs', ['--source', source]);
  const copied = fs.readFileSync(path.join(workdir, 'src', 'icons', 'lucide', 'play.svg'), 'utf8');
  check(
    'icons: vendor script copies every manifest icon from the package',
    ok.code === 0 && copied.includes('data-from="play"'),
  );
  fs.rmSync(path.join(source, 'icons', 'camera.svg'));
  const missing = await run('vendor-icons.mjs', ['--source', source]);
  check(
    'icons: vendor script fails clearly when an icon was removed upstream',
    missing.code === 1 && /camera/.test(missing.stderr),
  );

  // The build inlines icons and rejects unknown names.
  const dist = path.join(workdir, 'dist');
  const html = path.join(workdir, 'src', 'index.html');
  fs.writeFileSync(
    path.join(workdir, 'src', 'icons', 'lucide', 'camera.svg'),
    '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>\n',
  );
  const built = await run('build.mjs', [], { PEKO_DIST_DIR: dist });
  const page = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  check(
    'icons: build inlines every placeholder as local SVG',
    built.code === 0 && !page.includes('{{icon') && (page.match(/class="shortcut-label"><svg/g) || []).length === 24,
  );
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('{{icon:chevron-up:15}}', '{{icon:not-a-real-icon}}'));
  const unknown = await run('build.mjs', [], { PEKO_DIST_DIR: dist });
  check('icons: build rejects an unknown icon name', unknown.code !== 0 && /not-a-real-icon/.test(unknown.stderr));
  fs.rmSync(workdir, { recursive: true, force: true });
}

async function installAndMultiViewChecks(browser) {
  const clip = path.join(root, 'tests', 'fixtures', 'clip-a.webm');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-dist-'));
  build({ PEKO_DIST_DIR: dist });
  const server = startStaticServer(dist, 4313);
  await sleep(600);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4313/', { waitUntil: 'load' });
  await sleep(800);

  // Install web app button: lives under the shortcuts list, stays hidden until the browser offers installation
  const placement = await page.evaluate(() => {
    const b = document.getElementById('installPwaBtn');
    return { inModal: b.parentElement.classList.contains('modal'), inTopbar: !!b.closest('.topbar'), hidden: b.hidden };
  });
  check(
    'install: button is in the shortcuts panel, not the top bar, and starts hidden',
    placement.inModal && !placement.inTopbar && placement.hidden,
  );
  await page.evaluate(() => {
    window.__prompted = 0;
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    offer.prompt = () => {
      window.__prompted++;
      return Promise.resolve();
    };
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(offer);
  });
  await page.keyboard.press('?');
  await sleep(900);
  const shown = await page.evaluate(() => {
    const button = document.getElementById('installPwaBtn');
    const note = document.querySelector('#shortcutsModal .shortcut-note');
    return {
      hidden: button.hidden,
      belowNote: button.getBoundingClientRect().top >= note.getBoundingClientRect().bottom - 1,
      label: button.textContent.trim().replace(/\s+/g, ' '),
    };
  });
  check(
    'install: "Install web app" appears under the shortcut list once the browser offers it',
    !shown.hidden && shown.belowNote && shown.label === 'Install web app',
    JSON.stringify(shown),
  );
  await page.click('#installPwaBtn');
  await sleep(300);
  check(
    'install: clicking it shows the browser prompt and hides the button',
    await page.evaluate(() => window.__prompted === 1 && document.getElementById('installPwaBtn').hidden),
  );
  await page.keyboard.press('Escape');
  await sleep(300);

  // Multi-view down arrow: same behavior as the main top bar, and a little larger
  await page.evaluate(() => document.getElementById('multiviewOpenBtn').click());
  await sleep(600);
  await page.setInputFiles('#mvFileInput', [clip]);
  await sleep(2000);
  const tab = () =>
    page.evaluate(() => {
      const element = document.getElementById('mvBarTab');
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        opacity: style.opacity,
        pointer: style.pointerEvents,
        toolbar: Math.round(document.getElementById('mvToolbar').getBoundingClientRect().height),
      };
    });
  await page.click('#mvHideBarBtn');
  await sleep(500);
  await page.mouse.move(640, 500);
  await sleep(300);
  const away = await tab();
  check(
    'multi-view: with the toolbar hidden, the arrow stays out of sight until the pointer nears the top',
    away.toolbar === 0 && away.opacity === '0' && away.pointer === 'none',
  );
  await page.mouse.move(640, 12);
  await sleep(350);
  const near = await tab();
  check(
    'multi-view: the arrow appears at the top edge and is larger than before (60x24, was 44x16)',
    near.opacity === '1' && near.top === 0 && near.pointer === 'auto' && near.width === 60 && near.height === 24,
    JSON.stringify(near),
  );
  await page.click('#mvBarTab');
  await sleep(500);
  const restored = await tab();
  check('multi-view: clicking the arrow restores the toolbar', restored.toolbar > 30 && restored.opacity === '0');
  await ctx.close();

  // Touch screens have no hover, so the arrow stays visible there
  const touch = await browser.newContext({ viewport: { width: 700, height: 500 }, hasTouch: true, isMobile: true });
  await touch.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const phone = await touch.newPage();
  await phone.goto('http://127.0.0.1:4313/', { waitUntil: 'load' });
  await sleep(800);
  await phone.evaluate(() => document.getElementById('multiviewOpenBtn').click());
  await sleep(500);
  await phone.setInputFiles('#mvFileInput', [clip]);
  await sleep(2000);
  await phone.evaluate(() => document.getElementById('mvHideBarBtn').click());
  await sleep(400);
  const onTouch = await phone.evaluate(() => {
    const style = getComputedStyle(document.getElementById('mvBarTab'));
    return { hoverNone: matchMedia('(hover: none)').matches, opacity: style.opacity, pointer: style.pointerEvents };
  });
  check(
    'multi-view: on touch screens the arrow is always visible',
    onTouch.hoverNone && onTouch.opacity === '0.75' && onTouch.pointer === 'auto',
    JSON.stringify(onTouch),
  );
  await touch.close();

  server.kill();
  fs.rmSync(dist, { recursive: true, force: true });
}

async function subpathChecks(browser) {
  // GitHub Pages serves project sites from /<repository>/, so the app must work away from the domain root.
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-subpath-'));
  const site = path.join(parent, 'pekoplayer');
  build({ PEKO_DIST_DIR: site }, ['--csp-meta']);
  const server = startStaticServer(parent, 4312);
  await sleep(600);
  const ctx = await browser.newContext();
  await ctx.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto('http://127.0.0.1:4312/pekoplayer/', { waitUntil: 'load' });
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  check('subpath: service worker scope is the sub-path', scope === 'http://127.0.0.1:4312/pekoplayer/', scope);

  const manifest = await page.evaluate(async () => {
    const url = new URL(document.querySelector('link[rel="manifest"]').href);
    const data = await (await fetch(url)).json();
    const icons = await Promise.all(data.icons.map(async (icon) => (await fetch(new URL(icon.src, url))).status));
    return {
      start: new URL(data.start_url, url).pathname,
      scope: new URL(data.scope, url).pathname,
      id: new URL(data.id, url).pathname,
      icons,
    };
  });
  check(
    'subpath: manifest start, scope and icons resolve under the sub-path',
    manifest.start === '/pekoplayer/' &&
      manifest.scope === '/pekoplayer/' &&
      manifest.id === '/pekoplayer/' &&
      manifest.icons.every((status) => status === 200),
    JSON.stringify(manifest),
  );

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const offline = await page.evaluate(() => ({ player: !!window.pekoPlayer, violations: window.__csp }));
  check(
    'subpath: offline reload works and the meta CSP raises no violations',
    offline.player && offline.violations.length === 0,
    offline.violations.join(','),
  );
  await ctx.close();
  server.kill();
  fs.rmSync(parent, { recursive: true, force: true });
}

(async () => {
  const browser = await chromium.launch();
  try {
    await pwaChecks(browser);
    await privacyChecks(browser);
    await desktopServerChecks();
    await cspMetaChecks(browser);
    await searchHighlightChecks(browser);
    await youtubeCspChecks(browser);
    await behaviorChecks(browser);
    await fileOpenChecks(browser);
    await debugPanelChecks(browser);
    await wallChecks(browser);
    await installAndMultiViewChecks(browser);
    await subpathChecks(browser);
    await iconToolingChecks();
  } finally {
    await browser.close();
  }
  process.exit(results.every(Boolean) ? 0 : 1);
})();
