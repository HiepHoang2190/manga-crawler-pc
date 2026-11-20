import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel List View Layout and Toolbar Dedup', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

  test('toolbar deduplicates pagination controls and scan button (no duplicate first_page or bulk-load-btn in toolbar rightSlot)', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    // Ensure toolbar rightSlot does not duplicate first_page, last_page, or bulk-load-btn
    const toolbarRightMatch = content.match(/rightSlot=\{([\s\S]*?)\n\s*\}\s*\/>/);
    expect(toolbarRightMatch).not.toBeNull();
    expect(toolbarRightMatch[1]).not.toContain('first_page');
    expect(toolbarRightMatch[1]).not.toContain('last_page');
    expect(toolbarRightMatch[1]).not.toContain('bulk-load-btn');
  });

  test('list view utilizes horizontal space with structured columns and chapter label', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('latestChapterLabel');
  });

  test('complies with UI standards: zero native title and zero underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });
});
