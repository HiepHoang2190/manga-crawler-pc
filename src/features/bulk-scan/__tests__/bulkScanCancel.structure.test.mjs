import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const panelPath = path.join(root, 'src/features/bulk-scan/BulkScanPanel.jsx');
const preloadPath = path.join(root, 'electron/preload.js');
const ipcPath = path.join(root, 'electron/ipc/download.js');
const viPath = path.join(root, 'src/i18n/locales/vi.js');
const enPath = path.join(root, 'src/i18n/locales/en.js');

describe('BulkScan Cancellable Scan Flow', () => {
  const panel = fs.readFileSync(panelPath, 'utf8');
  const preload = fs.readFileSync(preloadPath, 'utf8');
  const ipc = fs.readFileSync(ipcPath, 'utf8');
  const vi = fs.readFileSync(viPath, 'utf8');
  const en = fs.readFileSync(enPath, 'utf8');

  test('preload exposes cancelBulkScan invoking manga:cancelBulkScan', () => {
    expect(preload).toMatch(/cancelBulkScan:\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(['"]manga:cancelBulkScan['"]/);
  });

  test('IPC tracks activeBulkScanControllers, passes AbortSignal, guards progress, and handles manga:cancelBulkScan', () => {
    expect(ipc).toContain('activeBulkScanControllers');
    expect(ipc).toMatch(/signal:\s*controller\.signal/);
    expect(ipc).toMatch(/controller\.signal\.aborted[\s\S]{0,120}manga:bulkScanProgress|!controller\.signal\.aborted/);
    expect(ipc).toMatch(/ipcMain\.handle\(['"]manga:cancelBulkScan['"]/);
  });

  test('BulkScanPanel renders a single Stop Scan button in Toolbar (not duplicated in BulkScanSkeleton), handles res.aborted cleanly, and follows UI rules', () => {
    expect(panel).toContain('stopScan');
    expect(panel).toContain('cancelBulkScan');
    expect(panel).toContain('res?.aborted');
    expect(panel).not.toContain('onCancel={stopScan}');
    expect(panel.match(/onClick=\{stopScan\}/g)).toHaveLength(1);
    expect(panel).toContain("t('bulkScan.stopScan')");
    expect(panel).toContain("t('bulkScan.stopping')");
    expect(panel).toMatch(/\{busyList\s*\?\s*\([\s\S]{0,600}stopScan/);
    expect(panel).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(panel).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('vi.js and en.js define bulkScan.stopScan and bulkScan.stopping keys', () => {
    expect(vi).toContain("'bulkScan.stopScan':");
    expect(vi).toContain("'bulkScan.stopping':");
    expect(en).toContain("'bulkScan.stopScan':");
    expect(en).toContain("'bulkScan.stopping':");
  });
});
