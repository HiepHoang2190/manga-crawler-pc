const { describe, it, expect, beforeEach } = require('@jest/globals');
const { HtmlConnectorService } = require('../../platform/connectors/base/HtmlConnectorService');

jest.mock('../../download/connector/htmlConnectorUtils', () => ({
  USER_AGENT_JSOUP: 'MockUserAgent',
  fetchHtml: jest.fn(),
  parseMangaPage: jest.fn(),
  collectChapterImages: jest.fn(),
}));

jest.mock('../../platform/cookies/cookieManager', () => ({
  getEffectiveCookie: jest.fn(() => ''),
}));

const { fetchHtml, parseMangaPage, collectChapterImages } = require('../../download/connector/htmlConnectorUtils');
const cookieManager = require('../../platform/cookies/cookieManager');

describe('HtmlConnectorService', () => {
  let service;
  const mockConfig = {
    domain: 'https://example.com/',
    label: 'TestSite',
    siteId: 'testsite',
    selectors: {
      chapterLinks: 'a.chapter',
      title: 'h1.title',
      cover: 'img.cover',
    },
  };

  beforeEach(() => {
    service = new HtmlConnectorService(mockConfig);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should require selectors in config', () => {
      expect(() => new HtmlConnectorService({ domain: 'test', label: 'Test', siteId: 'test' })).toThrow(
        'HtmlConnectorService requires config.selectors'
      );
    });

    it('should store config with selectors', () => {
      expect(service.config.selectors).toEqual(mockConfig.selectors);
    });
  });

  describe('load', () => {
    it('should return error for empty URL', async () => {
      const result = await service.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });

    it('should fetch HTML and parse manga page', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: '<html><body>Test</body></html>',
      });

      parseMangaPage.mockReturnValueOnce({
        title: 'Test Manga',
        coverUrl: 'https://example.com/cover.jpg',
        chapters: [{ url: 'https://example.com/ch1', title: 'Chapter 1' }],
      });

      const result = await service.load('https://example.com/manga');

      expect(fetchHtml).toHaveBeenCalledWith('https://example.com/manga', expect.any(Object));
      expect(parseMangaPage).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.manga.title).toBe('Test Manga');
      expect(result.manga.siteId).toBe('testsite');
      expect(result.chapters).toHaveLength(1);
    });

    it('should handle fetch errors', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: false,
        error: 'HTTP 404',
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('404');
    });

    it('should handle missing title', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: '<html><body>Test</body></html>',
      });

      parseMangaPage.mockReturnValueOnce({
        title: '',
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Không đọc được tên truyện.');
    });

    it('should use custom user agent if provided', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: '<html></html>',
      });

      parseMangaPage.mockReturnValueOnce({
        title: 'Test',
        coverUrl: '',
        chapters: [],
      });

      await service.load('https://example.com/manga', { userAgent: 'CustomAgent' });

      expect(fetchHtml).toHaveBeenCalledWith(
        'https://example.com/manga',
        expect.objectContaining({ userAgent: 'CustomAgent' })
      );
    });

    it('should forward effective user cookie to fetchHtml when set', async () => {
      cookieManager.getEffectiveCookie.mockReturnValueOnce('session=abc');
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: '<html></html>',
      });

      parseMangaPage.mockReturnValueOnce({
        title: 'Test',
        coverUrl: '',
        chapters: [],
      });

      await service.load('https://example.com/manga');

      expect(fetchHtml).toHaveBeenCalledWith(
        'https://example.com/manga',
        expect.objectContaining({ userAgent: 'MockUserAgent', cookie: 'session=abc' }),
      );
    });
  });

  describe('fetchChapterImages', () => {
    it('should fetch HTML and collect images', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: '<html><body><img src="1.jpg"/></body></html>',
      });

      collectChapterImages.mockReturnValueOnce([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
      ]);

      const result = await service.fetchChapterImages(
        'https://example.com/chapter1',
        'https://example.com'
      );

      expect(fetchHtml).toHaveBeenCalledWith('https://example.com/chapter1', {
        referer: 'https://example.com',
      });
      expect(collectChapterImages).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].imageUrl).toBe('https://example.com/1.jpg');
    });

    it('should throw error if fetch fails', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: false,
        error: 'HTTP 404',
      });

      await expect(
        service.fetchChapterImages('https://example.com/chapter1', 'https://example.com')
      ).rejects.toThrow('Không tải được trang chương');
    });

    it('should return empty array if no images found', async () => {
      fetchHtml.mockResolvedValueOnce({
        ok: true,
        html: '<html><body>No images</body></html>',
      });

      collectChapterImages.mockReturnValueOnce([]);

      const result = await service.fetchChapterImages(
        'https://example.com/chapter1',
        'https://example.com'
      );

      expect(result).toEqual([]);
    });
  });
});
