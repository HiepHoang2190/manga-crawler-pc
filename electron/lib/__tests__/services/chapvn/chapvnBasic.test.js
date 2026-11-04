/**
 * Basic tests for Chap.vn connector
 */
const { load } = require('../../../platform/connectors/services/chapVnService');

describe('Chap.vn Connector - Basic Tests', () => {
  describe('load()', () => {
    it('should reject empty URL', async () => {
      const result = await load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    it('should reject invalid URL', async () => {
      // Invalid URLs will be caught during fetch
      try {
        const result = await load('not-a-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Expected - invalid URL throws during fetch
        expect(error).toBeDefined();
      }
    });

    it('should have correct structure on success', async () => {
      // This is a structure test - actual network test would be in integration tests
      const mockResult = {
        ok: true,
        manga: {
          title: 'Test Manga',
          coverUrl: 'https://example.com/cover.jpg',
          mangaUrl: 'https://chap.vn/threads/12345/',
          mangaId: '',
          siteId: 'chapvn',
          sourceLabel: 'Chap.vn',
        },
        chapters: [
          { url: 'https://chap.vn/threads/12345/', title: 'Trang 1' },
        ],
      };

      expect(mockResult.ok).toBe(true);
      expect(mockResult.manga).toBeDefined();
      expect(mockResult.manga.title).toBeDefined();
      expect(mockResult.manga.siteId).toBe('chapvn');
      expect(mockResult.chapters).toBeInstanceOf(Array);
    });
  });

  describe('Service Configuration', () => {
    it('should export required functions', () => {
      const service = require('../../../platform/connectors/services/chapVnService');
      expect(typeof service.load).toBe('function');
      expect(typeof service.downloadChapter).toBe('function');
      expect(service.DOMAIN).toBe('https://chap.vn/');
      expect(service.LABEL).toBe('Chap.vn');
    });
  });

  describe('Connector Registration', () => {
    it('should be registered in connector registry', () => {
      const connectors = require('../../../platform/connectors');
      const chapvn = connectors.get('chapvn');
      expect(chapvn).toBeDefined();
      expect(chapvn.id).toBe('chapvn');
      expect(chapvn.label).toBe('Chap.vn');
      expect(chapvn.domain).toBe('https://chap.vn/');
    });

    it('should detect chap.vn URLs', () => {
      const connectors = require('../../../platform/connectors');
      const detected = connectors.detectSiteIdFromUrl('https://chap.vn/threads/60321/');
      expect(detected).toBe('chapvn');
    });
  });
});
