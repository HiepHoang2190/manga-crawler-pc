/**
 * Error Handling Tests for HtmlConnectorService
 * 
 * Tests network failures, invalid URLs, malformed HTML,
 * and error recovery for HTML-based connectors.
 * 
 * **Validates: Requirements AC 6.1 (Error Scenarios Testing)**
 */

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

describe('HtmlConnectorService - Error Handling', () => {
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

  describe('Network Failure Scenarios in load()', () => {
    it('should handle timeout errors', async () => {
      fetchHtml.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle connection refused', async () => {
      fetchHtml.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle DNS errors', async () => {
      fetchHtml.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle SSL/TLS errors', async () => {
      fetchHtml.mockRejectedValue(new Error('CERT_HAS_EXPIRED'));

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle network reset', async () => {
      fetchHtml.mockRejectedValue(new Error('ECONNRESET'));

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('Invalid URL Scenarios', () => {
    it('should handle empty URL', async () => {
      const result = await service.load('');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
      expect(fetchHtml).not.toHaveBeenCalled();
    });

    it('should handle null URL', async () => {
      const result = await service.load(null);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });

    it('should handle undefined URL', async () => {
      const result = await service.load(undefined);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });

    it('should handle whitespace-only URL', async () => {
      const result = await service.load('   ');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });

    it('should handle malformed URL', async () => {
      fetchHtml.mockRejectedValue(new Error('Invalid URL'));

      const result = await service.load('not-a-valid-url');

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle 404 Not Found', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'HTTP 404 Not Found',
      });

      const result = await service.load('https://example.com/nonexistent');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('404');
    });

    it('should handle 403 Forbidden', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'HTTP 403 Forbidden',
      });

      const result = await service.load('https://example.com/forbidden');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('403');
    });

    it('should handle 500 Internal Server Error', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'HTTP 500 Internal Server Error',
      });

      const result = await service.load('https://example.com/error');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should handle 503 Service Unavailable', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'HTTP 503 Service Unavailable',
      });

      const result = await service.load('https://example.com/unavailable');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('503');
    });
  });

  describe('Malformed HTML Scenarios', () => {
    it('should handle missing title in HTML', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body>No title here</body></html>',
      });

      parseMangaPage.mockReturnValue({
        title: '',
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Không đọc được tên truyện.');
    });

    it('should handle null title', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body>Content</body></html>',
      });

      parseMangaPage.mockReturnValue({
        title: null,
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Không đọc được tên truyện.');
    });

    it('should handle empty HTML', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '',
      });

      parseMangaPage.mockReturnValue({
        title: '',
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
    });

    it('should handle malformed HTML structure', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body><div>Broken HTML',
      });

      parseMangaPage.mockReturnValue({
        title: '',
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(false);
    });

    it('should succeed with valid title even if chapters are empty', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body><h1>Valid Title</h1></body></html>',
      });

      parseMangaPage.mockReturnValue({
        title: 'Valid Title',
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(true);
      expect(result.manga.title).toBe('Valid Title');
      expect(result.chapters).toEqual([]);
    });
  });

  describe('fetchChapterImages() Error Scenarios', () => {
    it('should throw error on network failure', async () => {
      fetchHtml.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        service.fetchChapterImages('https://example.com/chapter1', 'https://example.com')
      ).rejects.toThrow();
    });

    it('should throw error on 404', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'HTTP 404',
      });

      await expect(
        service.fetchChapterImages('https://example.com/chapter1', 'https://example.com')
      ).rejects.toThrow('Không tải được trang chương');
    });

    it('should throw error on 500', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'HTTP 500',
      });

      await expect(
        service.fetchChapterImages('https://example.com/chapter1', 'https://example.com')
      ).rejects.toThrow('Không tải được trang chương');
    });

    it('should return empty array when no images found', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body>No images</body></html>',
      });

      collectChapterImages.mockReturnValue([]);

      const result = await service.fetchChapterImages(
        'https://example.com/chapter1',
        'https://example.com'
      );

      expect(result).toEqual([]);
    });

    it('should handle malformed image URLs', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body><img src="invalid"/></body></html>',
      });

      collectChapterImages.mockReturnValue([
        { imageUrl: 'invalid-url', ext: 'jpg' },
      ]);

      const result = await service.fetchChapterImages(
        'https://example.com/chapter1',
        'https://example.com'
      );

      // Should return the result even if URLs are invalid
      // (validation happens during download)
      expect(result).toHaveLength(1);
    });

    it('should handle parsing errors gracefully', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body>Content</body></html>',
      });

      collectChapterImages.mockImplementation(() => {
        throw new Error('Parsing error');
      });

      await expect(
        service.fetchChapterImages('https://example.com/chapter1', 'https://example.com')
      ).rejects.toThrow('Parsing error');
    });
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error for empty URL', async () => {
      const result = await service.load('');

      expect(result.error).toBe('URL trống.');
    });

    it('should provide clear error for missing title', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html></html>',
      });

      parseMangaPage.mockReturnValue({
        title: '',
        coverUrl: '',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.error).toBe('Không đọc được tên truyện.');
    });

    it('should preserve fetch error messages', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
        error: 'Custom error message',
      });

      const result = await service.load('https://example.com/manga');

      expect(result.error).toContain('Custom error message');
    });

    it('should provide default error when fetch error is missing', async () => {
      fetchHtml.mockResolvedValue({
        ok: false,
      });

      const result = await service.load('https://example.com/manga');

      expect(result.error).toBe('Không tải được trang truyện.');
    });
  });

  describe('Graceful Degradation', () => {
    it('should succeed with partial data (no cover)', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body><h1>Title</h1></body></html>',
      });

      parseMangaPage.mockReturnValue({
        title: 'Test Manga',
        coverUrl: '',
        chapters: [{ url: 'https://example.com/ch1', title: 'Chapter 1' }],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(true);
      expect(result.manga.title).toBe('Test Manga');
      expect(result.manga.coverUrl).toBe('');
    });

    it('should succeed with partial data (no chapters)', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body><h1>Title</h1></body></html>',
      });

      parseMangaPage.mockReturnValue({
        title: 'Test Manga',
        coverUrl: 'https://example.com/cover.jpg',
        chapters: [],
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(true);
      expect(result.manga.title).toBe('Test Manga');
      expect(result.chapters).toEqual([]);
    });

    it('should handle unexpected parseMangaPage return values', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html><body>Content</body></html>',
      });

      parseMangaPage.mockReturnValue({
        title: 'Test',
        // Missing coverUrl and chapters
      });

      const result = await service.load('https://example.com/manga');

      expect(result.ok).toBe(true);
      expect(result.manga.title).toBe('Test');
    });
  });

  describe('Custom User Agent Handling', () => {
    it('should use custom user agent when provided', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: '<html></html>',
      });

      parseMangaPage.mockReturnValue({
        title: 'Test',
        coverUrl: '',
        chapters: [],
      });

      await service.load('https://example.com/manga', { userAgent: 'CustomAgent/1.0' });

      expect(fetchHtml).toHaveBeenCalledWith(
        'https://example.com/manga',
        expect.objectContaining({ userAgent: 'CustomAgent/1.0' })
      );
    });

    it('should handle errors with custom user agent', async () => {
      fetchHtml.mockRejectedValue(new Error('Blocked user agent'));

      const result = await service.load('https://example.com/manga', {
        userAgent: 'BlockedAgent/1.0',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});
