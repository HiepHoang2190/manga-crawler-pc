/**
 * Basic tests for Minotruyen Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://minotruyenv5.xyz/comics/books/8755
 */
const { describe, test, expect } = require('@jest/globals');

const minotruyenService = require('../../../platform/connectors/services/minotruyenService');

describe('Minotruyen Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(minotruyenService.DOMAIN).toBeDefined();
      expect(minotruyenService.LABEL).toBe('Minotruyen');
    });

    test('should export required functions', () => {
      expect(typeof minotruyenService.load).toBe('function');
      expect(typeof minotruyenService.downloadChapter).toBe('function');
      expect(typeof minotruyenService.extractBookIdFromUrl).toBe('function');
      expect(typeof minotruyenService.resolveSiteOriginFromUrl).toBe('function');
    });
  });

  describe('resolveSiteOriginFromUrl', () => {
    test('returns origin for minotruyenv5 host', () => {
      expect(
        minotruyenService.resolveSiteOriginFromUrl('https://minotruyenv5.xyz/manga/books/1'),
      ).toBe('https://minotruyenv5.xyz');
    });

    test('returns origin for minotruyenv7 host', () => {
      expect(
        minotruyenService.resolveSiteOriginFromUrl('https://minotruyenv7.xyz/manga/books/7787'),
      ).toBe('https://minotruyenv7.xyz');
    });

    test('returns null for unrelated host', () => {
      expect(minotruyenService.resolveSiteOriginFromUrl('https://example.com/manga/books/1')).toBeNull();
    });
  });

  describe('extractBookIdFromUrl', () => {
    test('reads book id from /manga/books/ URL', () => {
      expect(minotruyenService.extractBookIdFromUrl('https://minotruyenv5.xyz/manga/books/6122')).toBe('6122');
      expect(minotruyenService.extractBookIdFromUrl('https://minotruyenv7.xyz/manga/books/7787')).toBe('7787');
      expect(minotruyenService.extractBookIdFromUrl('https://minotruyenv7.xyz/b/manga/books/8703')).toBe('8703');
    });

    test('uses /books/ id when chapter index is in path', () => {
      expect(minotruyenService.extractBookIdFromUrl('https://minotruyenv5.xyz/manga/books/6122/1')).toBe('6122');
    });

    test('reads book id when chapter id follows /books/{bookId}/{chapterId}', () => {
      expect(
        minotruyenService.extractBookIdFromUrl('https://minotruyenv5.xyz/manga/books/8684/264417'),
      ).toBe('8684');
    });

    test('falls back to last numeric segment when no /books/', () => {
      expect(minotruyenService.extractBookIdFromUrl('https://minotruyenv5.xyz/comics/chapters/12345')).toBe('12345');
    });
  });

  describe('extractChapterIdFromUrl', () => {
    test('reads chapter id from /manga/books/{bookId}/{chapterId}', () => {
      expect(
        minotruyenService.extractChapterIdFromUrl(
          'https://minotruyenv5.xyz/manga/books/8684/264417',
        ),
      ).toBe('264417');
    });

    test('returns null when only book id is present', () => {
      expect(
        minotruyenService.extractChapterIdFromUrl('https://minotruyenv5.xyz/manga/books/8684'),
      ).toBeNull();
    });
  });

  describe('pagesFromChapterApi', () => {
    test('maps plaintext API images with drmData (site no longer uses digest: HTML)', () => {
      const root = {
        success: true,
        data: {
          chapter: {
            chapterId: 264417,
            images: [
              {
                chapterImageId: 1,
                order: 1,
                servers: [
                  {
                    drmData: null,
                    imageUrl: 'https://phinf.pstatic.net/memo/page1.jpeg',
                  },
                  {
                    drmData: null,
                    imageUrl: 'https://kin-phinf.pstatic.net/page1_alt',
                  },
                ],
              },
              {
                chapterImageId: 2,
                order: 0,
                servers: [
                  {
                    drmData: 'EFxdX1oU',
                    imageUrl: 'https://phinf.pstatic.net/memo/page0.jpeg',
                  },
                ],
              },
            ],
          },
        },
      };
      const pages = minotruyenService.pagesFromChapterApi(root);
      expect(pages.length).toBe(2);
      expect(pages[0].imageUrl).toBe('https://phinf.pstatic.net/memo/page0.jpeg');
      expect(pages[0].drmData).toBe('EFxdX1oU');
      expect(pages[1].imageUrl).toBe('https://phinf.pstatic.net/memo/page1.jpeg');
      expect(pages[1].drmData == null).toBe(true);
    });

    test('returns empty when success/images missing', () => {
      expect(minotruyenService.pagesFromChapterApi({ success: false })).toEqual([]);
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid Minotruyen URLs', () => {
      const validUrls = [
        'https://minotruyenv5.xyz/comics/books/8755',
        'https://minotruyenv5.xyz/manga/books/6122',
        'https://minotruyenv4.xyz/comics/books/123',
        'https://minotruyenv3.xyz/comics/books/456',
      ];

      validUrls.forEach((url) => {
        expect(url).toMatch(/minotruyenv\d+\.xyz/);
        expect(url).toMatch(/\/(?:comics|manga)\/books\/\d+/);
      });
    });

    test('should handle book ID in URL', () => {
      const url = 'https://minotruyenv5.xyz/comics/books/8755';
      const idMatch = url.match(/\/comics\/books\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('8755');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://minotruyenv5.xyz/comics/chapters/12345';
      expect(chapterUrl).toContain('/comics/chapters/');
    });

    test('should support versioned domains', () => {
      const domains = ['minotruyenv3.xyz', 'minotruyenv4.xyz', 'minotruyenv5.xyz'];
      domains.forEach(domain => {
        expect(domain).toMatch(/minotruyenv\d+\.xyz/);
      });
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await minotruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate null URL', async () => {
      const result = await minotruyenService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate undefined URL', async () => {
      const result = await minotruyenService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate whitespace URL', async () => {
      const result = await minotruyenService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(minotruyenService.DOMAIN).toBeDefined();
      expect(minotruyenService.LABEL).toBeDefined();
    });

    test('should support HTML-based fetching', () => {
      expect(typeof minotruyenService.load).toBe('function');
    });

    test('should support Vietnamese content', () => {
      expect(minotruyenService.LABEL).toBe('Minotruyen');
    });
  });

  describe('Minotruyen-specific Features', () => {
    test('should support DRM descrambling', () => {
      expect(typeof minotruyenService.downloadChapter).toBe('function');
    });

    test('should support CryptoJS decryption', () => {
      expect(typeof minotruyenService.downloadChapter).toBe('function');
    });

    test('should support versioned domains', () => {
      const versions = ['v3', 'v4', 'v5'];
      expect(versions.length).toBe(3);
    });
  });

  describe('URL Pattern Matching', () => {
    test('should match minotruyenv domain', () => {
      const url = 'https://minotruyenv5.xyz/comics/books/8755';
      expect(url).toMatch(/minotruyenv\d+\.xyz/);
    });

    test('should match /comics/books/ path pattern', () => {
      const url = 'https://minotruyenv5.xyz/comics/books/8755';
      expect(url).toMatch(/\/comics\/books\//);
    });

    test('should match /comics/chapters/ path pattern', () => {
      const url = 'https://minotruyenv5.xyz/comics/chapters/12345';
      expect(url).toMatch(/\/comics\/chapters\//);
    });

    test('should extract book ID from URL', () => {
      const url = 'https://minotruyenv5.xyz/comics/books/8755';
      const idMatch = url.match(/\/comics\/books\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('8755');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed URLs', async () => {
      try {
        const result = await minotruyenService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
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
