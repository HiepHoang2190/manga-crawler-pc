const { BaseConnectorService } = require('./BaseConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  parseMangaPage,
  collectChapterImages,
} = require('../../../download/connector/htmlConnectorUtils');
const { mergeCookieHeaders } = require('../api-clients/flareCookieSession');
const cookieManager = require('../../cookies/cookieManager');

/**
 * HTML-based connector service.
 * 
 * Extends BaseConnectorService with HTML parsing capabilities using cheerio.
 * Suitable for manga sites that serve content as HTML pages.
 * 
 * ## Features
 * 
 * - Automatic HTML fetching and parsing
 * - CSS selector-based content extraction
 * - Default image collection strategy
 * - Customizable parsing logic via method overrides
 * 
 * ## Usage Example - Simple Connector
 * 
 * ```javascript
 * const { HtmlConnectorService } = require('./base/HtmlConnectorService');
 * 
 * class SimpleSiteService extends HtmlConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://example.com/',
 *       label: 'Example Site',
 *       siteId: 'example',
 *       selectors: {
 *         chapterLinks: 'ul.chapters li a',
 *         title: 'h1.manga-title',
 *         cover: 'img.manga-cover',
 *       },
 *     });
 *   }
 *   // No need to override anything - default behavior works!
 * }
 * 
 * const service = new SimpleSiteService();
 * module.exports = {
 *   load: (url) => service.load(url),
 *   downloadChapter: (payload) => service.downloadChapter(payload, 'Example Site'),
 * };
 * ```
 * 
 * ## Usage Example - Custom Image Parsing
 * 
 * ```javascript
 * class CustomSiteService extends HtmlConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://custom.com/',
 *       label: 'Custom Site',
 *       siteId: 'custom',
 *       selectors: {
 *         chapterLinks: 'a.chapter',
 *         title: 'h1',
 *         cover: 'img.cover',
 *       },
 *     });
 *   }
 * 
 *   // Override for custom image extraction
 *   async fetchChapterImages(chapterUrl, referer) {
 *     const fetched = await fetchHtml(chapterUrl, { referer });
 *     if (!fetched.ok) {
 *       throw new Error(`Failed to fetch: ${fetched.error}`);
 *     }
 * 
 *     // Custom parsing logic
 *     const $ = cheerio.load(fetched.html);
 *     const images = [];
 *     $('div.reader img').each((i, el) => {
 *       const src = $(el).attr('data-src') || $(el).attr('src');
 *       if (src) {
 *         images.push({
 *           imageUrl: new URL(src, referer).href,
 *           ext: 'jpg'
 *         });
 *       }
 *     });
 *     return images;
 *   }
 * }
 * ```
 * 
 * ## Usage Example - Custom Load Logic
 * 
 * ```javascript
 * class MultiPageSiteService extends HtmlConnectorService {
 *   constructor() {
 *     super({
 *       domain: 'https://multipage.com/',
 *       label: 'MultiPage Site',
 *       siteId: 'multipage',
 *       selectors: {
 *         chapterLinks: 'a.chapter',
 *         title: 'h1',
 *         cover: 'img.cover',
 *       },
 *     });
 *   }
 * 
 *   // Override for multi-page chapter list
 *   async load(url, options = {}) {
 *     // First page
 *     const result = await super.load(url, options);
 *     if (!result.ok) return result;
 * 
 *     // Fetch additional pages
 *     const $ = cheerio.load(result.html);
 *     const totalPages = parseInt($('.pagination .last').text()) || 1;
 * 
 *     for (let page = 2; page <= totalPages; page++) {
 *       const pageUrl = `${url}?page=${page}`;
 *       const fetched = await fetchHtml(pageUrl);
 *       if (fetched.ok) {
 *         const moreChapters = parseChapters(fetched.html);
 *         result.chapters.push(...moreChapters);
 *       }
 *     }
 * 
 *     return result;
 *   }
 * }
 * ```
 * 
 * @extends BaseConnectorService
 */
class HtmlConnectorService extends BaseConnectorService {
  /**
   * Create a new HTML connector service instance.
   * 
   * @param {object} config - Connector configuration
   * @param {string} config.domain - Base domain URL (e.g., 'https://example.com/')
   * @param {string} config.label - Human-readable connector label
   * @param {string} config.siteId - Unique site identifier
   * @param {object} config.selectors - CSS selectors for parsing
   * @param {string} config.selectors.chapterLinks - Selector for chapter links (e.g., 'ul.chapters li a')
   * @param {string} config.selectors.title - Selector for manga title (e.g., 'h1.title')
   * @param {string} config.selectors.cover - Selector for cover image (e.g., 'img.cover')
   * @param {string} [config.imageReferer] - Custom referer for image requests
   * 
   * @throws {Error} If config is missing or lacks selectors
   * 
   * @example
   * const service = new HtmlConnectorService({
   *   domain: 'https://example.com/',
   *   label: 'Example Site',
   *   siteId: 'example',
   *   selectors: {
   *     chapterLinks: 'ul.chapters li a',
   *     title: 'h1.manga-title',
   *     cover: 'img.manga-cover',
   *   },
   * });
   */
  constructor(config) {
    super(config);
    if (!config.selectors) {
      throw new Error('HtmlConnectorService requires config.selectors');
    }
  }

  /**
   * Saved site cookie (honors send on/off toggle).
   */
  _effectiveUserCookie() {
    return cookieManager.getEffectiveCookie(this.config.siteId);
  }

