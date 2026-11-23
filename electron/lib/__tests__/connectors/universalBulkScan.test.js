const connectors = require('../../platform/connectors');

describe('Universal Bulk Scan support & orchestrator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('listConnectors enables supportsBulkScan across >= 45 built-in multi-title connectors while excluding single-series sites', () => {
    const list = connectors.listConnectors();
    const builtInBulk = list.filter((c) => !c.isJsPlugin && c.supportsBulkScan);
    expect(builtInBulk.length).toBeGreaterThanOrEqual(45);

    const byId = new Map(list.map((c) => [c.id, c]));
    for (const id of ['cuutruyen', 'truyenqq', 'mangadex', 'nettruyengg', 'bluelake', 'comicvn', 'moetruyen']) {
      expect(byId.get(id)?.supportsBulkScan).toBe(true);
    }
    for (const id of ['sakamotodays', 'kingdomhoiquan', 'hoaphunglieunguyen', 'pokemonspecial']) {
      expect(byId.get(id)?.supportsBulkScan).toBe(false);
    }
  });

  test('fetchBulkScan rejects excluded single-series sites cleanly', async () => {
    const res = await connectors.fetchBulkScan('sakamotodays', { maxPages: 3 });
    expect(res.ok).toBe(false);
    expect(res.items).toEqual([]);
    expect(res.error).toMatch(/Bulk scan is not supported/i);
  });

  test('fetchBulkScanFromLatestUpdates aggregates multiple pages, deduplicates by mangaUrl, and reports progress', async () => {
    const progressEvents = [];
    const seenCalls = [];
    const mockConnector = {
      id: 'mangadex',
      requiresCookie: false,
      fetchLatestUpdates: jest.fn(async (opts) => {
        seenCalls.push(opts);
        if (opts.page === 1) {
          return {
            ok: true,
            page: 1,
            totalPages: 5,
            items: [
              { title: 'Alpha', mangaUrl: 'https://mangadex.org/title/1', coverUrl: 'c1', latestChapterLabel: 'Ch. 1' },
              { title: 'Beta', mangaUrl: 'https://mangadex.org/title/2', coverUrl: 'c2', latestChapterLabel: 'Ch. 2' },
            ],
          };
        }
        if (opts.page === 2) {
          return {
            ok: true,
            page: 2,
            totalPages: 5,
            items: [
              { title: 'Beta dup', mangaUrl: 'https://mangadex.org/title/2', coverUrl: 'c2', latestChapterLabel: 'Ch. 2' },
              { title: 'Gamma', mangaUrl: 'https://mangadex.org/title/3', coverUrl: 'c3', latestChapterLabel: 'Ch. 3' },
            ],
          };
        }
        return {
          ok: true,
          page: 3,
          totalPages: 5,
          items: [
            { title: 'Delta', mangaUrl: 'https://mangadex.org/title/4', coverUrl: 'c4', latestChapterLabel: 'Ch. 4' },
          ],
        };
      }),
    };

    const res = await connectors.fetchBulkScanFromLatestUpdates(mockConnector, {
      maxPages: 3,
      pageDelayMs: 0,
      cookie: 'cf=1',
      mangadexLanguage: 'vi',
      onProgress: (p) => progressEvents.push(p),
    });

    expect(res.ok).toBe(true);
    expect(res.siteId).toBe('mangadex');
    expect(res.pagesFetched).toBe(3);
    expect(res.totalPagesDetected).toBe(3);
    expect(res.items.map((x) => x.title)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    expect(res.items.every((x) => x.siteId === 'mangadex')).toBe(true);
    expect(progressEvents).toEqual([
      { page: 1, totalPages: 3, itemsCount: 2 },
      { page: 2, totalPages: 3, itemsCount: 3 },
      { page: 3, totalPages: 3, itemsCount: 4 },
    ]);
    expect(seenCalls[0].cookie).toBe('cf=1');
    expect(seenCalls[0].mangadexLanguage).toBe('vi');
    expect(seenCalls[0].latestUpdatesSearch).toBe('');
  });

  test('fetchBulkScanFromLatestUpdates stops early when page >= 2 repeats existing URLs or returns empty', async () => {
    const mockConnector = {
      id: 'dilib',
      fetchLatestUpdates: jest.fn(async ({ page }) => {
        if (page === 1) {
          return {
            ok: true,
            page: 1,
            totalPages: 10,
            items: [{ title: 'One', mangaUrl: 'https://dilib.vn/1' }],
          };
        }
        return {
          ok: true,
          page,
          totalPages: 10,
          items: [{ title: 'One again', mangaUrl: 'https://dilib.vn/1' }],
        };
      }),
    };

    const res = await connectors.fetchBulkScanFromLatestUpdates(mockConnector, {
      maxPages: 5,
      pageDelayMs: 0,
    });

    expect(res.ok).toBe(true);
    expect(res.pagesFetched).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(mockConnector.fetchLatestUpdates).toHaveBeenCalledTimes(2);
  });

  test('fetchBulkScanFromLatestUpdates preserves partial items on page >= 2 failure and fails cleanly on page 1 failure', async () => {
    const partialConnector = {
      id: 'truyenqq',
      fetchLatestUpdates: jest.fn(async ({ page }) => {
        if (page === 1) {
          return {
            ok: true,
            page: 1,
            totalPages: 4,
            items: [{ title: 'First', mangaUrl: 'https://truyenqq.com/1' }],
          };
        }
        return { ok: false, error: 'HTTP 503' };
      }),
    };

    const partialRes = await connectors.fetchBulkScanFromLatestUpdates(partialConnector, {
      maxPages: 4,
      pageDelayMs: 0,
    });
    expect(partialRes.ok).toBe(true);
    expect(partialRes.pagesFetched).toBe(1);
    expect(partialRes.items).toHaveLength(1);
    expect(partialRes.error).toContain('HTTP 503');

    const failPage1Connector = {
      id: 'truyenqq',
      fetchLatestUpdates: jest.fn(async () => ({ ok: false, error: 'Network down' })),
    };
    const failRes = await connectors.fetchBulkScanFromLatestUpdates(failPage1Connector, {
      maxPages: 3,
      pageDelayMs: 0,
    });
    expect(failRes.ok).toBe(false);
    expect(failRes.items).toEqual([]);
    expect(failRes.error).toContain('Network down');
  });

  test('fetchBulkScanFromLatestUpdates respects AbortSignal immediately', async () => {
    const ac = new AbortController();
    const mockConnector = {
      id: 'cuutruyen',
      fetchLatestUpdates: jest.fn(async ({ page }) => {
        if (page === 1) {
          ac.abort();
          return {
            ok: true,
            page: 1,
            totalPages: 5,
            items: [{ title: 'Title 1', mangaUrl: 'https://cuutruyen.net/mangas/1' }],
          };
        }
        throw new Error('Should not fetch page 2 after abort');
      }),
    };

    const res = await connectors.fetchBulkScanFromLatestUpdates(mockConnector, {
      maxPages: 5,
      pageDelayMs: 0,
      signal: ac.signal,
    });

    expect(res.ok).toBe(false);
    expect(res.aborted).toBe(true);
    expect(mockConnector.fetchLatestUpdates).toHaveBeenCalledTimes(1);
  });

  test('fetchBulkScan keeps dedicated comicvn and moetruyen delegation untouched', async () => {
    const comicvn = connectors.get('comicvn');
    const spyComicvn = jest.spyOn(comicvn, 'fetchMoiNhatListing').mockResolvedValue({
      ok: true,
      siteId: 'comicvn',
      pagesFetched: 1,
      totalPagesDetected: 1,
      items: [],
    });
    const r1 = await connectors.fetchBulkScan('comicvn', { maxPages: 5 });
    expect(spyComicvn).toHaveBeenCalledWith({ maxPages: 5 });
    expect(r1.siteId).toBe('comicvn');

    const moetruyen = connectors.get('moetruyen');
    const spyMoe = jest.spyOn(moetruyen, 'fetchBulkScanListing').mockResolvedValue({
      ok: true,
      siteId: 'moetruyen',
      pagesFetched: 1,
      totalPagesDetected: 1,
      items: [],
    });
    const r2 = await connectors.fetchBulkScan('moetruyen', { maxPages: 5 });
    expect(spyMoe).toHaveBeenCalledWith({ maxPages: 5 });
    expect(r2.siteId).toBe('moetruyen');
  });

  test('connectorSupportsBulkScan checks plugin.fetchLatestUpdates for JS plugins instead of prototype method', () => {
    const unsupportedPlugin = {
      id: 'js-no-latest',
      plugin: { loadManga: jest.fn() },
      fetchLatestUpdates: jest.fn(), // inherited prototype method
    };
    expect(connectors.connectorSupportsBulkScan(unsupportedPlugin)).toBe(false);

    const supportedPlugin = {
      id: 'js-with-latest',
      plugin: { fetchLatestUpdates: jest.fn() },
      fetchLatestUpdates: jest.fn(),
    };
    expect(connectors.connectorSupportsBulkScan(supportedPlugin)).toBe(true);
  });

  test('fetchBulkScanFromLatestUpdates stops immediately after empty page 1 and respects abort during inter-page delay', async () => {
    const emptyPage1 = {
      id: 'dilib',
      fetchLatestUpdates: jest.fn(async () => ({
        ok: true,
        page: 1,
        items: [],
      })),
    };
    const emptyRes = await connectors.fetchBulkScanFromLatestUpdates(emptyPage1, {
      maxPages: 10,
      pageDelayMs: 0,
    });
    expect(emptyRes.ok).toBe(true);
    expect(emptyRes.pagesFetched).toBe(1);
    expect(emptyRes.totalPagesDetected).toBe(1);
    expect(emptyRes.items).toEqual([]);
    expect(emptyPage1.fetchLatestUpdates).toHaveBeenCalledTimes(1);

    const ac = new AbortController();
    const slowDelayConnector = {
      id: 'mangadex',
      fetchLatestUpdates: jest.fn(async ({ page }) => ({
        ok: true,
        page,
        totalPages: 5,
        items: [{ title: `Item ${page}`, mangaUrl: `https://mangadex.org/title/${page}` }],
      })),
    };
    setTimeout(() => ac.abort(), 30);
    const abortRes = await connectors.fetchBulkScanFromLatestUpdates(slowDelayConnector, {
      maxPages: 5,
      pageDelayMs: 5000,
      signal: ac.signal,
    });
    expect(abortRes.ok).toBe(false);
    expect(abortRes.aborted).toBe(true);
    expect(slowDelayConnector.fetchLatestUpdates).toHaveBeenCalledTimes(1);
  });

  test('fetchBulkScanFromLatestUpdates supports maxPages="all" (up to 500 cap), expands totalPages dynamically, and forwards perPage=60', async () => {
    const progress = [];
    const seenPerPage = [];
    const dynamicConnector = {
      id: 'incremental-site',
      fetchLatestUpdates: jest.fn(async ({ page, perPage }) => {
        seenPerPage.push(perPage);
        // Simulate a connector whose reported totalPages grows as it crawls deeper (like page + 1), up to 110 pages!
        const nextTotal = page < 110 ? page + 1 : 110;
        return {
          ok: true,
          page,
          totalPages: nextTotal,
          items: [{ title: `Manga ${page}`, mangaUrl: `https://example.org/m/${page}` }],
        };
      }),
    };

    const res = await connectors.fetchBulkScanFromLatestUpdates(dynamicConnector, {
      maxPages: 'all',
      pageDelayMs: 0,
      onProgress: (p) => progress.push(p),
    });

    expect(res.ok).toBe(true);
    expect(res.pagesFetched).toBe(110);
    expect(res.totalPagesDetected).toBe(110);
    expect(res.items).toHaveLength(110);
    expect(seenPerPage[0]).toBe(60);
    expect(progress[0]).toEqual({ page: 1, totalPages: 2, itemsCount: 1 });
    expect(progress[109]).toEqual({ page: 110, totalPages: 110, itemsCount: 110 });
  });

  test('cuuTruyenService parses root._metadata total_pages and comicvn/moetruyen allow >= 500 pages', () => {
    const { parseRecentlyUpdatedResponse } = require('../../platform/connectors/services/cuuTruyenService');
    const parsed = parseRecentlyUpdatedResponse(
      {
        data: [{ id: 1, name: 'Test', newest_chapter_number: '10' }],
        _metadata: { total_count: 4027, total_pages: 81, current_page: 1, per_page: 50 },
      },
      'https://cuutruyen.net',
      1,
      50,
    );
    expect(parsed.totalPages).toBe(81);

    const { MOI_NHAT_MAX_PAGES_CAP } = require('../../platform/connectors/services/comicvnService');
    const { MANGA_BULK_SCAN_MAX_PAGES_CAP } = require('../../platform/connectors/services/moeTruyenService');
    expect(MOI_NHAT_MAX_PAGES_CAP).toBeGreaterThanOrEqual(500);
    expect(MANGA_BULK_SCAN_MAX_PAGES_CAP).toBeGreaterThanOrEqual(500);
  });

  test('fetchBulkScanFromLatestUpdates emits incremental snapshots via onPartialUpdate', async () => {
    const snapshots = [];
    const ac = new AbortController();
    const mockConnector = {
      id: 'partial-test',
      fetchLatestUpdates: jest.fn(async ({ page }) => ({
        ok: true,
        page,
        totalPages: 3,
        items: [{ title: `Item ${page}`, mangaUrl: `https://example.org/item/${page}` }],
      })),
    };
    const res = await connectors.fetchBulkScanFromLatestUpdates(mockConnector, {
      maxPages: 'all',
      pageDelayMs: 0,
      signal: ac.signal,
      onPartialUpdate: (snap) => {
        snapshots.push(snap);
        if (snap.pagesFetched === 2) ac.abort();
      },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].pagesFetched).toBe(2);
    expect(snapshots[1].items).toHaveLength(2);
    expect(res.aborted).toBe(true);
    expect(res.items).toHaveLength(2);
  });
});
