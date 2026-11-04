/**
 * Comick Service using ApiConnectorService
 * Migrated from the original comickService.js to use the new base class architecture
 * Supports 18 languages: en, vi, ja, zh, zh-hk, ko, es, es-la, pt, pt-br, fr, de, it, ru, tr, id, th, ar
 */

const { ApiConnectorService } = require('../base/ApiConnectorService');
const { ComickApiClient, IMG_REFERER } = require('./comickApiClient');

const SITE_DOMAIN = 'https://comick.live';
const LABEL = 'Comick';

/**
 * Comick Service Class
 * Extends ApiConnectorService with Comick-specific API client
 */
class ComickService extends ApiConnectorService {
  constructor() {
    super({
      domain: SITE_DOMAIN,
      label: LABEL,
      siteId: 'comick',
      apiClient: new ComickApiClient(),
      imageReferer: IMG_REFERER,
    });
  }

  /**
   * Override getReferer to use Comick image referer
   * @param {object} payload - Download payload
   * @returns {string} Referer URL
   */
  getReferer(payload) {
    return IMG_REFERER;
  }

  /**
   * Load manga with language selection support
   * Preserves the 18-language selection logic from the original service
   * @param {string} url - Manga URL
   * @param {string} language - Language code (default: 'en')
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, language = 'en') {
    // Normalize language parameter
    const lang = String(language || 'en').toLowerCase();
    
    return super.load(url, { comickLanguage: lang });
  }
}

// Create service instance
const service = new ComickService();

/**
 * Load manga information and chapters
 * @param {string} url - Manga URL
 * @param {string} language - Language code (default: 'en')
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, language = 'en') {
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

module.exports = {
  SITE_DOMAIN,
  LABEL,
  load,
  downloadChapter,
  // Export for testing and compatibility
  service,
  ComickService,
};
