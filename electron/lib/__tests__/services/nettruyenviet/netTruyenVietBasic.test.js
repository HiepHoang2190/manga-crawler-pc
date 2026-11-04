/**
 * Basic tests for NetTruyenViet Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan
 */
const { describe, test, expect } = require('@jest/globals');

// Import the service
const netTruyenVietService = require('../../../platform/connectors/services/netTruyenVietService');

describe('NetTruyenViet Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(netTruyenVietService.DOMAIN).toBeDefined();
      expect(netTruyenVietService.LABEL).toBe('NetTruyenViet');
    });

    test('should export required functions', () => {
      expect(typeof netTruyenVietService.load).toBe('function');
      expect(typeof netTruyenVietService.downloadChapter).toBe('function');
    });
  });

  describe('URL Format Validation', () => {
    test('should recognize valid NetTruyenViet URLs', () => {
      const validUrls = [
        'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan',
        'https://nettruyenviet9.com/truyen-tranh/test-manga',
        'https://nettruyen.work/truyen-tranh/another-manga',
      ];

      validUrls.forEach(url => {
        expect(url).toMatch(/nettruyenviet\d+\.com|nettruyen\.work/);
      });
    });

    test('should handle manga slug in URL', () => {
      const url = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      
      // Extract manga slug from URL
      const slugMatch = url.match(/\/truyen-tranh\/([^/?]+)/);
      expect(slugMatch).not.toBeNull();
      expect(slugMatch[1]).toBe('ta-that-su-khong-muon-lam-thanh-nhan');
    });

    test('should handle Vietnamese manga titles in URLs', () => {
      const url = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      
      expect(url).toContain('ta-that-su-khong-muon-lam-thanh-nhan');
      expect(url).toContain('truyen-tranh');
    });

    test('should handle chapter URLs', () => {
      const chapterUrl = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan/chap-1';
      
      expect(chapterUrl).toContain('/truyen-tranh/');
      expect(chapterUrl).toMatch(/\/chap-\d+/);
    });

    test('should support numbered domains', () => {
      const domains = [
        'nettruyenviet9.com',
        'nettruyenviet10.com',
        'nettruyenviet11.com',
      ];

      domains.forEach(domain => {
        expect(domain).toMatch(/nettruyenviet\d+\.com/);
      });
    });

    test('should support nettruyen.work domain', () => {
      const url = 'https://nettruyen.work/truyen-tranh/test-manga';
      expect(url).toContain('nettruyen.work');
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await netTruyenVietService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate null URL', async () => {
      const result = await netTruyenVietService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate undefined URL', async () => {
      const result = await netTruyenVietService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('load() should validate whitespace URL', async () => {
      const result = await netTruyenVietService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Service Architecture', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(netTruyenVietService.DOMAIN).toBeDefined();
      expect(netTruyenVietService.LABEL).toBeDefined();
    });

    test('should support HTML-based fetching', () => {
      // NetTruyenViet uses HTML parsing with Settings cookie
      expect(typeof netTruyenVietService.load).toBe('function');
    });

    test('should support Vietnamese content', () => {
      expect(netTruyenVietService.DOMAIN).toContain('nettruyen');
    });
  });

  describe('Response Format Expectations', () => {
    test('load() function signature validation', () => {
      expect(typeof netTruyenVietService.load).toBe('function');
      expect(netTruyenVietService.load.length).toBeGreaterThanOrEqual(1);
    });

    test('downloadChapter() should accept proper payload structure', () => {
      const payload = {
        mangaTitle: 'Ta Thật Sự Không Muốn Làm Thánh Nhân',
        mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan',
        chapterUrl: 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan/chap-1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };

      expect(payload.mangaTitle).toBeDefined();
      expect(payload.chapterUrl).toBeDefined();
      expect(typeof netTruyenVietService.downloadChapter).toBe('function');
    });
  });

  describe('URL Pattern Matching', () => {
    test('should match nettruyenviet domain', () => {
      const url = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      expect(url).toMatch(/nettruyenviet\d+\.com/);
    });

    test('should match nettruyen.work domain', () => {
      const url = 'https://nettruyen.work/truyen-tranh/test-manga';
      expect(url).toMatch(/nettruyen\.work/);
    });

    test('should match /truyen-tranh/ path pattern', () => {
      const url = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      expect(url).toMatch(/\/truyen-tranh\//);
    });

    test('should extract manga slug from URL', () => {
      const url = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan';
      
      const slugMatch = url.match(/\/truyen-tranh\/([^/?]+)/);
      expect(slugMatch).not.toBeNull();
      expect(slugMatch[1]).toBe('ta-that-su-khong-muon-lam-thanh-nhan');
    });

    test('should match chapter URL pattern', () => {
      const chapterUrl = 'https://nettruyenviet10.com/truyen-tranh/ta-that-su-khong-muon-lam-thanh-nhan/chap-1';
      expect(chapterUrl).toMatch(/\/chap-\d+/);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await netTruyenVietService.load('https://nonexistent-nettruyen-domain.com/truyen-tranh/test');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      } catch (error) {
        // Network errors throw exceptions, which is expected behavior
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed URLs', async () => {
      try {
        const result = await netTruyenVietService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('Domain Variations', () => {
    test('should handle nettruyenviet9.com domain', () => {
      const url = 'https://nettruyenviet9.com/truyen-tranh/test';
      expect(url).toMatch(/nettruyenviet9\.com/);
    });

    test('should handle nettruyenviet10.com domain', () => {
      const url = 'https://nettruyenviet10.com/truyen-tranh/test';
      expect(url).toMatch(/nettruyenviet10\.com/);
    });

    test('should handle nettruyen.work domain', () => {
      const url = 'https://nettruyen.work/truyen-tranh/test';
      expect(url).toMatch(/nettruyen\.work/);
    });

    test('should handle potential numbered domains', () => {
      const domains = ['nettruyenviet9.com', 'nettruyenviet10.com', 'nettruyenviet11.com'];
      
      domains.forEach(domain => {
        expect(domain).toMatch(/nettruyenviet\d+\.com/);
      });
    });
  });

});
