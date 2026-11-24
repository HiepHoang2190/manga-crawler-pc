import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function extractLocaleKeys(relPath) {
  const src = read(relPath);
  const keys = new Set();
  const re = /^\s*['"]([a-zA-Z0-9_.-]+)['"]\s*:/gm;
  let match;
  while ((match = re.exec(src)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

function extractTranslationCalls(src) {
  const keys = new Set();
  const re = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    keys.add(match[1]);
  }
  return [...keys];
}

describe('Explore Subtabs Unified UI, i18n & Performance Standards', () => {
  const exploreFiles = [
    'src/features/explore/ExplorePanel.jsx',
    'src/features/latest-updates/LatestUpdatesPanel.jsx',
    'src/features/explore/components/FollowedMangaPanel.jsx',
    'src/features/explore/components/FollowedMangaCard.jsx',
    'src/features/bulk-scan/BulkScanPanel.jsx',
  ];

  const subtabFiles = [
    'src/features/latest-updates/LatestUpdatesPanel.jsx',
    'src/features/explore/components/FollowedMangaPanel.jsx',
    'src/features/bulk-scan/BulkScanPanel.jsx',
  ];

  test('every t(...) key across all Explore files exists in both vi.js and en.js', () => {
    const viKeys = extractLocaleKeys('src/i18n/locales/vi.js');
    const enKeys = extractLocaleKeys('src/i18n/locales/en.js');

    expect(viKeys.has('bulkScan.emptySubtitle')).toBe(true);
    expect(enKeys.has('bulkScan.emptySubtitle')).toBe(true);

    for (const relPath of exploreFiles) {
      const usedKeys = extractTranslationCalls(read(relPath));
      const missVi = usedKeys.filter((k) => !viKeys.has(k));
      const missEn = usedKeys.filter((k) => !enKeys.has(k));
      expect({ file: relPath, missVi, missEn }).toEqual({
        file: relPath,
        missVi: [],
        missEn: [],
      });
    }
  });

  test('Explore files contain zero hardcoded Vietnamese/English fallback strings removed by unification', () => {
    const followedSrc = read('src/features/explore/components/FollowedMangaPanel.jsx');
    const cardSrc = read('src/features/explore/components/FollowedMangaCard.jsx');
    const bulkSrc = read('src/features/bulk-scan/BulkScanPanel.jsx');

    expect(followedSrc).not.toContain('Kéo để thay đổi độ rộng sidebar');
    expect(followedSrc).not.toContain('chap mới');
    expect(followedSrc).not.toMatch(/`\$\{remoteCount\} chap`/);
    expect(cardSrc).not.toContain('chap mới');
    expect(cardSrc).not.toMatch(/`\$\{remoteCount\} chap`/);
    expect(bulkSrc).not.toContain('aria-label="Xoá tìm kiếm"');
    expect(bulkSrc).not.toContain("'Chọn nguồn truyện từ thanh bên trái");
  });

  test('all 3 subtabs omit left-sidebar collapse toggle, keep LeftSidebar open with resize, and avoid duplicate ResizeSplitter', () => {
    for (const relPath of subtabFiles) {
      const src = read(relPath);
      expect(src).not.toContain('onToggleLeftSidebar');
      expect(src).not.toContain('showLeftSidebar');
      expect(src).toContain('open={true}');
      expect(src).not.toContain('<ResizeSplitter');
    }
  });

  test('all 3 subtabs use unified ViewModeToggle size="md", h-8 toolbar buttons, and identical grid columns', () => {
    for (const relPath of subtabFiles) {
      const src = read(relPath);
      expect(src).toMatch(/<ViewModeToggle[\s\S]*?size="md"/);
      expect(src).toContain('grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6');
    }
    const mangaCardSrc = read('src/shared/ui/MangaCard.jsx');
    expect(mangaCardSrc).toContain('group-hover:scale-105 transition-transform duration-300');
    expect(read('src/features/latest-updates/LatestUpdatesPanel.jsx')).toContain('<MangaCard');
    expect(read('src/features/explore/components/FollowedMangaCard.jsx')).toContain('<MangaCard');
    expect(read('src/features/bulk-scan/BulkScanPanel.jsx')).toContain('<MangaCard');
    const bulkSrc = read('src/features/bulk-scan/BulkScanPanel.jsx');
    expect(bulkSrc).toContain('<EmptyState');
    expect(bulkSrc).toContain('bulkScan.emptyFilteredTitle');
    expect(read('src/features/explore/components/FollowedMangaPanel.jsx')).toContain('followedManga.resetFilters');
  });

  test('performance optimizations are present across ExplorePanel and all 3 subtabs', () => {
    const exploreSrc = read('src/features/explore/ExplorePanel.jsx');
    const latestSrc = read('src/features/latest-updates/LatestUpdatesPanel.jsx');
    const followedSrc = read('src/features/explore/components/FollowedMangaPanel.jsx');
    const cardSrc = read('src/features/explore/components/FollowedMangaCard.jsx');
    const bulkSrc = read('src/features/bulk-scan/BulkScanPanel.jsx');

    expect(exploreSrc).toContain('visitedSubtabs');
    expect(exploreSrc).toContain('KeepAliveSubtab');
    expect(cardSrc).toContain('export const MemoFollowedMangaCard = React.memo');
    expect(followedSrc).toContain('<MemoFollowedMangaCard');
    expect(followedSrc).toContain('useDeferredValue');
    expect(bulkSrc).toContain('useDeferredValue');
    expect(bulkSrc).toContain('chapterCacheRef');
    expect(bulkSrc).not.toContain('favorites.some(');
    expect(latestSrc).toContain('favoriteIdSet');
    expect(latestSrc).not.toContain('favorites.some(');
    expect(latestSrc).toContain('isActive');
  });
});
