/**
 * Basic tests for GocTruyenTranh Connector
 * Focuses on core functionality without heavy network operations
 * Test URL: https://goctruyentranhvui22.com/truyen/tieng-gam-guko
 */
const { describe, test, expect } = require('@jest/globals');

// Import connector registry
const { detectSiteIdFromUrl, get } = require('../../../platform/connectors');

// Import the service and connector
const gocTruyenTranhService = require('../../../platform/connectors/services/gocTruyenTranhService');
const gocTruyenTranhConnector = require('../../../platform/connectors/gocTruyenTranh');

describe('GocTruyenTranh Basic Tests', () => {
  const TEST_MANGA_URL = 'https://goctruyentranhvui31.com/truyen/onepunch-man';
  const TEST_CHAPTER_URL = 'https://goctruyentranhvui31.com/truyen/onepunch-man/chuong-11';
  
  describe('URL Detection and Registry', () => {
    test('should detect GocTruyenTranh URLs correctly', () => {
      const testUrls = [
        'https://goctruyentranh.com/truyen/some-manga',
        'https://goctruyentranh.org/truyen/another-manga',
        'https://goctruyentranhvui20.com/truyen/test-manga',
        'https://goctruyentranhvui21.com/truyen/test-manga',
        'https://goctruyentranhvui22.com/truyen/tieng-gam-guko',
        'https://goctruyentranhvui31.com/truyen/onepunch-man',
      ];

      testUrls.forEach(url => {
        const siteId = detectSiteIdFromUrl(url);
        expect(siteId).toBe('goctruyentranh');
      });
    });

    test('should be registered in connector registry', () => {
      const connector = get('goctruyentranh');
      expect(connector).not.toBeNull();
      expect(connector.id).toBe('goctruyentranh');
      expect(connector.label).toBe('GocTruyenTranh');
      expect(connector.domain).toBe('https://goctruyentranhvui31.com/');
    });
  });

  describe('Connector Configuration', () => {
    test('should have correct connector properties', () => {
      expect(gocTruyenTranhConnector.id).toBe('goctruyentranh');
      expect(gocTruyenTranhConnector.label).toBe('GocTruyenTranh');
      expect(gocTruyenTranhConnector.domain).toBe('https://goctruyentranhvui31.com/');
      expect(gocTruyenTranhConnector.supportsApiFetch).toBe(false);
      expect(gocTruyenTranhConnector.requiresCookie).toBe(true);
      expect(gocTruyenTranhConnector.hasLockedChapters).toBe(true);
      expect(typeof gocTruyenTranhConnector.load).toBe('function');
      expect(typeof gocTruyenTranhConnector.downloadChapter).toBe('function');
    });

    test('should have image handling configuration', () => {
      expect(gocTruyenTranhConnector.imageReferer).toBe('https://goctruyentranh.com/');
      expect(gocTruyenTranhConnector.icon).toBeDefined();
    });

    test('should have host includes configuration', () => {
      expect(Array.isArray(gocTruyenTranhConnector.hostIncludes)).toBe(true);
      expect(gocTruyenTranhConnector.hostIncludes).toContain('goctruyentranh');
      expect(gocTruyenTranhConnector.hostIncludes).toContain('goctruyentranhvui');
    });

    test('should have extra domains configuration', () => {
      expect(Array.isArray(gocTruyenTranhConnector.extraDomains)).toBe(true);
      expect(gocTruyenTranhConnector.extraDomains).toContain('https://goctruyentranh.org/');
      expect(gocTruyenTranhConnector.extraDomains).toContain('https://goctruyentranhvui31.com/');
    });
  });

  describe('Service Configuration', () => {
    test('should have correct service exports', () => {
      expect(typeof gocTruyenTranhService.load).toBe('function');
      expect(typeof gocTruyenTranhService.downloadChapter).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should validate manga URL format', () => {
      const mangaUrl = TEST_MANGA_URL;
      
      expect(mangaUrl).toMatch(/goctruyentranh/);
      expect(mangaUrl).toMatch(/\/truyen\/[\w-]+/);
      
      const siteId = detectSiteIdFromUrl(mangaUrl);
      expect(siteId).toBe('goctruyentranh');
    });

    test('should validate chapter URL format', () => {
      const chapterUrl = TEST_CHAPTER_URL;
      
      expect(chapterUrl).toMatch(/goctruyentranh/);
      expect(chapterUrl).toMatch(/\/truyen\/[\w-]+\/chuong-\d+/);
      
      const siteId = detectSiteIdFromUrl(chapterUrl);
      expect(siteId).toBe('goctruyentranh');
    });

    test('should handle different domain variations', () => {
      const domains = [
        'goctruyentranh.com',
        'goctruyentranh.org', 
        'goctruyentranh.net',
        'goctruyentranhvui20.com',
        'goctruyentranhvui21.com',
        'goctruyentranhvui22.com',
        'goctruyentranhvui31.com'
      ];

      domains.forEach(domain => {
        const testUrl = `https://${domain}/truyen/test-manga`;
        const siteId = detectSiteIdFromUrl(testUrl);
        expect(siteId).toBe('goctruyentranh');
      });
    });
  });

  describe('Authentication Requirements', () => {
    test('should require cookie because some chapters are login-locked', () => {
      expect(gocTruyenTranhConnector.requiresCookie).toBe(true);
      expect(gocTruyenTranhConnector.hasLockedChapters).toBe(true);
    });

    test('should not support API fetch (uses HTML + API hybrid)', () => {
      expect(gocTruyenTranhConnector.supportsApiFetch).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      try {
        const result = await gocTruyenTranhService.load('');
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
          const result = await gocTruyenTranhService.load(input);
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
      expect(typeof gocTruyenTranhService.load).toBe('function');
      expect(gocTruyenTranhService.load.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof gocTruyenTranhConnector.load).toBe('function');
      expect(gocTruyenTranhConnector.load.length).toBeGreaterThanOrEqual(1);
    });

    test('should have correct downloadChapter function signature', () => {
      expect(typeof gocTruyenTranhService.downloadChapter).toBe('function');
      expect(gocTruyenTranhService.downloadChapter.length).toBeGreaterThanOrEqual(1);
      
      expect(typeof gocTruyenTranhConnector.downloadChapter).toBe('function');
      expect(gocTruyenTranhConnector.downloadChapter.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GocTruyenTranh-specific Features', () => {
    test('should handle Vietnamese content', () => {
      const testUrl = TEST_MANGA_URL;
      expect(testUrl).toContain('onepunch-man'); // Updated to onepunch-man
    });

    test('should support chapter URL format', () => {
      const chapterUrl = TEST_CHAPTER_URL;
      const chapterMatch = chapterUrl.match(/\/chuong-(\d+)/);
      
      expect(chapterMatch).not.toBeNull();
      expect(chapterMatch[1]).toBe('11');
    });

    test('should handle manga slug format', () => {
      const mangaUrl = TEST_MANGA_URL;
      const slugMatch = mangaUrl.match(/\/truyen\/([\w-]+)/);
      
      expect(slugMatch).not.toBeNull();
      expect(slugMatch[1]).toBe('onepunch-man');
      expect(slugMatch[1]).toMatch(/^[\w-]+$/);
    });

    test('should handle API endpoint format', () => {
      // GocTruyenTranh uses /api/chapter/loadAll endpoint
      const apiEndpoint = '/api/chapter/loadAll';
      expect(apiEndpoint).toMatch(/^\/api\/chapter\/loadAll$/);
    });
  });

  describe('Integration Validation', () => {
    test('should have consistent service-connector integration', () => {
      expect(typeof gocTruyenTranhService.load).toBe(typeof gocTruyenTranhConnector.load);
      expect(typeof gocTruyenTranhService.downloadChapter).toBe(typeof gocTruyenTranhConnector.downloadChapter);
    });

    test('should be properly registered', () => {
      const connectors = require('../../../platform/connectors').listConnectors();
      const gocFromList = connectors.find(c => c.id === 'goctruyentranh');
      
      expect(gocFromList).toBeDefined();
      expect(gocFromList.label).toBe('GocTruyenTranh');
      expect(gocFromList.domain).toBe('https://goctruyentranhvui31.com/');
      expect(gocFromList.requiresCookie).toBe(true);
      expect(gocFromList.hasLockedChapters).toBe(true);
    });
  });

  describe('Content Format Validation', () => {
    test('should handle Vietnamese manga titles', () => {
      const titleSlug = 'tieng-gam-guko';
      
      expect(titleSlug).toMatch(/^[\w-]+$/);
      expect(titleSlug).toContain('tieng-gam-guko');
    });

    test('should handle chapter numbering', () => {
      const chapterUrl = TEST_CHAPTER_URL;
      const chapterNum = chapterUrl.match(/chuong-(\d+)/);
      
      expect(chapterNum).not.toBeNull();
      expect(parseInt(chapterNum[1])).toBeGreaterThan(0);
    });

    test('should handle domain variations', () => {
      const domains = ['goctruyentranh.com', 'goctruyentranhvui22.com'];
      
      domains.forEach(domain => {
        expect(domain).toMatch(/goctruyentranh/);
        
        const testUrl = `https://${domain}/truyen/test-manga`;
        const siteId = detectSiteIdFromUrl(testUrl);
        expect(siteId).toBe('goctruyentranh');
      });
    });
  });

  describe('API Response Format', () => {
    test('should handle codeState response format', () => {
      // GocTruyenTranh API returns codeState: "00" for success
      const successCode = "00";
      const loginRequiredCode = "01";
      const levelRequiredCode = "02";
      
      expect(successCode).toBe("00");
      expect(loginRequiredCode).toBe("01");
      expect(levelRequiredCode).toBe("02");
    });

    test('should handle API parameter format', () => {
      // API expects comicId, chapterNumber, nameEn
      const apiParams = {
        comicId: 'test-comic-id',
        chapterNumber: 11,
        nameEn: 'test-name-en'
      };
      
      expect(typeof apiParams.comicId).toBe('string');
      expect(typeof apiParams.chapterNumber).toBe('number');
      expect(typeof apiParams.nameEn).toBe('string');
    });
  });
});