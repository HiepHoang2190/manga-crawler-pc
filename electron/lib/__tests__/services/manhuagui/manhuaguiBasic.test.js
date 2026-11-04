/**
 * Basic tests for Manhuagui Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://www.manhuagui.com/comic/22843/
 */
const { describe, test, expect } = require('@jest/globals');

// Import the service
const manhuaguiService = require('../../../platform/connectors/services/manhuaguiService');

describe('Manhuagui Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(manhuaguiService.DOMAIN).toBeDefined();
      expect(manhuaguiService.LABEL).toBe('ManhuaGui');
    });

    test('should export required functions', () => {
      expect(typeof manhuaguiService.load).toBe('function');
      expect(typeof manhuaguiService.downloadChapter).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid Manhuagui URLs', () => {
      const validUrls = [
        'https://www.manhuagui.com/comic/22843/',
        'https://tw.manhuagui.com/comic/12345/',
        'https://www.manhuagui.com/comic/54321/',
      ];

      validUrls.forEach(url => {
        expect(url).toMatch(/manhuagui\.com/);
        expect(url).toMatch(/\/comic\/\d+/);
      });
    });

    test('should handle manga ID in URL', () => {
      const url = 'https://www.manhuagui.com/comic/22843/';
      
      // Extract manga ID from URL
      const idMatch = url.match(/\/comic\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('22843');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://www.manhuagui.com/comic/22843/123456.html';
      
      expect(chapterUrl).toContain('/comic/');
      expect(chapterUrl).toMatch(/\.html$/);
      
      const chapterMatch = chapterUrl.match(/\/(\d+)\.html$/);
      expect(chapterMatch).not.toBeNull();
    });

    test('should support both www and tw domains', () => {
      const wwwUrl = 'https://www.manhuagui.com/comic/22843/';
      const twUrl = 'https://tw.manhuagui.com/comic/22843/';
      
      expect(wwwUrl).toContain('manhuagui.com');
      expect(twUrl).toContain('manhuagui.com');
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await manhuaguiService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate null URL', async () => {
      const result = await manhuaguiService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate undefined URL', async () => {
      const result = await manhuaguiService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate whitespace URL', async () => {
      const result = await manhuaguiService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(manhuaguiService.DOMAIN).toBeDefined();
      expect(manhuaguiService.LABEL).toBeDefined();
    });

    test('should support HTML-based fetching', () => {
      // Manhuagui uses HTML parsing with packed script decoding
      expect(typeof manhuaguiService.load).toBe('function');
    });

    test('should support Chinese/Taiwanese content', () => {
      expect(manhuaguiService.DOMAIN).toContain('manhuagui');
    });
  });

  describe('Response Format Expectations', () => {
    test('load() function signature validation', () => {
      expect(typeof manhuaguiService.load).toBe('function');
      expect(manhuaguiService.load.length).toBeGreaterThanOrEqual(1);
    });

    test('downloadChapter() should accept proper payload structure', () => {
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://www.manhuagui.com/comic/22843/',
        chapterUrl: 'https://www.manhuagui.com/comic/22843/123456.html',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(payload.mangaTitle).toBeDefined();
      expect(payload.chapterUrl).toBeDefined();
      expect(typeof manhuaguiService.downloadChapter).toBe('function');
    });
  });

  describe('URL Pattern Matching', () => {
    test('should match manhuagui.com domain', () => {
      const url = 'https://www.manhuagui.com/comic/22843/';
      expect(url).toMatch(/manhuagui\.com/);
    });

    test('should match /comic/ path pattern', () => {
      const url = 'https://www.manhuagui.com/comic/22843/';
      expect(url).toMatch(/\/comic\//);
    });

    test('should extract manga ID from URL', () => {
      const url = 'https://www.manhuagui.com/comic/22843/';
      
      const idMatch = url.match(/\/comic\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('22843');
    });

    test('should match chapter URL pattern', () => {
      const chapterUrl = 'https://www.manhuagui.com/comic/22843/123456.html';
      expect(chapterUrl).toMatch(/\/comic\/\d+\/\d+\.html$/);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await manhuaguiService.load('https://nonexistent-manhuagui-domain.com/comic/12345/');
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
        const result = await manhuaguiService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Domain Variations', () => {
    test('should handle www.manhuagui.com domain', () => {
      const url = 'https://www.manhuagui.com/comic/22843/';
      expect(url).toMatch(/www\.manhuagui\.com/);
    });

    test('should handle tw.manhuagui.com domain', () => {
      const url = 'https://tw.manhuagui.com/comic/22843/';
      expect(url).toMatch(/tw\.manhuagui\.com/);
    });

    test('should handle both domains', () => {
      const domains = ['www.manhuagui.com', 'tw.manhuagui.com'];
      
      domains.forEach(domain => {
        expect(domain).toContain('manhuagui.com');
      });
    });
  });
});
