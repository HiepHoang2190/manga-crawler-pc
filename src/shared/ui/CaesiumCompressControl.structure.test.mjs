import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('CaesiumCompressControl obeys UI rules: no native title= on interactive elements', () => {
  const src = fs.readFileSync(path.join(dirname, 'CaesiumCompressControl.jsx'), 'utf8');
  // Unified Tooltip Standards: CẤM DÙNG thuộc tính title="..." native của HTML
  expect(src).not.toMatch(/<(button|a|span|div|input)\b[^>]*\stitle=/);
});

test('CaesiumCompressControl obeys UI rules: no underline or hover:underline', () => {
  const src = fs.readFileSync(path.join(dirname, 'CaesiumCompressControl.jsx'), 'utf8');
  expect(src).not.toMatch(/\b(hover:)?underline\b/);
});

test('CaesiumCompressControl exports presets and component properly', () => {
  const src = fs.readFileSync(path.join(dirname, 'CaesiumCompressControl.jsx'), 'utf8');
  expect(src).toContain('export const COMPRESS_QUALITY_PRESETS');
  expect(src).toContain('export default function CaesiumCompressControl');
  expect(src).toContain('data-tooltip={desc}');
});

test('CaesiumCompressControl presets have valid i18n keys in vi.js and en.js', () => {
  const compSrc = fs.readFileSync(path.join(dirname, 'CaesiumCompressControl.jsx'), 'utf8');
  const viSrc = fs.readFileSync(path.join(dirname, '../../i18n/locales/vi.js'), 'utf8');
  const enSrc = fs.readFileSync(path.join(dirname, '../../i18n/locales/en.js'), 'utf8');

  // Extract all subLabelKey and descKey from CaesiumCompressControl.jsx
  const keyMatches = [...compSrc.matchAll(/(subLabelKey|descKey):\s*'([^']+)'/g)].map((m) => m[2]);
  expect(keyMatches.length).toBeGreaterThan(0);

  for (const key of keyMatches) {
    expect(viSrc).toContain(`'${key}':`);
    expect(enSrc).toContain(`'${key}':`);
  }
});

