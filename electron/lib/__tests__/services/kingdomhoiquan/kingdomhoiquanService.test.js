const { describe, test, expect, beforeEach } = require('@jest/globals');

jest.mock('../../../download/connector/htmlConnectorUtils', () => {
  const actual = jest.requireActual('../../../download/connector/htmlConnectorUtils');
  return {
    ...actual,
    fetchHtml: jest.fn(),
  };
});

const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const kingdomHoiQuanApiClient = require('../../../platform/connectors/services/kingdomHoiQuanApiClient');

const SAMPLE_HOMEPAGE_HTML = `
<!doctype html>
<html>
<head>
  <title>Kingdom — Đọc truyện Kingdom tiếng Việt – Kingdom Hội Quán</title>
  <meta property="og:image" content="https://kingdomhoiquan.com/wp-content/uploads/2026/10/kingdom-cover.webp">
</head>
<body>
  <div class="cover">
    <img data-src="https://kingdomhoiquan.com/wp-content/uploads/2026/10/kingdom-cover.webp" alt="Ảnh bìa Kingdom">
  </div>
  <h1 class="t">Kingdom</h1>
  <dl class="meta">
    <div><dt>Tác giả</dt><dd><a href="https://kingdomhoiquan.com/tac-gia/">Hara Yasuhisa</a></dd></div>
  </dl>
  <p class="sum">Có thể nói Kingdom là 1 bộ truyện manga vô cùng xuất sắc.</p>
  <div class="grid" id="grid" data-home="https://kingdomhoiquan.com/" data-src="https://kingdomhoiquan.com/wp-content/uploads/khq/list.json">
    <a class="ch" data-n="8930" href="https://kingdomhoiquan.com/chap/893/"><b>Chap 893</b></a>
    <a class="ch" data-n="8870" href="https://kingdomhoiquan.com/chap/887/"><b>Chap 887</b></a>
  </div>
</body>
</html>
`;

const SAMPLE_CHAPTER_HTML = `
<!doctype html>
<html>
<head><title>Kingdom chap 887</title></head>
<body>
  <main class="pages">
    <img src="data:image/svg+xml;base64,PHN2Zz4=" data-src="https://kingdomhoiquan.com/wp-content/uploads/kq/887/01.webp" alt="Trang 1">
    <img src="data:image/svg+xml;base64,PHN2Zz4=" data-src="https://kingdomhoiquan.com/wp-content/uploads/kq/887/02.webp" alt="Trang 2">
    <img src="data:image/svg+xml;base64,PHN2Zz4=" data-src="https://kingdomhoiquan.com/wp-content/uploads/kq/887/03.jpg" alt="Trang 3">
    <!-- Placeholder SVG only, no data-src: should be ignored -->
    <img src="data:image/svg+xml;base64,PHN2Zz4=" alt="Placeholder">
  </main>
</body>
</html>
`;

describe('KingdomHoiQuanApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('load()', () => {
    test('should return error on empty url', async () => {
      const res = await kingdomHoiQuanApiClient.load('');
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });

    test('should return error on null/undefined url', async () => {
      const res1 = await kingdomHoiQuanApiClient.load(null);
      expect(res1.ok).toBe(false);
      const res2 = await kingdomHoiQuanApiClient.load(undefined);
      expect(res2.ok).toBe(false);
    });

    test('should load manga metadata and chapters via list.json from homepage URL', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: SAMPLE_HOMEPAGE_HTML,
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          c: [
            [8930, 1794116469],
            [8875, 1794116468],
            [10, 1793267330],
          ],
        }),
      });

      const res = await kingdomHoiQuanApiClient.load('https://kingdomhoiquan.com/');
      expect(res.ok).toBe(true);
      expect(res.manga).toEqual({
        title: 'Kingdom',
        coverUrl: 'https://kingdomhoiquan.com/wp-content/uploads/2026/10/kingdom-cover.webp',
        mangaUrl: 'https://kingdomhoiquan.com/',
        mangaId: 'kingdom',
        siteId: 'kingdomhoiquan',
        sourceLabel: 'Kingdom Hội Quán',
        author: 'Hara Yasuhisa',
        description: 'Có thể nói Kingdom là 1 bộ truyện manga vô cùng xuất sắc.',
      });

      expect(res.chapters).toHaveLength(3);
      expect(res.chapters[0]).toEqual({
        url: 'https://kingdomhoiquan.com/chap/893/',
        title: 'Chap 893',
      });
      expect(res.chapters[1]).toEqual({
        url: 'https://kingdomhoiquan.com/chap/887-5/',
        title: 'Chap 887.5',
      });
      expect(res.chapters[2]).toEqual({
        url: 'https://kingdomhoiquan.com/chap/1/',
        title: 'Chap 1',
      });
    });

    test('should normalize chapter URL to homepage and load full manga', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: SAMPLE_HOMEPAGE_HTML,
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          c: [[8870, 1794116467]],
        }),
      });

      const res = await kingdomHoiQuanApiClient.load('https://kingdomhoiquan.com/chap/887/');
      expect(res.ok).toBe(true);
      expect(res.manga.mangaUrl).toBe('https://kingdomhoiquan.com/');
      expect(res.chapters[0].url).toBe('https://kingdomhoiquan.com/chap/887/');
      expect(res.chapters[0].title).toBe('Chap 887');
    });

    test('should fallback to HTML scraping if list.json fetch fails', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: SAMPLE_HOMEPAGE_HTML,
      });

      global.fetch.mockRejectedValueOnce(new Error('Network error on list.json'));

      const res = await kingdomHoiQuanApiClient.load('https://kingdomhoiquan.com/');
      expect(res.ok).toBe(true);
      expect(res.chapters).toHaveLength(2);
      expect(res.chapters[0].url).toBe('https://kingdomhoiquan.com/chap/893/');
      expect(res.chapters[0].title).toBe('Chap 893');
      expect(res.chapters[1].url).toBe('https://kingdomhoiquan.com/chap/887/');
      expect(res.chapters[1].title).toBe('Chap 887');
    });

    test('should return error if fetchHtml fails', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: false,
        error: 'Failed to connect to kingdomhoiquan.com',
      });

      const res = await kingdomHoiQuanApiClient.load('https://kingdomhoiquan.com/');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Failed to connect to kingdomhoiquan.com');
    });
  });

  describe('fetchChapterImages()', () => {
    test('should extract images from .pages img with data-src', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: SAMPLE_CHAPTER_HTML,
      });

      const images = await kingdomHoiQuanApiClient.fetchChapterImages(
        'https://kingdomhoiquan.com/chap/887/',
        'https://kingdomhoiquan.com/',
      );

      expect(images).toHaveLength(3);
      expect(images[0]).toEqual({
        imageUrl: 'https://kingdomhoiquan.com/wp-content/uploads/kq/887/01.webp',
        ext: 'webp',
      });
      expect(images[1]).toEqual({
        imageUrl: 'https://kingdomhoiquan.com/wp-content/uploads/kq/887/02.webp',
        ext: 'webp',
      });
      expect(images[2]).toEqual({
        imageUrl: 'https://kingdomhoiquan.com/wp-content/uploads/kq/887/03.jpg',
        ext: 'jpg',
      });
    });

    test('should throw error when chapter HTML fails to load', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: false,
        error: '404 Not Found',
      });

      await expect(
        kingdomHoiQuanApiClient.fetchChapterImages('https://kingdomhoiquan.com/chap/9999/'),
      ).rejects.toThrow('404 Not Found');
    });
  });
});
