const { describe, it, expect, beforeEach } = require('@jest/globals');
const { ApiConnectorService } = require('./ApiConnectorService');

describe('ApiConnectorService', () => {
  let mockApiClient;
  let service;
  const mockConfig = {
    domain: 'https://api.example.com/',
    label: 'TestAPI',
    siteId: 'testapi',
  };

  beforeEach(() => {
    mockApiClient = {
      load: jest.fn(),
      fetchChapterImages: jest.fn(),
    };
    service = new ApiConnectorService({ ...mockConfig, apiClient: mockApiClient });
  });

  describe('constructor', () => {
    it('should require apiClient in config', () => {
      expect(() => new ApiConnectorService(mockConfig)).toThrow(
        'ApiConnectorService requires config.apiClient'
      );
    });

    it('should require apiClient to have load method', () => {
      expect(() => new ApiConnectorService({ ...mockConfig, apiClient: {} })).toThrow(
        'apiClient must have a load() method'
      );
    });

    it('should require apiClient to have fetchChapterImages method', () => {
      expect(
        () =>
          new ApiConnectorService({
            ...mockConfig,
            apiClient: { load: jest.fn() },
          })
      ).toThrow('apiClient must have a fetchChapterImages() method');
    });

    it('should store config with apiClient', () => {
      expect(service.config.apiClient).toBe(mockApiClient);
    });
  });

  describe('load', () => {
    it('should delegate to apiClient.load', async () => {
      const mockResult = {
        ok: true,
        manga: { title: 'Test Manga' },
        chapters: [],
      };
      mockApiClient.load.mockResolvedValueOnce(mockResult);

      const result = await service.load('https://api.example.com/manga/123');

      expect(mockApiClient.load).toHaveBeenCalledWith('https://api.example.com/manga/123', {});
      expect(result).toEqual(mockResult);
    });

    it('should pass options to apiClient.load', async () => {
      const mockResult = { ok: true, manga: {}, chapters: [] };
      mockApiClient.load.mockResolvedValueOnce(mockResult);

      const options = { language: 'en' };
      await service.load('https://api.example.com/manga/123', options);

      expect(mockApiClient.load).toHaveBeenCalledWith('https://api.example.com/manga/123', options);
    });

    it('should handle apiClient errors', async () => {
      mockApiClient.load.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.load('https://api.example.com/manga/123')).rejects.toThrow('API Error');
    });
  });

  describe('fetchChapterImages', () => {
    it('should delegate to apiClient.fetchChapterImages', async () => {
      const mockImages = [
        { imageUrl: 'https://cdn.example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://cdn.example.com/2.jpg', ext: 'jpg' },
      ];
      mockApiClient.fetchChapterImages.mockResolvedValueOnce(mockImages);

      const result = await service.fetchChapterImages(
        'https://api.example.com/chapter/456',
        'https://example.com'
      );

      expect(mockApiClient.fetchChapterImages).toHaveBeenCalledWith(
        'https://api.example.com/chapter/456'
      );
      expect(result).toEqual(mockImages);
    });

    it('should not pass referer to apiClient (API-based)', async () => {
      mockApiClient.fetchChapterImages.mockResolvedValueOnce([]);

      await service.fetchChapterImages('https://api.example.com/chapter/456', 'https://example.com');

      expect(mockApiClient.fetchChapterImages).toHaveBeenCalledWith('https://api.example.com/chapter/456');
      expect(mockApiClient.fetchChapterImages).not.toHaveBeenCalledWith(
        expect.anything(),
        'https://example.com'
      );
    });

    it('should handle apiClient errors', async () => {
      mockApiClient.fetchChapterImages.mockRejectedValueOnce(new Error('API Error'));

      await expect(
        service.fetchChapterImages('https://api.example.com/chapter/456', 'https://example.com')
      ).rejects.toThrow('API Error');
    });

    it('should return empty array if no images', async () => {
      mockApiClient.fetchChapterImages.mockResolvedValueOnce([]);

      const result = await service.fetchChapterImages(
        'https://api.example.com/chapter/456',
        'https://example.com'
      );

      expect(result).toEqual([]);
    });
  });
});
