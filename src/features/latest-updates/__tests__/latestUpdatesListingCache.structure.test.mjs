import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel listing cache temporal dead zone & SWR structure check', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('latestUpdatesListingCache.fetchError is assigned after let warn declaration', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const cacheWarnIndex = content.indexOf('latestUpdatesListingCache.fetchError = warn');
    const letWarnIndex = content.indexOf('let warn =');
    expect(cacheWarnIndex).toBeGreaterThan(-1);
    expect(letWarnIndex).toBeGreaterThan(-1);
    expect(cacheWarnIndex).toBeGreaterThan(letWarnIndex);
  });

  test('integrates multi-connector SWR cache, force refresh invalidation, and non-blocking background refresh state', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain("from './latestUpdatesCache.mjs'");
    expect(content).toContain('latestUpdatesPageCache');
    expect(content).toContain('makeListingPageCacheKey');
    expect(content).toContain('buildLatestListTriggerKey');
    expect(content).toContain('isBackgroundRefreshing');
    expect(content).toContain('isFromCache');
    expect(content).toContain('invalidateByTriggerKey');
    expect(content).toMatch(/runFetchForPage\(\s*1\s*,\s*undefined\s*,\s*\{\s*force:\s*true\s*\}/);
    expect(content).toContain("t('latestUpdates.stats.cachedBadge')");
    expect(content).toContain("t('latestUpdates.stats.cachedTooltip')");
    expect(content).toContain("t('latestUpdates.stats.revalidating')");
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('vi.js and en.js define cache and background revalidation locale keys', () => {
    const vi = fs.readFileSync(viPath, 'utf8');
    const en = fs.readFileSync(enPath, 'utf8');
    for (const key of [
      'latestUpdates.stats.cachedBadge',
      'latestUpdates.stats.cachedTooltip',
      'latestUpdates.stats.revalidating',
    ]) {
      expect(vi).toContain(`'${key}':`);
      expect(en).toContain(`'${key}':`);
    }
  });
});

