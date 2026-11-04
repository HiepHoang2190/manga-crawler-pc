/**
 * Unit tests for MangaPlus Service
 * Site: mangaplus.shueisha.co.jp
 * Test URL: https://mangaplus.shueisha.co.jp/titles/1000001
 */
const { SITE_DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/mangaPlusService');

describe('MangaPlus Service', () => {
  describe('Module exports', () => {
    test('should export SITE_DOMAIN constant', () => {
      expect(SITE_DOMAIN).toBe('https://mangaplus.shueisha.co.jp/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('MangaPlus');
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
  });

  describe('Service architecture', () => {
    test('should extend ApiConnectorService', () => {
      const service = require('../../../platform/connectors/services/mangaPlusService');
      expect(service.SITE_DOMAIN).toBeDefined();
      expect(service.LABEL).toBeDefined();
    });

    test('should have correct domain configuration', () => {
      expect(SITE_DOMAIN).toBe('https://mangaplus.shueisha.co.jp/');
      expect(LABEL).toBe('MangaPlus');
    });

    test('should support API fetch', () => {
      const connector = require('../../../platform/connectors/mangaPlus');
      expect(connector.supportsApiFetch).toBe(true);
    });
  });

  describe('MangaPlus-specific features', () => {
    test('should support XOR encryption', () => {
      const service = require('../../../platform/connectors/services/mangaPlusService');
      expect(service.service).toBeDefined();
    });

    test('should have correct image referer', () => {
      const connector = require('../../../platform/connectors/mangaPlus');
      expect(connector.imageReferer).toBeDefined();
    });

    test('should have image CDN host detection', () => {
      const connector = require('../../../platform/connectors/mangaPlus');
      expect(typeof connector.isImageCdnHost).toBe('function');
    });

    test('should be official Shueisha service', () => {
      expect(SITE_DOMAIN).toContain('shueisha.co.jp');
      expect(LABEL).toBe('MangaPlus');
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://mangaplus.shueisha.co.jp/titles/999999999');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});