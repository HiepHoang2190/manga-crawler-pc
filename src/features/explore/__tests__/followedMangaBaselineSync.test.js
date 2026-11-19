import { computeFavoritesStats, filterFavorites } from '../services/favoriteChecker';

describe('Followed Manga Baseline & Sync Logic', () => {
  it('correctly treats newly followed manga with hasNew=false as up to date (0 new chapters)', () => {
    const favorites = [
      {
        id: 'baotangtruyen::https://baotangtruyen.site/manga/test-1',
        title: 'Manga Test 1',
        siteId: 'baotangtruyen',
        chapterCount: 36,
      },
    ];

    // Baseline sync when newly added from feed
    const syncById = {
      'baotangtruyen::https://baotangtruyen.site/manga/test-1': {
        hasNew: false,
        pendingNewCount: 0,
        remoteCount: 36,
        latestChapterTitle: 'Chapter 36',
        checkedAt: Date.now(),
      },
    };

    const stats = computeFavoritesStats({ favorites, favoriteSyncById: syncById });
    expect(stats.total).toBe(1);
    expect(stats.hasNewCount).toBe(0);

    const hasNewFiltered = filterFavorites({
      favorites,
      favoriteSyncById: syncById,
      statusFilter: 'hasNew',
    });
    expect(hasNewFiltered).toHaveLength(0);

    const allFiltered = filterFavorites({
      favorites,
      favoriteSyncById: syncById,
      statusFilter: 'all',
    });
    expect(allFiltered).toHaveLength(1);
  });

  it('correctly identifies new chapters when remote count exceeds baseline or feed brings newer chapter', () => {
    const favorites = [
      {
        id: 'baotangtruyen::https://baotangtruyen.site/manga/test-1',
        title: 'Manga Test 1',
        siteId: 'baotangtruyen',
        chapterCount: 36,
      },
      {
        id: 'baotangtruyen::https://baotangtruyen.site/manga/test-2',
        title: 'Manga Test 2',
        siteId: 'baotangtruyen',
        chapterCount: 10,
      },
    ];

    const syncById = {
      // test-1 has a new chapter (Chapter 37)
      'baotangtruyen::https://baotangtruyen.site/manga/test-1': {
        hasNew: true,
        pendingNewCount: 1,
        remoteCount: 37,
        latestChapterTitle: 'Chapter 37',
        checkedAt: Date.now(),
      },
      // test-2 is still up to date
      'baotangtruyen::https://baotangtruyen.site/manga/test-2': {
        hasNew: false,
        pendingNewCount: 0,
        remoteCount: 10,
        latestChapterTitle: 'Chapter 10',
        checkedAt: Date.now(),
      },
    };

    const stats = computeFavoritesStats({ favorites, favoriteSyncById: syncById });
    expect(stats.total).toBe(2);
    expect(stats.hasNewCount).toBe(1);

    const hasNewFiltered = filterFavorites({
      favorites,
      favoriteSyncById: syncById,
      statusFilter: 'hasNew',
    });
    expect(hasNewFiltered).toHaveLength(1);
    expect(hasNewFiltered[0].id).toBe('baotangtruyen::https://baotangtruyen.site/manga/test-1');
  });
});
