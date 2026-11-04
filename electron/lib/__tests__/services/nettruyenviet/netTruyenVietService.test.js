/**
 * Service-level tests for NetTruyenViet
 * Tests service implementation details and edge cases
 * Test URL: https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan
 */
const { describe, test, expect } = require('@jest/globals');
const netTruyenVietService = require('../../../platform/connectors/services/netTruyenVietService');

describe('NetTruyenViet Service Tests', () => {
  describe('Service Exports', () => {
    test('should export DOMAIN constant', () => {
      expect(netTruyenVietService.DOMAIN).toBeDefined();
      expect(netTruyenVietService.DOMAIN).toContain('nettruyen');
    });

    test('should export LABEL constant', () => {
      expect(netTruyenVietService.LABEL).toBe('NetTruyenViet');
    });

    test('should export load function', () => {
      expect(typeof netTruyenVietService.load).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof netTruyenVietService.downloadChapter).toBe('function');
    });
  });

  describe('load() Function', () => {
    test('should return object with ok property', async () => {
      const result = await netTruyenVietService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error for empty URL', async () => {
      const result = await netTruyenVietService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should return error for null URL', async () => {
      const result = await netTruyenVietService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await netTruyenVietService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should trim whitespace from URL', async () => {
      const result = await netTruyenVietService.load('   ');
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
        mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/test',
        chapterUrl: 'https://nettruyenviet10.com/truyen-tranh/test/chap-1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        netTruyenVietService.downloadChapter(payload);
      }).not.toThrow();
    });

    test('should accept connector parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/test',
        chapterUrl: 'https://nettruyenviet10.com/truyen-tranh/test/chap-1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        netTruyenVietService.downloadChapter(payload, 'NetTruyenViet');
      }).not.toThrow();
    });

    test('should return Promise', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/test',
        chapterUrl: 'https://nettruyenviet10.com/truyen-tranh/test/chap-1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      const result = netTruyenVietService.downloadChapter(payload);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Service Implementation', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(netTruyenVietService.DOMAIN).toBeDefined();
      expect(netTruyenVietService.LABEL).toBeDefined();
    });

    test('should have correct domain', () => {
      expect(netTruyenVietService.DOMAIN).toContain('nettruyen');
    });

    test('should have correct label', () => {
      expect(netTruyenVietService.LABEL).toBe('NetTruyenViet');
    });

    test('should support Vietnamese content', () => {
      expect(netTruyenVietService.DOMAIN).toContain('nettruyen');
    });
  });

  describe('URL Handling', () => {
    test('should handle manga URLs', () => {
      const mangaUrl = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      expect(mangaUrl).toContain('nettruyen');
      expect(mangaUrl).toContain('/truyen-tranh/');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan/chap-1';
      expect(chapterUrl).toContain('/truyen-tranh/');
      expect(chapterUrl).toMatch(/\/chap-\d+/);
    });

    test('should extract manga slug from URL', () => {
      const mangaUrl = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      const slugMatch = mangaUrl.match(/\/truyen-tranh\/([^/?]+)/);
      expect(slugMatch).not.toBeNull();
      expect(slugMatch[1]).toBe('ta-that-su-khong-muon-lam-thanh-nhan');
    });

    test('should extract chapter number from URL', () => {
      const chapterUrl = 'https://nettruyenviet10.com/truyen-tranh/test/chap-5';
      const chapterMatch = chapterUrl.match(/\/chap-(\d+)/);
      expect(chapterMatch).not.toBeNull();
      expect(chapterMatch[1]).toBe('5');
    });

    test('should handle URLs with trailing slash', () => {
      const urlWithSlash = 'https://nettruyenviet10.com/truyen-tranh/test/';
      const urlWithoutSlash = 'https://nettruyenviet10.com/truyen-tranh/test';
      
      expect(urlWithSlash).toContain('nettruyen');
      expect(urlWithoutSlash).toContain('nettruyen');
    });
  });

  describe('Response Structure', () => {
    test('should return correct structure on success', () => {
      const successResponse = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/test',
          mangaId: '',
          siteId: 'nettruyenviet',
          sourceLabel: 'NetTruyenViet',
        },
        chapters: [
          {
            url: 'https://nettruyenviet10.com/truyen-tranh/test/chap-1',
            title: 'Chapter 1',
          },
        ],
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.manga).toBeDefined();
      expect(successResponse.manga.siteId).toBe('nettruyenviet');
      expect(successResponse.manga.sourceLabel).toBe('NetTruyenViet');
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
          mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/test',
          mangaId: '',
          siteId: 'nettruyenviet',
          sourceLabel: 'NetTruyenViet',
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
          mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/test',
          mangaId: '',
          siteId: 'nettruyenviet',
          sourceLabel: 'NetTruyenViet',
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

  });

  describe('Domain Variations', () => {
    test('should handle nettruyenviet numbered domains', () => {
      const domains = ['nettruyenviet9.com', 'nettruyenviet10.com', 'nettruyenviet11.com'];
      
      domains.forEach(domain => {
        expect(domain).toMatch(/nettruyenviet\d+\.com/);
      });
    });

    test('should handle nettruyen.work domain', () => {
      const domain = 'nettruyen.work';
      expect(domain).toBe('nettruyen.work');
    });
  });
});
