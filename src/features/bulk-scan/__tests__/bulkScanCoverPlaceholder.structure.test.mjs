import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Cover Placeholder', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

  test('has onError handler and fallback menu_book placeholder in list and grid views', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('menu_book');
    expect(content).toContain('currentTarget.style.display = \'none\'');
  });

  test('complies with UI standards: zero native title and zero underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });
});

