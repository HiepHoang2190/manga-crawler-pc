/**
 * MangaFire Service
 *
 * Catalog and chapter image lists come from a hidden BrowserWindow
 * (in-page signed APIs). Image bytes use Chromium session.fetch.
 */

const { ApiConnectorService } = require('../base/ApiConnectorService');
const { MangaFireApiClient, IMG_REFERER } = require('../api-clients/mangaFireClient');
const { downloadMangaFireImageToFile } = require('../../../download/connector/mangaFireImageDownload');

const SITE_DOMAIN = 'https://mangafire.to';
const LABEL = 'MangaFire';

/**
 * MangaFire Service Class
 * Extends ApiConnectorService with MangaFire-specific API client.
 *
 * Chapter images come from the in-page signed chapter API (not DOM scrape).
 */
class MangaFireService extends ApiConnectorService {
  constructor() {
    super({
      domain: SITE_DOMAIN,
      label: LABEL,
      siteId: 'mangafire',
      apiClient: new MangaFireApiClient(),
      imageReferer: IMG_REFERER,
    });
  }

  /**
   * Chromium session.fetch cancels cross-origin requests whose Referer
   * includes a path (strict-origin-when-cross-origin). Origin only.
   */
  getReferer(_payload) {
    return IMG_REFERER;
  }

  /**
   * mfcdn2 resets Node TLS; Chromium session.fetch matches the in-page <img> load.
   * Single attempt — downloadChapter already retries 3 times.
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, _maxAttempts = 3, _imageInfo = {}, shouldAbort) {
    const IMAGE_FETCH_TIMEOUT_MS = 30_000;
    const abort_controller = new AbortController();
    const timer = setTimeout(() => abort_controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    let poll_interval;
    if (typeof shouldAbort === 'function') {
      poll_interval = setInterval(() => {
        if (shouldAbort()) abort_controller.abort();
      }, 300);
    }

    try {
      return await downloadMangaFireImageToFile(
        imageUrl,
        filePath,
        headers || this.getImageHeaders(IMG_REFERER),
        abort_controller.signal,
      );
    } finally {
      clearTimeout(timer);
      if (poll_interval) clearInterval(poll_interval);
    }
  }
}

// Create service instance
const service = new MangaFireService();

/**
 * Load manga information and chapters
 * @param {string} url - Manga URL
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url) {
  return service.load(url);
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
  MangaFireService,
};
