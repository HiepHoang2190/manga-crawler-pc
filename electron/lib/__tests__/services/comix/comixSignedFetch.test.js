/**
 * Comix load() uses one hidden BrowserWindow (Cloudflare renderer).
 * Main-process fetch is not used for the title page.
 */
jest.mock('electron', () => ({
  app: {
    userAgentFallback:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  },
  net: {
    fetch: jest.fn(),
  },
  BrowserWindow: jest.fn(),
  session: {
    defaultSession: {
      fetch: jest.fn(),
      cookies: {
        get: jest.fn(async () => []),
        set: jest.fn(async () => {}),
      },
    },
  },
}));

const { net, session, BrowserWindow } = require('electron');
const {
  load,
  rewriteComixRequestHeader,
  collectComixChaptersViaInPageGet,
  formatComixChapterProgress,
  COMIX_SCRAPE_CHAPTERS_SCRIPT,
} = require('../../../platform/connectors/services/comixService');

const TITLE_PAGE_HTML = `<!DOCTYPE html><html><head>
  <title>Frozen Wolf, Fire Dragon - Comix</title>
  <meta property="og:image" content="https://static.comix.to/cover.webp">
</head><body>
  <h1 class="title">Frozen Wolf, Fire Dragon</h1>
</body></html>`;

