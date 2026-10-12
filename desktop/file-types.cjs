'use strict';
// Video file handling for the desktop app: which files PekoPlayer opens, how files passed on the command line are
// resolved, and (for the portable build) how to add or remove PekoPlayer in the Windows "Open with" menu.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Keep in sync with file_handlers in public/manifest.webmanifest (a unit test compares them).
const VIDEO_EXTENSIONS = ['.3gp', '.m4v', '.mkv', '.mov', '.mp4', '.ogg', '.ogv', '.webm'];
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt'];

const PROG_ID = 'PekoPlayer.Video';
const APP_KEY = 'PekoPlayer.exe';
const CLASSES = 'HKCU\\Software\\Classes';

const SIDECAR_PATTERN = /\.(srt|vtt|info\.json|chapters\.(txt|json))$/i;

const hasExtension = (file, extensions) => extensions.includes(path.extname(file).toLowerCase());

/**
 * Turns command-line arguments into the files to open: existing video files, each followed by the subtitle file that
 * sits next to it and shares its name (movie.mp4 with movie.srt or movie.vtt), which is how the player pairs them.
 * Anything else is ignored.
 */
function filesFromArguments(args, cwd = process.cwd()) {
  const result = [];
  for (const arg of args) {
    if (!arg || arg.startsWith('-')) continue;
    const file = path.resolve(cwd, arg);
    try {
      if (!hasExtension(file, VIDEO_EXTENSIONS) || !fs.statSync(file).isFile()) continue;
    } catch {
      // The file does not exist or cannot be read: nothing to open.
      continue;
    }
    result.push(file, ...findSubtitles(file));
  }
  return [...new Set(result)];
}

/** Subtitle files in the same folder with the video's name, such as movie.srt next to movie.mp4. */
function findSubtitles(videoFile) {
  const dir = path.dirname(videoFile);
  const stem = path.basename(videoFile, path.extname(videoFile)).toLowerCase();
  try {
    return fs
      .readdirSync(dir)
      .filter(
        (name) =>
          hasExtension(name, SUBTITLE_EXTENSIONS) && path.basename(name, path.extname(name)).toLowerCase() === stem,
      )
      .sort()
      .map((name) => path.join(dir, name));
  } catch {
    // The folder cannot be listed: open the video without subtitles.
    return [];
  }
}

/**
 * Every video in a folder and its subfolders, with the subtitle, chapter and info.json files that go with them.
 * Hidden entries and symbolic links are skipped. `maxFiles` and `maxDepth` keep a huge or cyclic tree from hanging the app.
 */
function collectFolderFiles(root, { maxFiles = 20000, maxDepth = 12 } = {}) {
  const found = [];
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // The folder cannot be listed (permissions or removed): skip it.
      return;
    }
    for (const entry of entries.sort(byName)) {
      if (found.length >= maxFiles) return;
      if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(full, depth + 1);
      } else if (entry.isFile() && (hasExtension(entry.name, VIDEO_EXTENSIONS) || SIDECAR_PATTERN.test(entry.name))) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found;
}

/** The registry values that make PekoPlayer appear in the "Open with" menu of video files, for the current user only. */
function registryEntries(exePath) {
  const command = `"${exePath}" "%1"`;
  const entries = [
    { key: `${CLASSES}\\${PROG_ID}`, data: 'PekoPlayer video' },
    { key: `${CLASSES}\\${PROG_ID}\\DefaultIcon`, data: `"${exePath}",0` },
    { key: `${CLASSES}\\${PROG_ID}\\shell\\open\\command`, data: command },
    { key: `${CLASSES}\\Applications\\${APP_KEY}`, name: 'FriendlyAppName', data: 'PekoPlayer' },
    { key: `${CLASSES}\\Applications\\${APP_KEY}\\shell\\open\\command`, data: command },
  ];
  for (const ext of VIDEO_EXTENSIONS) {
    entries.push({ key: `${CLASSES}\\Applications\\${APP_KEY}\\SupportedTypes`, name: ext, data: '' });
    entries.push({ key: `${CLASSES}\\${ext}\\OpenWithProgids`, name: PROG_ID, type: 'REG_NONE' });
  }
  return entries;
}

/** Arguments for `reg add`: a named value, or the key's default value when there is no name. */
function toAddArguments({ key, name, type = 'REG_SZ', data = '' }) {
  const args = ['add', key, ...(name ? ['/v', name] : ['/ve']), '/t', type];
  if (type !== 'REG_NONE') args.push('/d', data);
  args.push('/f');
  return args;
}

const queryReg = (args) =>
  new Promise((resolve, reject) => {
    execFile('reg.exe', args, { windowsHide: true }, (error, stdout) =>
      error ? reject(error) : resolve(String(stdout)),
    );
  });

/** True when the "Open with" entries exist and point at this executable. `query` is replaceable for tests. */
async function isRegistered(exePath, query = queryReg) {
  try {
    const output = await query(['query', `${CLASSES}\\${PROG_ID}\\shell\\open\\command`, '/ve']);
    return output.toLowerCase().includes(exePath.toLowerCase());
  } catch {
    // The key does not exist: PekoPlayer is not registered.
    return false;
  }
}

const runReg = (args) =>
  new Promise((resolve, reject) => {
    execFile('reg.exe', args, { windowsHide: true }, (error) => (error ? reject(error) : resolve()));
  });

/** Adds PekoPlayer to the "Open with" menu of video files. `run` is replaceable for tests. */
async function registerFileTypes(exePath, run = runReg) {
  for (const entry of registryEntries(exePath)) await run(toAddArguments(entry));
}

/** Removes everything registerFileTypes added. Missing keys are fine. */
async function unregisterFileTypes(run = runReg) {
  const commands = [
    ['delete', `${CLASSES}\\${PROG_ID}`, '/f'],
    ['delete', `${CLASSES}\\Applications\\${APP_KEY}`, '/f'],
    ...VIDEO_EXTENSIONS.map((ext) => ['delete', `${CLASSES}\\${ext}\\OpenWithProgids`, '/v', PROG_ID, '/f']),
  ];
  for (const args of commands) {
    try {
      await run(args);
    } catch {
      // The key or value was never added: nothing to remove.
    }
  }
}

module.exports = {
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  filesFromArguments,
  findSubtitles,
  collectFolderFiles,
  isRegistered,
  registryEntries,
  toAddArguments,
  registerFileTypes,
  unregisterFileTypes,
};
