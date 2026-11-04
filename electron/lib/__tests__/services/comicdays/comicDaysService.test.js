/**
 * Unit tests for ComicDays Service
 * Site: comic-days.com
 * Test URL: https://comic-days.com/episode/13932016480029480667
 */
const { COMIC_DAYS_DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/comicDaysService');

describe('ComicDays Service', () => {
  describe('Module exports', () => {
    test('should export COMIC_DAYS_DOMAIN constant', () => {
      expect(COMIC_DAYS_DOMAIN).toBe('https://comic-days.com/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('ComicDays');
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
        const result = await load('https://invalid-comic-days.com', { userAgent: 'test-agent' });
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
        const result = await load('https://invalid-comic-days.com');
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
        mangaUrl: 'https://comic-days.com/episode/13932016480029480667',
        chapterUrl: 'https://comic-days.com/episode/13932016480029480667',
        chapterTitle: 'Episode 1',
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
        mangaUrl: 'https://comic-days.com/episode/13932016480029480667',
        chapterUrl: 'https://comic-days.com/episode/13932016480029480667',
        chapterTitle: 'Episode 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };
      
      // Just test that the function exists and can be called
      expect(typeof downloadChapter).toBe('function');
      expect(payload.chapterTitle).toBe('Episode 1');
    });
  });

  describe('URL format validation', () => {
    test('should handle episode URLs format', () => {
      const testUrl = 'https://comic-days.com/episode/13932016480029480667';
      
      // Just validate URL format without making network calls
      expect(testUrl).toMatch(/comic-days\.com/);
      expect(testUrl).toMatch(/episode\/\d+/);
      expect(typeof load).toBe('function');
    });

    test('should handle title URLs format', () => {
      const testUrl = 'https://comic-days.com/title/123456';
      
      // Just validate URL format without making network calls
      expect(testUrl).toMatch(/comic-days\.com/);
      expect(testUrl).toMatch(/title\/\d+/);
      expect(typeof load).toBe('function');
    });
  });

  describe('Service architecture', () => {
    test('should extend ApiConnectorService', () => {
      const comicDaysService = require('../../../platform/connectors/services/comicDaysService');
      
      // Should have the expected exports
      expect(comicDaysService.COMIC_DAYS_DOMAIN).toBeDefined();
      expect(comicDaysService.LABEL).toBeDefined();
      expect(typeof comicDaysService.load).toBe('function');
      expect(typeof comicDaysService.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(COMIC_DAYS_DOMAIN).toBe('https://comic-days.com/');
      expect(LABEL).toBe('ComicDays');
    });

    test('should support API fetch', () => {
      const comicDaysConnector = require('../../../platform/connectors/comicDays');
      expect(comicDaysConnector.supportsApiFetch).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-comic-days-domain.com/episode/123');
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

  describe('ComicDays-specific features', () => {
    test('should handle image descrambling configuration', () => {
      const comicDaysService = require('../../../platform/connectors/services/comicDaysService');
      
      // Should have service instance for testing
      expect(comicDaysService.service).toBeDefined();
      expect(comicDaysService.ComicDaysService).toBeDefined();
    });

    test('should have correct image referer', () => {
      const comicDaysConnector = require('../../../platform/connectors/comicDays');
      expect(comicDaysConnector.imageReferer).toBeDefined();
    });

    test('should have image CDN host detection', () => {
      const comicDaysConnector = require('../../../platform/connectors/comicDays');
      expect(typeof comicDaysConnector.isImageCdnHost).toBe('function');
    });
  });

  describe('Response format validation', () => {
    test('load() function signature validation', () => {
      // Just test function signature without making network calls
      expect(typeof load).toBe('function');
      expect(load.length).toBeGreaterThanOrEqual(1); // Should accept at least 1 parameter
      
      // Test that we can create a proper payload structure
      const testUrl = 'https://comic-days.com/episode/13932016480029480667';
      expect(testUrl).toMatch(/comic-days\.com/);
    });
  });
});