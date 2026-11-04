/**
 * Comick Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const comickConnector = require('../../../platform/connectors/comick');
const comickService = require('../../../platform/connectors/services/comickService');

describe('Comick - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const comick = connectors.find((c) => c.id === 'comick');
      expect(comick).toBeDefined();
      expect(comick.label).toBe('Comick');
    });

    test('should have correct domain', () => {
      expect(comickConnector.domain).toBe('https://comick.live/');
    });

    test('should have correct ID', () => {
      expect(comickConnector.id).toBe('comick');
    });

    test('should have icon path', () => {
      expect(comickConnector.icon).toBeDefined();
      expect(typeof comickConnector.icon).toBe('string');
    });

    test('should support API fetch', () => {
      expect(comickConnector.supportsApiFetch).toBe(true);
    });

    test('should have image referer', () => {
      expect(comickConnector.imageReferer).toBe('https://comick.live/');
    });

    test('should have extra domains', () => {
      expect(comickConnector.extraDomains).toBeDefined();
      expect(Array.isArray(comickConnector.extraDomains)).toBe(true);
      expect(comickConnector.extraDomains.length).toBeGreaterThan(0);
    });

    test('should include alternative domains', () => {
      expect(comickConnector.extraDomains).toContain('https://comick.io/');
      expect(comickConnector.extraDomains).toContain('https://comick.fun/');
      expect(comickConnector.extraDomains).toContain('https://comick.dev/');
    });

    test('should have isImageCdnHost function', () => {
      expect(typeof comickConnector.isImageCdnHost).toBe('function');
    });
  });

  describe('URL Detection', () => {
    test('should detect comick.live URLs', () => {
      const url = 'https://comick.live/comic/00-lan-ke-qi-yuan';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('comick');
    });

    test('should detect comick.io URLs', () => {
      const url = 'https://comick.io/comic/test-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('comick');
    });

    test('should detect comick.fun URLs', () => {
      const url = 'https://comick.fun/comic/test-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('comick');
    });

    test('should detect comick.dev URLs', () => {
      const url = 'https://comick.dev/comic/test-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('comick');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.comick.live/comic/test-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('comick');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://comick.live/comic/test-manga?page=1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('comick');
    });

    test('should not detect non-comick URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('comick');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept standard comic URLs', () => {
      const url = 'https://comick.live/comic/00-lan-ke-qi-yuan';
      expect(url).toMatch(/comick\.(live|io|fun|dev)\/comic\//);
    });

    test('should accept chapter URLs', () => {
      const url = 'https://comick.live/comic/test-manga/abc123-chapter-1-en';
      expect(url).toMatch(/\/comic\/[^/]+\/[^/]+-chapter-/);
    });

    test('should accept URLs with slug format', () => {
      const url = 'https://comick.live/comic/test-manga-slug';
      expect(url).toMatch(/\/comic\/[\w-]+/);
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof comickService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof comickService.downloadChapter).toBe('function');
    });

    test('should export SITE_DOMAIN constant', () => {
      expect(comickService.SITE_DOMAIN).toBe('https://comick.live');
    });

    test('should export LABEL constant', () => {
      expect(comickService.LABEL).toBe('Comick');
    });

    test('should export service instance', () => {
      expect(comickService.service).toBeDefined();
    });

    test('should export ComickService class', () => {
      expect(comickService.ComickService).toBeDefined();
      expect(typeof comickService.ComickService).toBe('function');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof comickConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof comickConnector.downloadChapter).toBe('function');
    });

    test('should accept language option in load', () => {
      const options = { comickLanguage: 'vi' };
      expect(() => comickConnector.load('https://comick.live/comic/test', options)).not.toThrow();
    });
  });

  describe('Architecture', () => {
    test('should be API-based connector', () => {
      expect(comickConnector.supportsApiFetch).toBe(true);
    });

    test('should use ApiConnectorService base class', () => {
      expect(typeof comickService.load).toBe('function');
      expect(typeof comickService.downloadChapter).toBe('function');
    });

    test('should use ComickApiClient', () => {
      expect(comickService.service).toBeDefined();
    });
  });

  describe('CDN Host Detection', () => {
    test('should detect comick CDN hosts', () => {
      expect(comickConnector.isImageCdnHost('comick.pictures')).toBe(true);
      expect(comickConnector.isImageCdnHost('comicknew.pictures')).toBe(true);
    });

    test('should handle case-insensitive detection', () => {
      expect(comickConnector.isImageCdnHost('COMICK.pictures')).toBe(true);
      expect(comickConnector.isImageCdnHost('ComickNew.Pictures')).toBe(true);
    });

    test('should not detect non-comick hosts', () => {
      expect(comickConnector.isImageCdnHost('example.com')).toBe(false);
      expect(comickConnector.isImageCdnHost('mangadex.org')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await comickService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await comickService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await comickService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle URL without slug', async () => {
      const result = await comickService.load('https://comick.live/');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Language Support', () => {
    test('should support default language (en)', () => {
      const options = {};
      expect(() => comickConnector.load('https://comick.live/comic/test', options)).not.toThrow();
    });

    test('should support Vietnamese language', () => {
      const options = { comickLanguage: 'vi' };
      expect(() => comickConnector.load('https://comick.live/comic/test', options)).not.toThrow();
    });

    test('should support Japanese language', () => {
      const options = { comickLanguage: 'ja' };
      expect(() => comickConnector.load('https://comick.live/comic/test', options)).not.toThrow();
    });

    test('should support Chinese language', () => {
      const options = { comickLanguage: 'zh' };
      expect(() => comickConnector.load('https://comick.live/comic/test', options)).not.toThrow();
    });

    test('should support Korean language', () => {
      const options = { comickLanguage: 'ko' };
      expect(() => comickConnector.load('https://comick.live/comic/test', options)).not.toThrow();
    });
  });
});
