import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const modalPath = path.resolve(dirname, '../ConfirmModal.jsx');

describe('ConfirmModal structure', () => {
  const src = fs.readFileSync(modalPath, 'utf8');

  test('renders via createPortal with accessible dialog role', () => {
    expect(src).toMatch(/createPortal\(/);
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
  });

  test('handles Escape key and backdrop dismissal', () => {
    expect(src).toMatch(/e\.key === 'Escape'/);
    expect(src).toMatch(/e\.target === e\.currentTarget/);
  });

  test('adheres to UI standards (no underline, no native title, no native dialogs)', () => {
    expect(src).not.toMatch(/\bunderline\b/);
    expect(src).not.toMatch(/\btitle=/);
    expect(src).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  });
});
