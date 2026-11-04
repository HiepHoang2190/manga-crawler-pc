import { emptySession, applyHydrateSession, applyClearSession } from './sessionReducers.js';

describe('emptySession', () => {
  test('returns the initial session fields App starts with', () => {
    expect(emptySession()).toEqual({
      manga: null,
      chapters: [],
      sourceUrl: '',
      site: '',
      fetchError: '',
      chapterListNoticeKey: '',
    });
  });
});

describe('applyHydrateSession', () => {
  test('merges payload onto current session and keeps unspecified fields', () => {
    const current_session = {
      ...emptySession(),
      site: 'mangadex',
      fetchError: 'old',
      selectedUrls: new Set(['a']),
    };
    const next_session = applyHydrateSession(current_session, {
      manga: { title: 'One' },
      chapters: [{ url: 'u1' }],
      sourceUrl: 'https://example.com/manga',
      site: 'comick',
    });
    expect(next_session.manga).toEqual({ title: 'One' });
    expect(next_session.chapters).toEqual([{ url: 'u1' }]);
    expect(next_session.sourceUrl).toBe('https://example.com/manga');
    expect(next_session.site).toBe('comick');
    expect(next_session.fetchError).toBe('old');
    expect(next_session.chapterListNoticeKey).toBe('');
    expect(next_session.selectedUrls).toEqual(new Set(['a']));
  });

  test('applies cover duration and increments cover tick like offline/CBZ writers', () => {
    const current_session = {
      ...emptySession(),
      manga: { title: 'Old' },
      coverFetchDurationMs: 2800,
      coverFetchSuccessTick: 4,
    };
    const next_session = applyHydrateSession(current_session, {
      manga: { title: 'Offline' },
      chapters: [{ url: 'c1' }],
      sourceUrl: 'https://example.com/offline',
      selectedUrls: new Set(),
      fetchError: '',
      coverFetchDurationMs: 0,
      coverFetchSuccessTick: (n) => (Number(n) || 0) + 1,
    });
    expect(next_session.manga).toEqual({ title: 'Offline' });
    expect(next_session.chapters).toEqual([{ url: 'c1' }]);
    expect(next_session.coverFetchDurationMs).toBe(0);
    expect(next_session.coverFetchSuccessTick).toBe(5);
  });

  test('patches manga via updater without resetting cover fetch fields', () => {
    const current_session = {
      ...emptySession(),
      manga: { title: 'One', coverUrl: 'old.jpg' },
      coverFetchDurationMs: 1200,
      coverFetchSuccessTick: 2,
    };
    const next_session = applyHydrateSession(current_session, {
      manga: (prev) => ({
        ...prev,
        coverUrl: 'new.jpg',
        selectedCover: { url512: 'new.jpg' },
      }),
    });
    expect(next_session.manga).toEqual({
      title: 'One',
      coverUrl: 'new.jpg',
      selectedCover: { url512: 'new.jpg' },
    });
    expect(next_session.coverFetchDurationMs).toBe(1200);
    expect(next_session.coverFetchSuccessTick).toBe(2);
  });
});

describe('applyClearSession', () => {
  test('resets the same fields as App CBZ-close, without clearing site', () => {
    const current_session = {
      manga: { title: 'CBZ', cbzTempExtractDir: '/tmp/x' },
      chapters: [{ url: 'c1' }],
      sourceUrl: 'https://example.com/manga',
      site: 'mangadex',
      selectedUrls: new Set(['c1']),
      fetchError: 'oops',
      chapterListNoticeKey: 'stale-notice',
      loading: true,
    };
    const next_session = applyClearSession(current_session);
    expect(next_session.manga).toBe(null);
    expect(next_session.chapters).toEqual([]);
    expect(next_session.sourceUrl).toBe('');
    expect(next_session.selectedUrls).toEqual(new Set());
    expect(next_session.fetchError).toBe('');
    expect(next_session.chapterListNoticeKey).toBe('');
    expect(next_session.site).toBe('mangadex');
    expect(next_session.loading).toBe(true);
  });
});
