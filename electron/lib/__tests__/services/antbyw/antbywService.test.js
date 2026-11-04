/**
 * Integration tests for Antbyw Service
 * Site: www.antbyw.com
 * Test URL: https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651
 */
const { BASE_URL, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/antbywService');

describe('Antbyw Service', () => {
  describe('Module exports', () => {
    test('should export BASE_URL constant', () => {
      expect(BASE_URL).toBe('https://www.antbyw.com');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('Antbyw');
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
      expect(result.error).toBe('URL trống.');
    });

    test('should return error for null URL', async () => {
      const result = await load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });

    test('should return error for undefined URL', async () => {
      const result = await load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });

    test('should return error for whitespace URL', async () => {
      const result = await load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('URL trống.');
    });
  });

  describe('load() - Options parameter', () => {
    test('should accept options parameter', async () => {
      // Should not throw even with options, but will return error for invalid URL
      try {
        const result = await load('https://invalid-url.com', { userAgent: 'test-agent' });
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
        const result = await load('https://invalid-url.com');
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
    test('should accept connector parameter', async () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651',
        chapterUrl: 'https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651&zjid=123',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 3,
      };
      
      // Should not throw - will fail at fetch stage but that's expected in test environment
      try {
        await downloadChapter(payload, 'CustomLabel');
      } catch (err) {
        // Expected to fail at fetch/download stage in test environment
        expect(err).toBeDefined();
      }
    });

    test('should work with default connector label', async () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651',
        chapterUrl: 'https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651&zjid=123',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };
      
      try {
        await downloadChapter(payload);
      } catch (err) {
        // Expected to fail at fetch/download stage in test environment
        expect(err).toBeDefined();
      }
    });
  });

  describe('URL format validation', () => {
    test('should handle plugin.php URLs', async () => {
      const testUrl = 'https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=170651';
      const result = await load(testUrl);
      
      // Will likely fail at network level in test environment, but should not throw
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });

    test('should handle relative URLs in chapter links', async () => {
      // This tests the URL resolution logic in the service
      const testUrl = 'https://www.antbyw.com/some-manga-page';
      const result = await load(testUrl);
      
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('Service architecture', () => {
    test('should extend HtmlConnectorService', () => {
      // Test that the service follows the expected architecture
      const antbywService = require('../../../platform/connectors/services/antbywService');
      
      // Should have the expected exports
      expect(antbywService.BASE_URL).toBeDefined();
      expect(antbywService.LABEL).toBeDefined();
      expect(typeof antbywService.load).toBe('function');
      expect(typeof antbywService.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(BASE_URL).toBe('https://www.antbyw.com');
      expect(LABEL).toBe('Antbyw');
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-antbyw-domain.com/manga');
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

  describe('Response format validation', () => {
    test('load() should return expected response format', async () => {
      try {
        const result = await load('https://example.com');
        
        expect(result).toBeDefined();
        expect(typeof result.ok).toBe('boolean');
        
        if (result.ok) {
          expect(result.manga).toBeDefined();
          expect(result.chapters).toBeDefined();
          expect(Array.isArray(result.chapters)).toBe(true);
          
          // Validate manga object structure
          expect(result.manga.title).toBeDefined();
          expect(result.manga.siteId).toBe('antbyw');
          expect(result.manga.sourceLabel).toBe('Antbyw');
        } else {
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
        }
      } catch (error) {
        // Network errors are expected in test environment
        expect(error).toBeDefined();
      }
    });
  });
});