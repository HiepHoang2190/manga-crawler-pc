import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Sidebar Workflow', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

  test('sidebar includes direct scan button alongside enqueue button', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('bulkScan.scanSource');
    expect(content).toContain('bulkScan.shiftTip');
  });

  test('complies with UI standards: zero native title and zero underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });
});

