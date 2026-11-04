const { BaseConnectorService } = require('./BaseConnectorService');

/**
 * API-based connector service.
 * 
 * Extends BaseConnectorService with API client delegation.
 * Suitable for manga sites that provide REST APIs or require complex API interactions.
 * 
 * ## Features
 * 
 * - Delegates load() and fetchChapterImages() to injected API client
 * - Maintains compatibility with existing API-based connectors
 * - Supports custom API clients with any implementation
 * - Inherits all download orchestration from BaseConnectorService
 * 
 * ## API Client Interface
 * 
 * The API client must implement:
 * ```javascript
 * {
 *   async load(url, options) {
 *     // Return: {ok, manga, chapters, error}
 *   },
 *   async fetchChapterImages(chapterUrl) {
 *     // Return: [{imageUrl, ext}, ...]
 *   }
 * }
 * ```
 * 
 * ## Usage Example - Simple API Connector
 * 
 * ```javascript
 * const { ApiConnectorService } = require('./base/ApiConnectorService');
 * 
 * // Create API client
 * const apiClient = {
 *   async load(url, options) {
 *     const response = await fetch(`https://api.example.com/manga?url=${url}`);
 *     const data = await response.json();
 *     return {
 *       ok: true,
 *       manga: {
 *         title: data.title,
 *         coverUrl: data.cover,
 *         mangaUrl: url,
 *         mangaId: data.id,
 *         siteId: 'example',
 *         sourceLabel: 'Example API',
 *       },
 *       chapters: data.chapters.map(ch => ({
 *         url: ch.url,
 *         title: ch.title
 *       }))
 *     };
 *   },
 * 
 *   async fetchChapterImages(chapterUrl) {
 *     const response = await fetch(`https://api.example.com/chapter?url=${chapterUrl}`);
 *     const data = await response.json();
 *     return data.images.map(img => ({
 *       imageUrl: img.url,
 *       ext: img.format || 'jpg'
 *     }));
 *   }
 * };
 * 
 * // Create service with API client
 * class ExampleApiService extends ApiConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://example.com/',
 *       label: 'Example API',
 *       siteId: 'example',
 *       apiClient: apiClient,
 *     });
 *   }
 * }
 * 
 * const service = new ExampleApiService();
 * module.exports = {
 *   load: (url, options) => service.load(url, options),
 *   downloadChapter: (payload) => service.downloadChapter(payload, 'Example API'),
 * };
 * ```
 * 
 * ## Usage Example - Existing API Client
 * 
 * ```javascript
 * // Reuse existing cuuTruyenClient
 * const cuuTruyenClient = require('../api-clients/cuuTruyenClient');
 * 
 * class CuuTruyenService extends ApiConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://cuutruyen.net/',
 *       label: 'Cứu Truyện',
 *       siteId: 'cuutruyen',
 *       apiClient: cuuTruyenClient,
 *     });
 *   }
 * }
 * ```
 * 
 * ## Usage Example - Language Selection
 * 
 * ```javascript
 * // API client with language selection
 * const mangadexApiClient = {
 *   async load(url, options = {}) {
 *     const lang = options.language || 'en';
 *     const response = await fetch(`https://api.mangadex.org/manga/${id}?lang=${lang}`);
 *     // ... parse and return
 *   },
 * 
 *   async fetchChapterImages(chapterUrl) {
 *     const response = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
 *     const data = await response.json();
 *     return data.chapter.data.map(filename => ({
 *       imageUrl: `${data.baseUrl}/data/${data.chapter.hash}/${filename}`,
 *       ext: filename.split('.').pop()
 *     }));
 *   }
 * };
 * 
 * class MangadexService extends ApiConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://mangadex.org/',
 *       label: 'MangaDex',
 *       siteId: 'mangadex',
 *       apiClient: mangadexApiClient,
 *     });
 *   }
 * }
 * ```
 * 
 * @extends BaseConnectorService
 */
class ApiConnectorService extends BaseConnectorService {
  /**
   * Create a new API connector service instance.
   * 
   * @param {object} config - Connector configuration
   * @param {string} config.domain - Base domain URL
   * @param {string} config.label - Human-readable connector label
   * @param {string} config.siteId - Unique site identifier
   * @param {object} config.apiClient - API client instance
   * @param {Function} config.apiClient.load - Load manga function (url, options) => Promise<{ok, manga, chapters, error}>
   * @param {Function} config.apiClient.fetchChapterImages - Fetch images function (chapterUrl) => Promise<[{imageUrl, ext}]>
   * @param {string} [config.imageReferer] - Custom referer for image requests
   * 
   * @throws {Error} If config is missing or lacks apiClient
   * @throws {Error} If apiClient is missing required methods
   * 
   * @example
   * const service = new ApiConnectorService({
   *   domain: 'https://api.example.com/',
   *   label: 'Example API',
   *   siteId: 'example',
   *   apiClient: {
   *     load: async (url, options) => { ... },
   *     fetchChapterImages: async (chapterUrl) => { ... }
   *   }
   * });
   */
  constructor(config) {
    super(config);
    if (!config.apiClient) {
      throw new Error('ApiConnectorService requires config.apiClient');
    }
    if (typeof config.apiClient.load !== 'function') {
      throw new Error('apiClient must have a load() method');
    }
    if (typeof config.apiClient.fetchChapterImages !== 'function') {
      throw new Error('apiClient must have a fetchChapterImages() method');
    }
  }

  /**
   * Load manga information from URL.
   * 
   * Delegates to the API client's load() method.
   * 
   * @param {string} url - Manga URL to load
   * @param {object} [options] - Load options (passed to API client)
   * 
   * @returns {Promise<object>} Result from API client
   * @returns {boolean} result.ok - Whether the operation succeeded
   * @returns {object} [result.manga] - Manga metadata
   * @returns {Array<{url: string, title: string}>} [result.chapters] - Chapter list
   * @returns {string} [result.error] - Error message if failed
   * 
   * @example
   * const result = await service.load('https://example.com/manga/123', {
   *   language: 'en'
   * });
   */
  async load(url, options = {}) {
    return this.config.apiClient.load(url, options);
  }

  /**
   * Fetch chapter images from chapter URL.
   * 
   * Delegates to the API client's fetchChapterImages() method.
   * Note: The referer parameter may not be used by API-based implementations.
   * 
   * @param {string} chapterUrl - Chapter URL to fetch images from
   * @param {string} referer - Referer header value (may not be used by API)
   * 
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>} Array of image objects from API client
   * 
   * @example
   * const images = await service.fetchChapterImages('https://example.com/chapter/123');
   * // Returns: [{imageUrl: 'https://...', ext: 'jpg'}, ...]
   */
  async fetchChapterImages(chapterUrl, referer) {
    return this.config.apiClient.fetchChapterImages(chapterUrl);
  }
}

module.exports = { ApiConnectorService };
