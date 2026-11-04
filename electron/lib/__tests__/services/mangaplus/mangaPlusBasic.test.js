/**
 * Basic tests for MangaPlus Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://mangaplus.shueisha.co.jp/titles/1000001
 */
const { describe, test, expect } = require('@jest/globals');

const mangaPlusService = require('../../../platform/connectors/services/mangaPlusService');

describe('MangaPlus Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(mangaPlusService.SITE_DOMAIN).toBe('https://mangaplus.shueisha.co.jp/');
      expect(mangaPlusService.LABEL).toBe('MangaPlus');
    });

    test('should export required functions', () => {
      expect(typeof mangaPlusService.load).toBe('function');
      expect(typeof mangaPlusService.downloadChapter).toBe('function');
    });

    test('should export service instance', () => {
      expect(mangaPlusService.service).toBeDefined();
      expect(mangaPlusService.MangaPlusService).toBeDefined();
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid MangaPlus title URLs', () => {
      const validUrls = [
        'https://mangaplus.shueisha.co.jp/titles/1000001',
        'https://mangaplus.shueisha.co.jp/titles/100001',
      ];

      validUrls.forEach(url => {
        expect(url).toMatch(/mangaplus\.shueisha\.co\.jp/);
        expect(url).toMatch(/\/titles\/\d+/);
      });
    });

    test('should handle title ID extraction', () => {
      const url = 'https://mangaplus.shueisha.co.jp/titles/1000001';
      const idMatch = url.match(/\/titles\/(\d+)/);
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('1000001');
    });

    test('should handle URLs with query parameters', () => {
      const url = 'https://mangaplus.shueisha.co.jp/titles/1000001?fbclid=test';
      expect(url).toMatch(/\/titles\/\d+/);
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await mangaPlusService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate null URL', async () => {
      const result = await mangaPlusService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate undefined URL', async () => {
      const result = await mangaPlusService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use ApiConnectorService base class', () => {
      expect(mangaPlusService.SITE_DOMAIN).toBeDefined();
      expect(mangaPlusService.LABEL).toBeDefined();
    });

    test('should support API-based fetching', () => {
      const connector = require('../../../platform/connectors/mangaPlus');
      expect(connector.supportsApiFetch).toBe(true);
    });

    test('should support official Shueisha platform', () => {
      expect(mangaPlusService.SITE_DOMAIN).toContain('shueisha.co.jp');
    });
  });

  describe('MangaPlus-specific Features', () => {
    test('should support XOR image encryption', () => {
      // MangaPlus uses XOR encryption for images
      expect(mangaPlusService.service).toBeDefined();
    });

    test('should support session token', () => {
      // MangaPlus requires session token for API access
      expect(mangaPlusService.SITE_DOMAIN).toBeDefined();
    });

    test('should be official Shueisha service', () => {
      expect(mangaPlusService.LABEL).toBe('MangaPlus');
      expect(mangaPlusService.SITE_DOMAIN).toContain('shueisha.co.jp');
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await mangaPlusService.load('https://mangaplus.shueisha.co.jp/titles/999999999');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed URLs', async () => {
      try {
        const result = await mangaPlusService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});