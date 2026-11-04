/**
 * Test suite for MangaDex API Client fetchMangaCovers
 */

const { fetchMangaCovers } = require('../../../platform/connectors/services/mangadxApiClient');

// Mock fetch globally
global.fetch = jest.fn();

describe('MangaDex API Client - fetchMangaCovers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input validation', () => {
    it('should reject invalid manga ID', async () => {
      const result = await fetchMangaCovers('invalid-id');
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Manga ID không hợp lệ');
    });

    it('should reject empty manga ID', async () => {
      const result = await fetchMangaCovers('');
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Manga ID không hợp lệ');
    });

    it('should reject null manga ID', async () => {
      const result = await fetchMangaCovers(null);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Manga ID không hợp lệ');
    });

    it('should accept valid UUID', async () => {
      const validId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';
      
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      
      await fetchMangaCovers(validId);
      
      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('API request', () => {
    const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';

    it('should call correct API endpoint', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      
      await fetchMangaCovers(testId);
      
      const callUrl = fetch.mock.calls[0][0];
      expect(callUrl).toContain('/cover');
      expect(callUrl).toContain(`manga[]=${testId}`);
      expect(callUrl).toContain('limit=100');
      expect(callUrl).toContain('order[volume]=asc');
    });

    it('should handle HTTP error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle network error', async () => {
      fetch.mockRejectedValue(new Error('Network error'));
      
      try {
        await fetchMangaCovers(testId);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  describe('Response parsing', () => {
    const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';

    it('should parse valid cover data', async () => {
      const mockResponse = {
        data: [
          {
            id: 'cover-1',
            attributes: {
              fileName: 'test.jpg',
              volume: '1',
              description: 'Volume 1',
            },
          },
        ],
      };

      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(true);
      expect(result.covers).toHaveLength(1);
      expect(result.covers[0].id).toBe('cover-1');
      expect(result.covers[0].fileName).toBe('test.jpg');
      expect(result.covers[0].volume).toBe('1');
    });

    it('should handle multiple covers', async () => {
      const mockResponse = {
        data: [
          {
            id: 'cover-1',
            attributes: { fileName: 'test1.jpg', volume: '1', description: '' },
          },
          {
            id: 'cover-2',
            attributes: { fileName: 'test2.jpg', volume: '2', description: '' },
          },
          {
            id: 'cover-3',
            attributes: { fileName: 'test3.jpg', volume: '3', description: '' },
          },
        ],
      };

      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(true);
      expect(result.covers).toHaveLength(3);
    });

    it('should filter out covers without fileName', async () => {
      const mockResponse = {
        data: [
          {
            id: 'cover-1',
            attributes: { fileName: 'test1.jpg', volume: '1' },
          },
          {
            id: 'cover-2',
            attributes: { volume: '2' }, // Missing fileName
          },
          {
            id: 'cover-3',
            attributes: { fileName: 'test3.jpg', volume: '3' },
          },
        ],
      };

      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(true);
      expect(result.covers).toHaveLength(2);
      expect(result.covers[0].id).toBe('cover-1');
      expect(result.covers[1].id).toBe('cover-3');
    });

    it('should handle covers without volume', async () => {
      const mockResponse = {
        data: [
          {
            id: 'cover-1',
            attributes: { fileName: 'test.jpg' }, // No volume
          },
        ],
      };

      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(true);
      expect(result.covers[0].volume).toBeNull();
    });

    it('should generate correct CDN URLs', async () => {
      const mockResponse = {
        data: [
          {
            id: 'cover-1',
            attributes: { fileName: 'test.jpg', volume: '1' },
          },
        ],
      };

      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.covers[0].url256).toBe(
        `https://uploads.mangadex.org/covers/${testId}/test.jpg.256.jpg`
      );
      expect(result.covers[0].url512).toBe(
        `https://uploads.mangadex.org/covers/${testId}/test.jpg.512.jpg`
      );
      expect(result.covers[0].urlOriginal).toBe(
        `https://uploads.mangadex.org/covers/${testId}/test.jpg`
      );
    });

    it('should handle empty data array', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(true);
      expect(result.covers).toEqual([]);
    });

    it('should handle invalid response structure', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'structure' }),
      });
      
      const result = await fetchMangaCovers(testId);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Dữ liệu cover không hợp lệ');
    });
  });

  describe('Volume ordering', () => {
    const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';

    it('should request covers ordered by volume ascending', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      
      await fetchMangaCovers(testId);
      
      const callUrl = fetch.mock.calls[0][0];
      expect(callUrl).toContain('order[volume]=asc');
    });
  });
});
