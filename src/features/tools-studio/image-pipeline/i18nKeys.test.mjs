// src/features/tools-studio/image-pipeline/i18nKeys.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const localeDir = path.join(dirname, '../../../i18n/locales');

function keysOf(file) {
  const src = fs.readFileSync(path.join(localeDir, file), 'utf8');
  return new Set([...src.matchAll(/'((?:imagePipeline|toolsStudio\.tab)\.[^']+)'\s*:/g)].map((m) => m[1]));
}

function usedKeys() {
  const files = fs.readdirSync(dirname).filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.endsWith('.test.mjs'));
  const keys = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(dirname, f), 'utf8');
    for (const m of src.matchAll(/['`](imagePipeline\.[A-Za-z0-9_.]+)['`]/g)) keys.add(m[1]);
  }
  return keys;
}

test('vi and en define the same imagePipeline keys', () => {
  expect([...keysOf('vi.js')].sort()).toEqual([...keysOf('en.js')].sort());
  expect(keysOf('vi.js').has('toolsStudio.tab.imagePipeline')).toBe(true);
});

test('every imagePipeline key used in the feature exists in both locales', () => {
  const vi = keysOf('vi.js');
  const en = keysOf('en.js');
  for (const key of usedKeys()) {
    expect({ key, vi: vi.has(key) }).toEqual({ key, vi: true });
    expect({ key, en: en.has(key) }).toEqual({ key, en: true });
  }
});
