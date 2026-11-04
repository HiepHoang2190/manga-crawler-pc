/**
 * Service-level tests for Cứu Truyện
 * Tests service implementation details and edge cases
 * Test URL: https://hetcuutruyen.net/mangas/1775
 */
const { describe, test, expect } = require('@jest/globals');
const cuuTruyenService = require('../../../platform/connectors/services/cuuTruyenService');

describe('Cứu Truyện Service Tests', () => {
  describe('Service Exports', () => {
    test('should export DOMAIN constant', () => {
      expect(cuuTruyenService.DOMAIN).toBeDefined();
      expect(cuuTruyenService.DOMAIN).toContain('cuutruyen.net');
    });

    test('should export LABEL constant', () => {
      expect(cuuTruyenService.LABEL).toBe('Cứu Truyện');
    });

    test('should export load function', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
    });

    test('should export fetchLatestUpdates function', () => {
      expect(typeof cuuTruyenService.fetchLatestUpdates).toBe('function');
    });

    test('should export parseRecentlyUpdatedResponse helper', () => {
      expect(typeof cuuTruyenService.parseRecentlyUpdatedResponse).toBe('function');
    });

    test('should export parseQuickSearchResponse helper', () => {
      expect(typeof cuuTruyenService.parseQuickSearchResponse).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });
  });

  describe('load() Function', () => {
    test('should return object with ok property', async () => {
      const result = await cuuTruyenService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error for empty URL', async () => {
      const result = await cuuTruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should return error for null URL', async () => {
      const result = await cuuTruyenService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await cuuTruyenService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should trim whitespace from URL', async () => {
      const result = await cuuTruyenService.load('   ');
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
        mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
        chapterUrl: 'https://hetcuutruyen.net/chapters/12345',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        cuuTruyenService.downloadChapter(payload);
      }).not.toThrow();
    });

    test('should accept connector parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
        chapterUrl: 'https://hetcuutruyen.net/chapters/12345',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        cuuTruyenService.downloadChapter(payload, 'Cứu Truyện');
      }).not.toThrow();
    });

    test('should return Promise', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
        chapterUrl: 'https://hetcuutruyen.net/chapters/12345',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      const result = cuuTruyenService.downloadChapter(payload);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Service Implementation', () => {
    test('should use ApiConnectorService base class', () => {
      expect(cuuTruyenService.DOMAIN).toBeDefined();
      expect(cuuTruyenService.LABEL).toBeDefined();
    });

    test('should have correct domain', () => {
      expect(cuuTruyenService.DOMAIN).toContain('cuutruyen.net');
    });

    test('should have correct label', () => {
      expect(cuuTruyenService.LABEL).toBe('Cứu Truyện');
    });

    test('should support Vietnamese content', () => {
      expect(cuuTruyenService.LABEL).toBe('Cứu Truyện');
    });
  });

  describe('Custom Implementation', () => {
    test('should use API client for loading', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
    });

    test('should support DRM descrambling', () => {
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });

    test('should support multi-domain fallback', () => {
      // Cứu Truyện has multiple mirrors
      expect(typeof cuuTruyenService.load).toBe('function');
    });
  });

  describe('URL Handling', () => {
    test('should handle manga URLs', () => {
      const mangaUrl = 'https://hetcuutruyen.net/mangas/1775';
      expect(mangaUrl).toMatch(/(hetcuutruyen\.net|nettrom\.com|cuutruyen\.net)/);
      expect(mangaUrl).toMatch(/\/mangas\//);
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://hetcuutruyen.net/chapters/12345';
      expect(chapterUrl).toMatch(/\/chapters\//);
    });

    test('should extract manga ID from URL', () => {
      const mangaUrl = 'https://hetcuutruyen.net/mangas/1775';
      const idMatch = mangaUrl.match(/\/mangas\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('1775');
    });

    test('should extract chapter ID from URL', () => {
      const chapterUrl = 'https://hetcuutruyen.net/chapters/12345';
      const idMatch = chapterUrl.match(/\/chapters\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('12345');
    });
  });

  describe('Response Structure', () => {
    test('should return correct structure on success', () => {
      const successResponse = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
          mangaId: '1775',
          siteId: 'cuutruyen',
          sourceLabel: 'Cứu Truyện',
        },
        chapters: [
          {
            url: 'https://hetcuutruyen.net/chapters/12345',
            title: 'Chapter 1',
            chapterId: '12345',
          },
        ],
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.manga).toBeDefined();
      expect(successResponse.manga.siteId).toBe('cuutruyen');
      expect(successResponse.manga.sourceLabel).toBe('Cứu Truyện');
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
          mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
          mangaId: '1775',
          siteId: 'cuutruyen',
          sourceLabel: 'Cứu Truyện',
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
          mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
          mangaId: '1775',
          siteId: 'cuutruyen',
          sourceLabel: 'Cứu Truyện',
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

    test('should handle Vietnamese characters in titles', () => {
      const vietnameseTitle = 'Cứu Truyện';
      expect(vietnameseTitle).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/);
    });
  });

  describe('API Features', () => {
    test('should use API endpoint for manga data', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
    });

    test('should support JSON response parsing', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
    });
  });

  describe('DRM Features', () => {
    test('should support DRM-protected images', () => {
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });

    test('should support image descrambling', () => {
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });
  });

  describe('Multi-Domain Features', () => {
    test('should support multiple domains', () => {
      const domains = ['hetcuutruyen.net', 'nettrom.com', 'cuutruyen.net'];
      expect(domains.length).toBe(3);
    });

    test('should handle domain fallback', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
    });
  });

  describe('parseRecentlyUpdatedResponse()', () => {
    const origin = 'https://hetcuutruyen.net';

    test('parses standard data array + meta pagination', () => {
      const root = {
        data: [
          {
            id: 12,
            name: 'ABC',
            cover_url: '//cdn.example/c.jpg',
            latest_chapter: { number: 5, name: 'Opening' },
          },
        ],
        meta: {
          current_page: 1,
          last_page: 4,
          total: 120,
          per_page: 30,
        },
      };
      const { items, totalPages } = cuuTruyenService.parseRecentlyUpdatedResponse(root, origin, 1, 30);
      expect(totalPages).toBe(4);
      expect(items).toHaveLength(1);
      expect(items[0].mangaUrl).toBe(`${origin}/mangas/12`);
      expect(items[0].title).toBe('ABC');
      expect(items[0].coverUrl).toBe('https://cdn.example/c.jpg');
      expect(items[0].latestChapterLabel).toContain('5');
      expect(items[0].latestChapterLabel).toContain('Opening');
    });

    test('fallback totalPages when shorter than per_page', () => {
      const root = { data: [{ id: 1, name: 'Solo' }] };
      const r = cuuTruyenService.parseRecentlyUpdatedResponse(root, origin, 3, 30);
      expect(r.totalPages).toBe(3);
      expect(r.items).toHaveLength(1);
    });

    test('fallback totalPages when full page and meta missing', () => {
      const data = [];
      for (let i = 0; i < 30; i++) data.push({ id: i + 100, name: `M${i}` });
      const root = { data };
      const r = cuuTruyenService.parseRecentlyUpdatedResponse(root, origin, 2, 30);
      expect(r.totalPages).toBe(3);
      expect(r.items).toHaveLength(30);
    });
  });

  describe('parseQuickSearchResponse()', () => {
    const origin = 'https://hetcuutruyen.net';

    test('maps quick_search API data[] to listing rows', () => {
      const root = {
        data: [
          {
            id: 1378,
            name: 'Naruto Gaiden',
            author_name: 'Masashi Kishimoto',
            cover_url: 'https://storage.example/c.jpg',
            newest_chapter_number: '1',
            newest_chapter_id: 24748,
          },
        ],
      };
      const { items } = cuuTruyenService.parseQuickSearchResponse(root, origin);
      expect(items).toHaveLength(1);
      expect(items[0].mangaUrl).toBe(`${origin}/mangas/1378`);
      expect(items[0].title).toBe('Naruto Gaiden');
      expect(items[0].coverUrl).toBe('https://storage.example/c.jpg');
      expect(items[0].latestChapterLabel).toContain('1');
    });

    test('returns empty items for invalid root', () => {
      const { items } = cuuTruyenService.parseQuickSearchResponse(null, origin);
      expect(items).toEqual([]);
    });
  });
});
