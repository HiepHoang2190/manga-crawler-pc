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
const LATEST_UPDATES_PAGE_LIMIT = 20;
const COMICK_CURSOR_CACHE = new Map();

function pickComickLatestChapterLabel(item) {
  const byLang = item?.chapter_latest_by_langs && typeof item.chapter_latest_by_langs === 'object'
    ? item.chapter_latest_by_langs
    : null;
  let chap = byLang?.en || null;
  if (!chap && byLang) {
    const firstKey = Object.keys(byLang)[0];
    if (firstKey) chap = byLang[firstKey];
  }
  if (!chap && Array.isArray(item?.recent_chapters) && item.recent_chapters.length > 0) {
    chap = item.recent_chapters[0];
  }
  if (!chap || typeof chap !== 'object') return '';
  const num = chap.chapter_number != null ? String(chap.chapter_number).trim() : '';
  if (num) return `Chapter ${num}`;
  const title = chap.title != null ? String(chap.title).trim() : '';
  return title;
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'comick', page: 1, totalPages: 1, items: [] };
  }
  const page = Math.min(LATEST_UPDATES_PAGE_LIMIT, Math.max(1, Math.floor(Number(options.page) || 1)));
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'Fetch API không khả dụng.' };
  }

  if (page === 1) {
    COMICK_CURSOR_CACHE.clear();
  }
  const cachedCursor = page > 1 ? COMICK_CURSOR_CACHE.get(page) : null;
  const url = cachedCursor
    ? `${SITE_DOMAIN}/api/chapters/latest?cursor=${encodeURIComponent(cachedCursor)}`
    : `${SITE_DOMAIN}/api/chapters/latest?page=${page}`;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Referer: IMG_REFERER,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'comick', page, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'comick', page, totalPages: 1, items: [] };
  }
  if (!res?.ok) {
    return { ok: false, error: `Comick HTTP ${res?.status || 'error'}` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Không đọc được JSON từ Comick.' };
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const slug = String(row?.slug || '').trim();
    if (!slug) continue;
    const mangaUrl = `${SITE_DOMAIN}/comic/${slug}`;
    if (seen.has(mangaUrl)) continue;
    seen.add(mangaUrl);
    const title = String(row?.title || slug).trim();
    let coverUrl = String(row?.default_thumbnail || '').trim();
    if (coverUrl.startsWith('//')) coverUrl = `https:${coverUrl}`;
    const latestChapterLabel = pickComickLatestChapterLabel(row);
    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  }

  const nextCursor = data?.next_cursor ? String(data.next_cursor) : '';
  if (nextCursor && page < LATEST_UPDATES_PAGE_LIMIT) {
    COMICK_CURSOR_CACHE.set(page + 1, nextCursor);
  }
  const hasNext = Boolean(nextCursor);
  const totalPages = hasNext ? Math.min(LATEST_UPDATES_PAGE_LIMIT, page + 1) : page;
  return {
    ok: true,
    siteId: 'comick',
    page,
    totalPages,
    items,
  };
}

function downloadChapter(payload, connector = LABEL) {
  return service.downloadChapter(payload, connector);
}

module.exports = {
  SITE_DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
  // Export for testing and compatibility
  service,
  ComickService,
};
