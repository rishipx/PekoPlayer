// Generates the two short WebM clips used by the smoke tests. Requires ffmpeg on the PATH.
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { cwd: dir, stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') {
    console.error(
      'ffmpeg was not found on the PATH. Install it (https://ffmpeg.org/download.html), reopen the terminal and try again.',
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc=duration=12:size=640x360:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=12',
  '-c:v',
  'libvpx',
  '-b:v',
  '300k',
  '-c:a',
  'libvorbis',
  '-shortest',
  'clip-a.webm',
]);
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=duration=8:size=480x270:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=660:duration=8',
  '-c:v',
  'libvpx',
  '-b:v',
  '200k',
  '-c:a',
  'libvorbis',
  '-shortest',
  'clip-b.webm',
]);
console.log(`fixtures written to ${dir}`);
