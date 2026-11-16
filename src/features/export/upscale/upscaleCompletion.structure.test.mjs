import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const upscaleTabPath = path.join(__dirname, 'UpscaleTab.jsx');

describe('UpscaleTab completion integration structure tests', () => {
  const src = fs.readFileSync(upscaleTabPath, 'utf8');

  test('UpscaleTab imports UpscaleCompletionModal', () => {
    expect(src).toMatch(/import\s+UpscaleCompletionModal\s+from\s+['"]\.\/UpscaleCompletionModal['"]/);
  });

  test('UpscaleTab defines completionModalData state', () => {
    expect(src).toMatch(/const\s+\[completionModalData,\s*setCompletionModalData\]\s*=\s*useState\(null\)/);
  });

  test('UpscaleTab renders UpscaleCompletionModal with required props', () => {
    expect(src).toContain('<UpscaleCompletionModal');
    expect(src).toContain('open={Boolean(completionModalData)}');
    expect(src).toContain('data={completionModalData}');
    expect(src).toContain('onClose=');
    expect(src).toContain('onOpenFolder=');
    expect(src).toContain('onClearAndReset=');
    expect(src).toContain('onKeepOnlyFailed=');
    expect(src).toContain('onForceClearAll=');
  });

  test('UpscaleTab does not silently auto-open output path on completion', () => {
    // Should not call api.openPath directly inside the completion block without user action
    expect(src).not.toMatch(/if\s*\(api\?\.openPath\s*&&\s*!res\.cancelled\)\s*\{\s*const\s+target\s*=\s*getUpscaleOutputFolder/);
  });
});