  /**
   * Merge user session cookie into image download headers.
   */
  getImageHeaders(referer) {
    const headers = super.getImageHeaders(referer);
    const userCookie = this._effectiveUserCookie();
    if (userCookie) {
      headers.Cookie = headers.Cookie
        ? mergeCookieHeaders(headers.Cookie, userCookie)
        : userCookie;
    }
    return headers;
  }

  /**
   * Load manga information from URL.
   * 
   * Fetches the manga page HTML and parses it using the configured CSS selectors.
   * 
   * ## Preconditions
   * - `url` parameter is provided (may be empty or invalid)
   * - `config.selectors` contains valid CSS selectors
   * 
   * ## Postconditions
   * - Returns object with `ok` boolean property
   * - If `ok === true`: includes manga metadata and chapters array
   * - If `ok === false`: includes error message
   * - No network requests if URL is empty
   * 
   * @param {string} url - Manga URL to load
   * @param {object} [options] - Load options
   * @param {string} [options.userAgent] - Custom user agent (defaults to USER_AGENT_JSOUP)
   * 
   * @returns {Promise<object>} Result object
   * @returns {boolean} result.ok - Whether the operation succeeded
   * @returns {object} [result.manga] - Manga metadata
   * @returns {string} result.manga.title - Manga title
   * @returns {string} result.manga.coverUrl - Cover image URL
   * @returns {string} result.manga.mangaUrl - Canonical manga URL
   * @returns {string} result.manga.mangaId - Manga ID (empty string)
   * @returns {string} result.manga.siteId - Site identifier
   * @returns {string} result.manga.sourceLabel - Source label
   * @returns {Array<{url: string, title: string}>} [result.chapters] - Chapter list
   * @returns {string} [result.error] - Error message if failed
   * 
   * @example
   * const result = await service.load('https://example.com/manga/one-piece');
   * if (result.ok) {
   *   console.log(`Title: ${result.manga.title}`);
   *   console.log(`Chapters: ${result.chapters.length}`);
   * }
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const userCookie = this._effectiveUserCookie();
    let fetched;
    try {
      fetched = await fetchHtml(trimmed, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        ...(userCookie ? { cookie: userCookie } : {}),
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    if (fetched.finalUrl && this.config.siteId) {
      try {
        const { connectorDomainManager } = require('../domain/ConnectorDomainManager');
        const finalOrigin = new URL(fetched.finalUrl).origin + '/';
        connectorDomainManager.setDomain(this.config.siteId, finalOrigin);
      } catch {
        /* skip invalid url */
      }
    }

    const { title, coverUrl, chapters } = parseMangaPage(
      fetched.html,
      trimmed,
      this.config.selectors
    );

    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters,
    };
  }

  /**
   * Fetch chapter images from chapter URL.
   * 
   * Default implementation uses `collectChapterImages()` utility to extract all
   * `<img>` tags from the chapter page HTML.
   * 
   * **Override this method** when:
   * - Images are in `data-src` attributes instead of `src`
   * - Images are loaded via JavaScript/AJAX
   * - Images require special parsing (e.g., from `<script>` tags)
   * - You need to use a different image collection strategy
   * 
   * ## Preconditions
   * - `chapterUrl` is a valid URL string
   * - `referer` is a non-empty string
   * 
   * ## Postconditions
   * - Returns array of image objects
   * - Each object has `imageUrl` (absolute URL) and `ext` (file extension)
   * - Array may be empty if no images found
   * - Throws error if chapter page cannot be fetched
   * 
   * @param {string} chapterUrl - Chapter URL to fetch images from
   * @param {string} referer - Referer header value for requests
   * 
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>} Array of image objects
   * 
   * @throws {Error} If chapter page cannot be fetched
   * 
   * @example
   * // Default behavior (no override needed):
   * // Extracts all <img> tags with src attributes
   * 
   * @example
   * // Override for data-src attributes:
   * async fetchChapterImages(chapterUrl, referer) {
   *   const fetched = await fetchHtml(chapterUrl, { referer });
   *   if (!fetched.ok) throw new Error('Failed to fetch');
   *   
   *   const $ = cheerio.load(fetched.html);
   *   const images = [];
   *   $('img[data-src]').each((i, el) => {
   *     const src = $(el).attr('data-src');
   *     images.push({
   *       imageUrl: new URL(src, referer).href,
   *       ext: 'jpg'
   *     });
   *   });
   *   return images;
   * }
   * 
   * @example
   * // Override for script-based image URLs:
   * async fetchChapterImages(chapterUrl, referer) {
   *   const fetched = await fetchHtml(chapterUrl, { referer });
   *   if (!fetched.ok) throw new Error('Failed to fetch');
   *   
   *   const $ = cheerio.load(fetched.html);
   *   const scriptText = $('script:contains("imageUrls")').text();
   *   const match = scriptText.match(/imageUrls\s*=\s*(\[.*?\])/);
   *   const urls = JSON.parse(match[1]);
   *   
   *   return urls.map(url => ({
   *     imageUrl: url,
   *     ext: 'jpg'
   *   }));
   * }
   */
  async fetchChapterImages(chapterUrl, referer) {
    const userCookie = this._effectiveUserCookie();
    const fetched = await fetchHtml(chapterUrl, {
      referer,
      ...(userCookie ? { cookie: userCookie } : {}),
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    // Default: collect all images
    return collectChapterImages(fetched.html, referer);
  }
}

module.exports = { HtmlConnectorService };
