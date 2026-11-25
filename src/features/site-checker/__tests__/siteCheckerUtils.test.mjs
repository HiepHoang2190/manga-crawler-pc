import {
  sortConnectorsForChecker,
  buildHealthReportMarkdown,
  buildConnectorErrorReport,
  SITE_CHECKER_VIEW_MODE_KEY,
  SITE_CHECKER_SORT_PREF_KEY,
  loadSiteCheckerViewMode,
  saveSiteCheckerViewMode,
  loadSiteCheckerSortPref,
  saveSiteCheckerSortPref,
} from '../siteCheckerUtils.mjs';

describe('siteCheckerUtils', () => {
  const connectors = [
    { id: 'site_a', label: 'Site A', domain: 'a.com' },
    { id: 'site_b', label: 'Site B', domain: 'b.com' },
    { id: 'site_c', label: 'Site C', domain: 'c.com' },
    { id: 'site_d', label: 'Site D', domain: 'd.com' },
  ];

  const results = {
    site_a: { status: 'success', rtt: 450 },
    site_b: { status: 'failed', rtt: 120, error: 'Timeout 403' },
    site_c: { status: 'success', rtt: 180 },
    // site_d untested
  };

  test('sortConnectorsForChecker keeps original order on default and does not mutate', () => {
    const sorted = sortConnectorsForChecker(connectors, results, 'default');
    expect(sorted.map((c) => c.id)).toEqual(['site_a', 'site_b', 'site_c', 'site_d']);
    expect(sorted).not.toBe(connectors);
  });

  test('sortConnectorsForChecker sorts rttAsc and rttDesc with untested/no-RTT last', () => {
    const asc = sortConnectorsForChecker(connectors, results, 'rttAsc');
    expect(asc.map((c) => c.id)).toEqual(['site_b', 'site_c', 'site_a', 'site_d']);

    const desc = sortConnectorsForChecker(connectors, results, 'rttDesc');
    expect(desc.map((c) => c.id)).toEqual(['site_a', 'site_c', 'site_b', 'site_d']);
  });

  test('sortConnectorsForChecker sorts brokenFirst accurately', () => {
    const broken = sortConnectorsForChecker(connectors, results, 'brokenFirst');
    expect(broken.map((c) => c.id)).toEqual(['site_b', 'site_d', 'site_a', 'site_c']);
  });

  test('buildHealthReportMarkdown summarizes stats, avg RTT, and broken sources', () => {
    const report = buildHealthReportMarkdown(connectors, results, {
      total: 4,
      working: 2,
      broken: 1,
      tested: 3,
    });
    expect(report).toContain('2/4');
    expect(report).toContain('Site B');
    expect(report).toContain('Timeout 403');
    expect(report).toContain('315ms'); // average of 450 and 180
  });
});

describe('siteChecker preference persistence helpers', () => {
  const createMemoryStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, val) => map.set(key, String(val)),
    };
  };

  test('exports expected storage keys', () => {
    expect(SITE_CHECKER_VIEW_MODE_KEY).toBe('site_checker_view_mode_v1');
    expect(SITE_CHECKER_SORT_PREF_KEY).toBe('site_checker_sort_pref_v1');
  });

  test('loadSiteCheckerViewMode defaults to grid and falls back cleanly on invalid or throwing storage', () => {
    expect(loadSiteCheckerViewMode(createMemoryStorage())).toBe('grid');
    expect(
      loadSiteCheckerViewMode(createMemoryStorage({ [SITE_CHECKER_VIEW_MODE_KEY]: 'table' }))
    ).toBe('grid');
    expect(
      loadSiteCheckerViewMode(createMemoryStorage({ [SITE_CHECKER_VIEW_MODE_KEY]: 'list' }))
    ).toBe('list');
    expect(
      loadSiteCheckerViewMode({
        getItem: () => {
          throw new Error('storage blocked');
        },
      })
    ).toBe('grid');
  });

  test('saveSiteCheckerViewMode persists valid values only and handles throwing storage', () => {
    const storage = createMemoryStorage();
    saveSiteCheckerViewMode('list', storage);
    expect(loadSiteCheckerViewMode(storage)).toBe('list');
    saveSiteCheckerViewMode('grid', storage);
    expect(loadSiteCheckerViewMode(storage)).toBe('grid');
    saveSiteCheckerViewMode('invalid', storage);
    expect(loadSiteCheckerViewMode(storage)).toBe('grid');
    expect(() =>
      saveSiteCheckerViewMode('list', {
        setItem: () => {
          throw new Error('quota exceeded');
        },
      })
    ).not.toThrow();
  });

  test('loadSiteCheckerSortPref defaults to default and validates allowed sort modes', () => {
    expect(loadSiteCheckerSortPref(createMemoryStorage())).toBe('default');
    expect(
      loadSiteCheckerSortPref(createMemoryStorage({ [SITE_CHECKER_SORT_PREF_KEY]: 'bogus' }))
    ).toBe('default');
    for (const mode of ['default', 'rttAsc', 'rttDesc', 'brokenFirst']) {
      const storage = createMemoryStorage();
      saveSiteCheckerSortPref(mode, storage);
      expect(loadSiteCheckerSortPref(storage)).toBe(mode);
    }
    expect(() =>
      saveSiteCheckerSortPref('rttAsc', {
        setItem: () => {
          throw new Error('quota exceeded');
        },
      })
    ).not.toThrow();
  });
});

describe('buildConnectorErrorReport', () => {
  test('formats connector domain, error summary, steps breakdown, and testDetails cleanly', () => {
    const out = buildConnectorErrorReport(
      { id: 'hangtruyen', label: 'HangTruyen', domain: 'hangtruyen.top' },
      {
        status: 'failed',
        rtt: 812,
        error: 'HTTP 403 Forbidden',
        steps: {
          listing: { ok: true, durationMs: 210 },
          chapters: { ok: false, durationMs: 602, error: 'Selector .chapter-list not found' },
        },
        testDetails: {
          mangaTitle: 'One Piece',
          mangaUrl: 'https://www.hangtruyen.online/truyen/one-piece',
          chapterUrl: 'https://www.hangtruyen.online/truyen/one-piece/chap-1',
        },
      },
      'https://www.hangtruyen.online'
    );

    expect(out).toContain('HangTruyen (hangtruyen)');
    expect(out).toContain('https://www.hangtruyen.online');
    expect(out).toContain('HTTP 403 Forbidden');
    expect(out).toContain('listing: OK (210ms)');
    expect(out).toContain('chapters: FAILED (602ms) — Selector .chapter-list not found');
    expect(out).toContain('https://www.hangtruyen.online/truyen/one-piece');
    expect(out).not.toContain('undefined');
  });

  test('falls back gracefully when optional steps, testDetails, or error are omitted and ignores null/empty durations', () => {
    const out = buildConnectorErrorReport(
      { id: 'vietmessenger', label: 'VietMessenger', domain: 'vietmessenger.com' },
      {
        status: 'failed',
        rtt: null,
        error: '   ',
        steps: {
          custom: { ok: false, durationMs: '', error: 'Custom auth check failed' },
        },
      }
    );
    expect(out).toContain('VietMessenger (vietmessenger)');
    expect(out).toContain('vietmessenger.com');
    expect(out).toContain('Status: failed\n');
    expect(out).toContain('Unknown error');
    expect(out).toContain('- custom: FAILED — Custom auth check failed');
    expect(out).not.toContain('nullms');
    expect(out).not.toContain('0ms');
    expect(out).not.toContain('undefined');
  });
});
