import fs from 'node:fs';
import path from 'node:path';
import { countSourceOptions, buildFollowedSourceOptions } from '../components/exploreSourceUtils.mjs';

describe('ExploreSourceSelect connector count & consistency across 3 Explore tabs', () => {
  const selectPath = path.resolve(process.cwd(), 'src/features/explore/components/ExploreSourceSelect.jsx');
  const utilsPath = path.resolve(process.cwd(), 'src/features/explore/components/exploreSourceUtils.mjs');
  const followedPath = path.resolve(process.cwd(), 'src/features/explore/components/FollowedMangaPanel.jsx');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('countSourceOptions excludes empty/all placeholders and counts real connectors', () => {
    expect(countSourceOptions([])).toBe(0);
    expect(countSourceOptions(null)).toBe(0);
    expect(
      countSourceOptions([
        { value: '', label: 'All sources' },
        { value: 'cuutruyen', label: 'CuuTruyen' },
        { value: 'mangadex', label: 'MangaDex' },
      ]),
    ).toBe(2);
    expect(
      countSourceOptions([
        { value: 'all', label: 'All' },
        { value: 'truyenqq', label: 'TruyenQQ' },
      ]),
    ).toBe(1);
  });

  test('buildFollowedSourceOptions includes only connectors with favorites plus orphan breakdown IDs, formatted cleanly', () => {
    const extractHost = (d) => String(d || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const connectors = [
      { id: 'truyenqq', label: 'TruyenQQ', domain: 'https://truyenqqno.com/', icon: 'qq.png' },
      { id: 'cuutruyen', label: 'Cứu Truyện', domain: 'https://cuutruyen.net/', icon: 'cuu.png' },
      { id: 'mangadex', label: 'MangaDex', domain: 'https://mangadex.org/', icon: 'md.png' },
    ];
    const siteBreakdown = [
      { siteId: 'truyenqq', count: 3 },
      { siteId: 'cuutruyen', count: 1 },
      { siteId: 'legacy-site', count: 2 },
    ];
    const siteMap = {
      labels: new Map([['legacy-site', 'Legacy Site']]),
      icons: new Map(),
    };

    const opts = buildFollowedSourceOptions({
      connectors,
      siteBreakdown,
      siteMap,
      allSourcesLabel: 'Tất cả nguồn',
      extractHost,
    });

    expect(opts).toEqual([
      { value: '', label: 'Tất cả nguồn', icon: 'public' },
      { value: 'cuutruyen', label: 'Cứu Truyện (cuutruyen.net)', icon: 'cuu.png' },
      { value: 'truyenqq', label: 'TruyenQQ (truyenqqno.com)', icon: 'qq.png' },
      { value: 'legacy-site', label: 'Legacy Site', icon: 'language' },
    ]);
    // mangadex has 0 favorites -> must NOT appear
    expect(opts.some((o) => o.value === 'mangadex')).toBe(false);
    // countSourceOptions matches actual sources (2 connectors + 1 legacy = 3)
    expect(countSourceOptions(opts)).toBe(3);
  });

  test('ExploreSourceSelect renders source count beside Sources label across all subtabs', () => {
    const content = fs.readFileSync(selectPath, 'utf8');
    expect(content).toContain('countSourceOptions');
    expect(content).toContain('${displayLabel} (${sourceCount})');
    expect(content).not.toMatch(/<[a-z][a-z0-9-]*\b[^>]*\btitle=/);
  });

  test('FollowedMangaPanel delegates siteOptions to buildFollowedSourceOptions cleanly', () => {
    const followedContent = fs.readFileSync(followedPath, 'utf8');
    const utilsContent = fs.readFileSync(utilsPath, 'utf8');
    expect(followedContent).toContain('extractConnectorHost');
    expect(followedContent).toContain('buildFollowedSourceOptions');
    expect(followedContent).toMatch(/siteOptions\s*=\s*useMemo/);
    expect(followedContent).not.toContain('`${t(\'followedManga.filter.allSources\')} (${stats.total})`');
    expect(utilsContent).toContain('`${name} (${host})`');
  });

  test('multiSearchPartialSelected omits total denominator in both vi.js and en.js', () => {
    const vi = fs.readFileSync(viPath, 'utf8');
    const en = fs.readFileSync(enPath, 'utf8');
    expect(vi).toContain("'latestUpdates.multiSearchPartialSelected': 'Đã chọn {count} nguồn'");
    expect(en).toContain("'latestUpdates.multiSearchPartialSelected': '{count} sources selected'");
  });
});
