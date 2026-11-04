/**
 * MoeTruyen Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const moeTruyenConnector = require('../../../platform/connectors/moetruyen');
const moeTruyenService = require('../../../platform/connectors/services/moeTruyenService');

describe('MoeTruyen - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const moeTruyen = connectors.find((c) => c.id === 'moetruyen');
      expect(moeTruyen).toBeDefined();
      expect(moeTruyen.label).toBe('MoeTruyen');
    });

    test('should have correct domain', () => {
      expect(moeTruyenConnector.domain).toBe('https://moetruyen.net/');
    });

    test('should have correct ID', () => {
      expect(moeTruyenConnector.id).toBe('moetruyen');
    });

    test('should have icon path', () => {
      expect(moeTruyenConnector.icon).toBeDefined();
      expect(typeof moeTruyenConnector.icon).toBe('string');
    });

    test('should not support API fetch', () => {
      expect(moeTruyenConnector.supportsApiFetch).toBe(false);
    });

    test('should have image referer', () => {
      expect(moeTruyenConnector.imageReferer).toBeDefined();
    });

    test('should have isImageCdnHost function', () => {
      expect(typeof moeTruyenConnector.isImageCdnHost).toBe('function');
    });
  });

  describe('URL Detection', () => {
    test('should detect moetruyen.net URLs', () => {
      const url = 'https://moetruyen.net/manga/41-dau-bep-tru-danh';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('moetruyen');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.moetruyen.net/manga/some-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('moetruyen');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://moetruyen.net/manga/test?chapterPage=2';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('moetruyen');
    });

    test('should detect URLs with hash fragments', () => {
      const url = 'https://moetruyen.net/manga/test#chapters';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('moetruyen');
    });

    test('should not detect non-moetruyen URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('moetruyen');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept standard manga URLs', () => {
      const url = 'https://moetruyen.net/manga/41-dau-bep-tru-danh';
      expect(url).toMatch(/moetruyen\.net\/manga\//);
    });

    test('should accept URLs with numeric IDs', () => {
      const url = 'https://moetruyen.net/manga/123-test-manga';
      expect(url).toMatch(/moetruyen\.net\/manga\/\d+-/);
    });

    test('should accept URLs with Vietnamese slugs', () => {
      const url = 'https://moetruyen.net/manga/41-dau-bep-tru-danh';
      expect(url).toMatch(/moetruyen\.net\/manga\/\d+-[\w-]+/);
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof moeTruyenService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof moeTruyenService.downloadChapter).toBe('function');
    });

    test('should export DOMAIN constant', () => {
      expect(moeTruyenService.DOMAIN).toBe('https://moetruyen.net/');
    });

    test('should export LABEL constant', () => {
      expect(moeTruyenService.LABEL).toBe('MoeTruyen');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof moeTruyenConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof moeTruyenConnector.downloadChapter).toBe('function');
    });
  });

  describe('Architecture', () => {
    test('should be HTML-based connector', () => {
      expect(moeTruyenConnector.supportsApiFetch).toBe(false);
    });

    test('should use HtmlConnectorService base class', () => {
      // Service should have methods from HtmlConnectorService
      expect(typeof moeTruyenService.load).toBe('function');
      expect(typeof moeTruyenService.downloadChapter).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await moeTruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await moeTruyenService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await moeTruyenService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle whitespace-only URL', async () => {
      const result = await moeTruyenService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
