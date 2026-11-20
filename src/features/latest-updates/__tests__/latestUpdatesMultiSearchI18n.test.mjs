import fs from 'node:fs';
import path from 'node:path';

describe('Multi-source search i18n keys', () => {
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  const requiredKeys = [
    'latestUpdates.multiSearchAllSelected',
    'latestUpdates.multiSearchPartialSelected',
    'latestUpdates.multiSearchNoneSelected',
    'latestUpdates.selectAllSources',
    'latestUpdates.multiSearchSummary',
    'latestUpdates.multiSearchNoPaginationNotice',
  ];

  test('vi.js has all multi-source search keys', () => {
    const viContent = fs.readFileSync(viPath, 'utf8');
    for (const key of requiredKeys) {
      expect(viContent).toContain(`'${key}':`);
    }
  });

  test('en.js has all multi-source search keys', () => {
    const enContent = fs.readFileSync(enPath, 'utf8');
    for (const key of requiredKeys) {
      expect(enContent).toContain(`'${key}':`);
    }
  });
});

