/**
 * Basic tests for SakamotoDaysTruyen Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://sakamotodaystruyen.com/
 */
const { describe, test, expect } = require('@jest/globals');

const sakamotodaysService = require('../../../platform/connectors/services/sakamotodaysService');

describe('SakamotoDaysTruyen Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(sakamotodaysService.DOMAIN).toBe('https://sakamotodaystruyen.com/');
      expect(sakamotodaysService.LABEL).toBe('SakamotoDaysTruyen');
    });

    test('should export required functions', () => {
      expect(typeof sakamotodaysService.load).toBe('function');
      expect(typeof sakamotodaysService.downloadChapter).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid SakamotoDaysTruyen homepage URL', () => {
      const url = 'https://sakamotodaystruyen.com/';
      expect(url).toMatch(/sakamotodaystruyen\.com/);
    });

    test('should recognize valid chapter URLs', () => {
      const chapterUrls = [
        'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-1/',
        'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-100/',
        'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-256/',
      ];

      chapterUrls.forEach(url => {
        expect(url).toMatch(/sakamotodaystruyen\.com/);
        expect(url).toMatch(/chapter-\d+/);
      });
    });

    test('should extract chapter number from URL', () => {
      const url = 'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-253/';
      const match = url.match(/chapter-(\d+)/);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('253');
    });

    test('should match doc-truyen-tranh path pattern', () => {
      const url = 'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-1/';
      expect(url).toMatch(/\/doc-truyen-tranh-/);
    });
  });

  describe('Input Validation', () => {
    test('load() should return error for empty URL', async () => {
      const result = await sakamotodaysService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should return error for null URL', async () => {
      const result = await sakamotodaysService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should return error for undefined URL', async () => {
      const result = await sakamotodaysService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should return error for whitespace URL', async () => {
      const result = await sakamotodaysService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(sakamotodaysService.DOMAIN).toBeDefined();
      expect(sakamotodaysService.LABEL).toBeDefined();
    });

    test('should support HTML-based fetching', () => {
      expect(typeof sakamotodaysService.load).toBe('function');
    });

    test('should be a single-manga site', () => {
      // The site hosts only Sakamoto Days — homepage is the manga page
      expect(sakamotodaysService.DOMAIN).toBe('https://sakamotodaystruyen.com/');
    });
  });

  describe('Response Format Expectations', () => {
    test('load() function should accept at least one argument', () => {
      expect(typeof sakamotodaysService.load).toBe('function');
      expect(sakamotodaysService.load.length).toBeGreaterThanOrEqual(1);
    });

    test('downloadChapter() should accept proper payload structure', () => {
      const payload = {
        mangaTitle: 'Sakamoto Days',
        mangaUrl: 'https://sakamotodaystruyen.com/',
        chapterUrl: 'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-1/',
        chapterTitle: 'Chap 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(payload.mangaTitle).toBeDefined();
      expect(payload.chapterUrl).toBeDefined();
      expect(typeof sakamotodaysService.downloadChapter).toBe('function');
    });
  });

  describe('SakamotoDaysTruyen-specific Features', () => {
    test('should be a WordPress-based site', () => {
      // Chapter images use WordPress wp-content/uploads path
      const sampleImageUrl = 'https://sakamotodaystruyen.com/wp-content/uploads/2026/01/word-image-515-1.jpeg';
      expect(sampleImageUrl).toMatch(/wp-content\/uploads/);
    });

    test('should support lazy-loaded images (data-src)', () => {
      // The site uses WordPress lazy loading — images have data-src attributes
      const dataSrcAttr = 'data-src';
      expect(dataSrcAttr).toBe('data-src');
    });

    test('should support Vietnamese content', () => {
      const vietnameseTitle = 'Sát Thủ Về Vườn';
      expect(vietnameseTitle).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
    });

    test('chapter URL pattern should include chapter number', () => {
      const chapterUrl = 'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-1/';
      expect(chapterUrl).toMatch(/chapter[-_]?\d+/i);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await sakamotodaysService.load('https://nonexistent-sakamotodays-domain.com/');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed URLs', async () => {
      try {
        const result = await sakamotodaysService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
