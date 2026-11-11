import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../../');

function getAllJsxFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (item.name === 'node_modules' || item.name === '__tests__' || item.name.endsWith('.test.js') || item.name.endsWith('.test.mjs') || item.name.endsWith('.test.jsx')) {
      continue;
    }
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getAllJsxFiles(fullPath));
    } else if (item.name.endsWith('.jsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('UI Standards — Modern Text Links & Action Buttons (No Underline)', () => {
  const jsxFiles = getAllJsxFiles(SRC_DIR);

  test('All JSX files in src/ must have zero occurrences of underline or hover:underline', () => {
    const violations = [];
    for (const file of jsxFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(SRC_DIR, file);
      if (/\bhover:underline\b/.test(content)) {
        violations.push(`${relPath} contains hover:underline`);
      }
      if (/\bunderline\b/.test(content)) {
        violations.push(`${relPath} contains underline`);
      }
    }
    expect(violations).toEqual([]);
  });
});
