// Helpers for loading the browser scripts into a Node vm context, so pure logic can be tested without a browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Copies a value out of a vm context so that deepEqual does not trip over the context's own Array and Object. */
export const plain = (value) => JSON.parse(JSON.stringify(value));

/** Runs the given source files (paths relative to the repository root) as classic scripts and returns the named globals. */
export function load(files, names, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  const source = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  return vm.runInContext(`${source}\n;({ ${names.join(', ')} })`, context, { filename: files.join('+') });
}
