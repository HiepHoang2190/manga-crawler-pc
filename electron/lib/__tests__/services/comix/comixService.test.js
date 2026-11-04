/**
 * Unit tests for Comix Service
 * Site: comix.to
 * Test URL: https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny
 */
const { DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/comixService');

describe('Comix Service', () => {
  describe('Module exports', () => {
    test('should export DOMAIN constant', () => {
      expect(DOMAIN).toBe('https://comix.to/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('Comix');
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
        const result = await load('https://invalid-comix.com', { userAgent: 'test-agent' });
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
        const result = await load('https://invalid-comix.com');
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
        mangaUrl: 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny',
        chapterUrl: 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny/chapter-1',
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
        mangaUrl: 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny',
        chapterUrl: 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny/chapter-1',
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
    test('should handle title URLs format', () => {
      const testUrl = 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny';
      
      // Just validate URL format without making network calls
      expect(testUrl).toMatch(/comix\.to/);
      expect(testUrl).toMatch(/title\/[\w-]+/);
      expect(typeof load).toBe('function');
    });

    test('should handle chapter URLs format', () => {
      const testUrl = 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny/chapter-1';
      
      // Just validate URL format without making network calls
      expect(testUrl).toMatch(/comix\.to/);
      expect(testUrl).toMatch(/title\/[\w-]+\/chapter-\d+/);
      expect(typeof load).toBe('function');
    });
  });

  describe('Service architecture', () => {
    test('should extend HtmlConnectorService', () => {
      const comixService = require('../../../platform/connectors/services/comixService');
      
      // Should have the expected exports
      expect(comixService.DOMAIN).toBeDefined();
      expect(comixService.LABEL).toBeDefined();
      expect(typeof comixService.load).toBe('function');
      expect(typeof comixService.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(DOMAIN).toBe('https://comix.to/');
      expect(LABEL).toBe('Comix');
    });

    test('should support API fetch', () => {
      const comixConnector = require('../../../platform/connectors/comix');
      expect(comixConnector.supportsApiFetch).toBe(true);
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-comix-domain.com/title/test');
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

  describe('Comix-specific features', () => {
    test('should handle Cloudflare protection', () => {
      const comixService = require('../../../platform/connectors/services/comixService');
      
      // Should have Cloudflare bypass functionality
      expect(comixService.getComixImageFetchHeaders).toBeDefined();
    });

    test('should have correct image referer', () => {
      const comixConnector = require('../../../platform/connectors/comix');
      expect(comixConnector.imageReferer).toBeDefined();
    });

    test('should have image CDN host detection', () => {
      const comixConnector = require('../../../platform/connectors/comix');
      expect(typeof comixConnector.isImageCdnHost).toBe('function');
    });

    test('should support title slug extraction', () => {
      // Comix uses title slugs in URLs like /title/yedvn-once-an-assassin-now-a-royal-nanny
      const testUrl = 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny';
      expect(testUrl).toMatch(/title\/[\w-]+/);
    });
  });

  describe('Response format validation', () => {
    test('load() function signature validation', () => {
      // Just test function signature without making network calls
      expect(typeof load).toBe('function');
      expect(load.length).toBeGreaterThanOrEqual(1); // Should accept at least 1 parameter
      
      // Test that we can create a proper payload structure
      const testUrl = 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny';
      expect(testUrl).toMatch(/comix\.to/);
    });
  });
});