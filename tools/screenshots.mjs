// Regenerates the screenshots in docs/images from the real app, using videos that are generated on the fly, so nothing
// copyrighted is involved. Requires ffmpeg (with the `gradients` and `mandelbrot` sources) and Playwright's Chromium.
//
//   npm run docs:screenshots
//
// Set CHROMIUM_PATH (and optionally CHROMIUM_ARGS) to use a browser other than the one Playwright installs.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = path.join(root, 'docs', 'images');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-shots-'));
const dist = path.join(work, 'dist');
const PORT = 4399;

const CLIPS = {
  Aurora: [
    'gradients=s=960x540:r=24:duration=24:speed=0.02:c0=0x0b1d51:c1=0xff6b00:c2=0x00c2a8:c3=0x6a1b9a:nb_colors=4',
    330,
  ],
  Fractal: [
    'mandelbrot=s=960x540:r=24:start_scale=3:end_scale=0.01:start_x=-0.7436438870371587:start_y=0.131825904205312:maxiter=400',
    440,
  ],
  Sunset: [
    'gradients=s=960x540:r=24:duration=24:speed=0.03:type=radial:c0=0x1a0033:c1=0xff2e63:c2=0xffc93c:c3=0x2b1055:nb_colors=4',
    520,
  ],
  Ocean: [
    'gradients=s=960x540:r=24:duration=24:speed=0.025:type=spiral:c0=0x021b3a:c1=0x0077b6:c2=0x00c2a8:c3=0x90e0ef:nb_colors=4',
    262,
  ],
};

const SUBTITLES = [
  'Welcome to PekoPlayer, a private video player that runs in your browser.',
  'Open a file, a whole folder, or drag videos straight onto the window.',
  'Subtitles become a searchable transcript, and every line is a link to that moment.',
  'Nothing is uploaded. Your videos and your history stay on your device.',
  'Add bookmarks, loop a section, and change the speed without losing pitch.',
  'Open several videos together in multi-view and arrange them any way you like.',
  'Press the question mark key to see every shortcut.',
];

function makeMedia() {
  for (const [name, [source, hz]] of Object.entries(CLIPS)) {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        source,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${hz}:duration=24`,
        '-t',
        '24',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libvpx',
        '-b:v',
        '900k',
        '-g',
        '24',
        '-c:a',
        'libvorbis',
        '-shortest',
        path.join(work, `${name}.webm`),
      ],
      { stdio: 'inherit' },
    );
  }
  const stamp = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23).replace('.', ',');
  const cues = SUBTITLES.map((text, i) => `${i + 1}\n${stamp(0.5 + i * 3.5)} --> ${stamp(3.5 + i * 3.5)}\n${text}\n`);
  fs.writeFileSync(path.join(work, 'Aurora.srt'), cues.join('\n'));
}

const upload = (name, type = 'video/webm') => ({
  name,
  mimeType: type,
  buffer: fs.readFileSync(path.join(work, name)),
});

async function main() {
  makeMedia();
  execFileSync('node', [path.join(root, 'tools', 'build.mjs')], {
    env: { ...process.env, PEKO_DIST_DIR: dist },
    stdio: 'inherit',
  });
  const server = spawn(
    'node',
    [path.join(root, 'tools', 'serve.mjs'), dist, String(PORT), path.join(dist, '_headers')],
    { stdio: 'ignore' },
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      ...(process.env.CHROMIUM_ARGS ? process.env.CHROMIUM_ARGS.split(' ') : []),
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await context.route(/youtube\.com|ytimg\.com/, (route) => route.abort());
  const page = await context.newPage();
  const raw = path.join(work, 'raw');
  fs.mkdirSync(raw);
  const sleep = (ms) => page.waitForTimeout(ms);
  const frames = (ms = 600) =>
    page.evaluate(
      (duration) =>
        new Promise((resolve) => {
          const end = performance.now() + duration;
          const tick = () => (performance.now() < end ? requestAnimationFrame(tick) : resolve());
          tick();
        }),
      ms,
    );
  const shot = (name) => page.screenshot({ path: path.join(raw, `${name}.png`) });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(1200);
  await shot('player-empty-state');

  await page.setInputFiles('#fileInput', [
    upload('Aurora.webm'),
    upload('Aurora.srt', 'text/plain'),
    upload('Fractal.webm'),
    upload('Sunset.webm'),
    upload('Ocean.webm'),
  ]);
  await sleep(3500);
  await page.evaluate(() => {
    const video = document.getElementById('video');
    video.currentTime = 8.2;
    video.pause();
  });
  await sleep(800);
  await page.mouse.move(720, 700);
  await frames(500);
  await sleep(1800);
  await page.mouse.move(724, 704);
  await frames(400);
  await shot('player');

  await page.keyboard.press('/');
  await sleep(600);
  await page.fill('#searchInput', 'video');
  await sleep(900);
  await frames(300);
  await shot('transcript-search');
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('g');
  await sleep(800);
  await page.click('#settingsBtn');
  await sleep(600);
  await page.click('#fxNavBtn');
  await sleep(600);
  await frames(400);
  await shot('effects');
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(300);

  await page.keyboard.press('?');
  await sleep(700);
  await shot('keyboard-shortcuts');
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.evaluate(() => document.getElementById('multiviewOpenBtn').click());
  await sleep(700);
  await page.setInputFiles('#mvFileInput', [
    upload('Aurora.webm'),
    upload('Fractal.webm'),
    upload('Sunset.webm'),
    upload('Ocean.webm'),
  ]);
  await sleep(3000);
  await page.evaluate(() => {
    const times = [10, 12, 6, 14];
    window.multiView.tiles.forEach((tile, i) => {
      const video = tile.wrapper.querySelector('video');
      video.currentTime = times[i];
      video.pause();
    });
  });
  await page.click('.mv-seg[data-layout="grid"]');
  await sleep(900);
  await frames(500);
  await page.mouse.move(300, 300);
  await frames(600);
  await shot('multi-view-grid');

  await page.click('.mv-seg[data-layout="split"]');
  await sleep(900);
  const handle = await page.locator('.mv-gutter-v').first().boundingBox();
  const y = handle.y + handle.height * 0.2;
  await page.mouse.move(handle.x + handle.width / 2, y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(handle.x + handle.width / 2 + step * 22, y);
    await sleep(30);
  }
  await page.mouse.up();
  await frames(900);
  await page.mouse.move(handle.x + handle.width / 2 + 176, y);
  await frames(500);
  await shot('multi-view-split');

  await browser.close();
  server.kill();

  fs.mkdirSync(images, { recursive: true });
  for (const file of fs.readdirSync(raw)) {
    await sharp(path.join(raw, file))
      .resize(1280, 800)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toFile(path.join(images, file));
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Screenshots written to ${images}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
