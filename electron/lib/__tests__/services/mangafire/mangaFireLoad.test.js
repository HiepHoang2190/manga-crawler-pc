/**
 * MangaFire catalog load must use defaultSession (login/CF cookies) and the
 * in-page signed GET /api/titles/{hid}/chapters?vrf=…. A separate
 * persist:mangafire partition plus a 6s scrape returns 0 chapters.
 */
jest.mock('electron', () => ({
  app: {
    userAgentFallback:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  },
  BrowserWindow: jest.fn(),
  session: {
    defaultSession: {},
  },
}));

const { BrowserWindow, session } = require('electron');
const {
  fetchMangaPage,
  buildMangaFireChaptersScrapeScript,
} = require('../../../platform/connectors/api-clients/mangaFireClient');

function mock_manga_browser({ page_title, payload } = {}) {
  BrowserWindow.mockImplementation(() => {
    const handlers = {};
    const win = {
      webContents: {
        setUserAgent: jest.fn(),
        getURL: jest.fn(() => 'https://mangafire.to/title/rjn5n-ase-to-sekkenn'),
        executeJavaScript: jest.fn(async (script) => {
          const src = String(script);
          if (src.trim() === 'document.title') return page_title;
          if (src.includes('/api/titles/') && src.includes('/chapters')) {
            return payload;
          }
          return null;
        }),
        on: jest.fn((event, cb) => {
          handlers[event] = cb;
        }),
      },
      isDestroyed: jest.fn(() => false),
      destroy: jest.fn(),
      loadURL: jest.fn(() => {
        queueMicrotask(() => {
          if (typeof handlers['did-finish-load'] === 'function') {
            handlers['did-finish-load']();
          }
        });
      }),
    };
    return win;
  });
}

describe('mangafire catalog load uses defaultSession + signed chapters API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hidden BrowserWindow uses defaultSession, not persist:mangafire', async () => {
    mock_manga_browser({
      page_title: 'Ase to Sekken',
      payload: {
        title: 'Ase to Sekken',
        cover: 'https://cdn.example/cover.jpg',
        items: [{ id: 9052169, number: 111, name: 'What Came Next: Part II' }],
      },
    });

    await fetchMangaPage('https://mangafire.to/manga/ase-to-sekkenn.rjn5n');

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    const window_prefs = BrowserWindow.mock.calls[0][0].webPreferences;
    expect(window_prefs.session).toBe(session.defaultSession);
    expect(window_prefs.partition).toBeUndefined();
  });

  test('fetchMangaPage returns chapters from the in-page signed API', async () => {
    mock_manga_browser({
      page_title: 'Ase to Sekken',
      payload: {
        title: 'Ase to Sekken',
        cover: 'https://cdn.example/cover.jpg',
        items: [
          { id: 9052169, number: 111, name: 'What Came Next: Part II' },
          { id: 9052168, number: 110, name: 'Part I' },
        ],
      },
    });

    const result = await fetchMangaPage(
      'https://mangafire.to/manga/ase-to-sekkenn.rjn5n',
    );

    expect(result.ok).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].url).toBe(
      'https://mangafire.to/title/rjn5n-ase-to-sekkenn/chapter/9052169',
    );
    expect(result.manga.title).toBe('Ase to Sekken');
  });

  test('Cloudflare challenge title is not a successful empty catalog', async () => {
    mock_manga_browser({
      page_title: 'Just a moment...',
      payload: { title: 'Just a moment...', cover: '', items: [] },
    });

    const result = await fetchMangaPage(
      'https://mangafire.to/manga/ase-to-sekkenn.rjn5n',
      { timeout: 80 },
    );

    expect(result.ok).toBe(false);
    expect(result.chapters || []).toHaveLength(0);
  });

  test('chapter scrape script paginates via DOM next button and page-1 reset', () => {
    const script = buildMangaFireChaptersScrapeScript('rjn5n');
    expect(script).toContain('has_enabled_next_chapter_page');
    expect(script).toContain('go_to_chapter_page_number(1)');
    expect(script).toContain('wait_for_new_chapter_api_urls');
    expect(script).toContain('.npager__nav[aria-label="Next page"]');
    expect(script).toContain('meta.hasNext || has_enabled_next_chapter_page()');
    expect(script).toContain('catalog_looks_incomplete');
    expect(script).toContain('[aria-label="Last page"]');
    expect(script).toContain('read_pagination_guard_limit');
    expect(script).toContain('sweep_chapter_pages_from_start');
    expect(script).not.toContain('guard++ < 50');
  });
});
