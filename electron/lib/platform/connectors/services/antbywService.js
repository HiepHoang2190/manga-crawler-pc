/**
 * Antbyw Service - Migrated to HtmlConnectorService
 * Site: www.antbyw.com
 * Features: Multi-page chapter image parsing (script let urls = [...])
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { USER_AGENT, fetchHtml, resolveUrl } = require('../../../download/connector/htmlConnectorUtils');

const BASE_URL = 'https://www.antbyw.com';
const LABEL = 'Antbyw';

const SELECTORS = {
  chapterLinks: 'div.muludiv a.zj-container',
  title: 'h3.uk-heading-line',
  cover: 'div.uk-width-medium img',
};

const URLS_ARRAY_RE = /let\s+urls\s*=\s*\[(.*?)\]/s;
const URL_STRING_RE = /"(https?:\/\/[^"]+)"/g;
const TOTAL_PAGES_RE = /\/\s*(\d+)\s*页/;

/**
 * Extract image URLs from HTML script tags containing "let urls = [...]".
 */
function extractImageUrlsFromHtml(html) {
  const urls = [];
  const $ = cheerio.load(html);
  $('script').each((_, el) => {
    const scriptContent = $(el).html() || '';
    const am = scriptContent.match(URLS_ARRAY_RE);
    if (am) {
      const arrayContent = am[1];
      let m;
      const re = new RegExp(URL_STRING_RE.source, 'g');
      while ((m = re.exec(arrayContent)) !== null) {
        urls.push(m[1]);
      }
      return false;
    }
    return undefined;
  });
  return urls;
}

/**
 * Extract total number of pages from pagination label.
 */
function extractTotalPages(html) {
  const $ = cheerio.load(html);
  const pgLabel = $('div.pg span[title]').first();
  if (pgLabel.length) {
    const title = pgLabel.attr('title') || '';
    const m = title.match(TOTAL_PAGES_RE);
    if (m) return parseInt(m[1], 10);
  }
  const pgSpan = $('div.pg label span').first();
  if (pgSpan.length) {
    const m = pgSpan.text().match(TOTAL_PAGES_RE);
    if (m) return parseInt(m[1], 10);
  }
  return 1;
}

/**
 * Append or update page parameter in URL.
 */
function appendPageParam(url, page) {
  if (/[&?]page=/.test(url)) {
    return url.replace(/([&?])page=\d+/, `$1page=${page}`);
  }
  return `${url}${url.includes('?') ? '&' : '?'}page=${page}`;
}

/**
 * Fetch all chapter image URLs across multiple pages.
 */
async function fetchAllChapterImageUrls(chapterUrl) {
  const allUrls = [];
  const first = await fetchHtml(chapterUrl, { userAgent: USER_AGENT });
  if (!first.ok) return allUrls;
  allUrls.push(...extractImageUrlsFromHtml(first.html));
  const totalPages = extractTotalPages(first.html);
  for (let page = 2; page <= totalPages; page++) {
    const pageUrl = appendPageParam(chapterUrl, page);
    const fetched = await fetchHtml(pageUrl, { userAgent: USER_AGENT });
    if (!fetched.ok) break;
    allUrls.push(...extractImageUrlsFromHtml(fetched.html));
  }
  return allUrls;
}

/**
 * Antbyw connector service extending HtmlConnectorService.
 */
class AntbywService extends HtmlConnectorService {
  constructor() {
    super({
      domain: BASE_URL,
      label: LABEL,
      siteId: 'antbyw',
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const fetched = await fetchHtml(trimmed, {
      userAgent: options.userAgent || USER_AGENT,
    });

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang.' };
    }

    const $ = cheerio.load(fetched.html);

    // Parse title
    let title = $('h3.uk-heading-line').first().text().trim();
    if (!title) title = $('title').first().text().trim();

    // Parse cover
    let coverUrl = '';
    const $img = $('div.uk-width-medium img').first();
    if ($img.length) {
      const raw = $img.attr('src') || $img.attr('data-src') || '';
      if (raw) {
        coverUrl = /^https?:\/\//i.test(raw)
          ? raw
          : resolveUrl(`${BASE_URL}/`, raw.replace(/^\.\//, ''));
      }
    }

    // Parse chapters
    const chapters = [];
    $('div.muludiv a.zj-container').each((_, el) => {
      let href = $(el).attr('href') || '';
      if (href.startsWith('./')) href = `${BASE_URL}/${href.slice(2)}`;
      else if (href && !href.startsWith('http')) href = `${BASE_URL}/${href.replace(/^\//, '')}`;
      const text = $(el).text().trim();
      if (href) chapters.push({ url: href, title: text || href });
    });

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
        siteId: 'antbyw',
        sourceLabel: 'Antbyw',
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const rawList = await fetchAllChapterImageUrls(chapterUrl);
    if (!rawList.length) {
      throw new Error('Không tìm thấy ảnh trong chương.');
    }

    // Convert to {imageUrl, ext} format
    return rawList.map((imageUrl) => {
      const noQuery = imageUrl.split('?')[0];
      const seg = noQuery.split('/').pop() || '';
      const dot = seg.lastIndexOf('.');
      const ext = dot > 0 ? seg.slice(dot + 1).toLowerCase() : 'webp';
      return { imageUrl, ext: ext || 'webp' };
    });
  }

  getReferer() {
    return `${BASE_URL}/`;
  }
}

// Create singleton instance
const service = new AntbywService();

/**
 * Load manga information from URL.
 * @param {string} url - Manga URL
 * @param {object} [options] - Load options
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter.
 * @param {object} payload - Download configuration
 * @param {string} [connector] - Connector label override
 * @returns {Promise<{ok: boolean, successCount?: number, totalPages?: number, failedPageIndices?: array, skipped?: boolean, aborted?: boolean, error?: string}>}
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  BASE_URL,
  LABEL,
  load,
  downloadChapter,
};
