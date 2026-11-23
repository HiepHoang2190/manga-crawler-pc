/**
 * MangaPlus Service using ApiConnectorService
 * Migrated from the original mangaPlusService.js to use the new base class architecture
 * Special handling for XOR-encrypted images
 */

const fs = require('fs');
const path = require('path');
const { ApiConnectorService } = require('../base/ApiConnectorService');
const {
  MangaPlusApiClient,
  SITE_DOMAIN,
  API_BASE,
  sessionToken,
  fetchApiProtobuf,
} = require('./mangaPlusApiClient');

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

const MANGAPLUS_PAGE_SIZE = 48;
const MANGAPLUS_MAX_PAGES = 20;

function collectMangaPlusTitlesFromUpdated(respData) {
  const entries = respData?.success?.updatedTitleV2Group?.titles;
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const entry of entries) {
    if (entry?.title) out.push(entry.title);
  }
  return out;
}

function collectMangaPlusTitlesFromAllV2(respData) {
  const groups = respData?.success?.allTitlesViewV2?.AllTitlesGroup;
  if (!Array.isArray(groups)) return [];
  const out = [];
  for (const group of groups) {
    if (Array.isArray(group?.titles)) {
      out.push(...group.titles);
    }
  }
  return out;
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'mangaplus', page: 1, totalPages: 1, items: [] };
  }
  const page = Math.min(MANGAPLUS_MAX_PAGES, Math.max(1, Math.floor(Number(options.page) || 1)));
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  const sess = sessionToken();
  const apiUrl = searchQuery
    ? `${API_BASE}/title_list/allV2`
    : `${API_BASE}/title_list/updated`;

  const fetchProto = typeof options.fetchProtoImpl === 'function' ? options.fetchProtoImpl : fetchApiProtobuf;
  let resp;
  try {
    resp = await fetchProto(apiUrl, sess, signal ? { signal } : {});
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'mangaplus', page, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'mangaplus', page, totalPages: 1, items: [] };
  }
  if (!resp?.ok || !resp?.data) {
    return { ok: false, error: resp?.error || 'Không gọi được API MangaPlus.' };
  }
  if (resp.data.error && !resp.data.success) {
    return { ok: false, error: 'API MangaPlus trả lỗi.' };
  }

  const rawTitles = searchQuery
    ? collectMangaPlusTitlesFromAllV2(resp.data)
    : collectMangaPlusTitlesFromUpdated(resp.data);

  const queryLower = searchQuery.toLowerCase();
  const bestByName = new Map();
  const nameOrder = [];

  for (const t of rawTitles) {
    if (!t || !t.titleId || !t.name) continue;
    const name = String(t.name).trim();
    if (!name) continue;
    const author = String(t.author || '').trim();
    if (queryLower && !name.toLowerCase().includes(queryLower) && !author.toLowerCase().includes(queryLower)) {
      continue;
    }
    const key = name.toLowerCase();
    const lang = Number(t.language || 0);
    const prev = bestByName.get(key);
    const item = {
      title: name,
      mangaUrl: `${SITE_DOMAIN}titles/${t.titleId}`,
      coverUrl: String(t.portraitImageUrl || '').trim(),
      latestChapterLabel: '',
      _lang: lang,
    };
    if (!prev) {
      bestByName.set(key, item);
      nameOrder.push(key);
    } else if (prev._lang !== 0 && lang === 0) {
      bestByName.set(key, item);
    }
  }

  const allItems = nameOrder.map((k) => {
    const { _lang, ...clean } = bestByName.get(k);
    return clean;
  });

  const totalPages = allItems.length > 0
    ? Math.min(MANGAPLUS_MAX_PAGES, Math.max(1, Math.ceil(allItems.length / MANGAPLUS_PAGE_SIZE)))
    : 1;
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * MANGAPLUS_PAGE_SIZE;

  return {
    ok: true,
    siteId: 'mangaplus',
    page: clampedPage,
    totalPages,
    items: allItems.slice(start, start + MANGAPLUS_PAGE_SIZE),
  };
}

module.exports = {
  SITE_DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
  // Export for testing and compatibility
  service,
  MangaPlusService,
};
