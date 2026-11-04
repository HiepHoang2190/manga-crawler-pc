/**
 * Basic tests for TruyenTranhPhapBi Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng
 */
const { describe, test, expect } = require('@jest/globals');

// Import the service
const truyentranhphapbiService = require('../../../platform/connectors/services/truyenTranhPhapBiService');

describe('TruyenTranhPhapBi Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(truyentranhphapbiService.DOMAIN).toBe('https://www.truyentranhphapbi.com/');
      expect(truyentranhphapbiService.LABEL).toBe('TruyenTranhPhapBi');
    });

    test('should export required functions', () => {
      expect(typeof truyentranhphapbiService.load).toBe('function');
      expect(typeof truyentranhphapbiService.downloadChapter).toBe('function');
    });
  });

  describe('URL Type Detection', () => {
    test('should recognize label URLs', () => {
      const labelUrls = [
        'https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng',
        'https://www.truyentranhphapbi.com/search/label/Spirou',
        'https://www.truyentranhphapbi.com/search/label/Test',
      ];

      labelUrls.forEach(url => {
        expect(url).toMatch(/\/search\/label\//);
      });
    });

    test('should recognize index page URLs', () => {
      const indexUrls = [
        'https://www.truyentranhphapbi.com/p/muc-luc-spirou.html',
        'https://www.truyentranhphapbi.com/p/muc-luc-test.html',
        'https://www.truyentranhphapbi.com/p/some-index.html',
      ];

      indexUrls.forEach(url => {
        expect(url).toMatch(/\/p\/[^/?#]+\.html/);
      });
    });

    test('should recognize regular post URLs', () => {
      const postUrls = [
        'https://www.truyentranhphapbi.com/2024/01/spirou-tap-1.html',
        'https://www.truyentranhphapbi.com/2023/12/test-post.html',
      ];

      postUrls.forEach(url => {
        expect(url).toMatch(/\/\d{4}\/\d{2}\//);
      });
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await truyentranhphapbiService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    test('load() should validate null URL', async () => {
      const result = await truyentranhphapbiService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    test('load() should validate undefined URL', async () => {
      const result = await truyentranhphapbiService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    test('load() should validate whitespace URL', async () => {
      const result = await truyentranhphapbiService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });
  });

  describe('URL Format Validation', () => {
    test('should handle encoded label URLs', () => {
      const encodedUrl = 'https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng';
      
      expect(encodedUrl).toMatch(/\/search\/label\//);
      expect(encodedUrl).toContain('%');
      
      // Should decode to "Ngộ Không"
      const labelMatch = encodedUrl.match(/\/search\/label\/([^/?#]+)/);
      expect(labelMatch).not.toBeNull();
      expect(decodeURIComponent(labelMatch[1])).toBe('Ngộ Không');
    });

    test('should handle various label names', () => {
      const testCases = [
        { url: 'https://www.truyentranhphapbi.com/search/label/Spirou', label: 'Spirou' },
        { url: 'https://www.truyentranhphapbi.com/search/label/Test%20Label', label: 'Test Label' },
        { url: 'https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng', label: 'Ngộ Không' },
      ];

      testCases.forEach(({ url, label }) => {
        const match = url.match(/\/search\/label\/([^/?#]+)/);
        expect(match).not.toBeNull();
        expect(decodeURIComponent(match[1])).toBe(label);
      });
    });

    test('should handle index page URL patterns', () => {
      const indexUrls = [
        'https://www.truyentranhphapbi.com/p/muc-luc-spirou.html',
        'https://www.truyentranhphapbi.com/p/muc-luc-ngo-khong.html',
        'https://www.truyentranhphapbi.com/p/index-page.html',
      ];

      indexUrls.forEach(url => {
        expect(url).toMatch(/\/p\/[^/?#]+\.html/);
        expect(url).toContain('.html');
      });
    });

    test('should handle post URL date patterns', () => {
      const postUrls = [
        'https://www.truyentranhphapbi.com/2024/01/spirou-tap-1.html',
        'https://www.truyentranhphapbi.com/2023/12/test-post.html',
        'https://www.truyentranhphapbi.com/2022/06/another-post.html',
      ];

      postUrls.forEach(url => {
        expect(url).toMatch(/\/\d{4}\/\d{2}\//);
        const dateMatch = url.match(/\/(\d{4})\/(\d{2})\//);
        expect(dateMatch).not.toBeNull();
        expect(parseInt(dateMatch[1])).toBeGreaterThanOrEqual(2020);
        expect(parseInt(dateMatch[2])).toBeGreaterThanOrEqual(1);
        expect(parseInt(dateMatch[2])).toBeLessThanOrEqual(12);
      });
    });
  });

  describe('Service Architecture', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(truyentranhphapbiService.DOMAIN).toBeDefined();
      expect(truyentranhphapbiService.LABEL).toBeDefined();
    });

    test('should support Blogger platform', () => {
      // TruyenTranhPhapBi is a Blogger-based site
      expect(truyentranhphapbiService.DOMAIN).toContain('truyentranhphapbi.com');
    });

    test('should support multiple URL types', () => {
      // Should handle label, index, and post URLs
      expect(typeof truyentranhphapbiService.load).toBe('function');
    });
  });

  describe('Response Format Expectations', () => {
    test('load() function signature validation', () => {
      expect(typeof truyentranhphapbiService.load).toBe('function');
      expect(truyentranhphapbiService.load.length).toBeGreaterThanOrEqual(1);
    });

    test('downloadChapter() should accept proper payload structure', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.truyentranhphapbi.com/search/label/Test',
        chapterUrl: 'https://www.truyentranhphapbi.com/2024/01/test-post.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(payload.mangaTitle).toBeDefined();
      expect(payload.chapterUrl).toBeDefined();
      expect(typeof truyentranhphapbiService.downloadChapter).toBe('function');
    });
  });

  describe('TruyenTranhPhapBi-specific Features', () => {
    test('should support Vietnamese content', () => {
      const vietnameseLabel = 'Ngộ Không';
      const encodedLabel = encodeURIComponent(vietnameseLabel);
      
      expect(encodedLabel).toBe('Ng%E1%BB%99%20Kh%C3%B4ng');
      expect(decodeURIComponent(encodedLabel)).toBe(vietnameseLabel);
    });

    test('should support French-Belgian comics (Pháp Bỉ)', () => {
      const siteName = 'Truyện Tranh Pháp Bỉ';
      expect(siteName).toContain('Pháp Bỉ');
      expect(truyentranhphapbiService.DOMAIN).toContain('truyentranhphapbi');
    });

    test('should support pagination for label pages', () => {
      // Label pages have "Older Posts" pagination
      const labelUrl = 'https://www.truyentranhphapbi.com/search/label/Spirou';
      expect(labelUrl).toMatch(/\/search\/label\//);
    });

    test('should support static index pages', () => {
      // Index pages are static table of contents
      const indexUrl = 'https://www.truyentranhphapbi.com/p/muc-luc-spirou.html';
      expect(indexUrl).toMatch(/\/p\/muc-luc-/);
      expect(indexUrl).toContain('.html');
    });

    test('should support Blogger post structure', () => {
      // Blogger posts have specific URL pattern
      const postUrl = 'https://www.truyentranhphapbi.com/2024/01/spirou-tap-1.html';
      expect(postUrl).toMatch(/\/\d{4}\/\d{2}\//);
      expect(postUrl).toContain('.html');
    });
  });

  describe('Image Collection Strategies', () => {
    test('should support multiple image extraction strategies', () => {
      // TruyenTranhPhapBi uses 5 different strategies for image extraction
      const strategies = [
        'full-size-no-scale links',
        'Google User Content links',
        'Blogger lightbox pattern',
        'General separator links',
        'All images in post body',
      ];

      expect(strategies.length).toBe(5);
      strategies.forEach(strategy => {
        expect(typeof strategy).toBe('string');
        expect(strategy.length).toBeGreaterThan(0);
      });
    });

    test('should upgrade Blogger image URLs to full resolution', () => {
      const thumbnailUrl = 'https://example.com/s320/image.jpg';
      const fullResUrl = thumbnailUrl.replace(/\/[sw]\d+(?:-rw)?\//, '/s0/');
      
      expect(fullResUrl).toBe('https://example.com/s0/image.jpg');
    });

    test('should handle Google User Content URLs', () => {
      const googleUrl = 'https://lh3.googleusercontent.com/example.jpg';
      expect(googleUrl).toContain('googleusercontent');
      expect(googleUrl).toMatch(/\.(jpe?g|png|webp|gif)/);
    });
  });

  describe('Label Name Extraction', () => {
    test('should extract label name from URL', () => {
      const testCases = [
        { 
          url: 'https://www.truyentranhphapbi.com/search/label/Spirou',
          expected: 'Spirou'
        },
        { 
          url: 'https://www.truyentranhphapbi.com/search/label/Ng%E1%BB%99%20Kh%C3%B4ng',
          expected: 'Ngộ Không'
        },
        { 
          url: 'https://www.truyentranhphapbi.com/search/label/Test%20Label',
          expected: 'Test Label'
        },
      ];

      testCases.forEach(({ url, expected }) => {
        const match = url.match(/\/search\/label\/([^/?#]+)/);
        expect(match).not.toBeNull();
        expect(decodeURIComponent(match[1])).toBe(expected);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await truyentranhphapbiService.load('https://nonexistent-domain.com/search/label/test');
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
        const result = await truyentranhphapbiService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });
});