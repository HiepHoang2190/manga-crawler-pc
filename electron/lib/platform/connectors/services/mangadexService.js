/**
 * MangaDex Service using ApiConnectorService
 * Migrated from the original mangadexService.js to use the new base class architecture
 */

const fs = require('fs');
const path = require('path');
const { ApiConnectorService } = require('../base/ApiConnectorService');
const { MangaDexApiClient, fetchMangaDexLatestUpdates, fetchMangaCovers, extractMangaId } = require('./mangadxApiClient');
const { resolveMangaDir } = require('../../../download/connector/connectorPathUtils');
const { downloadCoverIfNeeded } = require('../../../download/connector/connectorDownloadUtils');

const DOMAIN = 'https://mangadex.org/';
const LABEL = 'MangaDex';

const mangaCoversCache = new Map();

function hasCoverFile(dir) {
  if (!fs.existsSync(dir)) return false;
  const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  for (const ext of extensions) {
    const p = path.join(dir, `cover${ext}`);
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        return true;
      }
    } catch {}
  }
  return false;
}

async function getCachedMangaCovers(mangaId) {
  if (mangaCoversCache.has(mangaId)) {
    return mangaCoversCache.get(mangaId);
  }
  const promise = (async () => {
    const res = await fetchMangaCovers(mangaId);
    if (res && res.ok && Array.isArray(res.covers)) {
      return res.covers;
    }
    return [];
  })();
  if (mangaCoversCache.size > 100) {
    const firstKey = mangaCoversCache.keys().next().value;
    mangaCoversCache.delete(firstKey);
  }
  mangaCoversCache.set(mangaId, promise);
  try {
    return await promise;
  } catch {
    mangaCoversCache.delete(mangaId);
    return [];
  }
}

async function downloadVolumeCoverIfNeeded(mangaId, mangaDir, volume, language, log) {
  const volStr = volume != null ? String(volume).trim() : '';
  if (!volStr || volStr.toLowerCase() === 'none') return;
  
  const volDir = path.join(mangaDir, `Vol. ${volStr}`);
  if (hasCoverFile(volDir)) return;
  
  if (!mangaId) return;
  
  const covers = await getCachedMangaCovers(mangaId);
  if (!covers || covers.length === 0) return;
  
  const matching = covers.filter(c => {
    if (c.volume == null) return false;
    const cVol = String(c.volume).trim();
    if (cVol === volStr) return true;
    const n1 = parseFloat(cVol);
    const n2 = parseFloat(volStr);
    return !isNaN(n1) && !isNaN(n2) && n1 === n2;
  });
  if (matching.length === 0) return;
  
  const preferredLang = String(language || 'vi').toLowerCase();
  const selectedCover =
    matching.find(c => c.locale && c.locale.toLowerCase() === preferredLang) ||
    matching.find(c => c.locale && c.locale.toLowerCase() === 'en') ||
    matching.find(c => c.locale && c.locale.toLowerCase() === 'ja') ||
    matching[0];
    
  const coverUrl = selectedCover.urlOriginal || selectedCover.url512;
  if (!coverUrl) return;
  
  await downloadCoverIfNeeded(coverUrl, volDir, DOMAIN, undefined, log);
}

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
    const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
    const log = (msg, level = 'info') => {
      if (typeof payload.onLog === 'function') payload.onLog(msg, level);
    };
    
    if (coverUrl) {
      // For uploads.mangadex.org, pass DOMAIN as referer and undefined for User-Agent
      await downloadCoverIfNeeded(coverUrl, mangaDir, DOMAIN, undefined, log);
    }

    const useVolumeFolder = payload.mangadexVolumeFolderGrouping !== false;
    const vol = useVolumeFolder ? payload.volume : null;

    if (vol) {
      const mangaId = extractMangaId(payload.mangaUrl) || (payload.chapterUrl && !payload.chapterUrl.includes('/chapter/') ? extractMangaId(payload.chapterUrl) : null);
      try {
        await downloadVolumeCoverIfNeeded(mangaId, mangaDir, vol, payload.mangadexLanguage || payload.language, log);
      } catch (err) {
        log(`Không thể tải bìa tập Vol. ${vol}: ${err.message}`, 'warn');
      }
    }
    
    // Create a modified payload without the coverUrl so the base class skips its cover download,
    // and with the sanitized volume field based on setting
    const modifiedPayload = {
      ...payload,
      volume: vol,
      coverUrl: null,
    };
    
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