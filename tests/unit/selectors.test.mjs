import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { load, plain, root } from './load.mjs';

const { PekoSelectors } = load(['src/scripts/multiview/02-selectors.js'], ['PekoSelectors']);
const { PekoConfig } = load(['src/shared/config.js'], ['PekoConfig']);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const classOf = (selector) => selector.replace(/^\./, '');

test('every tile part named in PekoSelectors is created by the tile template', () => {
  const template = read('src/scripts/multiview/15-tile-creation.js');
  for (const [name, selector] of Object.entries(plain(PekoSelectors.tile))) {
    assert.match(selector, /^\.mv-tile-[a-z-]+$/, name);
    const cls = classOf(selector);
    // Most parts are in the template markup; the YouTube holder is created by script.
    const defined = new RegExp(`class="[^"]*\\b${cls}\\b|className = '${cls}'`).test(template);
    assert.ok(defined, `${selector} is not created by 15-tile-creation.js`);
  }
});

test('no tile part selector is written out again in the multi-view scripts', () => {
  const dir = path.join(root, 'src', 'scripts', 'multiview');
  for (const file of fs.readdirSync(dir)) {
    if (file === '02-selectors.js') continue;
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(text, /'\.mv-tile-[a-z-]+'/, `${file} should use PekoSelectors`);
  }
});

test('storage keys are unique, namespaced and not written out again in the scripts', () => {
  const keys = Object.values(plain(PekoConfig.STORAGE));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => key.startsWith('pekoplayer')));
  for (const dir of ['player', 'multiview', 'pwa']) {
    const folder = path.join(root, 'src', 'scripts', dir);
    for (const file of fs.readdirSync(folder)) {
      assert.doesNotMatch(
        fs.readFileSync(path.join(folder, file), 'utf8'),
        /'pekoplayer[:-]/,
        `${dir}/${file} should use PekoConfig.STORAGE`,
      );
    }
  }
});

test('the frozen configuration cannot be changed by accident', () => {
  assert.ok(Object.isFrozen(PekoConfig) && Object.isFrozen(PekoConfig.STORAGE) && Object.isFrozen(PekoConfig.TIMING));
  assert.ok(Object.isFrozen(PekoSelectors.tile));
});
