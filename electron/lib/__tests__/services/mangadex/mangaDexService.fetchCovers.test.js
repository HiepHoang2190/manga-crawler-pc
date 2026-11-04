/**
 * Test suite for MangaDex fetchCovers functionality
 */

const { fetchCovers } = require('../../../platform/connectors/services/mangadexService');
const { fetchMangaCovers, extractMangaId } = require('../../../platform/connectors/services/mangadxApiClient');

// Mock the API client
jest.mock('../../../platform/connectors/services/mangadxApiClient', () => {
  const actual = jest.requireActual('../../../platform/connectors/services/mangadxApiClient');
  return {
    ...actual,
    fetchMangaCovers: jest.fn(),
  };
});

describe('MangaDex Service - fetchCovers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('URL parsing', () => {
    it('should extract manga ID from standard MangaDex URL', async () => {
      const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';
      const url = `https://mangadex.org/title/${testId}`;
      
      fetchMangaCovers.mockResolvedValue({ ok: true, covers: [] });
      
      await fetchCovers(url);
      
      expect(fetchMangaCovers).toHaveBeenCalledWith(testId);
    });

    it('should handle direct manga ID input', async () => {
      const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';
      
      fetchMangaCovers.mockResolvedValue({ ok: true, covers: [] });
      
      await fetchCovers(testId);
      
      expect(fetchMangaCovers).toHaveBeenCalledWith(testId);
    });

    it('should return error for invalid URL', async () => {
      const result = await fetchCovers('invalid-url');
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Không lấy được ID truyện');
    });

    it('should return error for empty input', async () => {
      const result = await fetchCovers('');
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Không lấy được ID truyện');
    });
  });

  describe('API response handling', () => {
    const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';
    const testUrl = `https://mangadex.org/title/${testId}`;

    it('should return covers array on success', async () => {
      const mockCovers = [
        {
          id: 'cover-1',
          fileName: 'test1.jpg',
          volume: '1',
          description: 'Volume 1 cover',
          url256: `https://uploads.mangadex.org/covers/${testId}/test1.jpg.256.jpg`,
          url512: `https://uploads.mangadex.org/covers/${testId}/test1.jpg.512.jpg`,
          urlOriginal: `https://uploads.mangadex.org/covers/${testId}/test1.jpg`,
        },
        {
          id: 'cover-2',
          fileName: 'test2.jpg',
          volume: '2',
          description: 'Volume 2 cover',
          url256: `https://uploads.mangadex.org/covers/${testId}/test2.jpg.256.jpg`,
          url512: `https://uploads.mangadex.org/covers/${testId}/test2.jpg.512.jpg`,
          urlOriginal: `https://uploads.mangadex.org/covers/${testId}/test2.jpg`,
        },
      ];

      fetchMangaCovers.mockResolvedValue({ ok: true, covers: mockCovers });
      
      const result = await fetchCovers(testUrl);
      
      expect(result.ok).toBe(true);
      expect(result.covers).toHaveLength(2);
      expect(result.covers[0]).toHaveProperty('url256');
      expect(result.covers[0]).toHaveProperty('url512');
      expect(result.covers[0]).toHaveProperty('urlOriginal');
    });

    it('should handle API error', async () => {
      fetchMangaCovers.mockResolvedValue({ 
        ok: false, 
        error: 'API error' 
      });
      
      const result = await fetchCovers(testUrl);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should handle empty covers array', async () => {
      fetchMangaCovers.mockResolvedValue({ ok: true, covers: [] });
      
      const result = await fetchCovers(testUrl);
      
      expect(result.ok).toBe(true);
      expect(result.covers).toEqual([]);
    });
  });

  describe('Cover data structure', () => {
    const testId = 'd1c0d3f9-f359-467c-8474-0b2ea8e06f3d';

    it('should include all required cover fields', async () => {
      const mockCover = {
        id: 'cover-id',
        fileName: 'test.jpg',
        volume: '1',
        description: 'Test cover',
        url256: `https://uploads.mangadex.org/covers/${testId}/test.jpg.256.jpg`,
        url512: `https://uploads.mangadex.org/covers/${testId}/test.jpg.512.jpg`,
        urlOriginal: `https://uploads.mangadex.org/covers/${testId}/test.jpg`,
      };

      fetchMangaCovers.mockResolvedValue({ ok: true, covers: [mockCover] });
      
      const result = await fetchCovers(testId);
      
      expect(result.covers[0]).toHaveProperty('id');
      expect(result.covers[0]).toHaveProperty('fileName');
      expect(result.covers[0]).toHaveProperty('volume');
      expect(result.covers[0]).toHaveProperty('description');
      expect(result.covers[0]).toHaveProperty('url256');
      expect(result.covers[0]).toHaveProperty('url512');
      expect(result.covers[0]).toHaveProperty('urlOriginal');
    });

    it('should handle covers without volume number', async () => {
      const mockCover = {
        id: 'cover-id',
        fileName: 'test.jpg',
        volume: null,
        description: '',
        url256: `https://uploads.mangadex.org/covers/${testId}/test.jpg.256.jpg`,
        url512: `https://uploads.mangadex.org/covers/${testId}/test.jpg.512.jpg`,
        urlOriginal: `https://uploads.mangadex.org/covers/${testId}/test.jpg`,
      };

      fetchMangaCovers.mockResolvedValue({ ok: true, covers: [mockCover] });
      
      const result = await fetchCovers(testId);
      
      expect(result.ok).toBe(true);
      expect(result.covers[0].volume).toBeNull();
    });
  });
});
