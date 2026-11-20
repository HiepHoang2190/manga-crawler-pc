import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Sidebar Workflow', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

  test('toolbar includes direct enqueue button alongside scan button', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('bulkScan.scanSource');
    expect(content).toContain('bulkScan.enqueueSelected');
    expect(content).toContain('bulkScan.shiftTip');
  });

  test('sidebar provides 3-column segmented pill grid for status filter and unified search box', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('grid grid-cols-3 gap-1');
    expect(content).toContain('bulkScan.filterAll');
    expect(content).toContain('bulkScan.filterSelected');
    expect(content).toContain('bulkScan.filterUnselected');
    expect(content).toContain('bulkScan.filterPlaceholder');
  });

  test('toolbar uses clean leftSlot matching explore family and footer has direct page jump', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('leftSlot={subtabsSlot}');
    expect(content).toContain('handleDirectPageSubmit');
    expect(content).toContain('rawPageInput');
  });

  test('uses round page sizes [20, 50, 100] with 20 as default', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('const PAGE_SIZES = [20, 50, 100];');
    expect(content).toMatch(/PAGE_SIZES\.includes\(n\)\s*\?\s*n\s*:\s*20/);
  });

  test('complies with UI standards: zero native title and zero underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });
});

