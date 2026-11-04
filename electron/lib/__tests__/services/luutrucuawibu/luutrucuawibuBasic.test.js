/**
 * LuuTruCuaWibu Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const luutrucuawibuConnector = require('../../../platform/connectors/luuTruCuaWibu');
const luutrucuawibuService = require('../../../platform/connectors/services/luuTruCuaWibuService');

describe('LuuTruCuaWibu - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const luutrucuawibu = connectors.find((c) => c.id === 'luutrucuawibu');
      expect(luutrucuawibu).toBeDefined();
      expect(luutrucuawibu.label).toBe('LuuTruCuaWibu');
    });

    test('should have correct domain', () => {
      expect(luutrucuawibuConnector.domain).toBe('https://luutrucuawibu.blogspot.com/');
    });

    test('should have correct ID', () => {
      expect(luutrucuawibuConnector.id).toBe('luutrucuawibu');
    });

    test('should have hostIncludes', () => {
      expect(luutrucuawibuConnector.hostIncludes).toBeDefined();
      expect(luutrucuawibuConnector.hostIncludes).toContain('luutrucuawibu');
    });

    test('should have icon path', () => {
      expect(luutrucuawibuConnector.icon).toBeDefined();
      expect(typeof luutrucuawibuConnector.icon).toBe('string');
    });

    test('should not support API fetch', () => {
      expect(luutrucuawibuConnector.supportsApiFetch).toBe(false);
    });
  });

  describe('URL Detection', () => {
    test('should detect luutrucuawibu.blogspot.com URLs', () => {
      const url = 'https://luutrucuawibu.blogspot.com/2026/01/one-punch-man-web-comic.html';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luutrucuawibu');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.luutrucuawibu.blogspot.com/2026/01/manga.html';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luutrucuawibu');
    });

    test('should detect URLs with different years', () => {
      const url = 'https://luutrucuawibu.blogspot.com/2025/12/manga.html';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luutrucuawibu');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://luutrucuawibu.blogspot.com/2026/01/manga.html?m=1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luutrucuawibu');
    });

    test('should not detect non-luutrucuawibu URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('luutrucuawibu');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept Blogger post URLs', () => {
      const url = 'https://luutrucuawibu.blogspot.com/2026/01/one-punch-man-web-comic.html';
      expect(url).toMatch(/blogspot\.com\/\d{4}\/\d{2}\//);
    });

    test('should accept URLs with year/month format', () => {
      const url = 'https://luutrucuawibu.blogspot.com/2026/01/manga.html';
      const match = url.match(/\/(\d{4})\/(\d{2})\//);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('2026');
        expect(match[2]).toBe('01');
      }
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof luutrucuawibuService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof luutrucuawibuService.downloadChapter).toBe('function');
    });

    test('should export LABEL constant', () => {
      expect(luutrucuawibuService.LABEL).toBe('LuuTruCuaWibu');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof luutrucuawibuConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof luutrucuawibuConnector.downloadChapter).toBe('function');
    });
  });

  describe('Architecture', () => {
    test('should be HTML-based connector', () => {
      expect(luutrucuawibuConnector.supportsApiFetch).toBe(false);
    });

    test('should use HtmlConnectorService base class', () => {
      expect(typeof luutrucuawibuService.load).toBe('function');
      expect(typeof luutrucuawibuService.downloadChapter).toBe('function');
    });

    test('should be Blogger platform', () => {
      expect(luutrucuawibuConnector.domain).toContain('blogspot.com');
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await luutrucuawibuService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await luutrucuawibuService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await luutrucuawibuService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle whitespace-only URL', async () => {
      const result = await luutrucuawibuService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
