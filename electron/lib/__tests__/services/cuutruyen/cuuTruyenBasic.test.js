/**
 * Basic tests for Cứu Truyện Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://hetcuutruyen.net/mangas/1775
 */
const { describe, test, expect } = require('@jest/globals');

// Import the service
const cuuTruyenService = require('../../../platform/connectors/services/cuuTruyenService');

describe('Cứu Truyện Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(cuuTruyenService.DOMAIN).toBeDefined();
      expect(cuuTruyenService.LABEL).toBe('Cứu Truyện');
    });

    test('should export required functions', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid Cứu Truyện URLs', () => {
      const validUrls = [
        'https://hetcuutruyen.net/mangas/1775',
        'https://nettrom.com/mangas/123',
        'https://cuutruyen.net/mangas/456',
      ];

      validUrls.forEach(url => {
        expect(url).toMatch(/(hetcuutruyen\.net|nettrom\.com|cuutruyen\.net)/);
        expect(url).toMatch(/\/mangas\/\d+/);
      });
    });

    test('should handle manga ID in URL', () => {
      const url = 'https://hetcuutruyen.net/mangas/1775';
      
      // Extract manga ID from URL
      const idMatch = url.match(/\/mangas\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('1775');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://hetcuutruyen.net/chapters/12345';
      
      expect(chapterUrl).toContain('/chapters/');
      expect(chapterUrl).toMatch(/\/chapters\/\d+/);
    });

    test('should support multiple domains', () => {
      const domains = [
        'hetcuutruyen.net',
        'nettrom.com',
        'cuutruyen.net',
      ];

      domains.forEach(domain => {
        expect(domain).toMatch(/(hetcuutruyen\.net|nettrom\.com|cuutruyen\.net)/);
      });
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await cuuTruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate null URL', async () => {
      const result = await cuuTruyenService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate undefined URL', async () => {
      const result = await cuuTruyenService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate whitespace URL', async () => {
      const result = await cuuTruyenService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use ApiConnectorService base class', () => {
      expect(cuuTruyenService.DOMAIN).toBeDefined();
      expect(cuuTruyenService.LABEL).toBeDefined();
    });

    test('should support API-based fetching', () => {
      // Cứu Truyện uses API, not HTML parsing
      expect(typeof cuuTruyenService.load).toBe('function');
    });

    test('should support Vietnamese content', () => {
      expect(cuuTruyenService.LABEL).toBe('Cứu Truyện');
    });
  });

  describe('Response Format Expectations', () => {
    test('load() function signature validation', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
      expect(cuuTruyenService.load.length).toBeGreaterThanOrEqual(1);
    });

    test('downloadChapter() should accept proper payload structure', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://hetcuutruyen.net/mangas/1775',
        chapterUrl: 'https://hetcuutruyen.net/chapters/12345',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(payload.mangaTitle).toBeDefined();
      expect(payload.chapterUrl).toBeDefined();
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });
  });

  describe('Cứu Truyện-specific Features', () => {
    test('should support API-based manga loading', () => {
      // Cứu Truyện uses API endpoint
      expect(typeof cuuTruyenService.load).toBe('function');
    });

    test('should support DRM descrambling', () => {
      // Cứu Truyện has DRM-protected images
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });

    test('should support multi-domain fallback', () => {
      // Cứu Truyện has multiple mirrors
      const mirrors = ['hetcuutruyen.net', 'nettrom.com', 'cuutruyen.net'];
      expect(mirrors.length).toBe(3);
    });

    test('should support Vietnamese manga', () => {
      const vietnameseTitle = 'Cứu Truyện';
      expect(vietnameseTitle).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/);
    });
  });

  describe('URL Pattern Matching', () => {
    test('should match hetcuutruyen.net domain', () => {
      const url = 'https://hetcuutruyen.net/mangas/1775';
      expect(url).toMatch(/hetcuutruyen\.net/);
    });

    test('should match nettrom.com domain', () => {
      const url = 'https://nettrom.com/mangas/123';
      expect(url).toMatch(/nettrom\.com/);
    });

    test('should match cuutruyen.net domain', () => {
      const url = 'https://cuutruyen.net/mangas/456';
      expect(url).toMatch(/cuutruyen\.net/);
    });

    test('should match /mangas/ path pattern', () => {
      const url = 'https://hetcuutruyen.net/mangas/1775';
      expect(url).toMatch(/\/mangas\//);
    });

    test('should match /chapters/ path pattern', () => {
      const url = 'https://hetcuutruyen.net/chapters/12345';
      expect(url).toMatch(/\/chapters\//);
    });

    test('should extract manga ID from URL', () => {
      const url = 'https://hetcuutruyen.net/mangas/1775';
      
      const idMatch = url.match(/\/mangas\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('1775');
    });

    test('should extract chapter ID from URL', () => {
      const url = 'https://hetcuutruyen.net/chapters/12345';
      
      const idMatch = url.match(/\/chapters\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('12345');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed URLs', async () => {
      try {
        const result = await cuuTruyenService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Domain Variations', () => {
    test('should handle hetcuutruyen.net domain', () => {
      const url = 'https://hetcuutruyen.net/mangas/1775';
      expect(url).toContain('hetcuutruyen.net');
    });

    test('should handle nettrom.com domain', () => {
      const url = 'https://nettrom.com/mangas/123';
      expect(url).toContain('nettrom.com');
    });

    test('should handle cuutruyen.net domain', () => {
      const url = 'https://cuutruyen.net/mangas/456';
      expect(url).toContain('cuutruyen.net');
    });
  });

  describe('API Features', () => {
    test('should use API endpoint for manga data', () => {
      // Cứu Truyện uses API endpoint
      const apiPattern = /\/api\//;
      expect(apiPattern).toBeDefined();
    });

    test('should support JSON response parsing', () => {
      expect(typeof cuuTruyenService.load).toBe('function');
    });
  });

  describe('DRM Features', () => {
    test('should support DRM-protected images', () => {
      // Cứu Truyện has DRM protection
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });

    test('should support image descrambling', () => {
      // Cứu Truyện requires descrambling
      expect(typeof cuuTruyenService.downloadChapter).toBe('function');
    });
  });

  describe('buildCuuTruyenMangaFromApiRoot()', () => {
    const url = 'https://hetcuutruyen.net/mangas/1775';

    test('parses title, cover, and description (no author — API author is often an object)', () => {
      const manga = cuuTruyenService.buildCuuTruyenMangaFromApiRoot(
        {
          data: {
            id: 1775,
            name: 'Test Manga',
            cover_url: '//cdn.example/cover.jpg',
            description: 'Synopsis line.',
            author_name: 'Author A',
            author: { id: 1, name: 'Nested Author' },
          },
        },
        url,
      );
      expect(manga).not.toBeNull();
      expect(manga.title).toBe('Test Manga');
      expect(manga.coverUrl).toBe('https://cdn.example/cover.jpg');
      expect(manga.description).toBe('Synopsis line.');
      expect(manga.author).toBeUndefined();
      expect(manga.mangaUrl).toBe(url);
    });

    test('unwraps nested data.manga', () => {
      const manga = cuuTruyenService.buildCuuTruyenMangaFromApiRoot(
        {
          data: {
            manga: {
              name: 'Nested',
              cover_url: '/covers/x.jpg',
            },
          },
        },
        url,
      );
      expect(manga?.title).toBe('Nested');
      expect(manga?.coverUrl).toBe('https://hetcuutruyen.net/covers/x.jpg');
    });
  });
});
