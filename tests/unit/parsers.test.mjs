import assert from 'node:assert/strict';
import test from 'node:test';
import { load, plain } from './load.mjs';

const { timecodeToSeconds, baseName, parseChaptersTxt, parseYtDlpInfoJson, detectChapters } = load(
  ['src/scripts/player/01-utils.js', 'src/scripts/player/03-transcript-search.js'],
  ['timecodeToSeconds', 'baseName', 'parseChaptersTxt', 'parseYtDlpInfoJson', 'detectChapters'],
);

test('timecodeToSeconds', () => {
  assert.equal(timecodeToSeconds('1:02:03'), 3723);
  assert.equal(timecodeToSeconds('02:03.5'), 123.5);
  assert.equal(timecodeToSeconds('45'), 45);
});

test('baseName removes the extension and sidecar suffixes', () => {
  assert.equal(baseName('movie.mp4'), 'movie');
  assert.equal(baseName('movie.info.json'), 'movie');
  assert.equal(baseName('movie.chapters.txt'), 'movie');
  assert.equal(baseName('my.movie.srt'), 'my.movie');
});

test('parseChaptersTxt reads timestamp lines and links each chapter to the next', () => {
  const chapters = plain(parseChaptersTxt('0:00 Intro\n1:30 Main part\n10:00 Outro\nnot a chapter'));
  assert.deepEqual(
    chapters.map((c) => [c.start, c.end, c.title]),
    [
      [0, 90, 'Intro'],
      [90, 600, 'Main part'],
      [600, null, 'Outro'],
    ],
  );
});

test('parseChaptersTxt reads the CHAPTERnn format', () => {
  const chapters = plain(
    parseChaptersTxt('CHAPTER01=00:00:00.000\nCHAPTER01NAME=Start\nCHAPTER02=00:05:00.000\nCHAPTER02NAME=Next'),
  );
  assert.deepEqual(
    chapters.map((c) => [c.start, c.end, c.title]),
    [
      [0, 300, 'Start'],
      [300, null, 'Next'],
    ],
  );
});

test('parseYtDlpInfoJson uses chapters, falls back to sections, and survives bad input', () => {
  const withChapters = parseYtDlpInfoJson(JSON.stringify({ chapters: [{ start_time: 0, end_time: 10, title: 'A' }] }));
  assert.equal(withChapters.chapters[0].title, 'A');
  const withSections = parseYtDlpInfoJson(JSON.stringify({ sections: [{ section_start: 5, section_title: 'S' }] }));
  assert.deepEqual(plain(withSections.chapters[0]).start, 5);
  assert.deepEqual(plain(parseYtDlpInfoJson('not json')), { chapters: [], raw: null });
});

// Four cues with long pauses between them (gaps of 20, 4 and 30 seconds).
const spaced = [
  { start: 0, end: 10 },
  { start: 30, end: 40 },
  { start: 44, end: 100 },
  { start: 130, end: 140 },
];

test('detectChapters splits at the largest gaps and respects the minimum chapter length', () => {
  const chapters = plain(detectChapters(spaced, 140, { minChapterSec: 5, maxChapters: 10 }));
  assert.deepEqual(
    chapters.map((c) => [c.start, c.end]),
    [
      [0, 10],
      [30, 40],
      [44, 100],
      [130, 140],
    ],
  );
});

test('detectChapters merges chapters that are shorter than the minimum', () => {
  const chapters = plain(detectChapters(spaced, 140, { minChapterSec: 45, maxChapters: 10 }));
  // The 10 s chapters at both ends and the 10 s chapter after the first gap are folded into their neighbours.
  assert.ok(chapters.length < 4);
  assert.ok(chapters.every((c) => c.end - c.start >= 45 || chapters.length === 1));
  assert.equal(chapters[0].start, 0);
  assert.equal(chapters.at(-1).end, 140);
});

test('detectChapters needs at least four cues and one gap', () => {
  assert.deepEqual(plain(detectChapters(spaced.slice(0, 3), 100)), []);
  assert.deepEqual(
    plain(
      detectChapters(
        [0, 1, 2, 3].map((i) => ({ start: i, end: i + 0.9 })),
        4,
      ),
    ),
    [],
  );
});
