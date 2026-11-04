import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('I18nContext.jsx provides both locale and lang in value and fallback', () => {
  const src = fs.readFileSync(path.join(dirname, 'I18nContext.jsx'), 'utf8');
  // Must expose both locale and lang (alias) in context value
  expect(src).toMatch(/value\s*=\s*useMemo\(\(\)\s*=>\s*\(\{[^}]*locale[^}]*lang:\s*locale/);
  // Must expose both in useSafeI18n
  expect(src).toMatch(/locale:\s*'vi'[^}]*lang:\s*'vi'/);
});
