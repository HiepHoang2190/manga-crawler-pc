import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('UpscaleListItem implements finder table row structure and obeys UI standards', () => {
  const itemPath = path.join(dirname, '..', 'UpscaleListItem.jsx');
  expect(fs.existsSync(itemPath)).toBe(true);

  const src = fs.readFileSync(itemPath, 'utf8');

  // Must export component
  expect(src).toMatch(/export\s+default\s+function\s+UpscaleListItem/);

  // Must support table columns and indicators
  expect(src).toMatch(/index/);
  expect(src).toMatch(/duration/i);
  expect(src).toMatch(/scale/i);
  expect(src).toMatch(/outputFormat/i);
  expect(src).toMatch(/filePercent/i);

  // Redundant eye icon check: must NOT have visibility icon since clicking the row opens preview
  expect(src).not.toMatch(/visibility/);

  // Unified Tooltip Standards: 0 native title="..." on interactive elements
  expect(src).not.toMatch(/<(button|a|span|div|input|li|img)\b[^>]*\stitle=/);

  // Modern Text Standards: 0 underline
  expect(src).not.toMatch(/\bhover:underline\b/);
  expect(src).not.toMatch(/\bunderline\b/);
});