function mock_comix_browser_window({ page_title, page_html, chapter_items } = {}) {
  BrowserWindow.mockImplementation(() => {
    const handlers = {};
    const win = {
      webContents: {
        setUserAgent: jest.fn(),
        getURL: jest.fn(() => 'https://comix.to/title/9058-frozen-wolf-fire-dragon'),
        session: session.defaultSession,
        executeJavaScript: jest.fn(async (script) => {
          const src = String(script);
          if (src.trim() === 'document.title') return page_title;
          if (src.includes('document.documentElement.outerHTML')) return page_html;
          if (src.includes('mchap-list')) {
            return { items: chapter_items || [], pages: 1 };
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

describe('comix chapter pager request header', () => {
  test('synthetic pager clicks are not sent as untrusted reads', () => {
    expect(rewriteComixRequestHeader('X-Rt', '1')).toBe('0');
    expect(rewriteComixRequestHeader('x-rt', '1')).toBe('0');
    expect(rewriteComixRequestHeader('Accept', 'application/json')).toBe('application/json');
    expect(COMIX_SCRAPE_CHAPTERS_SCRIPT).toContain('rewriteComixRequestHeader');
    expect(COMIX_SCRAPE_CHAPTERS_SCRIPT).toContain('setRequestHeader');
  });

  test('in-page API collector walks all pages with limit 100 beyond 100 chapters without untrusted clicks', async () => {
    const requested_pages = [];
    const fake_get = async (endpoint, config) => {
      expect(endpoint).toBe('/manga/31z3/chapters');
      expect(config.params.limit).toBe(100);
      const current_page = config.params.page;
      requested_pages.push(current_page);
      const items = [];
      const count_on_page = current_page < 11 ? 100 : 12;
      for (let idx = 0; idx < count_on_page; idx += 1) {
        const chapter_num = 1012 - (current_page - 1) * 100 - idx;
        items.push({
          url: `/title/31z3-kingdom/${11000000 + chapter_num}-chapter-${chapter_num}`,
          number: chapter_num,
          group: null,
          creator: null,
          isOfficial: false,
        });
      }
      return {
        items,
        meta: {
          page: current_page,
          lastPage: 11,
          hasNext: current_page < 11,
          total: 1012,
        },
      };
    };

    const collected = await collectComixChaptersViaInPageGet(
      fake_get,
      '/title/31z3-kingdom',
      '',
    );
    expect(requested_pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(collected.items).toHaveLength(1012);
    expect(collected.pages).toBe(11);
    expect(collected.items[0].href).toBe('/title/31z3-kingdom/11001012-chapter-1012');
    expect(collected.items[1011].href).toBe('/title/31z3-kingdom/11000001-chapter-1');
    expect(COMIX_SCRAPE_CHAPTERS_SCRIPT).toContain('collectComixChaptersViaInPageGet');
  });

  test('a later page failure keeps the chapters already collected', async () => {
    const fake_get = async (_endpoint, config) => {
      if (config.params.page > 1) {
        throw new Error('captcha_required');
      }
      return {
        items: [
          {
            url: '/title/31z3-kingdom/11429264-chapter-889',
            number: 889,
            group: null,
            creator: null,
            isOfficial: false,
          },
        ],
        meta: { page: 1, lastPage: 11, hasNext: true, total: 1012 },
      };
    };

    const collected = await collectComixChaptersViaInPageGet(
      fake_get,
      '/title/31z3-kingdom',
      '',
    );
    expect(collected.items).toHaveLength(1);
    expect(collected.items[0].href).toBe('/title/31z3-kingdom/11429264-chapter-889');
  });

  test('chapter page progress is reported after each fetched page', async () => {
    const progress_rows = [];
    const fake_get = async (_endpoint, config) => {
      const current_page = config.params.page;
      return {
        items: [
          {
            url: `/title/31z3-kingdom/chapter-${current_page}`,
            number: 100 - current_page,
            isOfficial: false,
          },
        ],
        meta: { page: current_page, lastPage: 2, hasNext: current_page < 2, total: 2 },
      };
    };

    await collectComixChaptersViaInPageGet(fake_get, '/title/31z3-kingdom', '', (payload) => {
      progress_rows.push(payload);
    });

    expect(progress_rows).toEqual([
      { phase: 'request', page: 1 },
      { page: 1, totalPages: 2, count: 1 },
      { phase: 'request', page: 2 },
      { page: 2, totalPages: 2, count: 2 },
    ]);
    expect(formatComixChapterProgress(progress_rows[1])).toBe(
      'Comix: đang lấy chương, trang 1/2 (1 chương)…',
    );
    expect(COMIX_SCRAPE_CHAPTERS_SCRIPT).toContain('COMIX_CHAPTER_PROGRESS');
  });

  test('a chapter request that never answers is abandoned instead of hanging the fetch', async () => {
    const fake_get = () => new Promise(() => {});
    const started_at = Date.now();
    const collected = await collectComixChaptersViaInPageGet(
      fake_get,
      '/title/9058-frozen-wolf-fire-dragon',
      '',
      null,
      40,
    );
    expect(Date.now() - started_at).toBeLessThan(1000);
    expect(collected.items).toEqual([]);
    expect(formatComixChapterProgress({ phase: 'request', page: 1 })).toBe(
      'Comix: đang gọi API trang 1…',
    );
  });

  test('a timed-out later page keeps the chapters already fetched', async () => {
    const calls_by_page = [];
    const fake_get = async (_endpoint, config) => {
      const current_page = config.params.page;
      calls_by_page.push(current_page);
      if (current_page === 2) return new Promise(() => {});
      return {
        items: [
          {
            url: '/title/4wlg-until-the-tragic-male-lead-walks-again/chapter-150',
            number: 150,
            isOfficial: false,
          },
        ],
        meta: { page: 1, lastPage: 2, hasNext: true, total: 150 },
      };
    };

    const collected = await collectComixChaptersViaInPageGet(
      fake_get,
      '/title/4wlg-until-the-tragic-male-lead-walks-again',
      '',
      null,
      20,
    );
    expect(calls_by_page.filter((page) => page === 2)).toHaveLength(1);
    expect(collected.items.map((item) => item.num)).toEqual(['150']);
  });

  test('the page script lets Cloudflare captcha finish instead of cancelling it', () => {
    expect(COMIX_SCRAPE_CHAPTERS_SCRIPT).not.toContain(
      "dispatchEvent(new Event('waf:captcha:cancelled'))",
    );
    expect(COMIX_SCRAPE_CHAPTERS_SCRIPT).toContain("phase: 'captcha'");
    expect(formatComixChapterProgress({ phase: 'captcha' })).toBe(
      'Comix: đang xác minh Cloudflare…',
    );
  });
});

describe('comix load uses one BrowserWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session.defaultSession.cookies.get.mockResolvedValue([]);
  });

  test('load() scrapes title, cover, and chapters from a single BrowserWindow', async () => {
    mock_comix_browser_window({
      page_title: 'Frozen Wolf, Fire Dragon - Comix',
      page_html: TITLE_PAGE_HTML,
      chapter_items: [
        {
          href: '/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
          num: '105',
          group: 'Lua Comic',
        },
      ],
    });

    const result = await load('https://comix.to/title/9058-frozen-wolf-fire-dragon', {
      waitAfterLoad: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.manga.title).toBe('Frozen Wolf, Fire Dragon');
    expect(result.manga.coverUrl).toBe('https://static.comix.to/cover.webp');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].url).toContain('11234489-chapter-105');
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(session.defaultSession.fetch).not.toHaveBeenCalled();
    expect(net.fetch).not.toHaveBeenCalled();
  });

  test('load() fails when the chapter list is empty', async () => {
    mock_comix_browser_window({
      page_title: 'Frozen Wolf, Fire Dragon - Comix',
      page_html: TITLE_PAGE_HTML,
      chapter_items: [],
    });

    const result = await load('https://comix.to/title/9058-frozen-wolf-fire-dragon', {
      waitAfterLoad: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('a Cloudflare interstitial opens the window before the title page is scraped', async () => {
    const logs = [];
    let title_reads = 0;
    const show_window = jest.fn();
    BrowserWindow.mockImplementation(() => {
      const handlers = {};
      const win = {
        show: (...args) => {
          show_window(...args);
          queueMicrotask(() => {
            if (typeof handlers['did-finish-load'] === 'function') handlers['did-finish-load']();
          });
        },
        focus: jest.fn(),
        webContents: {
          setUserAgent: jest.fn(),
          setWindowOpenHandler: jest.fn(),
          getURL: jest.fn(() => 'https://comix.to/title/9058-frozen-wolf-fire-dragon'),
          session: session.defaultSession,
          executeJavaScript: jest.fn(async (script) => {
            const src = String(script);
            if (src.trim() === 'document.title') {
              title_reads += 1;
              return title_reads === 1 ? 'Just a moment...' : 'Frozen Wolf, Fire Dragon - Comix';
            }
            if (src.includes('document.documentElement.outerHTML')) return TITLE_PAGE_HTML;
            if (src.includes('mchap-list')) {
              return {
                items: [
                  {
                    href: '/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
                    num: '105',
                    group: 'Lua Comic',
                  },
                ],
                pages: 1,
              };
            }
            return null;
          }),
          on: jest.fn((event, cb) => {
            handlers[event] = cb;
          }),
          removeListener: jest.fn(),
        },
        isDestroyed: jest.fn(() => false),
        destroy: jest.fn(),
        loadURL: jest.fn(() => {
          queueMicrotask(() => {
            if (typeof handlers['did-finish-load'] === 'function') handlers['did-finish-load']();
          });
        }),
      };
      return win;
    });

    const result = await load('https://comix.to/title/9058-frozen-wolf-fire-dragon', {
      waitAfterLoad: 0,
      sendLog: (message) => logs.push(message),
    });

    expect(show_window).toHaveBeenCalled();
    expect(logs).toContain('Comix: đang xác minh Cloudflare…');
    expect(result.ok).toBe(true);
    expect(result.chapters).toHaveLength(1);
  });
});
