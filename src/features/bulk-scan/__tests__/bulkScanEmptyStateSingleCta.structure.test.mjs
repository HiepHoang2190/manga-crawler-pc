import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Empty State single scan CTA & i18n copy', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('document_scanner EmptyState has no duplicate action scan button and uses bulkScan.emptyTitle', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const emptyBlock = content.match(/<EmptyState\s+icon="document_scanner"[\s\S]*?\/>/);
    expect(emptyBlock).not.toBeNull();
    expect(emptyBlock[0]).toContain("t('bulkScan.emptyTitle')");
    expect(emptyBlock[0]).toContain("t('bulkScan.emptySubtitle')");
    expect(emptyBlock[0]).not.toContain('action=');
    expect(emptyBlock[0]).not.toContain('runLoad');
  });

  test('vi and en locales define bulkScan.emptyTitle and align bulkScan.emptySubtitle with scan CTA', () => {
    const vi = fs.readFileSync(viPath, 'utf8');
    const en = fs.readFileSync(enPath, 'utf8');
    expect(vi).toContain("'bulkScan.emptyTitle':");
    expect(en).toContain("'bulkScan.emptyTitle':");
    expect(vi).toMatch(/'bulkScan\.emptySubtitle':\s*'[^']*Quét danh mục[^']*'/);
    expect(en).toMatch(/'bulkScan\.emptySubtitle':\s*'[^']*Scan catalog[^']*'/);
  });
});
