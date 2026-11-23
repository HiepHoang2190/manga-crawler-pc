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

const COMIC_DAYS_PAGE_SIZE = 48;
const COMIC_DAYS_MAX_PAGES = 500;

function parseComicDaysHomeHtml(html) {
  const match = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];

  let nextData;
  try {
    nextData = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const originalSerials = nextData?.props?.pageProps?.data?.originalSerials;
  if (!originalSerials || typeof originalSerials !== 'object') return [];

  const buckets = Object.values(originalSerials)
    .filter((b) => b && typeof b === 'object' && Array.isArray(b.latestEpisodes))
    .sort((a, b) => {
      const ta = Date.parse(a.serialUpdatedDate || '') || 0;
      const tb = Date.parse(b.serialUpdatedDate || '') || 0;
      return tb - ta;
    });

  const seenSeries = new Set();
  const items = [];
  for (const bucket of buckets) {
    for (const ep of bucket.latestEpisodes) {
      if (!ep || typeof ep !== 'object') continue;
      const series = ep.series && typeof ep.series === 'object' ? ep.series : null;
      const mangaUrl = String(ep.permalink || '').trim();
      if (!mangaUrl) continue;
      const dedupeKey = String(series?.id || mangaUrl);
      if (seenSeries.has(dedupeKey)) continue;
      seenSeries.add(dedupeKey);

      const title = String(series?.title || ep.title || '').trim();
      if (!title) continue;
      const rawThumb = String(series?.thumbnailUriTemplate || series?.thumbnailUriSquareTemplate || '').trim();
      const coverUrl = rawThumb
        ? rawThumb.replace('{width}', '480').replace('{height}', '640')
        : '';
      const latestChapterLabel = String(ep.title || '').trim();
      items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
    }
  }
  return items;
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'comicdays', page: 1, totalPages: 1, items: [] };
  }
  const page = Math.min(COMIC_DAYS_MAX_PAGES, Math.max(1, Math.floor(Number(options.page) || 1)));
  const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
  const fetchImpl = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;

  let fetched;
  try {
    fetched = await fetchImpl(DOMAIN, {
      userAgent: options.userAgent || service.getUserAgent(),
      referer: DOMAIN,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'comicdays', page, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: 'comicdays', page, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: fetched?.error || 'Không tải được danh sách ComicDays.' };
  }

  const allItems = parseComicDaysHomeHtml(fetched.html);
  const totalPages = allItems.length > 0
    ? Math.min(COMIC_DAYS_MAX_PAGES, Math.max(1, Math.ceil(allItems.length / COMIC_DAYS_PAGE_SIZE)))
    : 1;
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * COMIC_DAYS_PAGE_SIZE;

  return {
    ok: true,
    siteId: 'comicdays',
    page: clampedPage,
    totalPages,
    items: allItems.slice(start, start + COMIC_DAYS_PAGE_SIZE),
  };
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
  fetchLatestUpdates,
  // Export for testing and compatibility
  service,
  ComicDaysService,
};