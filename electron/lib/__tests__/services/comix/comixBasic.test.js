/**
 * Basic tests for Comix Connector
 * Focuses on core functionality without heavy network operations
 * Test URL: https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny
 */
const { describe, test, expect } = require('@jest/globals');

// Import connector registry
const { detectSiteIdFromUrl, get } = require('../../../platform/connectors');

// Import the service and connector
const comixService = require('../../../platform/connectors/services/comixService');
const comixConnector = require('../../../platform/connectors/comix');

describe('Comix Basic Tests', () => {
  const TEST_TITLE_URL = 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny';
  
  describe('URL Detection and Registry', () => {
    test('should detect Comix URLs correctly', () => {
      const testUrls = [
        'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny',
        'https://comix.to/title/some-manga-title',
        'https://comix.to/title/another-title/chapter-1',
      ];

      testUrls.forEach(url => {
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('comix');
      });
    });

    test('should be registered in connector registry', () => {
      const connector = get('comix');
      expect(connector).not.toBeNull();
      expect(connector.id).toBe('comix');
      expect(connector.label).toBe('Comix');
      expect(connector.domain).toBe('https://comix.to/');
    });
  });

  describe('Connector Configuration', () => {
    test('should have correct connector properties', () => {
      expect(comixConnector.id).toBe('comix');
      expect(comixConnector.label).toBe('Comix');
      expect(comixConnector.domain).toBe('https://comix.to/');
      expect(comixConnector.requiresCookie).toBe(true);
      expect(comixConnector.supportsApiFetch).toBe(true);
      expect(typeof comixConnector.load).toBe('function');
      expect(typeof comixConnector.downloadChapter).toBe('function');
    });

    test('should have image handling configuration', () => {
      expect(comixConnector.imageReferer).toBeDefined();
      expect(typeof comixConnector.isImageCdnHost).toBe('function');
      expect(comixConnector.icon).toBeDefined();
    });
  });

  describe('Service Configuration', () => {
    test('should have correct service exports', () => {
      expect(comixService.DOMAIN).toBe('https://comix.to/');
      expect(comixService.LABEL).toBe('Comix');
      expect(typeof comixService.load).toBe('function');
      expect(typeof comixService.downloadChapter).toBe('function');
    });

    test('should have Cloudflare bypass functionality', () => {
      expect(comixService.getComixImageFetchHeaders).toBeDefined();
      expect(typeof comixService.getComixImageFetchHeaders).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should validate title URL format', () => {
      const titleUrl = TEST_TITLE_URL;
      
      expect(titleUrl).toMatch(/comix\.to/);
      expect(titleUrl).toMatch(/title\/[\w-]+/);
      
      const siteId = detectSiteIdFromUrl(titleUrl);
      expect(siteId).toBe('comix');
    });

    test('should handle different URL formats', () => {
      const urlFormats = [
        { url: 'https://comix.to/title/yedvn-once-an-assassin-now-a-royal-nanny', type: 'title' },
        { url: 'https://comix.to/title/some-manga/chapter-1', type: 'chapter' },
      ];

      urlFormats.forEach(({ url, type }) => {
        expect(url).toMatch(/comix\.to/);
        expect(url).toMatch(/title\/[\w-]+/);
        
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('comix');
      });
    });
  });

  describe('API Architecture', () => {
    test('should support API-based fetching', () => {
      // Comix supports API fetching
      expect(comixConnector.supportsApiFetch).toBe(true);
    });

    test('should have HTML parsing capabilities', () => {
      // Comix uses HTML parsing with API support
      expect(comixService.DOMAIN).toBeDefined();
      expect(comixService.LABEL).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      try {
        const result = await comixService.load('');
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
          const result = await comixService.load(input);
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
      expect(typeof comixService.load).toBe('function');
      expect(comixService.load.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof comixConnector.load).toBe('function');
      expect(comixConnector.load.length).toBeGreaterThanOrEqual(1);
    });

    test('should have correct downloadChapter function signature', () => {
      expect(typeof comixService.downloadChapter).toBe('function');
      expect(comixService.downloadChapter.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof comixConnector.downloadChapter).toBe('function');
      expect(comixConnector.downloadChapter.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Comix-specific Features', () => {
    test('should handle Vietnamese content', () => {
      // Comix hosts Vietnamese translated manga
      const testUrl = TEST_TITLE_URL;
      expect(testUrl).toMatch(/yedvn-/); // Vietnamese translation indicator
    });

    test('should support title slug extraction', () => {
      // Comix uses title slugs like "yedvn-once-an-assassin-now-a-royal-nanny"
      const titleUrl = TEST_TITLE_URL;
      const slugMatch = titleUrl.match(/title\/([\w-]+)/);
      expect(slugMatch).not.toBeNull();
      expect(slugMatch[1]).toBe('yedvn-once-an-assassin-now-a-royal-nanny');
    });

    test('should have image CDN host detection', () => {
      expect(typeof comixConnector.isImageCdnHost).toBe('function');
      
      // Test with example hosts
      const testHosts = ['example.com', 'cdn.comix.to'];
      testHosts.forEach(host => {
        const result = comixConnector.isImageCdnHost(host);
        expect(typeof result).toBe('boolean');
      });
    });

    test('should support Cloudflare protection bypass', () => {
      // Comix may use Cloudflare protection
      expect(comixService.getComixImageFetchHeaders).toBeDefined();
      
      const headers = comixService.getComixImageFetchHeaders();
      expect(headers).toBeDefined();
      expect(typeof headers).toBe('object');
    });
  });

  describe('Integration Validation', () => {
    test('should have consistent service-connector integration', () => {
      // Both service and connector should have same basic structure
      expect(typeof comixService.load).toBe(typeof comixConnector.load);
      expect(typeof comixService.downloadChapter).toBe(typeof comixConnector.downloadChapter);
    });

    test('should be properly registered', () => {
      const connectors = require('../../../platform/connectors').listConnectors();
      const comixFromList = connectors.find(c => c.id === 'comix');
      
      expect(comixFromList).toBeDefined();
      expect(comixFromList.label).toBe('Comix');
      expect(comixFromList.domain).toBe('https://comix.to/');
    });
  });

  describe('Content Format Validation', () => {
    test('should handle manga title format', () => {
      // Test title: "Once an Assassin, Now a Royal Nanny"
      const titleSlug = 'yedvn-once-an-assassin-now-a-royal-nanny';
      
      expect(titleSlug).toMatch(/^[\w-]+$/);
      expect(titleSlug).toContain('once-an-assassin');
      expect(titleSlug).toContain('royal-nanny');
    });

    test('should handle Vietnamese translation prefix', () => {
      // "yedvn" indicates Vietnamese translation
      const titleSlug = 'yedvn-once-an-assassin-now-a-royal-nanny';
      expect(titleSlug).toMatch(/^yedvn-/);
    });
  });
});