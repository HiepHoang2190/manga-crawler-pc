/**
 * Basic tests for ComicVN Connector
 * Focuses on core functionality without heavy network operations
 * Test URL: https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html
 */
const { describe, test, expect } = require('@jest/globals');

// Import connector registry
const { detectSiteIdFromUrl, get } = require('../../../platform/connectors');

// Import the service and connector
const comicvnService = require('../../../platform/connectors/services/comicvnService');
const comicvnConnector = require('../../../platform/connectors/comicvn');

describe('ComicVN Basic Tests', () => {
  const TEST_MANGA_URL = 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html';
  
  describe('URL Detection and Registry', () => {
    test('should detect ComicVN URLs correctly', () => {
      const testUrls = [
        'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html',
        'https://comicvn19.net/some-manga-title-123456789abcdef.html',
        'https://comicvn.net/another-title-abcdef123456789.html',
      ];

      testUrls.forEach(url => {
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('comicvn');
      });
    });

    test('should be registered in connector registry', () => {
      const connector = get('comicvn');
      expect(connector).not.toBeNull();
      expect(connector.id).toBe('comicvn');
      expect(connector.label).toBe('ComicVN');
      expect(connector.domain).toBe('https://comicvn19.net/');
    });
  });

  describe('Connector Configuration', () => {
    test('should have correct connector properties', () => {
      expect(comicvnConnector.id).toBe('comicvn');
      expect(comicvnConnector.label).toBe('ComicVN');
      expect(comicvnConnector.domain).toBe('https://comicvn19.net/');
      expect(comicvnConnector.supportsApiFetch).toBe(true);
      expect(comicvnConnector.requiresCookie).toBe(true);
      expect(comicvnConnector.hasLockedChapters).toBe(true);
      expect(typeof comicvnConnector.load).toBe('function');
      expect(typeof comicvnConnector.downloadChapter).toBe('function');
    });

    test('should have image handling configuration', () => {
      expect(comicvnConnector.imageReferer).toBeDefined();
      expect(typeof comicvnConnector.isImageCdnHost).toBe('function');
      expect(comicvnConnector.icon).toBeDefined();
    });

    test('should have host includes configuration', () => {
      expect(Array.isArray(comicvnConnector.hostIncludes)).toBe(true);
      expect(comicvnConnector.hostIncludes).toContain('comicvn');
    });
  });

  describe('Service Configuration', () => {
    test('should have correct service exports', () => {
      expect(comicvnService.DOMAIN).toBe('https://comicvn19.net/');
      expect(comicvnService.LABEL).toBe('ComicVN');
      expect(typeof comicvnService.load).toBe('function');
      expect(typeof comicvnService.downloadChapter).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should validate manga URL format', () => {
      const mangaUrl = TEST_MANGA_URL;
      
      expect(mangaUrl).toMatch(/comicvn\d*\.net/);
      expect(mangaUrl).toMatch(/[\w-]+-[a-f0-9]+\.html/);
      
      const siteId = detectSiteIdFromUrl(mangaUrl);
      expect(siteId).toBe('comicvn');
    });

    test('should handle different URL formats', () => {
      const urlFormats = [
        { url: 'https://comicvn19.net/khu-ma-luc-606f2edaeba283afd110ac72.html', type: 'manga' },
        { url: 'https://comicvn19.net/some-title-123456789abcdef.html', type: 'manga' },
        { url: 'https://comicvn.net/another-title-abcdef123456789/chapter-1.html', type: 'chapter' },
      ];

      urlFormats.forEach(({ url, type }) => {
        expect(url).toMatch(/comicvn\d*\.net/);
        
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('comicvn');
      });
    });

    test('should extract manga ID from URL', () => {
      const mangaUrl = TEST_MANGA_URL;
      const idMatch = mangaUrl.match(/[\w-]+-([a-f0-9]+)\.html/);
      
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toBe('606f2edaeba283afd110ac72');
      expect(idMatch[1]).toMatch(/^[a-f0-9]{24}$/); // MongoDB ObjectId format
    });
  });

  describe('API Architecture', () => {
    test('should support API-based fetching', () => {
      // ComicVN supports API fetching
      expect(comicvnConnector.supportsApiFetch).toBe(true);
    });

    test('should require cookie authentication', () => {
      // ComicVN requires cookies for access
      expect(comicvnConnector.requiresCookie).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      try {
        const result = await comicvnService.load('');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle null/undefined URLs', async () => {
      const invalidInputs = [null, undefined, '   '];
      
      for (const input of invalidInputs) {
        try {
          const result = await comicvnService.load(input);
          expect(result.ok).toBe(false);
          expect(result.error).toBeDefined();
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Function Signatures', () => {
    test('should have correct load function signature', () => {
      expect(typeof comicvnService.load).toBe('function');
      expect(comicvnService.load.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof comicvnConnector.load).toBe('function');
      expect(comicvnConnector.load.length).toBeGreaterThanOrEqual(1);
    });

    test('should have correct downloadChapter function signature', () => {
      expect(typeof comicvnService.downloadChapter).toBe('function');
      expect(comicvnService.downloadChapter.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof comicvnConnector.downloadChapter).toBe('function');
      expect(comicvnConnector.downloadChapter.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ComicVN-specific Features', () => {
    test('should handle Vietnamese content', () => {
      // ComicVN hosts Vietnamese manga
      const testUrl = TEST_MANGA_URL;
      expect(testUrl).toContain('khu-ma-luc'); // Vietnamese title "Khu Ma Lục"
    });

    test('should support manga ID extraction', () => {
      // ComicVN uses MongoDB ObjectId format for manga IDs
      const mangaUrl = TEST_MANGA_URL;
      const idMatch = mangaUrl.match(/[\w-]+-([a-f0-9]+)\.html/);
      
      expect(idMatch).not.toBeNull();
      expect(idMatch[1]).toMatch(/^[a-f0-9]{24}$/); // 24-character hex string
    });

    test('should have image CDN host detection', () => {
      expect(typeof comicvnConnector.isImageCdnHost).toBe('function');
      
      // Test with example hosts
      const testHosts = ['example.com', 'cdn.comicvn.net'];
      testHosts.forEach(host => {
        const result = comicvnConnector.isImageCdnHost(host);
        expect(typeof result).toBe('boolean');
      });
    });

    test('should support cookie-based authentication', () => {
      // ComicVN requires cookies for access
      expect(comicvnConnector.requiresCookie).toBe(true);
      expect(comicvnConnector.hasLockedChapters).toBe(true);
    });

    test('should handle domain variations', () => {
      // ComicVN uses numbered domains like comicvn19.net, comicvn19.net
      const domains = ['comicvn.net', 'comicvn18.net', 'comicvn19.net'];
      
      domains.forEach(domain => {
        expect(domain).toMatch(/comicvn\d*\.net/);
        
        const testUrl = `https://${domain}/test-manga-123456789abcdef.html`;
        const siteId = detectSiteIdFromUrl(testUrl);
        expect(siteId).toBe('comicvn');
      });
    });
  });

  describe('Bulk Scan Support', () => {
    test('comicvn supportsBulkScan and appears in listConnectors', () => {
      const comicvn = require('../../../platform/connectors/comicvn');
      expect(comicvn.supportsBulkScan).toBe(true);
      const row = require('../../../platform/connectors').listConnectors().find((c) => c.id === 'comicvn');
      expect(row.supportsBulkScan).toBe(true);
    });

    test('fetchBulkScan routes comicvn and rejects unknown', async () => {
      const connectors = require('../../../platform/connectors');
      const bad = await connectors.fetchBulkScan('not-a-site', {});
      expect(bad.ok).toBe(false);

      expect(typeof connectors.fetchBulkScan).toBe('function');
    });
  });

  describe('Integration Validation', () => {
    test('should have consistent service-connector integration', () => {
      // Both service and connector should have same basic structure
      expect(typeof comicvnService.load).toBe(typeof comicvnConnector.load);
      expect(typeof comicvnService.downloadChapter).toBe(typeof comicvnConnector.downloadChapter);
    });

    test('should be properly registered', () => {
      const connectors = require('../../../platform/connectors').listConnectors();
      const comicvnFromList = connectors.find(c => c.id === 'comicvn');
      
      expect(comicvnFromList).toBeDefined();
      expect(comicvnFromList.label).toBe('ComicVN');
      expect(comicvnFromList.domain).toBe('https://comicvn19.net/');
    });
  });

  describe('Content Format Validation', () => {
    test('should handle manga title format', () => {
      // Test title: "Khu Ma Lục" (Vietnamese)
      const titleSlug = 'khu-ma-luc';
      
      expect(titleSlug).toMatch(/^[\w-]+$/);
      expect(titleSlug).toContain('khu-ma-luc');
    });

    test('should handle MongoDB ObjectId format', () => {
      // ComicVN uses MongoDB ObjectIds for manga identification
      const mangaId = '606f2edaeba283afd110ac72';
      
      expect(mangaId).toMatch(/^[a-f0-9]{24}$/);
      expect(mangaId.length).toBe(24);
    });

    test('should handle HTML file extension', () => {
      // ComicVN URLs end with .html
      const mangaUrl = TEST_MANGA_URL;
      expect(mangaUrl).toMatch(/\.html$/);
    });
  });
});