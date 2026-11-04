import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/explore/index.js exports ExplorePanel as default and named export', () => {
  const indexFile = path.join(dirname, 'index.js');
  expect(fs.existsSync(indexFile)).toBe(true);
  const src = fs.readFileSync(indexFile, 'utf8');
  expect(src).toMatch(/export\s*\{\s*default,\s*default\s+as\s+ExplorePanel\s*\}\s*from\s*['"]\.\/ExplorePanel(\.jsx)?['"]/);
});

test('src/features/explore/ExplorePanel.jsx exists and defines ExplorePanel component with subtab switcher', () => {
  const panelFile = path.join(dirname, 'ExplorePanel.jsx');
  expect(fs.existsSync(panelFile)).toBe(true);
  const src = fs.readFileSync(panelFile, 'utf8');
  expect(src).toMatch(/export\s+default\s+function\s+ExplorePanel/);
  expect(src).toMatch(/activeSubtab/);
  expect(src).toMatch(/LatestUpdatesPanel/);
  expect(src).toMatch(/BulkScanPanel/);
});

test('ShellLayout imports ExplorePanel from the explore barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/import ExplorePanel from '\.\.\/explore'/);
  expect(shell_src).toMatch(/<ExplorePanel/);
});
