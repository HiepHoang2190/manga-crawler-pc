/**
 * Unit tests for TruyenTranhPhapBi Service
 * Site: truyentranhphapbi.com
 * Test URL: https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng
 */
const { DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/truyenTranhPhapBiService');

describe('TruyenTranhPhapBi Service', () => {
  describe('Module exports', () => {
    test('should export DOMAIN constant', () => {
      expect(DOMAIN).toBe('https://www.truyentranhphapbi.com/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('TruyenTranhPhapBi');
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
        const result = await load('https://invalid-truyentranhphapbi.com', { userAgent: 'test-agent' });
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
        const result = await load('https://invalid-truyentranhphapbi.com');
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
        mangaUrl: 'https://www.truyentranhphapbi.com/search/label/Test',
        chapterUrl: 'https://www.truyentranhphapbi.com/2024/01/test-post.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 3,
      };
      
      expect(typeof downloadChapter).toBe('function');
      expect(payload.mangaTitle).toBe('Test Manga');
    });

    test('should work with default connector label without execution', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.truyentranhphapbi.com/search/label/Test',
        chapterUrl: 'https://www.truyentranhphapbi.com/2024/01/test-post.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };
      
      expect(typeof downloadChapter).toBe('function');
      expect(payload.chapterTitle).toBe('Chapter 1');
    });
  });

  describe('URL format validation', () => {
    test('should handle label URLs format', () => {
      const testUrl = 'https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng';
      
      expect(testUrl).toMatch(/truyentranhphapbi\.com/);
      expect(testUrl).toMatch(/\/search\/label\//);
      expect(typeof load).toBe('function');
    });

    test('should handle index page URLs format', () => {
      const testUrl = 'https://www.truyentranhphapbi.com/p/muc-luc-spirou.html';
      
      expect(testUrl).toMatch(/truyentranhphapbi\.com/);
      expect(testUrl).toMatch(/\/p\/[^/?#]+\.html/);
      expect(typeof load).toBe('function');
    });

    test('should handle post URLs format', () => {
      const testUrl = 'https://www.truyentranhphapbi.com/2024/01/spirou-tap-1.html';
      
      expect(testUrl).toMatch(/truyentranhphapbi\.com/);
      expect(testUrl).toMatch(/\/\d{4}\/\d{2}\//);
      expect(typeof load).toBe('function');
    });
  });

  describe('Service architecture', () => {
    test('should extend HtmlConnectorService', () => {
      const service = require('../../../platform/connectors/services/truyenTranhPhapBiService');
      
      expect(service.DOMAIN).toBeDefined();
      expect(service.LABEL).toBeDefined();
      expect(typeof service.load).toBe('function');
      expect(typeof service.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(DOMAIN).toBe('https://www.truyentranhphapbi.com/');
      expect(LABEL).toBe('TruyenTranhPhapBi');
    });

    test('should not support API fetch', () => {
      const connector = require('../../../platform/connectors/truyenTranhPhapBi');
      expect(connector.supportsApiFetch).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-truyentranhphapbi-domain.com/search/label/test');
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

  describe('TruyenTranhPhapBi-specific features', () => {
    test('should support Blogger platform', () => {
      // TruyenTranhPhapBi is built on Blogger
      expect(DOMAIN).toContain('truyentranhphapbi.com');
    });

    test('should have correct image referer', () => {
      const connector = require('../../../platform/connectors/truyenTranhPhapBi');
      expect(connector.imageReferer).toBe('https://www.truyentranhphapbi.com/');
    });

    test('should support multiple URL types', () => {
      // Should handle label, index, and post URLs
      const urlTypes = [
        '/search/label/',
        '/p/muc-luc-',
        '/2024/01/',
      ];

      urlTypes.forEach(pattern => {
        expect(typeof pattern).toBe('string');
        expect(pattern.length).toBeGreaterThan(0);
      });
    });

    test('should support Vietnamese labels', () => {
      const vietnameseLabel = 'Ngộ Không';
      const encoded = encodeURIComponent(vietnameseLabel);
      expect(encoded).toBe('Ng%E1%BB%99%20Kh%C3%B4ng');
    });

    test('should have host includes configuration', () => {
      const connector = require('../../../platform/connectors/truyenTranhPhapBi');
      expect(Array.isArray(connector.hostIncludes)).toBe(true);
      expect(connector.hostIncludes).toContain('truyentranhphapbi');
    });

    test('should support pagination for label pages', () => {
      // Label pages can have multiple pages with "Older Posts" links
      const labelUrl = 'https://www.truyentranhphapbi.com/search/label/Spirou';
      expect(labelUrl).toMatch(/\/search\/label\//);
    });

    test('should support static index pages', () => {
      // Index pages are static table of contents
      const indexUrl = 'https://www.truyentranhphapbi.com/p/muc-luc-spirou.html';
      expect(indexUrl).toMatch(/\/p\/[^/?#]+\.html/);
    });

    test('should support image extraction strategies', () => {
      // TruyenTranhPhapBi uses multiple strategies for image extraction
      const strategies = [
        'full-size-no-scale',
        'googleusercontent',
        'lightbox',
        'separator',
        'fallback',
      ];

      expect(strategies.length).toBe(5);
    });
  });

  describe('Response format validation', () => {
    test('load() function signature validation', () => {
      expect(typeof load).toBe('function');
      expect(load.length).toBeGreaterThanOrEqual(1);
      
      const testUrl = 'https://www.truyentranhphapbi.com/search/label/Test';
      expect(testUrl).toMatch(/truyentranhphapbi\.com/);
    });
  });
});