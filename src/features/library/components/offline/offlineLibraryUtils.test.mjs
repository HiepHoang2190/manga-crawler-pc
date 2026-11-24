import {
  normalizeExtraEntry,
  isDownloadedOfflineRow,
  buildOfflineDisplayRows,
  getSyncNewCount,
  hasRowFetchUrl,
  openOfflineRow,
  fetchOfflineRow,
  canOpenOfflineRowFolder,
  openOfflineRowFolder,
  rowMatchesSourceFilter,
  filterOfflineLibraryRows,
  sortOfflineLibraryRows,
  computeOfflineLibraryStats,
} from './offlineLibraryUtils.js';

describe('offlineLibraryUtils pure helpers', () => {
  test('normalizeExtraEntry preserves manga, cbz, and root kinds and drops invalid entries', () => {
    expect(normalizeExtraEntry(null)).toBeNull();
    expect(normalizeExtraEntry({ path: '   ' })).toBeNull();
    expect(normalizeExtraEntry({ path: ' /tmp/m1 ', kind: 'manga' })).toEqual({ path: '/tmp/m1', kind: 'manga' });
    expect(normalizeExtraEntry({ path: '/tmp/cbz', kind: 'cbz' })).toEqual({ path: '/tmp/cbz', kind: 'cbz' });
    expect(normalizeExtraEntry({ path: '/tmp/root', kind: 'root' })).toEqual({ path: '/tmp/root', kind: 'root' });
    expect(normalizeExtraEntry({ path: '/tmp/other', kind: 'unknown' })).toEqual({ path: '/tmp/other', kind: 'manga' });
  });

  test('getSyncNewCount reads LibraryProvider sync shape ({ hasNew, remoteCount, pendingNewCount }) and newCount', () => {
    expect(getSyncNewCount(null)).toBe(0);
    expect(getSyncNewCount({ sync: { hasNew: false, remoteCount: 0 } })).toBe(0);
    expect(getSyncNewCount({ sync: { hasNew: true, remoteCount: 4 } })).toBe(4);
    expect(getSyncNewCount({ sync: { hasNew: true, pendingNewCount: 7, remoteCount: 4 } })).toBe(7);
    expect(getSyncNewCount({ sync: { hasNew: true } })).toBe(1);
    expect(getSyncNewCount({ sync: { newCount: 3 } })).toBe(3);
  });

  const sampleRows = [
    {
      key: 'fav:1',
      source: 'favorite',
      mangaTitle: 'Berserk',
      chapterCount: 370,
      isFavorite: true,
      sync: { hasNew: true, remoteCount: 3 },
      absolutePath: '',
    },
    {
      key: 'save:/dl/naruto',
      source: 'save',
      mangaTitle: 'Naruto',
      chapterCount: 700,
      isFavorite: true,
      sync: { hasNew: false, remoteCount: 0 },
      absolutePath: '/dl/naruto',
    },
    {
      key: 'extra:/custom/akira',
      source: 'extra',
      mangaTitle: 'Akira',
      chapterCount: 6,
      isFavorite: false,
      absolutePath: '/custom/akira',
    },
    {
      key: 'extraCbz:/zips/oneshot',
      source: 'extraCbz',
      archiveKind: 'cbz',
      mangaTitle: 'Oneshot Pack',
      chapterCount: 12,
      isFavorite: false,
      absolutePath: '/zips/oneshot',
    },
  ];

  test('computeOfflineLibraryStats summarizes collections and total chapters safely', () => {
    expect(computeOfflineLibraryStats([...sampleRows, null])).toEqual({
      total: 4,
      favorites: 2,
      hasNew: 1,
      save: 1,
      extra: 1,
      archives: 1,
      totalChapters: 1088,
    });
  });

  test('filterOfflineLibraryRows handles hasNew, favorites, save, extra, archives, null opts, and search query', () => {
    expect(filterOfflineLibraryRows(sampleRows, null)).toHaveLength(4);
    expect(filterOfflineLibraryRows(sampleRows, { sourceFilter: 'all', query: '' })).toHaveLength(4);
    expect(filterOfflineLibraryRows(sampleRows, { sourceFilter: 'favorites' }).map((r) => r.key)).toEqual([
      'fav:1',
      'save:/dl/naruto',
    ]);
    expect(filterOfflineLibraryRows(sampleRows, { sourceFilter: 'hasNew' }).map((r) => r.key)).toEqual(['fav:1']);
    expect(filterOfflineLibraryRows(sampleRows, { sourceFilter: 'save' }).map((r) => r.key)).toEqual(['save:/dl/naruto']);
    expect(filterOfflineLibraryRows(sampleRows, { sourceFilter: 'extra' }).map((r) => r.key)).toEqual(['extra:/custom/akira']);
    expect(filterOfflineLibraryRows(sampleRows, { sourceFilter: 'archives' }).map((r) => r.key)).toEqual(['extraCbz:/zips/oneshot']);
    expect(filterOfflineLibraryRows(sampleRows, { query: '/custom/' }).map((r) => r.key)).toEqual(['extra:/custom/akira']);
    expect(rowMatchesSourceFilter({ source: 'save', archiveKind: 'archive' }, 'archives')).toBe(true);
  });

  test('sortOfflineLibraryRows supports titleAsc, titleDesc, chaptersDesc, and hasNewFirst', () => {
    expect(sortOfflineLibraryRows(sampleRows, 'titleAsc').map((r) => r.mangaTitle)).toEqual([
      'Akira',
      'Berserk',
      'Naruto',
      'Oneshot Pack',
    ]);
    expect(sortOfflineLibraryRows(sampleRows, 'titleDesc').map((r) => r.mangaTitle)).toEqual([
      'Oneshot Pack',
      'Naruto',
      'Berserk',
      'Akira',
    ]);
    expect(sortOfflineLibraryRows(sampleRows, 'chaptersDesc').map((r) => r.mangaTitle)).toEqual([
      'Naruto',
      'Berserk',
      'Oneshot Pack',
      'Akira',
    ]);
    const multiNew = [
      ...sampleRows,
      { key: 'fav:2', source: 'favorite', mangaTitle: 'Zatch Bell', chapterCount: 50, isFavorite: true, sync: { hasNew: true, remoteCount: 5 } },
    ];
    expect(sortOfflineLibraryRows(multiNew, 'hasNewFirst').map((r) => r.mangaTitle)).toEqual([
      'Zatch Bell',
      'Berserk',
      'Akira',
      'Naruto',
      'Oneshot Pack',
    ]);
  });

  test('hasRowFetchUrl allows HTTP(S) non-local URLs and rejects file://, local://, or siteId local', () => {
    expect(hasRowFetchUrl(null)).toBe(false);
    expect(hasRowFetchUrl({ mangaUrl: '   ' })).toBe(false);
    expect(hasRowFetchUrl({ mangaUrl: 'file:///Volumes/Manga/Test' })).toBe(false);
    expect(hasRowFetchUrl({ mangaUrl: 'local://Test' })).toBe(false);
    expect(hasRowFetchUrl({ siteId: 'local', mangaUrl: 'https://example.com/m1' })).toBe(false);
    expect(hasRowFetchUrl({ mangaUrl: 'https://example.com/m1' })).toBe(true);
    expect(hasRowFetchUrl({ url: 'http://example.com/m2' })).toBe(true);
  });

  test('openOfflineRow routes to appropriate reader/archive handler by row source', () => {
    const calls = [];
    const handlers = {
      onOpenPinnedCbzFolder: (p) => calls.push(['cbz', p]),
      onReadArchivePath: (p) => calls.push(['archive', p]),
      onReadFavorite: (r) => calls.push(['fav', r.key]),
      onReadOffline: (r) => calls.push(['offline', r.key]),
    };

    openOfflineRow({ key: '1', source: 'extraCbz', absolutePath: '/tmp/c' }, handlers);
    openOfflineRow({ key: '2', source: 'recentArchive', absolutePath: '/tmp/a.cbz' }, handlers);
    openOfflineRow({ key: '3', source: 'favorite', absolutePath: '' }, handlers);
    openOfflineRow({ key: '4', source: 'favorite', absolutePath: '/dl/fav' }, handlers);
    openOfflineRow({ key: '5', source: 'save', absolutePath: '/dl/s' }, handlers);
    openOfflineRow({ key: '6', source: 'favorite', absolutePath: '' }, { onReadOffline: handlers.onReadOffline });

    expect(calls).toEqual([
      ['cbz', '/tmp/c'],
      ['archive', '/tmp/a.cbz'],
      ['fav', '3'],
      ['offline', '4'],
      ['offline', '5'],
      ['offline', '6'],
    ]);
  });

  test('fetchOfflineRow dispatches to onFetchFavorite or onFetchManga only when row has URL', () => {
    const calls = [];
    const handlers = {
      onFetchFavorite: (r) => calls.push(['fetchFav', r.key]),
      onFetchManga: (r) => calls.push(['fetchManga', r.key]),
    };

    fetchOfflineRow({ key: 'local', source: 'save' }, handlers);
    fetchOfflineRow({ key: 'fav1', source: 'favorite', mangaUrl: 'https://x/1' }, handlers);
    fetchOfflineRow({ key: 'save1', source: 'save', mangaUrl: 'https://x/2' }, handlers);
    fetchOfflineRow({ key: 'favFallback', source: 'favorite', url: 'https://x/3' }, { onFetchManga: handlers.onFetchManga });

    expect(calls).toEqual([
      ['fetchFav', 'fav1'],
      ['fetchManga', 'save1'],
      ['fetchManga', 'favFallback'],
    ]);
  });

  test('canOpenOfflineRowFolder and openOfflineRowFolder require local absolutePath and open extractPath or parent directory for recentArchive', () => {
    const calls = [];
    const handlers = {
      onOpenFolder: (p) => calls.push(['openFolder', p]),
    };

    expect(canOpenOfflineRowFolder(null, handlers)).toBe(false);
    expect(canOpenOfflineRowFolder({ source: 'favorite', mangaTitle: 'Berserk', absolutePath: '' }, handlers)).toBe(false);
    expect(canOpenOfflineRowFolder({ source: 'save', absolutePath: '/dl/A' }, {})).toBe(false);
    expect(canOpenOfflineRowFolder({ source: 'save', absolutePath: '/dl/A' }, handlers)).toBe(true);

    openOfflineRowFolder({ source: 'save', mangaTitle: 'A', absolutePath: '/dl/A' }, handlers);
    openOfflineRowFolder(
      { source: 'recentArchive', mangaTitle: 'B', absolutePath: '/tmp/b.cbz', extractPath: '/tmp/ext-b' },
      handlers
    );
    openOfflineRowFolder(
      { source: 'recentArchive', mangaTitle: 'C', absolutePath: '/books/vol1.epub', extractPath: '' },
      handlers
    );
    openOfflineRowFolder({ source: 'favorite', mangaTitle: 'Berserk', absolutePath: '' }, handlers);
    openOfflineRowFolder({ source: 'favorite', mangaTitle: 'Noop' }, {});

    expect(calls).toEqual([
      ['openFolder', '/dl/A'],
      ['openFolder', '/tmp/ext-b'],
      ['openFolder', '/books'],
    ]);
  });

  test('isDownloadedOfflineRow rejects online-only favorites, empty paths, and 0-chapter folders while accepting downloaded local items and text ebooks', () => {
    expect(isDownloadedOfflineRow(null)).toBe(false);
    expect(isDownloadedOfflineRow(undefined)).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'favorite', absolutePath: '', chapterCount: 20 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'favorite', absolutePath: '/dl/berserk', ebookPath: '/dl/berserk.epub', chapterCount: 20 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'save', absolutePath: '   ', chapterCount: 10 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'recentArchive', absolutePath: '   ', ebookPath: '/books/novel.epub', chapterCount: 0 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'save', absolutePath: '/dl/empty', chapterCount: 0 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'save', absolutePath: '/dl/ebook-like', ebookPath: '/books/novel.epub', chapterCount: 0 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'recentExtracted', absolutePath: '/tmp/ext', ebookPath: '/books/novel.epub', chapterCount: 0 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'recentArchive', absolutePath: '/tmp/vol1.cbz', chapterCount: 0 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'recentArchive', absolutePath: '/tmp/vol1.cbz', ebookPath: '   ', chapterCount: 0 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'extra', absolutePath: '/custom/empty', chapterCount: NaN })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'extraCbz', absolutePath: '/zips/empty', chapterCount: -1 })
    ).toBe(false);
    expect(
      isDownloadedOfflineRow({ source: 'recentExtracted', absolutePath: '/tmp/ext' })
    ).toBe(false);

    expect(
      isDownloadedOfflineRow({ source: 'save', absolutePath: '/dl/naruto', chapterCount: 1 })
    ).toBe(true);
    expect(
      isDownloadedOfflineRow({ source: 'extra', absolutePath: '/custom/akira', chapterCount: 6 })
    ).toBe(true);
    expect(
      isDownloadedOfflineRow({ source: 'extraCbz', absolutePath: '/zips/pack', chapterCount: 3 })
    ).toBe(true);
    expect(
      isDownloadedOfflineRow({ source: 'recentExtracted', absolutePath: '/tmp/cbz', chapterCount: 2 })
    ).toBe(true);
    expect(
      isDownloadedOfflineRow({
        source: 'recentArchive',
        absolutePath: '/tmp/vol1.cbz',
        chapterCount: 5,
      })
    ).toBe(true);
    expect(
      isDownloadedOfflineRow({
        source: 'recentArchive',
        absolutePath: '/books/novel.epub',
        ebookPath: '/books/novel.epub',
        chapterCount: 0,
      })
    ).toBe(true);
  });

  test('buildOfflineDisplayRows omits online-only favorites and 0-chapter folders while augmenting matched local rows and keeping recent ebooks', () => {
    const result = buildOfflineDisplayRows({
      rows: [
        {
          key: 'save:/dl/naruto',
          source: 'save',
          mangaTitle: 'Naruto',
          chapterCount: 25,
          hasDb: true,
          mangaUrl: 'https://example.com/naruto',
          siteId: '',
          absolutePath: '/dl/naruto',
          localCoverPath: '/dl/naruto/cover.jpg',
        },
        {
          key: 'save:/dl/zero',
          source: 'save',
          mangaTitle: 'Zero Chapter Folder',
          chapterCount: 0,
          hasDb: true,
          mangaUrl: 'https://example.com/zero',
          siteId: 'nettruyen',
          absolutePath: '/dl/zero',
        },
        {
          key: 'save:/tmp/ext-vol',
          source: 'save',
          mangaTitle: 'Shadowed Zero',
          chapterCount: 0,
          absolutePath: '/tmp/ext-vol',
        },
      ],
      recentExtractedCbzEntries: [
        {
          title: 'Extracted Volume',
          chapterCount: 4,
          openPath: '/tmp/ext-vol',
          extractPath: '/tmp/ext-vol',
        },
        {
          title: 'Opened Text Novel',
          chapterCount: 0,
          sourceKind: 'file',
          openPath: '/books/novel.epub',
          ebookPath: '/books/novel.epub',
          sourceFile: '/books/novel.epub',
        },
        {
          title: 'Empty Archive Should Skip',
          chapterCount: 0,
          sourceKind: 'file',
          openPath: '/tmp/empty.cbz',
        },
      ],
      favorites: [
        {
          id: 'fav-naruto',
          title: 'Naruto',
          mangaUrl: 'https://example.com/naruto',
          siteId: 'truyenqq',
          coverUrl: 'https://cdn.example.com/naruto.jpg',
          chapterCount: 700,
          notifyWatch: true,
        },
        {
          id: 'fav-online-only',
          title: 'Animal Signal',
          mangaUrl: 'https://example.com/animal-signal',
          siteId: 'truyenqq',
          coverUrl: 'https://cdn.example.com/animal.jpg',
          chapterCount: 20,
        },
        {
          id: 'fav-zero',
          title: 'Zero Chapter Folder',
          mangaUrl: 'https://example.com/zero',
          siteId: 'nettruyen',
          chapterCount: 15,
        },
      ],
      favoriteSyncById: {
        'fav-naruto': { hasNew: true, remoteCount: 2, pendingNewCount: 2 },
      },
      favoriteTabBadgeReadById: {},
      isFavoriteTabBadgeUnread: (id, sync) => Boolean(id && sync?.hasNew),
    });

    expect(result.map((r) => r.key)).toEqual([
      'recentExtracted:/tmp/ext-vol',
      'recentExtracted:/books/novel.epub',
      'save:/dl/naruto',
    ]);
    expect(result.some((r) => r.source === 'favorite')).toBe(false);
    expect(result[0].chapterCount).toBe(4);
    expect(result[1].source).toBe('recentArchive');
    expect(result[1].ebookPath).toBe('/books/novel.epub');
    expect(result[2]).toMatchObject({
      isFavorite: true,
      favoriteId: 'fav-naruto',
      notifyWatch: true,
      siteId: 'truyenqq',
      coverUrl: 'https://cdn.example.com/naruto.jpg',
      isBadgeUnread: true,
    });
  });
});
