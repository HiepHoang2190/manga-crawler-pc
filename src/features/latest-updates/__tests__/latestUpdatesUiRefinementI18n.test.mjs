import fs from 'node:fs';
import path from 'node:path';

describe('Explore tab UI refinement i18n keys', () => {
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  const requiredKeys = [
    'latestUpdates.noCover',
    'latestUpdates.dismissError',
    'latestUpdates.viewDetails',
    'latestUpdates.hideDetails',
    'latestUpdates.multiFetchErrorSummary',
    'latestUpdates.stats.overviewTitle',
    'latestUpdates.stats.total',
    'latestUpdates.stats.following',
    'latestUpdates.stats.page',
    'latestUpdates.stats.sources',
    'latestUpdates.stats.lastUpdated',
    'latestUpdates.stats.tip',
  ];

  test('vi.js has all UI refinement keys', () => {
    const viContent = fs.readFileSync(viPath, 'utf8');
    for (const key of requiredKeys) {
      expect(viContent).toContain(`'${key}':`);
    }
    // Verify short label for selected source to prevent truncation
    expect(viContent).toContain(`'latestUpdates.searchScopeSelected': 'Nguồn chọn'`);
  });

  test('en.js has all UI refinement keys', () => {
    const enContent = fs.readFileSync(enPath, 'utf8');
    for (const key of requiredKeys) {
      expect(enContent).toContain(`'${key}':`);
    }
  });

  test('LatestUpdatesPanel renders overview stats card in LeftSidebar', () => {
    const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');
    const panelContent = fs.readFileSync(panelPath, 'utf8');
    expect(panelContent).toContain('latestUpdates.stats.overviewTitle');
    expect(panelContent).toContain('latestUpdates.stats.total');
    expect(panelContent).toContain('latestUpdates.stats.following');
    expect(panelContent).toContain('latestUpdates.stats.page');
    expect(panelContent).toContain('followingCount');
    expect(panelContent).toContain('lastFetchedAt');
  });
});

