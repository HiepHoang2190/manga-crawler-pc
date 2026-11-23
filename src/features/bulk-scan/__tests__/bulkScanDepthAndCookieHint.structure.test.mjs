import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Scan Depth control & generic cookie hint', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');
  const prefsPath = path.resolve(process.cwd(), 'src/utils/panelUiPrefs.js');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('BulkScanPanel renders Scan Depth SearchableSelect defaulting to all, shows live item count, keeps partial items on abort, and supports generic cookieHint', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain("SCAN_MAX_PAGES_OPTIONS = ['all', 10, 20, 50, 100]");
    expect(content).toContain('bulkScan.maxPagesLabel');
    expect(content).toContain('bulkScan.maxPagesAll');
    expect(content).toContain('bulkScan.maxPagesOption');
    expect(content).toContain('bulkScan.loadingPageWithCount');
    expect(content).toContain('bulkScan.cookieHintGeneric');
    expect(content).toContain('activeConnector?.requiresCookie');
    expect(content).toMatch(/res\?\.aborted[\s\S]*res\?\.items/);
    expect(content).toMatch(/api\.fetchBulkScan\(\s*\{[\s\S]*maxPages[\s\S]*mangadexLanguage/);
  });

  test('panelUiPrefs persists normalized bulkScan.maxPages defaulting to all', () => {
    const prefs = fs.readFileSync(prefsPath, 'utf8');
    expect(prefs).toContain("BULK_SCAN_MAX_PAGES_OPTIONS = ['all', 10, 20, 50, 100]");
    expect(prefs).toContain("maxPages: 'all'");
    expect(prefs).toContain('normalizeBulkScanMaxPages');
  });

  test('vi and en locales define new bulkScan keys cleanly', () => {
    for (const localePath of [viPath, enPath]) {
      const content = fs.readFileSync(localePath, 'utf8');
      expect(content).toContain("'bulkScan.maxPagesLabel':");
      expect(content).toContain("'bulkScan.maxPagesAll':");
      expect(content).toContain("'bulkScan.maxPagesOption':");
      expect(content).toContain("'bulkScan.loadingPageWithCount':");
      expect(content).toContain("'bulkScan.cookieHintGeneric':");
      expect(content).toMatch(/'bulkScan\.maxPagesOption':\s*'[^']*\{count\}[^']*'/);
      expect(content).toMatch(/'bulkScan\.loadingPageWithCount':\s*'[^']*\{count\}[^']*'/);
      expect(content).toMatch(/'bulkScan\.cookieHintGeneric':\s*'[^']*\{site\}[^']*'/);
    }
  });
});
