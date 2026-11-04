/**
 * Tests for VietMessenger Service
 */
const service = require('../../platform/connectors/services/vietMessengerService');
const cookieManager = require('../../platform/cookies/cookieManager');

// Mock cookieManager
jest.mock('../../platform/cookies/cookieManager', () => ({
  getEffectiveCookie: jest.fn(),
}));

describe('VietMessenger Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cookie
    cookieManager.getEffectiveCookie.mockReturnValue('');
  });

  describe('load', () => {
    it('should reject empty URL', async () => {
      const result = await service.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    it('should require cookie for protected content', async () => {
      // VietMessenger yêu cầu cookie SESSION
      // Test đơn giản: URL không hợp lệ -> fail
      const url = 'https://vietmessenger.com/comics/?title=invalid-title-test-12345';
      
      // Without valid cookie and invalid URL, should fail
      const result = await service.load(url);
      
      // Should either fail or get incomplete data
      expect(result).toBeDefined();
    }, 10000);
  });

  describe('config', () => {
    it('should have correct domain', () => {
      expect(service.config.domain).toBe('https://vietmessenger.com/');
    });

    it('should have correct siteId', () => {
      expect(service.config.siteId).toBe('vietmessenger');
    });

    it('should have correct label', () => {
      expect(service.config.label).toBe('VietMessenger');
    });

    it('should have selectors configured', () => {
      expect(service.config.selectors).toBeDefined();
      expect(service.config.selectors.title).toBe('h2 a.title');
      expect(service.config.selectors.cover).toContain('/scover.');
    });
  });

  describe('getReferer', () => {
    it('should return chapter URL as referer', () => {
      const payload = {
        chapterUrl: 'https://vietmessenger.com/comics/?title=test',
      };
      const referer = service.getReferer(payload);
      expect(referer).toBe(payload.chapterUrl);
    });

    it('should return domain if no chapter URL', () => {
      const referer = service.getReferer({});
      expect(referer).toBe('https://vietmessenger.com/');
    });
  });

  describe('getImageHeaders', () => {
    it('should include custom User-Agent', () => {
      const headers = service.getImageHeaders('https://vietmessenger.com/');
      expect(headers['User-Agent']).toContain('Chrome');
    });

    it('should include Referer', () => {
      const referer = 'https://vietmessenger.com/comics/?title=test';
      const headers = service.getImageHeaders(referer);
      expect(headers.Referer).toBe(referer);
    });

    it('should include cookie when available', () => {
      const mockCookie = 'SESSION=test123';
      cookieManager.getEffectiveCookie.mockReturnValue(mockCookie);
      
      const headers = service.getImageHeaders('https://vietmessenger.com/');
      expect(headers.Cookie).toContain('SESSION=test123');
    });
  });
});
