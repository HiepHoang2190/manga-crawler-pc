import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../../');

function getAllSourceFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (
      item.name === 'node_modules' ||
      item.name === '__tests__' ||
      item.name.endsWith('.test.js') ||
      item.name.endsWith('.test.mjs') ||
      item.name.endsWith('.test.jsx')
    ) {
      continue;
    }
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getAllSourceFiles(fullPath));
    } else if (item.name.endsWith('.jsx') || item.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('UI Standards — Custom Modals (No Native window.alert/confirm/prompt)', () => {
  const files = getAllSourceFiles(SRC_DIR);
  const NATIVE_DIALOG_REGEX = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;

  test('All source files in src/ must have zero calls to native alert/confirm/prompt', () => {
    const violations = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(SRC_DIR, file);
      if (NATIVE_DIALOG_REGEX.test(content)) {
        violations.push(`${relPath} calls native alert/confirm/prompt`);
      }
    }
    expect(violations).toEqual([]);
  });
});
