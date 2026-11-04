/**
 * Chapter images must come from the in-page signed API
 * GET /api/chapters/{id}?vrf=… (41 pages). DOM scrape of the paged
 * swiper only sees the first lazy slides (~6).
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
const { fetchChapterPage } = require('../../../platform/connectors/api-clients/mangaFireClient');

function mock_chapter_browser({ page_title, api_urls, dom_urls } = {}) {
  BrowserWindow.mockImplementation(() => {
    const handlers = {};
    const win = {
      webContents: {
        setUserAgent: jest.fn(),
        getURL: jest.fn(
          () => 'https://mangafire.to/title/rjn5n-ase-to-sekkenn/chapter/9052169',
        ),
        session: session.defaultSession,
        executeJavaScript: jest.fn(async (script) => {
          const src = String(script);
          if (src.trim() === 'document.title') return page_title;
          if (src.includes('/api/chapters')) {
            return { urls: api_urls || [] };
          }
          return { urls: dom_urls || [] };
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

describe('mangafire chapter images via in-page signed API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetchChapterPage returns the full API page list, not the lazy swiper subset', async () => {
    const api_urls = [];
    for (let index = 1; index <= 41; index += 1) {
      api_urls.push(`https://k99.mfcdn3.xyz/mf/page${index}/h/p.jpg`);
    }
    mock_chapter_browser({
      page_title: 'Ase to Sekken - Chapter 111',
      api_urls,
      dom_urls: api_urls.slice(0, 6),
    });

    const images = await fetchChapterPage(
      'https://mangafire.to/title/rjn5n-ase-to-sekkenn/chapter/9052169',
    );

    expect(images).toHaveLength(41);
    expect(images[0].imageUrl).toBe('https://k99.mfcdn3.xyz/mf/page1/h/p.jpg');
    expect(images[40].imageUrl).toBe('https://k99.mfcdn3.xyz/mf/page41/h/p.jpg');
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
  });
});
