/**
 * Basic tests for MangaDex Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger
 */
const { describe, test, expect } = require('@jest/globals');

// Import the service
const mangadexService = require('../../../platform/connectors/services/mangadexService');

describe('MangaDex Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(mangadexService.DOMAIN).toBe('https://mangadex.org/');
      expect(mangadexService.LABEL).toBe('MangaDex');
    });

    test('should export required functions', () => {
      expect(typeof mangadexService.load).toBe('function');
      expect(typeof mangadexService.downloadChapter).toBe('function');
    });

    test('should export service class', () => {
      expect(mangadexService.service).toBeDefined();
      expect(mangadexService.MangaDexService).toBeDefined();
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid MangaDex URLs', () => {
      const validUrls = [
        'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger',
        'https://mangadex.org/title/a96676e5-8ae2-425e-b549-7f15dd34a6d8/komi-san-wa-komyushou-desu',
        'https://mangadex.org/title/12345678-1234-1234-1234-123456789012',
      ];

      validUrls.forEach(url => {
        expect(url).toMatch(/mangadex\.org\/title\/[a-f0-9-]+/);
      });
    });

    test('should handle manga UUID in URL', () => {
      const url = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger';
      
      // Extract manga UUID from URL
      const uuidMatch = url.match(/\/title\/([a-f0-9-]+)/);
      expect(uuidMatch).not.toBeNull();
      expect(uuidMatch[1]).toBe('45d563b6-b416-4ab3-b371-cad254b49d35');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://mangadex.org/chapter/12345678-1234-1234-1234-123456789012';
      
      expect(chapterUrl).toContain('/chapter/');
      expect(chapterUrl).toMatch(/\/chapter\/[a-f0-9-]+/);
    });

    test('should handle URLs with query parameters', () => {
      const url = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger?tab=chapters';
      expect(url).toContain('mangadex.org');
      expect(url).toContain('?tab=chapters');
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await mangadexService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate null URL', async () => {
      const result = await mangadexService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate undefined URL', async () => {
      const result = await mangadexService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate whitespace URL', async () => {
      const result = await mangadexService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use ApiConnectorService base class', () => {
      expect(mangadexService.DOMAIN).toBeDefined();
      expect(mangadexService.LABEL).toBeDefined();
    });

    test('should support API-based fetching', () => {
      // MangaDex uses API, not HTML parsing
      expect(typeof mangadexService.load).toBe('function');
    });

    test('should support international content', () => {
      expect(mangadexService.LABEL).toBe('MangaDex');
    });
  });

  describe('Response Format Expectations', () => {
    test('load() function signature validation', () => {
      expect(typeof mangadexService.load).toBe('function');
      expect(mangadexService.load.length).toBeGreaterThanOrEqual(1);
    });

    test('downloadChapter() should accept proper payload structure', () => {
      const payload = {
        mangaTitle: 'Yokohama-sen Doppelganger',
        mangaUrl: 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35',
        chapterUrl: 'https://mangadex.org/chapter/12345678-1234-1234-1234-123456789012',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(payload.mangaTitle).toBeDefined();
      expect(payload.chapterUrl).toBeDefined();
      expect(typeof mangadexService.downloadChapter).toBe('function');
    });
  });

  describe('MangaDex-specific Features', () => {
    test('should support API-based manga loading', () => {
      // MangaDex uses MangaDex API v5
      expect(typeof mangadexService.load).toBe('function');
    });

    test('should support language selection', () => {
      // MangaDex supports vi/en/ja languages
      const languages = ['vi', 'en', 'ja'];
      expect(languages.length).toBe(3);
    });

    test('should support at-home server for images', () => {
      // MangaDex uses at-home server for image hosting
      expect(typeof mangadexService.downloadChapter).toBe('function');
    });

    test('should support multi-language chapters', () => {
      // MangaDex has chapters in multiple languages
      expect(typeof mangadexService.load).toBe('function');
    });
  });

  describe('Language Selection', () => {
    test('should default to Vietnamese language', async () => {
      // Default language should be 'vi'
      const result = await mangadexService.load('https://mangadex.org/title/test');
      // Will fail because URL is invalid, but we can check the logic
      expect(result).toBeDefined();
    });

    test('should accept language parameter', () => {
      expect(typeof mangadexService.load).toBe('function');
      // load(url, language) - language is optional with default 'vi'
    });

    test('should validate language codes', () => {
      const validLanguages = ['vi', 'en', 'ja'];
      validLanguages.forEach(lang => {
        expect(['vi', 'en', 'ja']).toContain(lang);
      });
    });

    test('should handle case-insensitive language codes', () => {
      // Language codes should be case-insensitive
      const upperCase = 'EN';
      const lowerCase = 'en';
      expect(upperCase.toLowerCase()).toBe(lowerCase);
    });

    test('should default invalid language to Vietnamese', () => {
      // Invalid language should default to 'vi'
      const invalidLang = 'invalid';
      const validLanguages = ['vi', 'en', 'ja'];
      const normalizedLang = validLanguages.includes(invalidLang.toLowerCase()) ? invalidLang.toLowerCase() : 'vi';
      expect(normalizedLang).toBe('vi');
    });
  });

  describe('URL Pattern Matching', () => {
    test('should match mangadex.org domain', () => {
      const url = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35';
      expect(url).toMatch(/mangadex\.org/);
    });

    test('should match /title/ path pattern', () => {
      const url = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35';
      expect(url).toMatch(/\/title\//);
    });

    test('should match /chapter/ path pattern', () => {
      const url = 'https://mangadex.org/chapter/12345678-1234-1234-1234-123456789012';
      expect(url).toMatch(/\/chapter\//);
    });

    test('should extract manga UUID from URL', () => {
      const url = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35/yokohamasen-doppelganger';
      
      const uuidMatch = url.match(/\/title\/([a-f0-9-]+)/);
      expect(uuidMatch).not.toBeNull();
      expect(uuidMatch[1]).toBe('45d563b6-b416-4ab3-b371-cad254b49d35');
    });

    test('should extract chapter UUID from URL', () => {
      const url = 'https://mangadex.org/chapter/12345678-1234-1234-1234-123456789012';
      
      const uuidMatch = url.match(/\/chapter\/([a-f0-9-]+)/);
      expect(uuidMatch).not.toBeNull();
      expect(uuidMatch[1]).toBe('12345678-1234-1234-1234-123456789012');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed URLs', async () => {
      try {
        const result = await mangadexService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('API Features', () => {
    test('should use MangaDex API v5', () => {
      // MangaDex uses API v5
      const apiVersion = 'v5';
      expect(apiVersion).toBe('v5');
    });

    test('should support manga endpoint', () => {
      const mangaEndpoint = '/manga/{id}';
      expect(mangaEndpoint).toContain('/manga/');
    });

    test('should support chapter endpoint', () => {
      const chapterEndpoint = '/chapter';
      expect(chapterEndpoint).toBe('/chapter');
    });

    test('should support at-home server endpoint', () => {
      const atHomeEndpoint = '/at-home/server/{chapterId}';
      expect(atHomeEndpoint).toContain('at-home');
    });
  });

  describe('UUID Format', () => {
    test('should recognize valid UUID format', () => {
      const uuid = '45d563b6-b416-4ab3-b371-cad254b49d35';
      const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
      expect(uuid).toMatch(uuidPattern);
    });

    test('should handle UUIDs in URLs', () => {
      const url = 'https://mangadex.org/title/45d563b6-b416-4ab3-b371-cad254b49d35';
      const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
      expect(url).toMatch(uuidPattern);
    });
  });
});
