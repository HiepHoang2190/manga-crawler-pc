import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Scan Depth control & generic cookie hint', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');
  const prefsPath = path.resolve(process.cwd(), 'src/utils/panelUiPrefs.js');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('BulkScanPanel renders Scan Depth SearchableSelect, forwards maxPages + language opts, and supports generic cookieHint', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('SCAN_MAX_PAGES_OPTIONS');
    expect(content).toContain('bulkScan.maxPagesLabel');
    expect(content).toContain('bulkScan.maxPagesOption');
    expect(content).toContain('bulkScan.cookieHintGeneric');
    expect(content).toContain('activeConnector?.requiresCookie');
    expect(content).toMatch(/api\.fetchBulkScan\(\s*\{[\s\S]*maxPages[\s\S]*mangadexLanguage/);
  });

  test('panelUiPrefs persists normalized bulkScan.maxPages', () => {
    const prefs = fs.readFileSync(prefsPath, 'utf8');
    expect(prefs).toContain('maxPages');
    expect(prefs).toContain('normalizeBulkScanMaxPages');
  });

  test('vi and en locales define new bulkScan keys cleanly', () => {
    for (const localePath of [viPath, enPath]) {
      const content = fs.readFileSync(localePath, 'utf8');
      expect(content).toContain("'bulkScan.maxPagesLabel':");
      expect(content).toContain("'bulkScan.maxPagesOption':");
      expect(content).toContain("'bulkScan.cookieHintGeneric':");
      expect(content).toMatch(/'bulkScan\.maxPagesOption':\s*'[^']*\{count\}[^']*'/);
      expect(content).toMatch(/'bulkScan\.cookieHintGeneric':\s*'[^']*\{site\}[^']*'/);
    }
  });
});
