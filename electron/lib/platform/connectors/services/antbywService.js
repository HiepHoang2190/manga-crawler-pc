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

const ANTBYW_MAX_PAGES = 500;

function parseAntbywListingHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  $('.uk-card, .uk-card-wrap').each((_, el) => {
    const $card = $(el);
    const $imgLink = $card.find('a[href*="kuid="]').filter((__, a) => $(a).find('img').length > 0).first();
    const $titleLink = $card.find('p a[href*="kuid="]').first();
    const href = ($titleLink.attr('href') || $imgLink.attr('href') || '').trim();
    const mangaUrl = href ? resolveUrl(pageUrl, href) : '';
    if (!mangaUrl || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const $img = $imgLink.find('img').first();
    const rawCover = ($img.attr('data-src') || $img.attr('src') || '').trim();
    const coverUrl = rawCover && !/^data:/i.test(rawCover) ? resolveUrl(pageUrl, rawCover) : '';

    const title = ($titleLink.text() || $img.attr('alt') || $imgLink.attr('title') || '').trim();
    if (!title) return;

    const latestChapterLabel = $card.find('.uk-overlay a.xs1, .uk-overlay a').last().text().trim();
    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  let totalPages = 1;
  $('.pg a, div.pg a').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const mHref = href.match(/[?&]page=(\d+)/i);
    if (mHref) {
      const p = parseInt(mHref[1], 10);
      if (Number.isFinite(p) && p > totalPages) totalPages = p;
    }
    const textNums = String($(el).text() || '').match(/\d+/g);
    if (textNums) {
      for (const n of textNums) {
        const p = parseInt(n, 10);
        if (Number.isFinite(p) && p > totalPages) totalPages = p;
      }
    }
  });

  return {
    items,
    totalPages: Math.min(ANTBYW_MAX_PAGES, Math.max(1, totalPages)),
  };
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'antbyw', page: 1, totalPages: 1, items: [] };
  }
  const page = Math.min(ANTBYW_MAX_PAGES, Math.max(1, Math.floor(Number(options.page) || 1)));
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  const fetchImpl = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;

  const listingUrl = searchQuery
    ? `${BASE_URL}/plugin.php?id=jameson_manhua&c=index&a=search&keyword=${encodeURIComponent(searchQuery)}${page > 1 ? `&page=${page}` : ''}`
    : `${BASE_URL}/plugin.php?id=jameson_manhua&c=index&a=ku&odfie=addtime&order=desc&page=${page}`;

  let fetched;
  try {
    fetched = await fetchImpl(listingUrl, {
      userAgent: options.userAgent || USER_AGENT,
      referer: `${BASE_URL}/`,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'antbyw', page, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: 'antbyw', page, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: fetched?.error || 'Không tải được danh sách Antbyw.' };
  }

  const parsed = parseAntbywListingHtml(fetched.html, listingUrl);
  return {
    ok: true,
    siteId: 'antbyw',
    page,
    totalPages: Math.max(page, parsed.totalPages),
    items: parsed.items,
  };
}

module.exports = {
  BASE_URL,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
};
