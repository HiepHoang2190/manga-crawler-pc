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
      results = results.concat(getAllJsxFiles(fullPath));
    } else if (item.name.endsWith('.jsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('UI Standards — Unified Tooltips (No Native HTML Title on Interactive Elements)', () => {
  const jsxFiles = getAllJsxFiles(SRC_DIR);
  // Match interactive HTML tags using native title= attribute
  const INTERACTIVE_TITLE_REGEX = /<(?:button|a|ResizeSplitter)\b[^>]*?\btitle=/;

  test('All interactive elements (<button>, <a>, <ResizeSplitter>) must use data-tooltip instead of title', () => {
    const violations = [];
    for (const file of jsxFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(SRC_DIR, file);
      if (INTERACTIVE_TITLE_REGEX.test(content)) {
        violations.push(`${relPath} contains interactive element with native title= attribute`);
      }
    }
    expect(violations).toEqual([]);
  });
});
