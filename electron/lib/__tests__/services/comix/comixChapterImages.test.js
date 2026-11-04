/**
 * Chapter image list must come from the signed API fetched inside
 * BrowserWindow. Main-process session.fetch is Cloudflare 403; DOM scrape
 * only sees the first lazy-loaded .rpage-page nodes (~3).
 */
jest.mock('electron', () => ({
  app: {
    userAgentFallback:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  },
  net: { fetch: jest.fn() },
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

const { session, BrowserWindow } = require('electron');
const {
  fetchChapterImages,
  resetComixSharedImageWindow,
  selectComixChapterDetailData,
  createComixCaptchaReveal,
  selectComixPrefetchUrls,
  warmComixChapterImageCache,
} = require('../../../platform/connectors/services/comixService');

function chapter_api_json(page_count, scramble = false) {
  const items = [];
  for (let index = 1; index <= page_count; index += 1) {
    items.push({ url: `p${index}.webp`, s: scramble ? 1 : 0 });
  }
  return {
    status: 'ok',
    result: {
      pages: {
        baseUrl: 'https://cdn.example/',
        items,
      },
    },
  };
}

function mock_chapter_browser({ page_title, api_json, dom_urls, subframe_error, react_json } = {}) {
  BrowserWindow.mockImplementation(() => {
    const handlers = {};
    const win = {
      webContents: {
        setUserAgent: jest.fn(),
        getURL: jest.fn(
          () => 'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
        ),
        session: session.defaultSession,
        executeJavaScript: jest.fn(async (script) => {
          const src = String(script);
          if (src.trim() === 'document.title') return page_title;
          if (src.includes('findPagesInReact') || src.includes('app-root')) {
            return react_json !== undefined ? react_json : null;
          }
          if (src.includes('fetch(') && src.includes('/chapters/')) {
            return {
              ok: true,
              status: 200,
              enc: null,
              text: JSON.stringify(api_json),
            };
          }
          if (src.includes('rpage-page')) {
            return { urls: dom_urls || [], total: (dom_urls || []).length, source: 'dom' };
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
          if (subframe_error && typeof handlers['did-fail-load'] === 'function') {
            handlers['did-fail-load'](
              {},
              subframe_error.error_code,
              subframe_error.error_description,
              subframe_error.validated_url,
              false,
            );
          }
          if (typeof handlers['did-finish-load'] === 'function') {
            handlers['did-finish-load']();
          }
        });
      }),
    };
    return win;
  });
}

describe('comix chapter images via in-page signed API', () => {
  beforeEach(() => {
    resetComixSharedImageWindow();
    jest.clearAllMocks();
    session.defaultSession.cookies.get.mockResolvedValue([]);
    session.defaultSession.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
      text: async () => '<!DOCTYPE html><title>Just a moment...</title>',
    });
  });

  test('fetchChapterImages returns the full API page list, not the lazy DOM subset', async () => {
    mock_chapter_browser({
      page_title: 'Frozen Wolf, Fire Dragon · Ch.105',
      api_json: chapter_api_json(70),
      dom_urls: [
        'https://cdn.example/p1.webp',
        'https://cdn.example/p2.webp',
        'https://cdn.example/p3.webp',
      ],
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
      'https://comix.to/',
    );

    expect(images).toHaveLength(70);
    expect(images[0].imageUrl).toBe('https://cdn.example/p1.webp');
    expect(images[69].imageUrl).toBe('https://cdn.example/p70.webp');
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
  });

  test('fetchChapterImages prefers the longer DOM list when the API only returns a viewport chunk', async () => {
    const dom_urls = [];
    for (let index = 1; index <= 70; index += 1) {
      dom_urls.push(`https://cdn.example/p${index}.webp`);
    }
    mock_chapter_browser({
      page_title: 'Frozen Wolf, Fire Dragon · Ch.105',
      api_json: chapter_api_json(3),
      dom_urls,
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
      'https://comix.to/',
    );

    expect(images).toHaveLength(70);
    expect(images[69].imageUrl).toBe('https://cdn.example/p70.webp');
  });

  test('fetchChapterImages still takes the longer DOM list when API returns more than 5 truncated pages', async () => {
    const dom_urls = [];
    for (let index = 1; index <= 70; index += 1) {
      dom_urls.push(`https://cdn.example/p${index}.webp`);
    }
    mock_chapter_browser({
      page_title: 'Frozen Wolf, Fire Dragon · Ch.105',
      api_json: chapter_api_json(20),
      dom_urls,
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
      'https://comix.to/',
    );

    expect(images).toHaveLength(70);
    expect(images[69].imageUrl).toBe('https://cdn.example/p70.webp');
  });

  test('DOM fallback keeps scramble flags from matching API items', async () => {
    const dom_urls = [];
    for (let index = 1; index <= 70; index += 1) {
      dom_urls.push(`https://cdn.example/p${index}.webp`);
    }
    mock_chapter_browser({
      page_title: 'Frozen Wolf, Fire Dragon · Ch.105',
      api_json: chapter_api_json(3, true),
      dom_urls,
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
      'https://comix.to/',
    );

    expect(images).toHaveLength(70);
    expect(images[0].scramble).toBe(true);
    expect(images[2].scramble).toBe(true);
    expect(images[3].scramble).toBe(false);
  });

  test('subframe did-fail-load does not abort the chapter image scrape', async () => {
    mock_chapter_browser({
      page_title: 'Frozen Wolf, Fire Dragon · Ch.105',
      api_json: chapter_api_json(70),
      subframe_error: {
        error_code: -2,
        error_description: 'ERR_FAILED',
        validated_url: 'https://ads.example/pixel',
      },
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/9058-frozen-wolf-fire-dragon/11234489-chapter-105',
      'https://comix.to/',
    );

    expect(images).toHaveLength(70);
  });

  test('fetchChapterImages extracts full page list directly from in-page React Query cache', async () => {
    mock_chapter_browser({
      page_title: 'Free Life Fantasy Online · Ch.1',
      react_json: {
        id: 10621088,
        pages: Array.from({ length: 58 }, (_, i) => ({
          url: `https://lov.example/p${i + 1}.webp`,
          width: 1000,
          height: 1500,
        })),
      },
      api_json: null,
      dom_urls: ['https://lov.example/p1.webp', 'https://lov.example/p2.webp', 'https://lov.example/p3.webp'],
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/nn2l5-free-life-fantasy-online-immortal-princess/10621088-chapter-1',
      'https://comix.to/',
    );

    expect(images).toHaveLength(58);
    expect(images[0].imageUrl).toBe('https://lov.example/p1.webp');
    expect(images[57].imageUrl).toBe('https://lov.example/p58.webp');
  });

  test('fetchChapterImages reads a renamed React Query page list instead of the 3 mounted images', async () => {
    const page_count = 43;
    const page_records = Array.from({ length: page_count }, (_, index) => ({
      X7: `https://8pl.example.site/hi/page-${index + 1}`,
      Lj: 1378,
      Q9: 960,
      lA: 'lov',
      ET: ['softglow33.site'],
    }));
    mock_chapter_browser({
      page_title: 'Free Life Fantasy Online · Ch.59',
      react_json: {
        M_: 6881403,
        ob: 59,
        XE: page_records,
      },
      api_json: chapter_api_json(3),
      dom_urls: [
        'https://8pl.example.site/hi/page-1',
        'https://8pl.example.site/hi/page-2',
        'https://8pl.example.site/hi/page-3',
      ],
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/nn2l5-free-life-fantasy-online-immortal-princess/6881403-chapter-59',
      'https://comix.to/',
    );

    expect(images).toHaveLength(43);
    expect(images[0].imageUrl).toBe('https://8pl.example.site/hi/page-1');
    expect(images[42].imageUrl).toBe('https://8pl.example.site/hi/page-43');
    expect(images[0].scramble).toBe(false);
  });

  test('fetchChapterImages handles React Query with raw pages.items baseUrl format', async () => {
    mock_chapter_browser({
      page_title: 'Free Life Fantasy Online · Ch.1',
      react_json: {
        id: 10621088,
        pages: {
          baseUrl: 'https://cdn.example/',
          items: Array.from({ length: 30 }, (_, i) => ({
            url: `page${i + 1}.webp`,
            width: 800,
            height: 1200,
            s: i === 0 ? 1 : 0,
          })),
        },
      },
      api_json: null,
      dom_urls: [],
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/nn2l5-free-life-fantasy-online-immortal-princess/10621088-chapter-1',
      'https://comix.to/',
    );

    expect(images).toHaveLength(30);
    expect(images[0].imageUrl).toBe('https://cdn.example/page1.webp');
    expect(images[0].scramble).toBe(true);
    expect(images[29].imageUrl).toBe('https://cdn.example/page30.webp');
    expect(images[29].scramble).toBe(false);
  });

  test('fetchChapterImages skips the slow DOM scroll script when React Query already has the full page list', async () => {
    const executed_scripts = [];
    BrowserWindow.mockImplementation(() => {
      const handlers = {};
      return {
        webContents: {
          setUserAgent: jest.fn(),
          getURL: jest.fn(
            () => 'https://comix.to/title/31z3-kingdom/11429264-chapter-889',
          ),
          session: session.defaultSession,
          executeJavaScript: jest.fn(async (script) => {
            const src = String(script);
            executed_scripts.push(src);
            if (src.trim() === 'document.title') return 'Kingdom · Ch.889';
            if (src.includes('findPagesInReact')) {
              return {
                id: 11429264,
                pages: {
                  items: Array.from({ length: 20 }, (_, idx) => ({
                    url: `https://c150.kkplayer.wtf/hi/page-${idx + 1}`,
                    width: 1200,
                    height: 1707,
                  })),
                },
              };
            }
            if (src.includes('rpage-page')) {
              return { urls: [], total: 20, source: 'dom' };
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
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/31z3-kingdom/11429264-chapter-889',
      'https://comix.to/',
    );

    expect(images).toHaveLength(20);
    expect(executed_scripts.some((src) => src.includes('window.scrollBy'))).toBe(false);
  });

  test('chapter image script does not clear the captcha poll outside the page function', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../../platform/connectors/services/comixService'),
      'utf8',
    );
    expect(source).not.toMatch(/\)\(\)\.finally\(\(\) => clearInterval\(captchaPoll\)\)/);
    expect(source).toContain('clearInterval(captchaPoll)');
  });

  test('chapter image fetch lets Cloudflare captcha finish and bounds the detail request', async () => {
    const show_window = jest.fn();
    const open_handler = jest.fn();
    BrowserWindow.mockImplementation(() => {
      const handlers = {};
      return {
        show: show_window,
        focus: jest.fn(),
        hide: jest.fn(),
        webContents: {
          setUserAgent: jest.fn(),
          setWindowOpenHandler: open_handler,
          getURL: jest.fn(
            () => 'https://comix.to/title/31z3-kingdom/11429264-chapter-889',
          ),
          session: session.defaultSession,
          executeJavaScript: jest.fn(async (script) => {
            const src = String(script);
            if (src.trim() === 'document.title') return 'Kingdom · Ch.889';
            if (src.includes('findPagesInReact')) {
              expect(src).toContain("phase: 'captcha'");
              expect(src).toContain('comix-chapter-timeout');
              const on_console = handlers['console-message'];
              if (typeof on_console === 'function') {
                on_console({ message: 'COMIX_CHAPTER_PROGRESS {"phase":"captcha"}' });
              }
              return {
                pages: {
                  items: [{ url: 'https://c150.kkplayer.wtf/hi/page-1', width: 800, height: 1200 }],
                },
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
            if (typeof handlers['did-finish-load'] === 'function') {
              handlers['did-finish-load']();
            }
          });
        }),
      };
    });

    const images = await fetchChapterImages(
      'https://comix.to/title/31z3-kingdom/11429264-chapter-889',
      'https://comix.to/',
    );
    expect(images).toHaveLength(1);
    expect(show_window).not.toHaveBeenCalled();
    expect(open_handler).toHaveBeenCalled();
    expect(open_handler.mock.calls[0][0]({ url: 'about:blank' })).toEqual({ action: 'deny' });
  });

  test('a finished chapter read does not reveal a leftover Cloudflare window', () => {
    jest.useFakeTimers();
    const win = {
      isDestroyed: () => false,
      show: jest.fn(),
      focus: jest.fn(),
      hide: jest.fn(),
    };
    const reveal = createComixCaptchaReveal(win, 4000);
    reveal.onCaptcha();
    jest.advanceTimersByTime(3999);
    reveal.finish();
    jest.advanceTimersByTime(5000);
    expect(win.show).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('the Cloudflare window opens only when the challenge is still blocking', () => {
    jest.useFakeTimers();
    const win = {
      isDestroyed: () => false,
      show: jest.fn(),
      focus: jest.fn(),
      hide: jest.fn(),
    };
    const reveal = createComixCaptchaReveal(win, 4000);
    reveal.onCaptcha();
    jest.advanceTimersByTime(4000);
    expect(win.show).toHaveBeenCalledTimes(1);
    reveal.finish();
    expect(win.hide).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('later chapters reuse the open Comix window instead of loading a new page', async () => {
    const load_urls = [];
    BrowserWindow.mockImplementation(() => {
      const handlers = {};
      return {
        show: jest.fn(),
        hide: jest.fn(),
        focus: jest.fn(),
        webContents: {
          setUserAgent: jest.fn(),
          getURL: jest.fn(() => 'https://comix.to/title/31z3-kingdom/11429264-chapter-889'),
          session: session.defaultSession,
          executeJavaScript: jest.fn(async (script) => {
            const src = String(script);
            if (src.trim() === 'document.title') return 'Kingdom · Ch.889';
            if (src.includes('findPagesInReact')) {
              return {
                pages: {
                  items: [{ url: 'https://c150.kkplayer.wtf/hi/page-1', width: 800, height: 1200 }],
                },
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
        loadURL: jest.fn((url) => {
          load_urls.push(url);
          queueMicrotask(() => {
            if (typeof handlers['did-finish-load'] === 'function') {
              handlers['did-finish-load']();
            }
          });
        }),
      };
    });

    const first_images = await fetchChapterImages(
      'https://comix.to/title/31z3-kingdom/11429264-chapter-889',
      'https://comix.to/',
    );
    const second_images = await fetchChapterImages(
      'https://comix.to/title/31z3-kingdom/11355841-chapter-888',
      'https://comix.to/',
    );

    expect(first_images).toHaveLength(1);
    expect(second_images).toHaveLength(1);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(load_urls).toEqual(['https://comix.to/title/31z3-kingdom/11429264-chapter-889']);
  });

  test('a reused window does not treat another chapter cache as this chapter', () => {
    const first_chapter = {
      queryKey: ['chapters', 'detail', 11429264],
      state: {
        data: {
          pages: { items: [{ url: 'https://cdn.example/chapter-889.webp' }] },
        },
      },
    };
    const other_chapter = selectComixChapterDetailData([first_chapter], '11355841');
    expect(other_chapter.data).toBeNull();
    expect(other_chapter.mismatched).toBe(true);
    expect(selectComixChapterDetailData([first_chapter], '11429264').data.pages.items[0].url).toBe(
      'https://cdn.example/chapter-889.webp',
    );
  });

  test('prefetch keeps the next chapter urls after the current one', () => {
    const urls = Array.from({ length: 12 }, (_, index) => `https://comix.to/title/x/${index + 1}`);
    const ahead = selectComixPrefetchUrls(urls, urls[0], 8);
    expect(ahead).toEqual(urls.slice(1, 9));
    expect(selectComixPrefetchUrls([urls[2], '', urls[2], urls[3]], urls[0], 8)).toEqual([
      urls[2],
      urls[3],
    ]);
  });

  test('a warm cache loads the current chapter and the next ones once', async () => {
    const loaded = [];
    const cache = new Map();
    const load_image_list = async (url) => {
      loaded.push(url);
      return [{ imageUrl: `${url}/page.webp`, ext: 'webp', scramble: false }];
    };
    const first = await warmComixChapterImageCache({
      cache,
      chapterUrl: 'https://comix.to/title/x/1',
      prefetchChapterUrls: ['https://comix.to/title/x/2', 'https://comix.to/title/x/3'],
      loadImageList: load_image_list,
    });
    expect(first.prefetched).toBe(2);
    expect(loaded).toEqual([
      'https://comix.to/title/x/1',
      'https://comix.to/title/x/2',
      'https://comix.to/title/x/3',
    ]);
    loaded.length = 0;
    const second = await warmComixChapterImageCache({
      cache,
      chapterUrl: 'https://comix.to/title/x/2',
      prefetchChapterUrls: ['https://comix.to/title/x/3', 'https://comix.to/title/x/4'],
      loadImageList: load_image_list,
    });
    expect(second.prefetched).toBe(0);
    expect(loaded).toEqual([]);
  });

  test('a prefetched chapter list is used without opening another browser window', async () => {
    await warmComixChapterImageCache({
      chapterUrl: 'https://comix.to/title/x/1',
      prefetchChapterUrls: ['https://comix.to/title/x/2'],
      loadImageList: async (url) => [{ imageUrl: `${url}/page.webp`, ext: 'webp', scramble: false }],
    });
    const images = await fetchChapterImages('https://comix.to/title/x/2', 'https://comix.to/');
    expect(images).toEqual([
      { imageUrl: 'https://comix.to/title/x/2/page.webp', ext: 'webp', scramble: false },
    ]);
    expect(BrowserWindow).not.toHaveBeenCalled();
  });
});

