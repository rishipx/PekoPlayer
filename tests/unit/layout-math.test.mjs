import assert from 'node:assert/strict';
import test from 'node:test';
import { load, plain } from './load.mjs';

const { PekoLayout } = load(['src/shared/layout-math.js'], ['PekoLayout']);
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message ?? ''} ${a} vs ${b}`);

// The packing algorithm the wall used before the layout code moved here, kept as a reference for the new function.
function referenceSmartGrid(aspects, colsOverride, width, height) {
  const GAP = 4;
  const cw = width - GAP * 2;
  const ch = height - GAP * 2;
  const cols = Math.max(1, Math.min(aspects.length, colsOverride));
  const rows = [];
  for (let i = 0; i < aspects.length; i += cols) rows.push(aspects.slice(i, i + cols));
  const nh = rows.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    const w = cw - GAP * (row.length - 1);
    return s > 0 ? w / s : 0;
  });
  const totH = nh.reduce((s, h) => s + h, 0) + GAP * (rows.length - 1);
  const scale = totH > 0 ? Math.min(1, ch / totH) : 1;
  const sh = nh.map((h) => h * scale);
  let y = Math.max(0, (ch - (sh.reduce((s, h) => s + h, 0) + GAP * (rows.length - 1))) / 2);
  const out = [];
  rows.forEach((row, rIdx) => {
    const rowH = sh[rIdx];
    const widths = row.map((a) => rowH * a);
    const rowW = widths.reduce((s, w) => s + w, 0) + GAP * (widths.length - 1);
    let x = Math.max(0, (cw - rowW) / 2);
    widths.forEach((w) => {
      out.push({ x: x + GAP, y: y + GAP, w, h: rowH });
      x += w + GAP;
    });
    y += rowH + GAP;
  });
  return out;
}

test('autoGrid places tiles exactly like the previous smart grid', () => {
  let seed = 11;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let run = 0; run < 300; run++) {
    const count = 1 + Math.floor(random() * 9);
    const aspects = Array.from({ length: count }, () => [16 / 9, 4 / 3, 9 / 16, 1, 21 / 9][Math.floor(random() * 5)]);
    const cols = 1 + Math.floor(random() * 4);
    const width = 300 + Math.floor(random() * 1600);
    const height = 200 + Math.floor(random() * 900);
    const expected = referenceSmartGrid(aspects, cols, width, height);
    const actual = plain(PekoLayout.autoGrid(aspects, cols, width, height).rects);
    assert.equal(actual.length, expected.length);
    expected.forEach((rect, i) =>
      ['x', 'y', 'w', 'h'].forEach((key) => close(actual[i][key], rect[key], `run ${run} tile ${i} ${key}`)),
    );
  }
});

test('autoGrid with no tiles or no room returns nothing', () => {
  assert.deepEqual(plain(PekoLayout.autoGrid([], 2, 800, 600)), { rects: [], rows: [] });
  assert.deepEqual(plain(PekoLayout.autoGrid([1.7], 2, 6, 600)), { rects: [], rows: [] });
});

test('manualGrid fills the wall exactly, with the gap between tiles and nothing overlapping', () => {
  const gap = PekoLayout.GAP;
  const layout = plain(PekoLayout.manualGrid(5, 2, [1, 2, 1], [1, 3, 1, 1, 1], 1000, 700));
  assert.equal(layout.rects.length, 5);
  assert.equal(layout.rows.length, 3);
  const [first, second] = layout.rects;
  close(second.x - (first.x + first.w), gap, 'horizontal gap');
  close(second.w / first.w, 3, 'width shares');
  const rowOne = layout.rows[0];
  const rowTwo = layout.rows[1];
  close(rowTwo.y - (rowOne.y + rowOne.h), gap, 'vertical gap');
  close(rowTwo.h / rowOne.h, 2, 'height shares');
  const last = layout.rows.at(-1);
  close(last.y + last.h, 700 - gap, 'bottom edge');
  close(Math.max(...layout.rects.map((r) => r.x + r.w)), 1000 - gap, 'right edge');
  // The odd tile in the last row is the only one in its row, so it takes the whole row.
  close(layout.rects[4].w, 1000 - gap * 2, 'single tile fills its row');
});

test('gridGutters sits in the gaps between tiles and between rows', () => {
  const gap = PekoLayout.GAP;
  const layout = PekoLayout.manualGrid(3, 2, [1, 1], [1, 1, 1], 1000, 600);
  const gutters = plain(PekoLayout.gridGutters(layout));
  const vertical = gutters.filter((g) => g.axis === 'v');
  const horizontal = gutters.filter((g) => g.axis === 'h');
  assert.equal(vertical.length, 1);
  assert.equal(horizontal.length, 1);
  const [a, b] = plain(layout).rects;
  close(vertical[0].x, a.x + a.w + gap / 2);
  assert.ok(vertical[0].x < b.x);
  close(horizontal[0].length, 1000 - gap * 2);
});

test('trackSizes divides the space left after the gaps', () => {
  const sizes = PekoLayout.trackSizes([1, 3], 1004, 4);
  close(sizes[0], 250);
  close(sizes[1], 750);
});

test('resizeTracks changes only the two neighbouring tracks and keeps the total', () => {
  const fr = [1, 1, 1, 1];
  const next = plain(PekoLayout.resizeTracks(fr, 1, 100, 1000, 120));
  assert.equal(next[0], 1);
  assert.equal(next[3], 1);
  close(next[1] + next[2], 2, 'pair total');
  assert.ok(next[1] > 1 && next[2] < 1);
  close((next[1] / 4) * 1000, 350, 'new size in pixels');
});

test('resizeTracks never shrinks a track below the minimum', () => {
  const grown = plain(PekoLayout.resizeTracks([1, 1], 0, 10000, 1000, 120));
  close((grown[1] / 2) * 1000, 120, 'right track stops at the minimum');
  const shrunk = plain(PekoLayout.resizeTracks([1, 1], 0, -10000, 1000, 120));
  close((shrunk[0] / 2) * 1000, 120, 'left track stops at the minimum');
  // When the pair is too small for the minimum, the tracks meet in the middle instead of one disappearing.
  const tight = plain(PekoLayout.resizeTracks([1, 1], 0, 500, 200, 120));
  close(tight[0], tight[1]);
});

test('resizeTracks ignores an edge that does not exist', () => {
  assert.deepEqual(plain(PekoLayout.resizeTracks([1, 2], 1, 50, 900)), [1, 2]);
  assert.deepEqual(plain(PekoLayout.resizeTracks([1], 0, 50, 900)), [1]);
});

test('moveItem and slotAt', () => {
  assert.deepEqual(plain(PekoLayout.moveItem(['a', 'b', 'c', 'd'], 0, 2)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(plain(PekoLayout.moveItem(['a', 'b', 'c', 'd'], 3, 0)), ['d', 'a', 'b', 'c']);
  assert.deepEqual(plain(PekoLayout.moveItem(['a', 'b'], 5, 0)), ['a', 'b']);
  const rects = [
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 100, y: 0, w: 100, h: 100 },
  ];
  assert.equal(PekoLayout.slotAt(rects, 150, 50), 1);
  assert.equal(PekoLayout.slotAt(rects, 150, 50, 1), -1);
  assert.equal(PekoLayout.slotAt(rects, 105, 50), -1, 'near the border is ignored');
});

test('isValidShares', () => {
  assert.equal(PekoLayout.isValidShares([1, 2], 2), true);
  assert.equal(PekoLayout.isValidShares([1, 0], 2), false);
  assert.equal(PekoLayout.isValidShares([1, NaN], 2), false);
  assert.equal(PekoLayout.isValidShares([1], 2), false);
  assert.equal(PekoLayout.isValidShares('x', 1), false);
});
