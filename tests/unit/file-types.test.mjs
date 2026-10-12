import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { root } from './load.mjs';

const require = createRequire(import.meta.url);
const fileTypes = require(path.join(root, 'desktop', 'file-types.cjs'));

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-files-'));
const touch = (name) => {
  const file = path.join(folder, name);
  fs.writeFileSync(file, 'x');
  return file;
};
const movie = touch('Movie.MP4');
const subtitle = touch('movie.srt');
const otherVtt = touch('movie.vtt');
touch('movie.en.srt');
const clip = touch('clip.webm');
touch('notes.txt');
touch('picture.png');
test.after(() => fs.rmSync(folder, { recursive: true, force: true }));

test('the desktop file types match the manifest file handlers', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  const declared = Object.values(manifest.file_handlers[0].accept).flat().sort();
  assert.deepEqual(declared, [...fileTypes.VIDEO_EXTENSIONS].sort());
});

test('filesFromArguments keeps existing video files and the subtitles that share their name', () => {
  const files = fileTypes.filesFromArguments(
    [movie, '--flag', 'notes.txt', 'picture.png', 'missing.mp4', clip, movie],
    folder,
  );
  assert.deepEqual(files, [movie, subtitle, otherVtt, clip]);
});

test('filesFromArguments resolves relative paths against the given folder', () => {
  assert.deepEqual(fileTypes.filesFromArguments(['clip.webm'], folder), [clip]);
  assert.deepEqual(fileTypes.filesFromArguments([], folder), []);
});

test('registry entries point every video extension at PekoPlayer and quote the executable path', () => {
  const exe = 'C:\\Users\\Some One\\PekoPlayer-1.0.0-portable.exe';
  const entries = fileTypes.registryEntries(exe);
  const command = entries.find((entry) => entry.key.endsWith('PekoPlayer.Video\\shell\\open\\command'));
  assert.equal(command.data, `"${exe}" "%1"`);
  for (const ext of fileTypes.VIDEO_EXTENSIONS) {
    assert.ok(
      entries.some((entry) => entry.key.endsWith(`\\${ext}\\OpenWithProgids`) && entry.name === 'PekoPlayer.Video'),
      ext,
    );
    assert.ok(
      entries.some((entry) => entry.key.endsWith('\\SupportedTypes') && entry.name === ext),
      ext,
    );
  }
  // Everything is written under the current user's hive, so no administrator rights are needed.
  assert.ok(entries.every((entry) => entry.key.startsWith('HKCU\\Software\\Classes\\')));
});

test('reg arguments for default values, named values and empty markers', () => {
  const { toAddArguments } = fileTypes;
  assert.deepEqual(toAddArguments({ key: 'K', data: 'D' }), ['add', 'K', '/ve', '/t', 'REG_SZ', '/d', 'D', '/f']);
  assert.deepEqual(toAddArguments({ key: 'K', name: 'N', data: '' }), [
    'add',
    'K',
    '/v',
    'N',
    '/t',
    'REG_SZ',
    '/d',
    '',
    '/f',
  ]);
  assert.deepEqual(toAddArguments({ key: 'K', name: 'N', type: 'REG_NONE' }), [
    'add',
    'K',
    '/v',
    'N',
    '/t',
    'REG_NONE',
    '/f',
  ]);
});

test('register runs every entry, and unregister carries on when a key is already gone', async () => {
  const added = [];
  await fileTypes.registerFileTypes('C:\\x\\PekoPlayer.exe', async (args) => added.push(args));
  assert.equal(added.length, fileTypes.registryEntries('C:\\x\\PekoPlayer.exe').length);
  assert.ok(added.every((args) => args[0] === 'add' && args.at(-1) === '/f'));

  const deleted = [];
  await fileTypes.unregisterFileTypes(async (args) => {
    deleted.push(args);
    throw new Error('The system was unable to find the specified registry key or value.');
  });
  assert.equal(deleted.length, 2 + fileTypes.VIDEO_EXTENSIONS.length);
  assert.ok(deleted.every((args) => args[0] === 'delete' && args.at(-1) === '/f'));
});

test('collectFolderFiles finds videos and their sidecars in subfolders and skips hidden and unrelated files', () => {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-tree-'));
  const make = (relative) => {
    const file = path.join(tree, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
    return file;
  };
  const expected = [
    make('a.mp4'),
    make('Season 2/ep2.mkv'),
    make('Season 2/ep2.srt'),
    make('Season 10/ep1.webm'),
    make('Season 10/ep1.info.json'),
    make('Season 10/ep1.chapters.txt'),
  ];
  make('readme.txt');
  make('picture.png');
  make('.hidden/secret.mp4');
  make('$RECYCLE.BIN/old.mp4');
  try {
    const found = fileTypes.collectFolderFiles(tree).map((file) => path.relative(tree, file).replaceAll('\\', '/'));
    // Names sort numerically, so "Season 2" comes before "Season 10".
    assert.deepEqual(
      found,
      expected
        .map((file) => path.relative(tree, file).replaceAll('\\', '/'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
    );
    assert.equal(fileTypes.collectFolderFiles(tree, { maxFiles: 2 }).length, 2);
    assert.equal(fileTypes.collectFolderFiles(tree, { maxDepth: 0 }).length, 1);
    assert.deepEqual(fileTypes.collectFolderFiles(path.join(tree, 'missing')), []);
  } finally {
    fs.rmSync(tree, { recursive: true, force: true });
  }
});

test('isRegistered compares the registered command with this executable and treats a missing key as not registered', async () => {
  const exe = 'C:\\Apps\\PekoPlayer-1.0.0-portable.exe';
  const output = `\r\nHKEY_CURRENT_USER\\Software\\Classes\\PekoPlayer.Video\\shell\\open\\command\r\n    (Default)    REG_SZ    "${exe}" "%1"\r\n`;
  assert.equal(await fileTypes.isRegistered(exe, async () => output), true);
  assert.equal(await fileTypes.isRegistered('C:\\Elsewhere\\PekoPlayer.exe', async () => output), false);
  assert.equal(await fileTypes.isRegistered(exe, async () => Promise.reject(new Error('not found'))), false);
});
