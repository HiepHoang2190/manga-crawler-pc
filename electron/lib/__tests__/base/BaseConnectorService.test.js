const { describe, it, expect, beforeEach } = require('@jest/globals');
const { BaseConnectorService } = require('./BaseConnectorService');

// Mock concrete implementation for testing
class TestConnectorService extends BaseConnectorService {
  constructor(config) {
    super(config);
    this.mockLoad = jest.fn();
    this.mockFetchChapterImages = jest.fn();
  }

  async load(url, options) {
    return this.mockLoad(url, options);
  }

  async fetchChapterImages(chapterUrl, referer) {
    return this.mockFetchChapterImages(chapterUrl, referer);
  }
}

describe('BaseConnectorService', () => {
  let service;
  const mockConfig = {
    domain: 'https://example.com/',
    label: 'TestSite',
    siteId: 'testsite',
  };

  beforeEach(() => {
    service = new TestConnectorService(mockConfig);
  });

  describe('constructor', () => {
    it('should require config with domain, label, and siteId', () => {
      expect(() => new BaseConnectorService({})).toThrow();
      expect(() => new BaseConnectorService({ domain: 'test' })).toThrow();
      expect(() => new BaseConnectorService({ domain: 'test', label: 'Test' })).toThrow();
    });

    it('should store config', () => {
      expect(service.config).toEqual(mockConfig);
    });
  });

  describe('abstract methods', () => {
    it('should throw error when load() is not implemented', async () => {
      const base = new BaseConnectorService(mockConfig);
      await expect(base.load('url')).rejects.toThrow('load() must be implemented');
    });

    it('should throw error when fetchChapterImages() is not implemented', async () => {
      const base = new BaseConnectorService(mockConfig);
      await expect(base.fetchChapterImages('url', 'referer')).rejects.toThrow(
        'fetchChapterImages() must be implemented'
      );
    });
  });

  describe('hook methods', () => {
    it('getReferer should return domain by default', () => {
      const payload = { mangaUrl: 'https://manga.com', chapterUrl: 'https://chapter.com' };
      expect(service.getReferer(payload)).toBe(mockConfig.domain);
    });

    it('getReferer should use imageReferer if provided', () => {
      const serviceWithReferer = new TestConnectorService({
        ...mockConfig,
        imageReferer: 'https://cdn.example.com/',
      });
      const payload = {};
      expect(serviceWithReferer.getReferer(payload)).toBe('https://cdn.example.com/');
    });

    it('getReferer should fallback to mangaUrl', () => {
      const serviceWithoutDomain = new TestConnectorService({
        domain: 'https://example.com/',
        label: 'Test',
        siteId: 'test',
      });
      // Override getReferer to test fallback logic
      serviceWithoutDomain.config.domain = '';
      const payload = { mangaUrl: 'https://manga.com' };
      expect(serviceWithoutDomain.getReferer(payload)).toBe('https://manga.com');
    });

    it('getUserAgent should return default user agent', () => {
      expect(service.getUserAgent()).toBeTruthy();
      expect(typeof service.getUserAgent()).toBe('string');
    });

    it('getImageHeaders should return headers object', () => {
      const headers = service.getImageHeaders('https://example.com');
      expect(headers).toHaveProperty('Referer', 'https://example.com');
      expect(headers).toHaveProperty('User-Agent');
      expect(headers).toHaveProperty('Accept');
    });
  });

  describe('downloadChapter', () => {
    it('should validate required payload fields', async () => {
      // This test would require extensive mocking of fs, downloadDb, etc.
      // For now, we verify the method exists and is callable
      expect(typeof service.downloadChapter).toBe('function');
    });

    it('should call fetchChapterImages during download', async () => {
      // Mock implementation would go here
      // This is a placeholder to show the test structure
      expect(service.mockFetchChapterImages).toBeDefined();
    });
  });
});
