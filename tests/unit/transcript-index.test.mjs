import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { load, plain, root } from './load.mjs';

const { TranscriptIndex } = load(['src/shared/transcript-index.js'], ['TranscriptIndex']);

const cues = [
  { start: 0, end: 2, text: 'Welcome to the test clip.' },
  { start: 3, end: 5, text: 'Search should find this <i>transcript</i> line.' },
  { start: 6, end: 8, text: 'Transcripts are indexed per word.' },
  { start: 9, end: 11, text: '' },
  { start: 12, end: 14, text: 'Fish & chips, 5 < 6, "quoted"' },
];
const build = () => {
  const index = new TranscriptIndex();
  index.index(cues);
  return index;
};

test('tokenize lowercases and drops punctuation, single characters and bare numbers', () => {
  assert.deepEqual(plain(TranscriptIndex.tokenize('Don’t STOP, a 42 times!')), ["don't", 'stop', 'times']);
});

test('index skips empty cues and strips markup', () => {
  const index = build();
  assert.equal(index.docs.length, 4);
  assert.equal(index.docs[1].text, 'Search should find this transcript line.');
});

test('exact words rank above prefix matches', () => {
  const results = plain(build().search('transcript'));
  assert.deepEqual(
    results.map((r) => [r.start, r.score]),
    [
      [3, 3],
      [6, 2],
    ],
  );
  assert.deepEqual(results[0].matches, ['transcript']);
});

test('a query with few hits also finds words one typo away', () => {
  const results = plain(build().search('welcom'));
  assert.equal(results[0].start, 0);
  const typo = plain(build().search('serch'));
  assert.equal(typo[0].start, 3);
});

test('words two edits away do not match', () => {
  assert.deepEqual(plain(build().search('sxxrch')), []);
});

test('limit, empty queries and an empty index', () => {
  assert.equal(build().search('the', 1).length, 1);
  assert.deepEqual(plain(build().search('   ')), []);
  assert.equal(new TranscriptIndex().isEmpty(), true);
  assert.deepEqual(plain(new TranscriptIndex().search('anything')), []);
});

test('withinEditDistance', () => {
  const { withinEditDistance } = TranscriptIndex;
  assert.equal(withinEditDistance('kitten', 'kitten', 1), true);
  assert.equal(withinEditDistance('kitten', 'sitten', 1), true);
  assert.equal(withinEditDistance('kitten', 'sittin', 1), false);
  assert.equal(withinEditDistance('', 'a', 1), true);
});

test('the built worker runs the same index through its message protocol', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'peko-unit-'));
  try {
    execFileSync('node', [path.join(root, 'tools', 'build.mjs')], {
      env: { ...process.env, PEKO_DIST_DIR: dist },
      stdio: 'pipe',
    });
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const script = html.match(/<script type="text\/worker" id="transcriptWorkerSrc">([\s\S]*?)<\/script>/)[1];
    const replies = [];
    const self = { postMessage: (message) => replies.push(message) };
    vm.runInContext(script, vm.createContext({ self, String, Array, Set, Map, Math }));
    const send = (message) => self.onmessage({ data: message });

    send({ type: 'index', cues, requestId: 1 });
    send({ type: 'search', query: 'transcript', limit: 40, requestId: 2 });
    send({ type: 'clear', requestId: 3 });
    send({ type: 'search', query: 'transcript', requestId: 4 });

    assert.deepEqual(plain(replies[0]), { requestId: 1, type: 'indexed', count: 4 });
    assert.equal(replies[1].type, 'results');
    assert.deepEqual(plain(replies[1].results), plain(build().search('transcript')));
    assert.deepEqual(plain(replies[2]), { requestId: 3, type: 'indexed', count: 0 });
    assert.deepEqual(plain(replies[3].results), []);
  } finally {
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
