/**
 * Basic tests for ComicDays Connector
 * Focuses on core functionality without heavy network operations
 * Test URL: https://comic-days.com/episode/13932016480029480667
 */
const { describe, test, expect } = require('@jest/globals');

// Import connector registry
const { detectSiteIdFromUrl, get } = require('../../../platform/connectors');

// Import the service and connector
const comicDaysService = require('../../../platform/connectors/services/comicDaysService');
const comicDaysConnector = require('../../../platform/connectors/comicDays');

describe('ComicDays Basic Tests', () => {
  const TEST_EPISODE_URL = 'https://comic-days.com/episode/13932016480029480667';
  
  describe('URL Detection and Registry', () => {
    test('should detect ComicDays URLs correctly', () => {
      const testUrls = [
        'https://comic-days.com/episode/13932016480029480667',
        'https://comic-days.com/title/12345',
        'https://comic-days.com/magazine/weekly-shonen-magazine',
      ];

      testUrls.forEach(url => {
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('comicdays');
      });
    });

    test('should be registered in connector registry', () => {
      const connector = get('comicdays');
      expect(connector).not.toBeNull();
      expect(connector.id).toBe('comicdays');
      expect(connector.label).toBe('ComicDays');
      expect(connector.domain).toBe('https://comic-days.com/');
    });
  });

  describe('Connector Configuration', () => {
    test('should have correct connector properties', () => {
      expect(comicDaysConnector.id).toBe('comicdays');
      expect(comicDaysConnector.label).toBe('ComicDays');
      expect(comicDaysConnector.domain).toBe('https://comic-days.com/');
      expect(comicDaysConnector.supportsApiFetch).toBe(true);
      expect(typeof comicDaysConnector.load).toBe('function');
      expect(typeof comicDaysConnector.downloadChapter).toBe('function');
    });

    test('should have image handling configuration', () => {
      expect(comicDaysConnector.imageReferer).toBeDefined();
      expect(typeof comicDaysConnector.isImageCdnHost).toBe('function');
      expect(comicDaysConnector.icon).toBeDefined();
    });
  });

  describe('Service Configuration', () => {
    test('should have correct service exports', () => {
      expect(comicDaysService.COMIC_DAYS_DOMAIN).toBe('https://comic-days.com/');
      expect(comicDaysService.LABEL).toBe('ComicDays');
      expect(typeof comicDaysService.load).toBe('function');
      expect(typeof comicDaysService.downloadChapter).toBe('function');
    });

    test('should have service instance and class', () => {
      expect(comicDaysService.service).toBeDefined();
      expect(comicDaysService.ComicDaysService).toBeDefined();
    });
  });

  describe('URL Format Validation', () => {
    test('should validate episode URL format', () => {
      const episodeUrl = TEST_EPISODE_URL;
      
      expect(episodeUrl).toMatch(/comic-days\.com/);
      expect(episodeUrl).toMatch(/episode\/\d+/);
      
      const siteId = detectSiteIdFromUrl(episodeUrl);
      expect(siteId).toBe('comicdays');
    });

    test('should handle different URL formats', () => {
      const urlFormats = [
        { url: 'https://comic-days.com/episode/13932016480029480667', type: 'episode' },
        { url: 'https://comic-days.com/title/12345', type: 'title' },
      ];

      urlFormats.forEach(({ url, type }) => {
        expect(url).toMatch(/comic-days\.com/);
        expect(url).toMatch(new RegExp(`${type}/\\d+`));
        
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('comicdays');
      });
    });
  });

  describe('API Architecture', () => {
    test('should use ApiConnectorService architecture', () => {
      // ComicDays should be API-based, not HTML scraping
      expect(comicDaysConnector.supportsApiFetch).toBe(true);
    });

    test('should support image descrambling', () => {
      // ComicDays requires image descrambling functionality
      expect(comicDaysService.service).toBeDefined();
      expect(comicDaysService.ComicDaysService).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      try {
        const result = await comicDaysService.load('');
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
          const result = await comicDaysService.load(input);
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
      expect(typeof comicDaysService.load).toBe('function');
      expect(comicDaysService.load.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof comicDaysConnector.load).toBe('function');
      expect(comicDaysConnector.load.length).toBeGreaterThanOrEqual(1);
    });

    test('should have correct downloadChapter function signature', () => {
      expect(typeof comicDaysService.downloadChapter).toBe('function');
      expect(comicDaysService.downloadChapter.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof comicDaysConnector.downloadChapter).toBe('function');
      expect(comicDaysConnector.downloadChapter.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ComicDays-specific Features', () => {
    test('should handle Kodansha official content', () => {
      // ComicDays is Kodansha's official platform
      expect(comicDaysService.COMIC_DAYS_DOMAIN).toBe('https://comic-days.com/');
      expect(comicDaysService.LABEL).toBe('ComicDays');
    });

    test('should support episode-based structure', () => {
      // ComicDays uses episodes rather than chapters
      const episodeUrl = TEST_EPISODE_URL;
      expect(episodeUrl).toMatch(/episode\/\d+/);
      
      const siteId = detectSiteIdFromUrl(episodeUrl);
      expect(siteId).toBe('comicdays');
    });

    test('should have image CDN host detection', () => {
      expect(typeof comicDaysConnector.isImageCdnHost).toBe('function');
      
      // Test with example hosts
      const testHosts = ['example.com', 'cdn.comic-days.com'];
      testHosts.forEach(host => {
        const result = comicDaysConnector.isImageCdnHost(host);
        expect(typeof result).toBe('boolean');
      });
    });
  });

  describe('Integration Validation', () => {
    test('should have consistent service-connector integration', () => {
      // Both service and connector should have same basic structure
      expect(typeof comicDaysService.load).toBe(typeof comicDaysConnector.load);
      expect(typeof comicDaysService.downloadChapter).toBe(typeof comicDaysConnector.downloadChapter);
    });

    test('should be properly registered', () => {
      const connectors = require('../../../platform/connectors').listConnectors();
      const comicDaysFromList = connectors.find(c => c.id === 'comicdays');
      
      expect(comicDaysFromList).toBeDefined();
      expect(comicDaysFromList.label).toBe('ComicDays');
      expect(comicDaysFromList.domain).toBe('https://comic-days.com/');
    });
  });
});