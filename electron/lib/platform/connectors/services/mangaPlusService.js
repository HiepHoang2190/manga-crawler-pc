/**
 * MangaPlus Service using ApiConnectorService
 * Migrated from the original mangaPlusService.js to use the new base class architecture
 * Special handling for XOR-encrypted images
 */

const fs = require('fs');
const path = require('path');
const { ApiConnectorService } = require('../base/ApiConnectorService');
const { MangaPlusApiClient, SITE_DOMAIN, sessionToken } = require('./mangaPlusApiClient');

const LABEL = 'MangaPlus';

/**
 * Decrypt image bytes using XOR encryption
 * @param {Buffer} imageData - Encrypted image data
 * @param {string} encryptionKey - Hex-encoded encryption key
 * @returns {Buffer} Decrypted image data
 */
function decryptImageBytes(imageData, encryptionKey) {
  if (!encryptionKey || !String(encryptionKey).length) {
    return imageData;
  }
  const key = String(encryptionKey);
  const keyBytes = Buffer.alloc(key.length / 2);
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(key.substr(i * 2, 2), 16);
  }
  const result = Buffer.alloc(imageData.length);
  for (let i = 0; i < imageData.length; i++) {
    result[i] = imageData[i] ^ keyBytes[i % keyBytes.length];
  }
  return result;
}

/**
 * MangaPlus Service Class
 * Extends ApiConnectorService with custom image download logic for encrypted images
 */
class MangaPlusService extends ApiConnectorService {
  constructor() {
    super({
      domain: SITE_DOMAIN,
      label: LABEL,
      siteId: 'mangaplus',
      apiClient: new MangaPlusApiClient(),
      imageReferer: SITE_DOMAIN,
    });
  }

  /**
   * Override getReferer to use MangaPlus domain
   * @param {object} payload - Download payload
   * @returns {string} Referer URL
   */
  getReferer(payload) {
    return SITE_DOMAIN;
  }

  /**
   * Override getUserAgent to use specific Chrome user agent
   * @returns {string} User agent string
   */
  getUserAgent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * Override getImageHeaders to include Origin header
   * @param {string} referer - Referer URL
   * @returns {object} HTTP headers
   */
  getImageHeaders(referer) {
    return {
      Referer: referer,
      Origin: SITE_DOMAIN.replace(/\/+$/, ''),
      'User-Agent': this.getUserAgent(),
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
  }

  /**
   * Custom image download method with XOR decryption
   * Overrides the base class method to handle encrypted images
   * @param {string} imageUrl - Image URL
   * @param {string} filePath - Target file path
   * @param {object} headers - HTTP headers
   * @param {number} maxAttempts - Maximum retry attempts
   * @param {object} imageInfo - Additional image info (encryptionKey, sessionToken)
   * @returns {Promise<{ok: boolean, fileSize?: number}>}
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Use session token from image info if available
        const finalHeaders = { ...headers };
        if (imageInfo.sessionToken) {
          finalHeaders['SESSION-TOKEN'] = imageInfo.sessionToken;
        }

        const res = await fetch(imageUrl, { headers: finalHeaders });
        if (!res.ok) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          return { ok: false, status: res.status };
        }

        const imageData = Buffer.from(await res.arrayBuffer());
        if (!imageData.length) {
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          return { ok: false };
        }

        // Decrypt image if encryption key is provided
        const finalData = imageInfo.encryptionKey 
          ? decryptImageBytes(imageData, imageInfo.encryptionKey)
          : imageData;

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, finalData);

        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          return { ok: true, fileSize: fs.statSync(filePath).size };
        }
      } catch (e) {
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }
    return { ok: false };
  }
}

// Create service instance
const service = new MangaPlusService();

/**
 * Load manga information and chapters
 * @param {string} url - Manga URL
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url) {
  return service.load(url);
}

/**
 * Download chapter using base class template method with custom image decryption
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
  MangaPlusService,
};
