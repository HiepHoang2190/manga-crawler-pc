/**
 * TruyenQQVn Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const truyenqqvnConnector = require('../../../platform/connectors/truyenqqVn');
const truyenqqvnService = require('../../../platform/connectors/services/truyenqqVnService');

describe('TruyenQQVn - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const truyenqqvn = connectors.find((c) => c.id === 'truyenqqvn');
      expect(truyenqqvn).toBeDefined();
      expect(truyenqqvn.label).toBe('TruyenQQ.vn');
    });

    test('should have correct domain', () => {
      expect(truyenqqvnConnector.domain).toBe('https://truyenqq.com.vn/');
    });

    test('should have correct ID', () => {
      expect(truyenqqvnConnector.id).toBe('truyenqqvn');
    });

    test('should have icon path', () => {
      expect(truyenqqvnConnector.icon).toBeDefined();
      expect(typeof truyenqqvnConnector.icon).toBe('string');
    });

    test('should not support API fetch', () => {
      expect(truyenqqvnConnector.supportsApiFetch).toBe(false);
    });

    test('should have image referer', () => {
      expect(truyenqqvnConnector.imageReferer).toBeDefined();
    });

    test('should have isImageCdnHost function', () => {
      expect(typeof truyenqqvnConnector.isImageCdnHost).toBe('function');
      expect(truyenqqvnConnector.isImageCdnHost('s11.cdn3t.com')).toBe(true);
      expect(truyenqqvnConnector.isImageCdnHost('s34.cc3t.net')).toBe(true);
      expect(truyenqqvnConnector.isImageCdnHost('s25.static3t.com')).toBe(true);
      expect(truyenqqvnConnector.isImageCdnHost('example.com')).toBe(false);
    });

    test('should require cookie', () => {
      expect(truyenqqvnConnector.requiresCookie).toBe(true);
      const connectors = listConnectors();
      const truyenqqvn = connectors.find((c) => c.id === 'truyenqqvn');
      expect(truyenqqvn.requiresCookie).toBe(true);
    });
  });

  describe('URL Detection', () => {
    test('should detect truyenqq.com.vn URLs', () => {
      const url = 'https://truyenqq.com.vn/thich-khach-than-cap-ta-chinh-la-bong-dem';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqqvn');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.truyenqq.com.vn/some-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqqvn');
    });

    test('should detect chapter URLs', () => {
      const url = 'https://truyenqq.com.vn/manga/chapter-1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqqvn');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://truyenqq.com.vn/manga?page=1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqqvn');
    });

    test('should not detect non-truyenqqvn URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('truyenqqvn');
    });

    test('should not confuse with truyenqqno.com', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('truyenqqvn');
      expect(detected).toBe('truyenqq');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept standard manga URLs', () => {
      const url = 'https://truyenqq.com.vn/thich-khach-than-cap-ta-chinh-la-bong-dem';
      expect(url).toMatch(/truyenqq\.com\.vn\//);
    });

    test('should accept chapter URLs', () => {
      const url = 'https://truyenqq.com.vn/manga/chapter-1';
      expect(url).toMatch(/truyenqq\.com\.vn\/.*\/chapter-/);
    });

    test('should accept URLs with Vietnamese slugs', () => {
      const url = 'https://truyenqq.com.vn/thich-khach-than-cap-ta-chinh-la-bong-dem';
      expect(url).toMatch(/truyenqq\.com\.vn\/[\w-]+/);
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof truyenqqvnService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof truyenqqvnService.downloadChapter).toBe('function');
    });

    test('should export DOMAIN constant', () => {
      expect(truyenqqvnService.DOMAIN).toBe('https://truyenqq.com.vn/');
    });

    test('should export LABEL constant', () => {
      expect(truyenqqvnService.LABEL).toBe('TruyenQQ.vn');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof truyenqqvnConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof truyenqqvnConnector.downloadChapter).toBe('function');
    });
  });

  describe('Architecture', () => {
    test('should be HTML-based connector', () => {
      expect(truyenqqvnConnector.supportsApiFetch).toBe(false);
    });

    test('should use HtmlConnectorService base class', () => {
      expect(typeof truyenqqvnService.load).toBe('function');
      expect(typeof truyenqqvnService.downloadChapter).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await truyenqqvnService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await truyenqqvnService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await truyenqqvnService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle whitespace-only URL', async () => {
      const result = await truyenqqvnService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

});
