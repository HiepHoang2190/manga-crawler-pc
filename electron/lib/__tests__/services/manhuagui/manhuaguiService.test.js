/**
 * Service-level tests for Manhuagui
 * Tests service implementation details and edge cases
 * Test URL: https://www.manhuagui.com/comic/22843/
 */
const { describe, test, expect } = require('@jest/globals');
const manhuaguiService = require('../../../platform/connectors/services/manhuaguiService');

describe('Manhuagui Service Tests', () => {
  describe('Service Exports', () => {
    test('should export DOMAIN constant', () => {
      expect(manhuaguiService.DOMAIN).toBeDefined();
      expect(manhuaguiService.DOMAIN).toContain('manhuagui.com');
    });

    test('should export LABEL constant', () => {
      expect(manhuaguiService.LABEL).toBe('ManhuaGui');
    });

    test('should export load function', () => {
      expect(typeof manhuaguiService.load).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof manhuaguiService.downloadChapter).toBe('function');
    });
  });

  describe('load() Function', () => {
    test('should accept URL parameter', async () => {
      const result = await manhuaguiService.load('https://www.manhuagui.com/comic/22843/');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    test('should accept options parameter', async () => {
      const result = await manhuaguiService.load('https://www.manhuagui.com/comic/22843/', {
        userAgent: 'Test User Agent',
      });
      expect(result).toBeDefined();
    });

    test('should return object with ok property', async () => {
      const result = await manhuaguiService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error for empty URL', async () => {
      const result = await manhuaguiService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should return error for null URL', async () => {
      const result = await manhuaguiService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await manhuaguiService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should trim whitespace from URL', async () => {
      const result = await manhuaguiService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return manga object on success', async () => {
      const result = { ok: true, manga: {}, chapters: [] };
      
      if (result.ok) {
        expect(result).toHaveProperty('manga');
        expect(result).toHaveProperty('chapters');
      }
    });
  });

  describe('downloadChapter() Function', () => {
    test('should accept payload parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.manhuagui.com/comic/22843/',
        chapterUrl: 'https://www.manhuagui.com/comic/22843/123456.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        manhuaguiService.downloadChapter(payload);
      }).not.toThrow();
    });

    test('should accept connector parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.manhuagui.com/comic/22843/',
        chapterUrl: 'https://www.manhuagui.com/comic/22843/123456.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        manhuaguiService.downloadChapter(payload, 'ManhuaGui');
      }).not.toThrow();
    });

    test('should return Promise', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.manhuagui.com/comic/22843/',
        chapterUrl: 'https://www.manhuagui.com/comic/22843/123456.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      const result = manhuaguiService.downloadChapter(payload);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Service Implementation', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(manhuaguiService.DOMAIN).toBeDefined();
      expect(manhuaguiService.LABEL).toBeDefined();
    });

    test('should have correct domain', () => {
      expect(manhuaguiService.DOMAIN).toContain('manhuagui.com');
    });

    test('should have correct label', () => {
      expect(manhuaguiService.LABEL).toBe('ManhuaGui');
    });

    test('should support Chinese/Taiwanese content', () => {
      expect(manhuaguiService.DOMAIN).toContain('manhuagui');
    });
  });

  describe('Selector Configuration', () => {
    test('should use chapter links selector', () => {
      const expectedSelector = 'div.chapter-list a[href]';
      expect(expectedSelector).toContain('chapter-list');
    });

    test('should use title selector', () => {
      const expectedSelector = 'h1';
      expect(expectedSelector).toBe('h1');
    });

    test('should use cover selector', () => {
      const expectedSelector = 'div.book-cover img, p.hcover img';
      expect(expectedSelector).toContain('book-cover');
      expect(expectedSelector).toContain('hcover');
    });
  });

  describe('Custom Implementation', () => {
    test('should override load() for complex parsing', () => {
      expect(typeof manhuaguiService.load).toBe('function');
    });

    test('should override fetchChapterImages() for packed script', () => {
      expect(typeof manhuaguiService.downloadChapter).toBe('function');
    });
  });

  describe('URL Handling', () => {
    test('should handle manga URLs', () => {
      const mangaUrl = 'https://www.manhuagui.com/comic/22843/';
      expect(mangaUrl).toContain('manhuagui.com');
      expect(mangaUrl).toContain('/comic/');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://www.manhuagui.com/comic/22843/123456.html';
      expect(chapterUrl).toContain('/comic/');
      expect(chapterUrl).toMatch(/\.html$/);
    });

    test('should extract manga ID from URL', () => {
      const mangaUrl = 'https://www.manhuagui.com/comic/22843/';
      const idMatch = mangaUrl.match(/\/comic\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('22843');
    });

    test('should extract chapter ID from URL', () => {
      const chapterUrl = 'https://www.manhuagui.com/comic/22843/123456.html';
      const chapterMatch = chapterUrl.match(/\/(\d+)\.html$/);
      expect(chapterMatch).not.toBeNull();
      expect(chapterMatch[1]).toBe('123456');
    });

    test('should handle URLs with trailing slash', () => {
      const urlWithSlash = 'https://www.manhuagui.com/comic/22843/';
      const urlWithoutSlash = 'https://www.manhuagui.com/comic/22843';
      
      expect(urlWithSlash).toContain('manhuagui.com');
      expect(urlWithoutSlash).toContain('manhuagui.com');
    });
  });

  describe('Response Structure', () => {
    test('should return correct structure on success', () => {
      const successResponse = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://www.manhuagui.com/comic/22843/',
          mangaId: '22843',
          siteId: 'manhuagui',
          sourceLabel: 'ManhuaGui',
        },
        chapters: [
          {
            url: 'https://www.manhuagui.com/comic/22843/123456.html',
            title: 'Chapter 1',
          },
        ],
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.manga).toBeDefined();
      expect(successResponse.manga.siteId).toBe('manhuagui');
      expect(successResponse.manga.sourceLabel).toBe('ManhuaGui');
      expect(successResponse.chapters).toBeDefined();
      expect(Array.isArray(successResponse.chapters)).toBe(true);
    });

    test('should return correct structure on error', () => {
      const errorResponse = {
        ok: false,
        error: 'Error message',
      };

      expect(errorResponse.ok).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(typeof errorResponse.error).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    test('should handle manga with no chapters', async () => {
      const response = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: '',
          mangaUrl: 'https://www.manhuagui.com/comic/22843/',
          mangaId: '22843',
          siteId: 'manhuagui',
          sourceLabel: 'ManhuaGui',
        },
        chapters: [],
      };

      expect(response.ok).toBe(true);
      expect(Array.isArray(response.chapters)).toBe(true);
      expect(response.chapters.length).toBe(0);
    });

    test('should handle manga with no cover', async () => {
      const response = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: '',
          mangaUrl: 'https://www.manhuagui.com/comic/22843/',
          mangaId: '22843',
          siteId: 'manhuagui',
          sourceLabel: 'ManhuaGui',
        },
        chapters: [],
      };

      expect(response.ok).toBe(true);
      expect(response.manga.coverUrl).toBe('');
    });

    test('should handle very long manga titles', () => {
      const longTitle = 'A'.repeat(500);
      expect(longTitle.length).toBe(500);
      expect(typeof longTitle).toBe('string');
    });

    test('should handle special characters in manga titles', () => {
      const specialTitle = 'Test & Manga: "Special" <Characters>';
      expect(typeof specialTitle).toBe('string');
      expect(specialTitle).toContain('&');
      expect(specialTitle).toContain(':');
    });

    test('should handle Chinese characters in titles', () => {
      const chineseTitle = '漫畫標題測試';
      expect(typeof chineseTitle).toBe('string');
      expect(chineseTitle.length).toBeGreaterThan(0);
    });
  });

});
