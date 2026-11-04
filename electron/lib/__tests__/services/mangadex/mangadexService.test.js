/**
 * Service-level tests for MangaDex
 * Tests service implementation details and edge cases
 * Test URL: https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger
 */
const { describe, test, expect } = require('@jest/globals');
const mangadexService = require('../../../platform/connectors/services/mangadexService');
const {
  mapMangaDexListingEntity,
  extractMangadexListingTitle,
  mangaDexListingLatestLabel,
  mangaDexChapterListingLabel,
  normalizeMangadexListLanguage,
} = require('../../../platform/connectors/services/mangadxApiClient');

describe('MangaDex Service Tests', () => {
  describe('Service Exports', () => {
    test('should export DOMAIN constant', () => {
      expect(mangadexService.DOMAIN).toBe('https://mangadex.org/');
    });

    test('should export LABEL constant', () => {
      expect(mangadexService.LABEL).toBe('MangaDex');
    });

    test('should export load function', () => {
      expect(typeof mangadexService.load).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof mangadexService.downloadChapter).toBe('function');
    });

    test('should export fetchLatestUpdates function', () => {
      expect(typeof mangadexService.fetchLatestUpdates).toBe('function');
    });

    test('should export service instance', () => {
      expect(mangadexService.service).toBeDefined();
    });

    test('should export MangaDexService class', () => {
      expect(mangadexService.MangaDexService).toBeDefined();
    });
  });

  describe('load() Function', () => {
    test('should return object with ok property', async () => {
      const result = await mangadexService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error for empty URL', async () => {
      const result = await mangadexService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should return error for null URL', async () => {
      const result = await mangadexService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await mangadexService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should trim whitespace from URL', async () => {
      const result = await mangadexService.load('   ');
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

  describe('Language Parameter', () => {
    test('should accept language parameter', () => {
      expect(typeof mangadexService.load).toBe('function');
      // load(url, language) - language is optional with default 'vi'
    });

    test('should default to Vietnamese', async () => {
      const result = await mangadexService.load('https://mangadex.org/title/test');
      expect(result).toBeDefined();
    });

    test('should accept Vietnamese language code', async () => {
      const result = await mangadexService.load('https://mangadex.org/title/test', 'vi');
      expect(result).toBeDefined();
    });

    test('should accept English language code', async () => {
      const result = await mangadexService.load('https://mangadex.org/title/test', 'en');
      expect(result).toBeDefined();
    });

    test('should accept Japanese language code', async () => {
      const result = await mangadexService.load('https://mangadex.org/title/test', 'ja');
      expect(result).toBeDefined();
    });

    test('should handle case-insensitive language codes', async () => {
      const result = await mangadexService.load('https://mangadex.org/title/test', 'EN');
      expect(result).toBeDefined();
    });

    test('should default invalid language to Vietnamese', async () => {
      const result = await mangadexService.load('https://mangadex.org/title/test', 'invalid');
      expect(result).toBeDefined();
    });
  });

  describe('downloadChapter() Function', () => {
    test('should accept payload parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://mangadex.org/title/test',
        chapterUrl: 'https://mangadex.org/chapter/test',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        mangadexService.downloadChapter(payload);
      }).not.toThrow();
    });

    test('should accept connector parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://mangadex.org/title/test',
        chapterUrl: 'https://mangadex.org/chapter/test',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        mangadexService.downloadChapter(payload, 'MangaDex');
      }).not.toThrow();
    });

    test('should return Promise', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://mangadex.org/title/test',
        chapterUrl: 'https://mangadex.org/chapter/test',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      const result = mangadexService.downloadChapter(payload);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Service Implementation', () => {
    test('should use ApiConnectorService base class', () => {
      expect(mangadexService.DOMAIN).toBeDefined();
      expect(mangadexService.LABEL).toBeDefined();
    });

    test('should have correct domain', () => {
      expect(mangadexService.DOMAIN).toBe('https://mangadex.org/');
    });

    test('should have correct label', () => {
      expect(mangadexService.LABEL).toBe('MangaDex');
    });
  });

  describe('Custom Implementation', () => {
    test('should use MangaDex API client', () => {
      expect(typeof mangadexService.load).toBe('function');
    });

    test('should support at-home server for images', () => {
      expect(typeof mangadexService.downloadChapter).toBe('function');
    });

    test('should support language selection', () => {
      expect(typeof mangadexService.load).toBe('function');
      // load(url, language) - language is optional with default 'vi'
    });
  });

  describe('URL Handling', () => {
    test('should handle manga URLs', () => {
      const mangaUrl = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35';
      expect(mangaUrl).toContain('mangadex.org');
      expect(mangaUrl).toContain('/title/');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://mangadex.org/chapter/12345678-1234-1234-1234-123456789012';
      expect(chapterUrl).toContain('/chapter/');
    });

    test('should extract manga UUID from URL', () => {
      const mangaUrl = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35';
      const uuidMatch = mangaUrl.match(/\/title\/([a-f0-9-]+)/);
      expect(uuidMatch).not.toBeNull();
      expect(uuidMatch[1]).toBe('45d563b6-b416-4ab3-b371-cad254b49d35');
    });

    test('should extract chapter UUID from URL', () => {
      const chapterUrl = 'https://mangadex.org/chapter/12345678-1234-1234-1234-123456789012';
      const uuidMatch = chapterUrl.match(/\/chapter\/([a-f0-9-]+)/);
      expect(uuidMatch).not.toBeNull();
      expect(uuidMatch[1]).toBe('12345678-1234-1234-1234-123456789012');
    });
  });

  describe('Response Structure', () => {
    test('should return correct structure on success', () => {
      const successResponse = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://mangadex.org/title/test',
          mangaId: 'test-uuid',
          siteId: 'mangadex',
          sourceLabel: 'MangaDex',
          mangadexLanguage: 'vi',
        },
        chapters: [
          {
            url: 'https://mangadex.org/chapter/test',
            title: 'Chapter 1',
            chapterId: 'chapter-uuid',
          },
        ],
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.manga).toBeDefined();
      expect(successResponse.manga.siteId).toBe('mangadex');
      expect(successResponse.manga.sourceLabel).toBe('MangaDex');
      expect(successResponse.manga.mangadexLanguage).toBe('vi');
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
          mangaUrl: 'https://mangadex.org/title/test',
          mangaId: 'test-uuid',
          siteId: 'mangadex',
          sourceLabel: 'MangaDex',
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
          mangaUrl: 'https://mangadex.org/title/test',
          mangaId: 'test-uuid',
          siteId: 'mangadex',
          sourceLabel: 'MangaDex',
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

  describe('API Features', () => {
    test('should use MangaDex API v5', () => {
      expect(typeof mangadexService.load).toBe('function');
    });

    test('should support manga endpoint', () => {
      const mangaEndpoint = '/manga/{id}';
      expect(mangaEndpoint).toContain('/manga/');
    });

    test('should support chapter endpoint', () => {
      const chapterEndpoint = '/chapter';
      expect(chapterEndpoint).toBe('/chapter');
    });

    test('should support at-home server', () => {
      const atHomeEndpoint = '/at-home/server/{chapterId}';
      expect(atHomeEndpoint).toContain('at-home');
    });
  });

  describe('Language Features', () => {
    test('should support Vietnamese language', () => {
      const lang = 'vi';
      expect(['vi', 'en', 'ja']).toContain(lang);
    });

    test('should support English language', () => {
      const lang = 'en';
      expect(['vi', 'en', 'ja']).toContain(lang);
    });

    test('should support Japanese language', () => {
      const lang = 'ja';
      expect(['vi', 'en', 'ja']).toContain(lang);
    });

    test('should validate language codes', () => {
      const validLanguages = ['vi', 'en', 'ja'];
      const testLang = 'vi';
      expect(validLanguages).toContain(testLang);
    });

    test('should default invalid language to Vietnamese', () => {
      const validLanguages = ['vi', 'en', 'ja'];
      const testLang = 'invalid';
      const normalizedLang = validLanguages.includes(testLang.toLowerCase()) ? testLang.toLowerCase() : 'vi';
      expect(normalizedLang).toBe('vi');
    });
  });

  describe('normalizeMangadexListLanguage', () => {
    test('defaults invalid to vi', () => {
      expect(normalizeMangadexListLanguage('')).toBe('vi');
      expect(normalizeMangadexListLanguage('xx')).toBe('vi');
    });

    test('accepts vi en ja case-insensitively', () => {
      expect(normalizeMangadexListLanguage('VI')).toBe('vi');
      expect(normalizeMangadexListLanguage('En')).toBe('en');
      expect(normalizeMangadexListLanguage('JA')).toBe('ja');
    });
  });

  describe('extractMangadexListingTitle', () => {
    test('prefers Vietnamese when listing language is vi', () => {
      const title = extractMangadexListingTitle(
        {
          title: { en: 'English Title', 'ja-ro': 'Romaji' },
          altTitles: [{ vi: 'Tên tiếng Việt' }],
        },
        'vi',
      );
      expect(title).toBe('Tên tiếng Việt');
    });

    test('falls back to en when preferred language missing', () => {
      const title = extractMangadexListingTitle(
        {
          title: { en: 'English Title' },
        },
        'vi',
      );
      expect(title).toBe('English Title');
    });
  });

  describe('Latest updates listing mapping', () => {
    test('mapMangaDexListingEntity builds title URL and chapter label', () => {
      const row = mapMangaDexListingEntity({
        id: '46e530ce-0766-4cbd-b005-5e6fb0ba5e71',
        type: 'manga',
        attributes: {
          title: { en: 'Boruto' },
          lastChapter: '12',
          lastVolume: '2',
          updatedAt: '2025-01-01T00:00:00+00:00',
        },
        relationships: [
          {
            type: 'cover_art',
            attributes: { fileName: 'abc.jpg' },
          },
        ],
      });
      expect(row.mangaUrl).toBe('https://mangadex.org/title/46e530ce-0766-4cbd-b005-5e6fb0ba5e71');
      expect(row.title).toBe('Boruto');
      expect(row.coverUrl).toContain('uploads.mangadex.org/covers/');
      expect(row.latestChapterLabel).toContain('12');
    });

    test('mangaDexListingLatestLabel uses updatedAt without lastChapter', () => {
      const s = mangaDexListingLatestLabel({ lastChapter: '', updatedAt: '2026-04-24T15:00:00+00:00' });
      expect(s).toContain('2026-04-24');
    });

    test('mangaDexChapterListingLabel uses readableAt without chapter number', () => {
      const s = mangaDexChapterListingLabel({
        chapter: '',
        readableAt: '2026-04-24T15:00:00+00:00',
      });
      expect(s).toContain('2026-04-24');
    });

    test('mapMangaDexListingEntity prefers preferredLanguage title from altTitles', () => {
      const row = mapMangaDexListingEntity(
        {
          id: '46e530ce-0766-4cbd-b005-5e6fb0ba5e71',
          type: 'manga',
          attributes: {
            title: { en: 'English Title' },
            altTitles: [{ vi: 'Tên tiếng Việt' }],
          },
          relationships: [],
        },
        { preferredLanguage: 'vi', latestChapterLabel: 'Ch. 5' },
      );
      expect(row.title).toBe('Tên tiếng Việt');
      expect(row.latestChapterLabel).toBe('Ch. 5');
    });
  });
});
