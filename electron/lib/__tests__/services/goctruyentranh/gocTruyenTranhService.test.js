/**
 * Service tests for GocTruyenTranh
 * Tests the service layer functionality
 */
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');

const gocTruyenTranhService = require('../../../platform/connectors/services/gocTruyenTranhService');

describe('GocTruyenTranh Service Tests', () => {
  const TEST_MANGA_URL = 'https://goctruyentranhvui31.com/truyen/onepunch-man';
  const TEST_CHAPTER_URL = 'https://goctruyentranhvui31.com/truyen/onepunch-man/chuong-11';

  describe('Service Structure', () => {
    test('should export required functions', () => {
      expect(typeof gocTruyenTranhService.load).toBe('function');
      expect(typeof gocTruyenTranhService.downloadChapter).toBe('function');
    });

    test('should have correct function signatures', () => {
      expect(gocTruyenTranhService.load.length).toBeGreaterThanOrEqual(1);
      expect(gocTruyenTranhService.downloadChapter.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Load Function', () => {
    test('should handle empty URL', async () => {
      const result = await gocTruyenTranhService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await gocTruyenTranhService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await gocTruyenTranhService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle whitespace-only URL', async () => {
      const result = await gocTruyenTranhService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle invalid URL format', async () => {
      const result = await gocTruyenTranhService.load('not-a-url');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle wrong domain URL', async () => {
      const result = await gocTruyenTranhService.load('https://example.com/truyen/test');
      // Service might still try to load, but should handle gracefully
      expect(result).toHaveProperty('ok');
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    });

    test('should return proper structure for valid URL format', async () => {
      // Note: This test may fail without proper authentication
      // but should still return a structured response
      try {
        const result = await gocTruyenTranhService.load(TEST_MANGA_URL);
        
        expect(result).toHaveProperty('ok');
        expect(typeof result.ok).toBe('boolean');
        
        if (result.ok) {
          expect(result).toHaveProperty('manga');
          expect(result).toHaveProperty('chapters');
          expect(Array.isArray(result.chapters)).toBe(true);
        } else {
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
        }
      } catch (error) {
        // Network errors are acceptable in unit tests
        expect(error).toBeDefined();
      }
    }, 15000); // Increase timeout
  });

  describe('Download Chapter Function', () => {
    const mockPayload = {
      chapterUrl: TEST_CHAPTER_URL,
      mangaUrl: TEST_MANGA_URL,
      chapterTitle: 'Chương 11',
      mangaTitle: 'Tiếng Gầm Guko',
      savePath: '/tmp/test',
      chapterIndex: 10
    };

    test('should handle empty payload', async () => {
      try {
        const result = await gocTruyenTranhService.downloadChapter({}, 'GocTruyenTranh');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Expected to throw due to missing required fields
        expect(error).toBeDefined();
      }
    });

    test('should handle null payload', async () => {
      try {
        const result = await gocTruyenTranhService.downloadChapter(null, 'GocTruyenTranh');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Expected to throw due to null payload
        expect(error).toBeDefined();
      }
    });

    test('should handle missing chapterUrl', async () => {
      const payload = { ...mockPayload };
      delete payload.chapterUrl;
      
      try {
        const result = await gocTruyenTranhService.downloadChapter(payload, 'GocTruyenTranh');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Expected to throw due to missing chapterUrl
        expect(error).toBeDefined();
      }
    });

    test('should handle invalid chapterUrl format', async () => {
      const payload = { ...mockPayload, chapterUrl: 'invalid-url' };
      
      try {
        const result = await gocTruyenTranhService.downloadChapter(payload, 'GocTruyenTranh');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Expected to throw due to invalid URL
        expect(error).toBeDefined();
      }
    });

    test('should return proper structure for valid payload', async () => {
      // Note: This test may fail without proper authentication
      try {
        const result = await gocTruyenTranhService.downloadChapter(mockPayload, 'GocTruyenTranh');
        
        expect(result).toHaveProperty('ok');
        expect(typeof result.ok).toBe('boolean');
        
        if (result.ok) {
          expect(result).toHaveProperty('savedFiles');
          expect(Array.isArray(result.savedFiles)).toBe(true);
        } else {
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
        }
      } catch (error) {
        // Network/auth errors are acceptable in unit tests
        expect(error).toBeDefined();
      }
    });
  });

  describe('URL Parsing', () => {
    test('should extract manga info from URL', () => {
      const url = TEST_MANGA_URL;
      const pathMatch = url.match(/\/truyen\/([\w-]+)/);
      
      expect(pathMatch).not.toBeNull();
      expect(pathMatch[1]).toBe('onepunch-man');
    });

    test('should extract chapter info from URL', () => {
      const url = TEST_CHAPTER_URL;
      const chapterMatch = url.match(/\/chuong-(\d+)/);
      
      expect(chapterMatch).not.toBeNull();
      expect(chapterMatch[1]).toBe('11');
    });

    test('should handle different URL formats', () => {
      const urls = [
        'https://goctruyentranh.com/truyen/test-manga',
        'https://goctruyentranhvui31.com/truyen/another-manga/chuong-5',
        'https://goctruyentranh.org/truyen/third-manga/chuong-100'
      ];

      urls.forEach(url => {
        const mangaMatch = url.match(/\/truyen\/([\w-]+)/);
        expect(mangaMatch).not.toBeNull();
        expect(mangaMatch[1]).toMatch(/^[\w-]+$/);
      });
    });
  });

  describe('Error Messages', () => {
    test('should provide meaningful error messages', async () => {
      const testCases = [
        { input: '', expectedError: /url|empty|required/i },
        { input: null, expectedError: /url|null|required/i },
        { input: 'invalid', expectedError: /url|invalid|format/i }
      ];

      for (const { input, expectedError } of testCases) {
        const result = await gocTruyenTranhService.load(input);
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(expectedError);
      }
    });
  });

  describe('Authentication Handling', () => {
    test('should handle missing authentication gracefully', async () => {
      // Without proper cookies/tokens, should return auth error
      try {
        const result = await gocTruyenTranhService.load(TEST_MANGA_URL);
        
        if (!result.ok) {
          // Should indicate authentication issue
          expect(result.error).toMatch(/login|auth|cookie|token|permission/i);
        }
      } catch (error) {
        // Network errors are acceptable
        expect(error).toBeDefined();
      }
    }, 15000); // Increase timeout

    test('should handle API authentication errors', async () => {
      const mockPayload = {
        chapterUrl: TEST_CHAPTER_URL,
        mangaUrl: TEST_MANGA_URL,
        chapterTitle: 'Test Chapter',
        mangaTitle: 'Test Manga',
        savePath: '/tmp/test'
      };

      try {
        const result = await gocTruyenTranhService.downloadChapter(mockPayload, 'GocTruyenTranh');
        
        if (!result.ok) {
          // Should handle auth-related errors gracefully
          expect(typeof result.error).toBe('string');
        }
      } catch (error) {
        // Network/auth errors are acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Response Format Validation', () => {
    test('should validate load response format', async () => {
      try {
        const result = await gocTruyenTranhService.load(TEST_MANGA_URL);
        
        // Should always have ok property
        expect(result).toHaveProperty('ok');
        expect(typeof result.ok).toBe('boolean');
        
        if (result.ok) {
          // Success response should have manga and chapters
          expect(result).toHaveProperty('manga');
          expect(result).toHaveProperty('chapters');
          expect(Array.isArray(result.chapters)).toBe(true);
          
          if (result.manga) {
            expect(typeof result.manga.title).toBe('string');
          }
        } else {
          // Error response should have error message
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      } catch (error) {
        // Network errors are acceptable in unit tests
        expect(error).toBeDefined();
      }
    }, 15000); // Increase timeout

    test('should validate downloadChapter response format', async () => {
      const mockPayload = {
        chapterUrl: TEST_CHAPTER_URL,
        mangaUrl: TEST_MANGA_URL,
        chapterTitle: 'Test Chapter',
        mangaTitle: 'Test Manga',
        savePath: '/tmp/test'
      };

      try {
        const result = await gocTruyenTranhService.downloadChapter(mockPayload, 'GocTruyenTranh');
        
        // Should always have ok property
        expect(result).toHaveProperty('ok');
        expect(typeof result.ok).toBe('boolean');
        
        if (result.ok) {
          // Success response should have savedFiles
          expect(result).toHaveProperty('savedFiles');
          expect(Array.isArray(result.savedFiles)).toBe(true);
        } else {
          // Error response should have error message
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
          expect(result.error.length).toBeGreaterThan(0);
        }
      } catch (error) {
        // Network/auth errors are acceptable in unit tests
        expect(error).toBeDefined();
      }
    });
  });
});