/**
 * SakamotoDaysTruyen Service
 * Site: sakamotodaystruyen.com
 *
 * WordPress-based site with lazy-loaded images.
 * - Homepage is the manga index page (chapter list + cover)
 * - Chapter images use data-src (lazy load) — only first img has real src
 * - Chapter links pattern: /doc-truyen-tranh-sakamoto-days-chapter-N/
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml, USER_AGENT_JSOUP, resolveUrl } = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://sakamotodaystruyen.com/';
const LABEL = 'SakamotoDaysTruyen';

const SELECTORS = {
  // Chapter links inside the chapter grid (excludes hero buttons)
  chapterLinks: '.chapter-grid a',
  // Title on the homepage
  title: 'h1',
  // Cover image (lazy-loaded via data-src)
  cover: '.saka-cover img',
};

/**
 * SakamotoDaysTruyen connector service extending HtmlConnectorService.
 *
 * Overrides:
 * - load(): filters chapter links to only include chapter URLs, extracts cover from data-src
 * - fetchChapterImages(): reads data-src attributes for lazy-loaded WordPress images
 */
class SakamotoDaysService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'sakamotodays',
      selectors: SELECTORS,
    });
  }

  /**
   * Load manga info from the homepage URL.
   * Filters chapter links to only those matching the chapter URL pattern.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const fetched = await fetchHtml(trimmed, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
    });

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    // Extract title
    const title = $('h1').first().text().trim();
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    // Extract cover from .saka-cover img — try data-src first (lazy load), then src
    let coverUrl = '';
    $('.saka-cover img').each((_, el) => {
      if (coverUrl) return;
      const dataSrc = $(el).attr('data-src') || '';
      const src = $(el).attr('src') || '';
      const candidate = dataSrc || src;
      if (candidate && !candidate.startsWith('data:')) {
        coverUrl = resolveUrl(trimmed, candidate);
      }
    });
    // Fallback: any wp-content image on the page
    if (!coverUrl) {
      $('img').each((_, el) => {
        if (coverUrl) return;
        const dataSrc = $(el).attr('data-src') || '';
        const src = $(el).attr('src') || '';
        const candidate = dataSrc || src;
        if (candidate && !candidate.startsWith('data:') && candidate.includes('wp-content')) {
          coverUrl = resolveUrl(trimmed, candidate);
        }
      });
    }

    // Extract chapter links — only from the chapter grid, not hero buttons
    const CHAPTER_RE = /chapter[-_](\d+)/i;
    const chapters = [];
    const seen = new Set();

    $('.chapter-grid a[href*="chapter"]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      const text = $(el).text().trim();
      if (!href || !CHAPTER_RE.test(href)) return;
      const absUrl = resolveUrl(trimmed, href);
      if (!absUrl || seen.has(absUrl)) return;
      seen.add(absUrl);
      chapters.push({ url: absUrl, title: text || href });
    });

    // Sort by chapter number ascending
    chapters.sort((a, b) => {
      const numA = parseInt((a.url.match(/chapter[-_](\d+)/i) || [0, 0])[1], 10);
      const numB = parseInt((b.url.match(/chapter[-_](\d+)/i) || [0, 0])[1], 10);
      return numA - numB;
    });

    if (chapters.length === 0) {
      return { ok: false, error: 'Không tìm thấy danh sách chương.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'sakamotodays',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Fetch chapter images.
   * WordPress lazy-load: real URLs are in data-src attributes.
   * Falls back to src for the first image which is typically eager-loaded.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, { referer });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const $ = cheerio.load(fetched.html);
    const images = [];
    const seen = new Set();

    // Look for images inside the post/article content area first
    const contentSelectors = [
      '.entry-content img',
      '.post-content img',
      'article img',
      '.wp-block-image img',
      '.chapter-content img',
      '.content img',
    ];

    let $imgs = null;
    for (const sel of contentSelectors) {
      const found = $(sel);
      if (found.length > 0) {
        $imgs = found;
        break;
      }
    }

    // Fallback: all images on the page
    if (!$imgs || $imgs.length === 0) {
      $imgs = $('img');
    }

    $imgs.each((_, el) => {
      // Prefer data-src (lazy load), then src
      const dataSrc = $(el).attr('data-src') || '';
      const src = $(el).attr('src') || '';
      const raw = dataSrc || src;

      if (!raw || raw.startsWith('data:') || seen.has(raw)) return;

      // Only accept image file extensions
      if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(raw)) return;

      const absUrl = resolveUrl(chapterUrl, raw);
      if (!absUrl || seen.has(absUrl)) return;
      seen.add(absUrl);

      const ext = (raw.match(/\.(jpe?g|png|webp|gif)/i) || ['', 'jpg'])[1]
        .toLowerCase()
        .replace('jpeg', 'jpg');

      images.push({ imageUrl: absUrl, ext });
    });

    return images;
  }
}

// Singleton instance
const service = new SakamotoDaysService();

/**
 * Load manga information from URL.
 * @param {string} url - Manga URL (homepage)
 * @param {object} [options] - Load options
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter.
 * @param {object} payload - Download configuration
 * @param {string} [connector] - Connector label override
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
};
