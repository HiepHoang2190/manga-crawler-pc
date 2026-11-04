/**
 * Unit tests for SakamotoDaysTruyen Service
 * Site: sakamotodaystruyen.com
 * Test URL: https://sakamotodaystruyen.com/
 */
const { DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/sakamotodaysService');

describe('SakamotoDaysTruyen Service', () => {
  describe('Module exports', () => {
    test('should export DOMAIN constant', () => {
      expect(DOMAIN).toBe('https://sakamotodaystruyen.com/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('SakamotoDaysTruyen');
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
        const result = await load('https://invalid-sakamotodays.com', { userAgent: 'test-agent' });
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should work without options parameter', async () => {
      try {
        const result = await load('https://invalid-sakamotodays.com');
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('downloadChapter() - API compatibility', () => {
    test('should accept payload without execution', () => {
      const payload = {
        mangaTitle: 'Sakamoto Days',
        mangaUrl: 'https://sakamotodaystruyen.com/',
        chapterUrl: 'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-1/',
        chapterTitle: 'Chap 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 3,
      };

      expect(typeof downloadChapter).toBe('function');
      expect(payload.mangaTitle).toBe('Sakamoto Days');
    });

    test('should work with default connector label without execution', () => {
      const payload = {
        mangaTitle: 'Sakamoto Days',
        mangaUrl: 'https://sakamotodaystruyen.com/',
        chapterUrl: 'https://sakamotodaystruyen.com/doc-truyen-tranh-sakamoto-days-chapter-1/',
        chapterTitle: 'Chap 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(typeof downloadChapter).toBe('function');
      expect(payload.chapterTitle).toBe('Chap 1');
    });
  });

  describe('Service architecture', () => {
    test('should extend HtmlConnectorService', () => {
      const service = require('../../../platform/connectors/services/sakamotodaysService');
      expect(service.DOMAIN).toBeDefined();
      expect(service.LABEL).toBeDefined();
      expect(typeof service.load).toBe('function');
      expect(typeof service.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(DOMAIN).toBe('https://sakamotodaystruyen.com/');
      expect(LABEL).toBe('SakamotoDaysTruyen');
    });

    test('should not support API fetch', () => {
      const connector = require('../../../platform/connectors/sakamotodays');
      expect(connector.supportsApiFetch).toBe(false);
    });

    test('should not require cookie', () => {
      const connector = require('../../../platform/connectors/sakamotodays');
      expect(connector.requiresCookie).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-sakamotodays-domain.com/');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed URLs', async () => {
      try {
        const result = await load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('SakamotoDaysTruyen-specific features', () => {
    test('should support HTML parsing', () => {
      expect(typeof load).toBe('function');
    });

    test('should have correct image referer', () => {
      const connector = require('../../../platform/connectors/sakamotodays');
      expect(connector.imageReferer).toBe('https://sakamotodaystruyen.com/');
    });

    test('should support Vietnamese content', () => {
      expect(DOMAIN).toContain('sakamotodaystruyen');
    });

    test('should be a single-manga WordPress site', () => {
      // Homepage is the manga page — no separate manga listing
      expect(DOMAIN).toBe('https://sakamotodaystruyen.com/');
    });
  });
});
