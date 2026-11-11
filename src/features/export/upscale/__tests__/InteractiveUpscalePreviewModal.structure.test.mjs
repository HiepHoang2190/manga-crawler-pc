import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('InteractiveUpscalePreviewModal implements Theme Studio Lightbox and obeys UI standards', () => {
  const modalPath = path.join(dirname, '..', 'InteractiveUpscalePreviewModal.jsx');
  expect(fs.existsSync(modalPath)).toBe(true);

  const src = fs.readFileSync(modalPath, 'utf8');

  // Must export default component
  expect(src).toMatch(/export\s+default\s+function\s+InteractiveUpscalePreviewModal/);

  // Theme Studio Lightbox: Semantic Theme Tokens
  expect(src).toMatch(/bg-surface/);
  expect(src).toMatch(/bg-surface-container-low/);
  expect(src).toMatch(/text-on-surface/);
  expect(src).toMatch(/border-outline-variant/);

  // Must NOT use old hardcoded dark container styles
  expect(src).not.toMatch(/bg-black\/92/);
  expect(src).not.toMatch(/bg-zinc-900/);

  // Interactive controls: Space-key peek & segmented toggle pill
  expect(src).toMatch(/Space/);
  expect(src).toMatch(/isHoldingSpace/);
  expect(src).toMatch(/isDisplayingOriginal/);
  expect(src).toMatch(/showOriginal/);

  // Zoom Fit vs 100% toggle
  expect(src).toMatch(/isZoom100/);

  // Comparison specs in bottom footer
  expect(src).toMatch(/origResText/);
  expect(src).toMatch(/upResText/);
  expect(src).toMatch(/formatBytes/);

  // UI Standards: 0 native title="..." on interactive elements
  expect(src).not.toMatch(/<(button|a|span|div|input|li|img)\b[^>]*\stitle=/);

  // Modern Text Standards: 0 underline
  expect(src).not.toMatch(/\bhover:underline\b/);
  expect(src).not.toMatch(/\bunderline\b/);
});

test('UpscaleTab wires up InteractiveUpscalePreviewModal with valid props and no undeclared engineInfo', () => {
  const upscaleTabPath = path.join(dirname, '..', 'UpscaleTab.jsx');
  expect(fs.existsSync(upscaleTabPath)).toBe(true);

  const tabSrc = fs.readFileSync(upscaleTabPath, 'utf8');

  // Must invoke InteractiveUpscalePreviewModal
  expect(tabSrc).toMatch(/<InteractiveUpscalePreviewModal/);

  // Must NOT pass undeclared engineInfo variable
  expect(tabSrc).not.toMatch(/engineInfo=\{engineInfo\}/);

  // Must pass effectiveEngine or valid prop
  expect(tabSrc).toMatch(/engineInfo=\{effectiveEngine\}/);
});


