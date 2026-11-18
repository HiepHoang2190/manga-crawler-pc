import fs from 'node:fs';
import path from 'node:path';

describe('Sidebar search i18n keys', () => {
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  const requiredKeys = [
    'latestUpdates.searchTitle',
    'latestUpdates.searchToggleTooltip',
    'latestUpdates.searchScopeActiveBadgeAll',
    'latestUpdates.searchResetToFeed',
  ];

  test('vi.js has all sidebar search keys', () => {
    const viContent = fs.readFileSync(viPath, 'utf8');
    for (const key of requiredKeys) {
      expect(viContent).toContain(`'${key}':`);
    }
  });

  test('en.js has all sidebar search keys', () => {
    const enContent = fs.readFileSync(enPath, 'utf8');
    for (const key of requiredKeys) {
      expect(enContent).toContain(`'${key}':`);
    }
  });
});
