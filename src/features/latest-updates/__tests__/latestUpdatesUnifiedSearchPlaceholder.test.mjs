import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel unified dynamic search placeholder', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('LatestUpdatesPanel uses unified searchPlaceholderSite and removes hardcoded per-site cascade', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain("t('latestUpdates.searchPlaceholderSite', { site: siteLabel })");
    expect(content).toContain("t('latestUpdates.searchAriaSite', { site: siteLabel })");
    expect(content).toContain("t('latestUpdates.searchPlaceholderAll')");
    expect(content).not.toContain('searchPlaceholderCuutruyen');
    expect(content).not.toContain('searchPlaceholderMangadex');
    expect(content).not.toContain('searchPlaceholderJsPlugin');
  });

  test('vi and en locales provide neutral fallbacks, unified {site} placeholders, and no hardcoded MoeTruyen fallback', () => {
    for (const localePath of [viPath, enPath]) {
      const content = fs.readFileSync(localePath, 'utf8');
      expect(content).toContain("'latestUpdates.searchPlaceholderAll':");
      expect(content).toContain("'latestUpdates.searchAriaAll':");
      expect(content).toMatch(/'latestUpdates\.searchPlaceholderSite':\s*'[^']*\{site\}[^']*'/);
      expect(content).toMatch(/'latestUpdates\.searchAriaSite':\s*'[^']*\{site\}[^']*'/);
      expect(content).not.toMatch(/'latestUpdates\.searchPlaceholder':\s*'[^']*(?:Mòe Truyện|MoeTruyen)/);
      expect(content).not.toMatch(/'latestUpdates\.searchAria':\s*'[^']*(?:Mòe Truyện|MoeTruyen)/);
      expect(content).not.toContain("'latestUpdates.searchPlaceholderCuutruyen':");
      expect(content).not.toContain("'latestUpdates.searchPlaceholderJsPlugin':");
    }
  });
});
