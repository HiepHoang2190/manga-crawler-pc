import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('UpscaleCardItem implements waifu2x style card structure and obeys UI standards', () => {
  const cardPath = path.join(dirname, '..', 'UpscaleCardItem.jsx');
  expect(fs.existsSync(cardPath)).toBe(true);

  const src = fs.readFileSync(cardPath, 'utf8');

  // Must export component
  expect(src).toMatch(/export\s+default\s+function\s+UpscaleCardItem/);

  // Must support waifu2x card elements
  expect(src).toMatch(/index/); // Index number
  expect(src).toMatch(/aspect-/); // Thumbnail aspect ratio
  expect(src).toMatch(/backdrop-blur/); // Frosted glass overlay
  expect(src).toMatch(/(crop|aspect_ratio)/); // Dimensions icon
  expect(src).toMatch(/description/); // Format icon
  expect(src).toMatch(/sd_storage/); // File size icon
  expect(src).toMatch(/svg/i); // Circular progress SVG
  expect(src).toMatch(/duration/i); // Per-image duration (e.g. 2.03s)
  expect(src).toMatch(/format/i); // Format comparison
  expect(src).toMatch(/size/i); // Size comparison

  // Unified Tooltip Standards: 0 native title="..." on interactive elements
  expect(src).not.toMatch(/<(button|a|span|div|input|li|img)\b[^>]*\stitle=/);

  // Modern Text Standards: 0 underline
  expect(src).not.toMatch(/\bhover:underline\b/);
  expect(src).not.toMatch(/\bunderline\b/);
});

