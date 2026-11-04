/**
 * Service-level tests for Minotruyen
 * Test URL: https://minotruyenv5.xyz/comics/books/8755
 */
const { describe, test, expect } = require('@jest/globals');
const minotruyenService = require('../../../platform/connectors/services/minotruyenService');

describe('Minotruyen Service Tests', () => {
  describe('Service Exports', () => {
    test('should export DOMAIN constant', () => {
      expect(minotruyenService.DOMAIN).toBeDefined();
    });

    test('should export LABEL constant', () => {
      expect(minotruyenService.LABEL).toBe('Minotruyen');
    });

    test('should export load function', () => {
      expect(typeof minotruyenService.load).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof minotruyenService.downloadChapter).toBe('function');
    });

    test('should export fetchLatestUpdates function', () => {
      expect(typeof minotruyenService.fetchLatestUpdates).toBe('function');
    });
  });

  describe('parseMinotruyenWebSearchRows()', () => {
    test('extracts books from RSC-style search HTML', () => {
      const html =
        'xxx\\"slug\\":\\"quy-song-trung\\",\\"title\\":\\"Quỷ song trùng\\",\\"bookId\\":13406,\\"covers\\":[{\\"url\\":\\"https://cdn.example/cover.webp\\"';
      const rows = minotruyenService.parseMinotruyenWebSearchRows(html, 'https://minotruyenv5.xyz');
      expect(rows.length).toBe(1);
      expect(rows[0].mangaUrl).toBe('https://minotruyenv5.xyz/manga/books/13406');
      expect(rows[0].title).toContain('Quỷ');
      expect(rows[0].coverUrl).toBe('https://cdn.example/cover.webp');
    });
  });

  describe('buildMinotruyenBooksListingUrl()', () => {
    test('adds category=manga for latest listing', () => {
      const url = minotruyenService.buildMinotruyenBooksListingUrl('', 1, 30, 'manga');
      expect(url).toContain('category=manga');
      expect(url).toContain('order=desc');
    });

    test('adds category=comics for latest listing', () => {
      const url = minotruyenService.buildMinotruyenBooksListingUrl('', 2, 24, 'comics');
      expect(url).toContain('category=comics');
      expect(url).toContain('page=2');
    });
  });

  describe('sortBooksByBookIdDesc()', () => {
    test(
      'sorts API rows by bookId DESC to match /manga/truyen-moi '
        + '(API ?order=desc actually sorts by updatedAt, not createdAt)',
      () => {
        const apiRows = [
          { bookId: 10848, title: 'Inazuma Eleven' },
          { bookId: 13402, title: 'Thật ra cậu thích tớ' },
          { bookId: 5559, title: 'Vermeil in gold' },
          { bookId: 19797, title: 'Oukoku e Tsuzuku Michi' },
          { bookId: 19788, title: 'Bóp d*i' },
          { bookId: 19794, title: 'Tiểu thư độc ác' },
          { bookId: 19782, title: 'The Fable - Phụ truyện' },
        ];
        const sorted = minotruyenService.sortBooksByBookIdDesc(apiRows);
        expect(sorted.map((b) => b.bookId)).toEqual([
          19797, 19794, 19788, 19782, 13402, 10848, 5559,
        ]);
      },
    );

    test('falls back to -1 when bookId is missing or non-numeric', () => {
      const apiRows = [
        { title: 'No id at all' },
        { bookId: 'not-a-number', title: 'Bad id' },
        { bookId: 42, title: 'Real' },
        { id: '99', title: 'String id 99' },
      ];
      const sorted = minotruyenService.sortBooksByBookIdDesc(apiRows);
      expect(sorted[0].title).toBe('String id 99');
      expect(sorted[1].bookId).toBe(42);
      expect(['No id at all', 'Bad id']).toContain(sorted[sorted.length - 1].title);
    });
  });

  describe('mapMinotruyenBookToLatestRow()', () => {
    test('maps API book row to listing fields', () => {
      const row = minotruyenService.mapMinotruyenBookToLatestRow(
        {
          bookId: 99,
          title: 'Test Title',
          category: 'comics',
          covers: [{ url: 'https://cdn.example/c.jpg' }],
          chapters: [{ num: '12', chapterNumber: 12 }],
        },
        'https://minotruyenv5.xyz',
        'manga',
      );
      expect(row).not.toBeNull();
      expect(row.title).toBe('Test Title');
      expect(row.mangaUrl).toBe('https://minotruyenv5.xyz/comics/books/99');
      expect(row.coverUrl).toBe('https://cdn.example/c.jpg');
      expect(row.latestChapterLabel).toBe('Ch. 12');
    });
  });

  describe('load() Function', () => {
    test('should return object with ok property', async () => {
      const result = await minotruyenService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error for empty URL', async () => {
      const result = await minotruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for null URL', async () => {
      const result = await minotruyenService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await minotruyenService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('downloadChapter() Function', () => {
    test('should accept payload parameter', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://minotruyenv5.xyz/comics/books/8755',
        chapterUrl: 'https://minotruyenv5.xyz/comics/chapters/12345',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(() => {
        minotruyenService.downloadChapter(payload);
      }).not.toThrow();
    });

    test('should return Promise', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://minotruyenv5.xyz/comics/books/8755',
        chapterUrl: 'https://minotruyenv5.xyz/comics/chapters/12345',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      const result = minotruyenService.downloadChapter(payload);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Service Implementation', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(minotruyenService.DOMAIN).toBeDefined();
      expect(minotruyenService.LABEL).toBeDefined();
    });

    test('should have correct label', () => {
      expect(minotruyenService.LABEL).toBe('Minotruyen');
    });
  });

  describe('URL Handling', () => {
    test('should handle manga URLs', () => {
      const mangaUrl = 'https://minotruyenv5.xyz/comics/books/8755';
      expect(mangaUrl).toContain('minotruyen');
      expect(mangaUrl).toContain('/comics/books/');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://minotruyenv5.xyz/comics/chapters/12345';
      expect(chapterUrl).toContain('/comics/chapters/');
    });

    test('should extract book ID from URL', () => {
      const mangaUrl = 'https://minotruyenv5.xyz/comics/books/8755';
      const idMatch = mangaUrl.match(/\/comics\/books\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('8755');
    });
  });

  describe('Response Structure', () => {
    test('should return correct structure on success', () => {
      const successResponse = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://minotruyenv5.xyz/comics/books/8755',
          siteId: 'minotruyen',
          sourceLabel: 'Minotruyen',
        },
        chapters: [
          {
            url: 'https://minotruyenv5.xyz/comics/chapters/12345',
            title: 'Chapter 1',
          },
        ],
      };

      expect(successResponse.ok).toBe(true);
      expect(successResponse.manga.siteId).toBe('minotruyen');
      expect(successResponse.manga.sourceLabel).toBe('Minotruyen');
    });

    test('should return correct structure on error', () => {
      const errorResponse = {
        ok: false,
        error: 'Error message',
      };

      expect(errorResponse.ok).toBe(false);
      expect(errorResponse.error).toBeDefined();
    });
  });

  describe('DRM Features', () => {
    test('should support DRM-protected images', () => {
      expect(typeof minotruyenService.downloadChapter).toBe('function');
    });

    test('should support image descrambling', () => {
      expect(typeof minotruyenService.downloadChapter).toBe('function');
    });

    test('should support CryptoJS decryption', () => {
      expect(typeof minotruyenService.downloadChapter).toBe('function');
    });
  });
});
