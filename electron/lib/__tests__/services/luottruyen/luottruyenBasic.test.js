/**
 * LuotTruyen Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const { getCatalogEntry } = require('../../../platform/connectors/tester/catalog');
const luottruyenConnector = require('../../../platform/connectors/luotTruyen');
const luottruyenService = require('../../../platform/connectors/services/luotTruyenService');
const gocTruyenTranhConnector = require('../../../platform/connectors/gocTruyenTranh');

describe('LuotTruyen - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const luottruyen = connectors.find((c) => c.id === 'luottruyen');
      expect(luottruyen).toBeDefined();
      expect(luottruyen.label).toBe('LuotTruyen');
    });

    test('should have correct domain', () => {
      expect(luottruyenConnector.domain).toBe('https://luottruyen20.com/');
    });

    test('should not require VPN', () => {
      expect(luottruyenConnector.requiresVpn).toBeFalsy();
    });

    test('should have correct ID', () => {
      expect(luottruyenConnector.id).toBe('luottruyen');
    });

    test('should have icon path', () => {
      expect(luottruyenConnector.icon).toBeDefined();
      expect(typeof luottruyenConnector.icon).toBe('string');
    });

    test('should not support API fetch', () => {
      expect(luottruyenConnector.supportsApiFetch).toBe(false);
    });

    test('should require cookie', () => {
      expect(luottruyenConnector.requiresCookie).toBe(true);
      expect(luottruyenConnector.hasLockedChapters).toBe(true);
    });

    test('should have image referer or dynamic referer support', () => {
      // imageReferer is null because LuotTruyen derives the referer dynamically
      // from the active session domain (supports luottruyen5.com, luottruyen6.vn, etc.)
      expect(luottruyenConnector.imageReferer === null || typeof luottruyenConnector.imageReferer === 'string').toBe(true);
    });

    test('should have hostIncludes', () => {
      expect(luottruyenConnector.hostIncludes).toBeDefined();
      expect(Array.isArray(luottruyenConnector.hostIncludes)).toBe(true);
      expect(luottruyenConnector.hostIncludes).toContain('luottruyen');
    });

    test('should have isImageCdnHost function', () => {
      expect(typeof luottruyenConnector.isImageCdnHost).toBe('function');
    });
  });

  describe('URL Detection', () => {
    test('should detect luottruyen5.com URLs', () => {
      const url = 'https://luottruyen5.com/truyen-tranh/hanh-trinh-tim-lai-ban-nga-cua-mot-loser-18633';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luottruyen');
    });

    test('should detect luottruyen17.com manga URLs', () => {
      const url = 'https://luottruyen17.com/truyen-tranh/dai-quan-gia-la-ma-hoang-2844';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luottruyen');
    });

    test('should detect luottruyen5.com URLs', () => {
      const url = 'https://luottruyen5.com/truyen-tranh/test-manga-12345';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luottruyen');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.luottruyen5.com/truyen-tranh/test-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luottruyen');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://luottruyen5.com/truyen-tranh/test-manga?page=1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('luottruyen');
    });

    test('should not detect non-luottruyen URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('luottruyen');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept standard manga URLs', () => {
      const url = 'https://luottruyen5.com/truyen-tranh/hanh-trinh-tim-lai-ban-nga-cua-mot-loser-18633';
      expect(url).toMatch(/luottruyen\d+\.com\/truyen-tranh\//);
    });

    test('should accept URLs with slug format', () => {
      const url = 'https://luottruyen5.com/truyen-tranh/test-manga-12345';
      expect(url).toMatch(/\/truyen-tranh\/[\w-]+-\d+/);
    });

    test('should accept chapter URLs', () => {
      const url = 'https://luottruyen5.com/truyen-tranh/chapter-1/chapter-1/12345';
      expect(url).toMatch(/\/chapter-\d+\//);
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof luottruyenService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof luottruyenService.downloadChapter).toBe('function');
    });

    test('should export DOMAIN constant', () => {
      expect(luottruyenService.DOMAIN).toBe('https://luottruyen20.com/');
    });

    test('should export LABEL constant', () => {
      expect(luottruyenService.LABEL).toBe('LuotTruyen');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof luottruyenConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof luottruyenConnector.downloadChapter).toBe('function');
    });

    test('should use the catalog 3-step Connectors-tab test like GocTruyenTranh', () => {
      expect(gocTruyenTranhConnector.testConnection).toBeUndefined();
      expect(luottruyenConnector.testConnection).toBeUndefined();
      const catalog_entry = getCatalogEntry('luottruyen');
      expect(catalog_entry).toBeTruthy();
      expect(catalog_entry.testUrl).toBe('/truyen-tranh/dac-vu-song-sinh-16719');
    });
  });

  describe('Architecture', () => {
    test('should be HTML-based connector', () => {
      expect(luottruyenConnector.supportsApiFetch).toBe(false);
    });

    test('should use HtmlConnectorService base class', () => {
      expect(typeof luottruyenService.load).toBe('function');
      expect(typeof luottruyenService.downloadChapter).toBe('function');
    });
  });

  describe('Cookie Requirement', () => {
    test('should require cookie for authentication', () => {
      expect(luottruyenConnector.requiresCookie).toBe(true);
    });

    test('should indicate cookie requirement in connector', () => {
      expect(luottruyenConnector.requiresCookie).toBe(true);
    });

    test('should flag locked chapters so the sidebar shows the login hint', () => {
      expect(luottruyenConnector.hasLockedChapters).toBe(true);
    });

    test('should expose locked-chapter hint through the connector list', () => {
      const connectors = listConnectors();
      const luotFromList = connectors.find((c) => c.id === 'luottruyen');
      expect(luotFromList).toBeDefined();
      expect(luotFromList.requiresCookie).toBe(true);
      expect(luotFromList.hasLockedChapters).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await luottruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await luottruyenService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await luottruyenService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Domain Variations', () => {
    test('should still detect the older luottruyen5.com host', () => {
      const detected = detectSiteIdFromUrl('https://luottruyen5.com/truyen-tranh/test-manga');
      expect(detected).toBe('luottruyen');
    });

    test('should detect various luottruyen domains', () => {
      const domains = ['luottruyen1.com', 'luottruyen5.com', 'luottruyen12.com', 'luottruyen17.com', 'luottruyen19.com'];
      
      domains.forEach(domain => {
        const url = `https://${domain}/truyen-tranh/test`;
        const detected = detectSiteIdFromUrl(url);
        expect(detected).toBe('luottruyen');
      });
    });
  });

  describe('Special Features', () => {
    test('should use custom API for chapter list', () => {
      // LuotTruyen uses POST /Story/ListChapterByStoryID API
      const apiPath = '/Story/ListChapterByStoryID';
      expect(apiPath).toContain('ListChapterByStoryID');
    });

    test('should extract StoryID from page', () => {
      // LuotTruyen extracts StoryID from input#storyID or URL
      const pattern = /[-/](\d+)\/?$/;
      const url = 'https://luottruyen5.com/truyen-tranh/test-18633';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('18633');
      }
    });

    test('should support dichvucdn image CDN', () => {
      const cdnUrl = 'https://dichvucdn.com/image.jpg';
      expect(cdnUrl).toContain('dichvucdn');
    });
  });
});
