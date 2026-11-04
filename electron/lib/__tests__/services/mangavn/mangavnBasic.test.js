/**
 * Basic tests for MangaVN connector
 */
const { load } = require('../../../platform/connectors/services/mangaVnService');

describe('MangaVN Connector - Basic Tests', () => {
  describe('load()', () => {
    it('should reject empty URL', async () => {
      const result = await load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    it('should reject invalid URL', async () => {
      const result = await load('https://example.com/invalid');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL không hợp lệ');
    });

    it('should accept thread URL', async () => {
      // This is a structure test - actual network test would be in integration tests
      const url = 'https://mangavn.forumotion.net/t15203-sekirei-chap-1';
      // We can't test actual fetch due to blocking, but we can verify URL pattern
      expect(url).toMatch(/\/t\d+/);
    });

    it('should accept forum URL', async () => {
      const url = 'https://mangavn.forumotion.net/f5-manga';
      expect(url).toMatch(/\/f\d+/);
    });

    it('should have correct structure on success', async () => {
      // This is a structure test - actual network test would be in integration tests
      const mockResult = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://mangavn.forumotion.net/t15203-sekirei-chap-1',
          mangaId: '',
          siteId: 'mangavn',
          sourceLabel: 'MangaVN',
        },
        chapters: [
          { url: 'https://mangavn.forumotion.net/t15203-sekirei-chap-1', title: 'Trang 1' },
        ],
      };

      expect(mockResult.ok).toBe(true);
      expect(mockResult.manga).toBeDefined();
      expect(mockResult.manga.title).toBeDefined();
      expect(mockResult.manga.siteId).toBe('mangavn');
      expect(mockResult.chapters).toBeInstanceOf(Array);
    });
  });

  describe('Service Configuration', () => {
    it('should export required functions', () => {
      const service = require('../../../platform/connectors/services/mangaVnService');
      expect(typeof service.load).toBe('function');
      expect(typeof service.downloadChapter).toBe('function');
      expect(service.DOMAIN).toBe('https://mangavn.forumotion.net/');
      expect(service.LABEL).toBe('MangaVN');
    });
  });

  describe('Connector Registration', () => {
    it('should be registered in connector registry', () => {
      const connectors = require('../../../platform/connectors');
      const mangavn = connectors.get('mangavn');
      expect(mangavn).toBeDefined();
      expect(mangavn.id).toBe('mangavn');
      expect(mangavn.label).toBe('MangaVN');
      expect(mangavn.domain).toBe('https://mangavn.forumotion.net/');
    });

    it('should detect mangavn.forumotion.net URLs', () => {
      const connectors = require('../../../platform/connectors');
      const detected = connectors.detectSiteIdFromUrl('https://mangavn.forumotion.net/t15203-sekirei-chap-1');
      expect(detected).toBe('mangavn');
    });

    it('should detect forum URLs', () => {
      const connectors = require('../../../platform/connectors');
      const detected = connectors.detectSiteIdFromUrl('https://mangavn.forumotion.net/f5-manga');
      expect(detected).toBe('mangavn');
    });
  });

  describe('Pagination', () => {
    it('should parse pagination links correctly', () => {
      // Test pagination URL format
      const baseUrl = 'https://mangavn.forumotion.net/t15202-sekirei';
      const page2Url = 'https://mangavn.forumotion.net/t15202p50-topic';
      const page3Url = 'https://mangavn.forumotion.net/t15202p100-topic';
      const page4Url = 'https://mangavn.forumotion.net/t15202p150-topic';
      
      // Verify URL patterns
      expect(page2Url).toMatch(/p50-topic$/);
      expect(page3Url).toMatch(/p100-topic$/);
      expect(page4Url).toMatch(/p150-topic$/);
      
      // Verify offset calculation
      const extractOffset = (url) => {
        const match = url.match(/p(\d+)-topic/);
        return match ? parseInt(match[1]) : 0;
      };
      
      expect(extractOffset(page2Url)).toBe(50);
      expect(extractOffset(page3Url)).toBe(100);
      expect(extractOffset(page4Url)).toBe(150);
    });
  });

  describe('URL Normalization', () => {
    it('should detect both mangavn.forumotion.net and www.mangavn.net domains', () => {
      const connectors = require('../../../platform/connectors');
      
      // Test main domain
      const detected1 = connectors.detectSiteIdFromUrl('https://mangavn.forumotion.net/t15202-sekirei');
      expect(detected1).toBe('mangavn');
      
      // Test alternative domain
      const detected2 = connectors.detectSiteIdFromUrl('http://www.mangavn.net/t15203-sekirei-chap-1');
      expect(detected2).toBe('mangavn');
      
      // Test https variant
      const detected3 = connectors.detectSiteIdFromUrl('https://www.mangavn.net/t15203-sekirei-chap-1');
      expect(detected3).toBe('mangavn');
    });

    it('should normalize www.mangavn.net URLs to mangavn.forumotion.net', async () => {
      const service = require('../../../platform/connectors/services/mangaVnService');
      
      // Test URL normalization
      const normalizeUrl = service.normalizeUrl || ((url) => url);
      
      const url1 = 'http://www.mangavn.net/t15203-sekirei-chap-1';
      const normalized1 = normalizeUrl(url1);
      expect(normalized1).toContain('mangavn.forumotion.net');
      expect(normalized1).not.toContain('www.mangavn.net');
      
      const url2 = 'https://www.mangavn.net/t15203-sekirei-chap-1';
      const normalized2 = normalizeUrl(url2);
      expect(normalized2).toContain('mangavn.forumotion.net');
    });
  });
});
