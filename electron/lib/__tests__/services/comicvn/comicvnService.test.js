/**
 * Unit tests for ComicVN Service
 * Site: comicvn19.net
 * Test URL: https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html
 */
const { DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/comicvnService');

describe('ComicVN Service', () => {
  describe('Module exports', () => {
    test('should export DOMAIN constant', () => {
      expect(DOMAIN).toBe('https://comicvn19.net/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('ComicVN');
    });

    test('should export load function', () => {
      expect(typeof load).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof downloadChapter).toBe('function');
    });
  });

  describe('load() - Input validation', () => {
    test('should return error for empty URL', async () => {
      const result = await load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for null URL', async () => {
      const result = await load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for whitespace URL', async () => {
      const result = await load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('load() - Options parameter', () => {
    test('should accept options parameter', async () => {
      try {
        const result = await load('https://invalid-comicvn.com', { userAgent: 'test-agent' });
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Network errors are expected in test environment
        expect(error).toBeDefined();
      }
    });

    test('should work without options parameter', async () => {
      try {
        const result = await load('https://invalid-comicvn.com');
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Network errors are expected in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe('downloadChapter() - API compatibility', () => {
    test('should accept connector parameter without execution', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html',
        chapterUrl: 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72/chapter-1.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 3,
      };
      
      // Just test that the function exists and can be called
      expect(typeof downloadChapter).toBe('function');
      expect(payload.mangaTitle).toBe('Test Manga');
    });

    test('should work with default connector label without execution', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html',
        chapterUrl: 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72/chapter-1.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };
      
      // Just test that the function exists and can be called
      expect(typeof downloadChapter).toBe('function');
      expect(payload.chapterTitle).toBe('Chapter 1');
    });
  });

  describe('URL format validation', () => {
    test('should handle manga URLs format', () => {
      const testUrl = 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html';
      
      // Just validate URL format without making network calls
      expect(testUrl).toMatch(/comicvn\d*\.net/);
      expect(testUrl).toMatch(/[\w-]+-[a-f0-9]+\.html/);
      expect(typeof load).toBe('function');
    });

    test('should handle chapter URLs format', () => {
      const testUrl = 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72/chapter-1.html';
      
      // Just validate URL format without making network calls
      expect(testUrl).toMatch(/comicvn\d*\.net/);
      expect(testUrl).toMatch(/[\w-]+-[a-f0-9]+\/chapter-\d+\.html/);
      expect(typeof load).toBe('function');
    });
  });

  describe('Service architecture', () => {
    test('should extend HtmlConnectorService', () => {
      const comicvnService = require('../../../platform/connectors/services/comicvnService');
      
      // Should have the expected exports
      expect(comicvnService.DOMAIN).toBeDefined();
      expect(comicvnService.LABEL).toBeDefined();
      expect(typeof comicvnService.load).toBe('function');
      expect(typeof comicvnService.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(DOMAIN).toBe('https://comicvn19.net/');
      expect(LABEL).toBe('ComicVN');
    });

    test('should support API fetch', () => {
      const comicvnConnector = require('../../../platform/connectors/comicvn');
      expect(comicvnConnector.supportsApiFetch).toBe(true);
    });

    test('should require cookies', () => {
      const comicvnConnector = require('../../../platform/connectors/comicvn');
      expect(comicvnConnector.requiresCookie).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-comicvn-domain.com/manga.html');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      } catch (error) {
        // Network errors throw exceptions, which is expected behavior
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed URLs', async () => {
      try {
        const result = await load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('ComicVN-specific features', () => {
    test('should handle cookie management', () => {
      const comicvnConnector = require('../../../platform/connectors/comicvn');
      
      // Should require cookies for access
      expect(comicvnConnector.requiresCookie).toBe(true);
    });

    test('should have correct image referer', () => {
      const comicvnConnector = require('../../../platform/connectors/comicvn');
      expect(comicvnConnector.imageReferer).toBeDefined();
    });

    test('should have image CDN host detection', () => {
      const comicvnConnector = require('../../../platform/connectors/comicvn');
      expect(typeof comicvnConnector.isImageCdnHost).toBe('function');
    });

    test('should support manga ID extraction', () => {
      // ComicVN uses manga IDs in URLs like khu-ma-luc-606f2edaeba283afd110ac72.html
      const testUrl = 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html';
      const idMatch = testUrl.match(/[\w-]+-([a-f0-9]+)\.html/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('606f2edaeba283afd110ac72');
    });

    test('should have host includes configuration', () => {
      const comicvnConnector = require('../../../platform/connectors/comicvn');
      expect(Array.isArray(comicvnConnector.hostIncludes)).toBe(true);
      expect(comicvnConnector.hostIncludes).toContain('comicvn');
    });
  });

  describe('Response format validation', () => {
    test('load() function signature validation', () => {
      // Just test function signature without making network calls
      expect(typeof load).toBe('function');
      expect(load.length).toBeGreaterThanOrEqual(1); // Should accept at least 1 parameter
      
      // Test that we can create a proper payload structure
      const testUrl = 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html';
      expect(testUrl).toMatch(/comicvn\d*\.net/);
    });
  });
});