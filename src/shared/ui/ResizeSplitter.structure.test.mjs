import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('ResizeSplitter obeys accessibility and tooltip rules: retains aria-label but has no data-tooltip or native title', () => {
  const src = fs.readFileSync(path.join(dirname, 'ResizeSplitter.jsx'), 'utf8');

  // Must retain accessibility aria-label and role="separator"
  expect(src).toContain('aria-label={ariaLabel}');
  expect(src).toContain('role="separator"');

  // Must NOT attach data-tooltip or title on full-height divider to prevent header tab overlapping
  expect(src).not.toMatch(/data-tooltip=/);
  expect(src).not.toMatch(/<(button|a|span|div|input)\b[^>]*\stitle=/);
});

test('GlobalTooltip listens to pointerdown with capture to dismiss tooltips on interaction', () => {
  const src = fs.readFileSync(path.join(dirname, 'GlobalTooltip.jsx'), 'utf8');
  expect(src).toContain("window.addEventListener('pointerdown', handleDismiss, true)");
});
