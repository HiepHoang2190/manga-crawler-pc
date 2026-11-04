/**
 * ComicDays Service using ApiConnectorService
 * Migrated from the original comicDaysService.js to use the new base class architecture
 * Handles ComicDays (Kodansha) official API with custom image descrambling
 */

const fs = require('fs');
const path = require('path');
const { ApiConnectorService } = require('../base/ApiConnectorService');
const { ComicDaysApiClient } = require('./comicDaysApiClient');

const DOMAIN = 'https://comic-days.com/';
const LABEL = 'ComicDays';

/**
 * ComicDays Service Class
 * Extends ApiConnectorService with ComicDays-specific API client and custom image download logic
 */
class ComicDaysService extends ApiConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'comicdays',
      apiClient: new ComicDaysApiClient(),
      imageReferer: DOMAIN,
    });
  }

  /**
   * Override getUserAgent to use ComicDays-specific user agent
   * @returns {string} User agent string
   */
  getUserAgent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  /**
   * Override getImageHeaders for ComicDays-specific headers
   * @param {string} referer - Referer header value
   * @returns {object} HTTP headers for image requests
   */
  getImageHeaders(referer) {
    return {
      Referer: DOMAIN,
      'User-Agent': this.getUserAgent(),
    };
  }

  /**
   * Override downloadImageWithRetry to handle ComicDays image descrambling
   * ComicDays images are scrambled and need to be descrambled using Jimp
   * @param {string} imageUrl - Image URL
   * @param {string} filePath - Target file path
   * @param {object} headers - HTTP headers
   * @param {number} maxAttempts - Maximum retry attempts
   * @param {object} imageInfo - Additional image info (contains needsDescrambling flag)
   * @returns {Promise<{ok: boolean, fileSize?: number}>}
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Download scrambled image
        const res = await fetch(imageUrl, { headers });
        if (!res.ok) {
          if (attempt === maxAttempts) return { ok: false };
          continue;
        }

        const scrambledBuf = Buffer.from(await res.arrayBuffer());
        if (!scrambledBuf.length) {
          if (attempt === maxAttempts) return { ok: false };
          continue;
        }

        // Descramble the image if needed (ComicDays images are always scrambled)
        let finalBuf = scrambledBuf;
        if (imageInfo.needsDescrambling) {
          finalBuf = await this.config.apiClient.downloadImageBuffer(scrambledBuf);
        }

        // Write descrambled image to file
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, finalBuf);

        // Verify file was written successfully
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          return { ok: true, fileSize: fs.statSync(filePath).size };
        }

        if (attempt === maxAttempts) return { ok: false };
      } catch (error) {
        if (attempt === maxAttempts) return { ok: false };
        // Wait before retry
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    return { ok: false };
  }
}

// Create service instance
const service = new ComicDaysService();

/**
 * Load manga information and chapters
 * @param {string} url - Manga URL
 * @param {object} options - Load options (unused for ComicDays)
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, options = {}) {
  return service.load(url, options);
}

/**
 * Download chapter using the base class template method with custom descrambling
 * @param {object} payload - Download configuration
 * @param {string} connector - Connector label
 * @returns {Promise<{ok: boolean, successCount?: number, totalPages?: number, failedPageIndices?: array}>}
 */
function downloadChapter(payload, connector = LABEL) {
  return service.downloadChapter(payload, connector);
}

module.exports = {
  COMIC_DAYS_DOMAIN: DOMAIN,
  LABEL,
  load,
  downloadChapter,
  // Export for testing and compatibility
  service,
  ComicDaysService,
};