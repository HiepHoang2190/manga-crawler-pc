/**
 * MangaDex Service using ApiConnectorService
 * Migrated from the original mangadexService.js to use the new base class architecture
 */

const { ApiConnectorService } = require('../base/ApiConnectorService');
const { MangaDexApiClient, fetchMangaDexLatestUpdates, fetchMangaCovers, extractMangaId } = require('./mangadxApiClient');

const DOMAIN = 'https://mangadex.org/';
const LABEL = 'MangaDex';

/**
 * MangaDx Service Class
 * Extends ApiConnectorService with MangaDx-specific API client
 */
class MangaDexService extends ApiConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'mangadex',
      apiClient: new MangaDexApiClient(),
      imageReferer: DOMAIN,
    });
  }

  /**
   * Override getReferer to use MangaDex chapter URL as referer for images
   * @param {object} payload - Download payload
   * @returns {string} Referer URL
   */
  getReferer(payload) {
    // Use chapter URL as referer for MangaDex at-home API
    return payload.chapterUrl || DOMAIN;
  }

  /**
   * Load manga with language selection support
   * Preserves the language selection logic from the original service
   * @param {string} url - Manga URL
   * @param {string} language - Language code (vi/en/ja)
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, language = 'vi') {
    // Validate language parameter (case-insensitive)
    const validLanguages = ['vi', 'en', 'ja'];
    const normalizedLang = String(language || 'vi').toLowerCase();
    const lang = validLanguages.includes(normalizedLang) ? normalizedLang : 'vi';
    
    return super.load(url, { mangadexLanguage: lang });
  }

  /**
   * Override downloadChapter to fix MangaDex cover download
   * MangaDex's cover server rejects requests with custom User-Agent
   */
  async downloadChapter(payload, connectorLabel) {
    const { coverUrl, mangaTitle, baseSaveDir } = payload;
    
    if (coverUrl) {
      const { resolveMangaDir } = require('../../../download/connector/connectorPathUtils');
      const { downloadCoverIfNeeded } = require('../../../download/connector/connectorDownloadUtils');
      
      const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
      const log = (msg, level = 'info') => {
        if (typeof payload.onLog === 'function') payload.onLog(msg, level);
      };
      
      // For uploads.mangadex.org, pass DOMAIN as referer and undefined for User-Agent
      await downloadCoverIfNeeded(coverUrl, mangaDir, DOMAIN, undefined, log);
    }
    
    // Create a modified payload without the coverUrl so the base class skips its cover download
    const modifiedPayload = { ...payload, coverUrl: null };
    
    return super.downloadChapter(modifiedPayload, connectorLabel);
  }
}

// Create service instance
const service = new MangaDexService();

/**
 * Load manga information and chapters
 * @param {string} url - Manga URL
 * @param {string} language - Language code (vi/en/ja)
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, language = 'vi') {
  return service.load(url, language);
}

/**
 * Download chapter using the base class template method
 * @param {object} payload - Download configuration
 * @param {string} connector - Connector label
 * @returns {Promise<{ok: boolean, successCount?: number, totalPages?: number, failedPageIndices?: array}>}
 */
function downloadChapter(payload, connector = LABEL) {
  return service.downloadChapter(payload, connector);
}

/**
 * Tab Mới cập nhật — api.mangadex.org/manga (latest or title search).
 *
 * @param {object} [options]  forwarded from IPC (page, latestUpdatesSearch, mangadexListLimit, …)
 */
function fetchLatestUpdates(options = {}) {
  return fetchMangaDexLatestUpdates(options || {});
}

/**
 * Fetch all available covers for a manga
 * @param {string} urlOrId - Manga URL or UUID
 * @returns {Promise<{ok: boolean, covers?: array, error?: string}>}
 */
function fetchCovers(urlOrId) {
  const mangaId = extractMangaId(urlOrId);
  if (!mangaId) {
    return Promise.resolve({ 
      ok: false, 
      error: 'Không lấy được ID truyện từ URL (dạng .../title/<uuid>).' 
    });
  }
  return fetchMangaCovers(mangaId);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
  fetchCovers,
  // Export for testing and compatibility
  service,
  MangaDexService,
};