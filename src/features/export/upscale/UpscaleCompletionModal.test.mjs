import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modalPath = path.join(__dirname, 'UpscaleCompletionModal.jsx');

describe('UpscaleCompletionModal contract & structure tests', () => {
  test('UpscaleCompletionModal file exists and satisfies structure and UI guidelines', () => {
    expect(fs.existsSync(modalPath)).toBe(true);
    const src = fs.readFileSync(modalPath, 'utf8');

    // Should render via createPortal
    expect(src).toContain('createPortal');

    // Must support escape key
    expect(src).toContain("'Escape'");

    // Must support success and failure branches with the required callbacks
    expect(src).toContain('onOpenFolder');
    expect(src).toContain('onClearAndReset');
    expect(src).toContain('onKeepOnlyFailed');
    expect(src).toContain('onForceClearAll');

    // Must not have native title attribute (per UI standards)
    expect(src).not.toMatch(/\stitle=["'][^"']+["']/);

    // Must not have underline classes (per UI standards)
    expect(src).not.toContain('underline');

    // Must use standard i18n with upscale.completion namespace
    expect(src).toContain('useI18n');
    expect(src).toContain('upscale.completion');
  });
});
