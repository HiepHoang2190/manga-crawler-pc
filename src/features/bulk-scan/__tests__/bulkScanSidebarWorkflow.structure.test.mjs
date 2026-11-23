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

  test('sidebar provides clean 3-row vertical status filter list (Sample 2) and unified search box', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('rounded-xl border border-outline-variant/20 bg-surface-container-highest/60 p-1 space-y-0.5');
    expect(content).toContain('bulkScan.statusFilter');
    expect(content).toContain('aria-pressed={isActive}');
    expect(content).toContain('listFilter === opt.id');
    expect(content).toContain('bulkScan.filterAll');
    expect(content).toContain('bulkScan.filterSelected');
    expect(content).toContain('bulkScan.filterUnselected');
    expect(content).toContain('bulkScan.filterPlaceholder');
    expect(content).not.toContain('grid-cols-3 gap-1');
    expect(content).not.toContain('col-span-2');
    expect(content).not.toContain('BULK_SCAN_FILTERS');
  });

  test('toolbar places primary scan/enqueue actions next to subtabsSlot in leftSlot and keeps footer direct page jump', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const leftSlotMatch = content.match(/leftSlot=\{([\s\S]*?)\}\s*\n\s*rightSlot=/);
    expect(leftSlotMatch).not.toBeNull();
    const leftSlotCode = leftSlotMatch[1];
    const subtabsIdx = leftSlotCode.indexOf('{subtabsSlot}');
    const slotIdx = leftSlotCode.indexOf('data-testid="explore-primary-action-slot"');
    const scanIdx = leftSlotCode.indexOf('runLoad');
    const enqueueIdx = leftSlotCode.indexOf('runEnqueue');
    expect(subtabsIdx).toBeGreaterThan(-1);
    expect(slotIdx).toBeGreaterThan(subtabsIdx);
    expect(scanIdx).toBeGreaterThan(slotIdx);
    expect(enqueueIdx).toBeGreaterThan(scanIdx);
    expect(leftSlotCode).toContain('stopScan');
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

