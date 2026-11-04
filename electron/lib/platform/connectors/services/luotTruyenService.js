/**
 * LuotTruyen connector — luottruyen*.com
 * Site yêu cầu đăng nhập (cookie) để đọc chapter.
 * Migrated to use HtmlConnectorService base class.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { USER_AGENT_JSOUP, resolveUrl } = require('../../../download/connector/htmlConnectorUtils');
const cookieManager = require('../../cookies/cookieManager');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://luottruyen20.com/'; // fallback default, overridden at runtime by URL
const LABEL = 'LuotTruyen';

// Session state for cookie management
// activeDomain is updated each time load() is called so API calls use the correct base URL.
const session = { cookieHeader: '', activeDomain: DOMAIN };

/**
 * Merge cookie headers from different sources.
 * @param {string} base - Base cookie header
 * @param {string} extra - Additional cookie header
 * @returns {string} Merged cookie header
 */
function mergeCookieHeaders(base, extra) {
  if (!extra) return base || '';
  if (!base) return extra;
  const map = new Map();
  for (const part of [...base.split(';'), ...extra.split(';')]) {
    const t = part.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    const key = eq >= 0 ? t.slice(0, eq).trim() : t;
    map.set(key, t);
  }
  return [...map.values()].join('; ');
}

/**
 * Merge all cookies from cookieManager into session.
 */
function mergeAllCookies() {
  session.cookieHeader = '';
  const uiCookie = cookieManager.getEffectiveCookie('luottruyen');
  if (uiCookie) {
    session.cookieHeader = mergeCookieHeaders(session.cookieHeader, uiCookie);
  }
}

/**
 * Extract the base domain (origin + trailing slash) from a URL.
 * Falls back to DOMAIN constant if parsing fails.
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
  try {
    const { origin } = new URL(String(url).trim());
    return origin + '/';
  } catch {
    return DOMAIN;
  }
}

/**
 * Fetch HTML with cookie support for LuotTruyen.
 * @param {string} url - URL to fetch
 * @returns {Promise<{ok: boolean, html?: string, error?: string}>}
 */
async function fetchHtmlWithCookie(url) {
  const headers = {
    'User-Agent': USER_AGENT_JSOUP,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: session.activeDomain,
  };
  if (session.cookieHeader) headers.Cookie = session.cookieHeader;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const html = await res.text();
  return { ok: true, html, finalUrl: res.url };
}

/**
 * Extract StoryID từ input#storyID trong HTML trang manga.
 * Fallback: lấy số cuối trong URL slug (vd. -18633).
 * @param {string} html - HTML content
 * @param {string} pageUrl - Page URL
 * @returns {string} Story ID
 */
function extractStoryId(html, pageUrl) {
  const $ = cheerio.load(html);
  const val = ($('#storyID').val() || '').trim();
  if (val && /^\d+$/.test(val)) return val;
  // Fallback: số cuối URL
  const m = /[-/](\d+)\/?$/.exec(String(pageUrl));
  return m ? m[1] : '';
}

/**
 * Gọi API POST /Story/ListChapterByStoryID để lấy danh sách chapter.
 * @param {string} storyId - Story ID
 * @param {string} pageUrl - Page URL for referer
 * @returns {Promise<{ok: boolean, html?: string, error?: string}>}
 */
async function fetchChapterList(storyId, pageUrl) {
  const apiUrl = new URL('/Story/ListChapterByStoryID', session.activeDomain).href;
  const headers = {
    'User-Agent': USER_AGENT_JSOUP,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: pageUrl,
  };
  if (session.cookieHeader) headers.Cookie = session.cookieHeader;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: `StoryID=${encodeURIComponent(storyId)}`,
    redirect: 'follow',
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const html = await res.text();
  return { ok: true, html };
}

/**
 * Parse chapter links từ HTML trả về bởi API ListChapterByStoryID.
 * href dạng: /truyen-tranh/chapter-{n}/chapter-{n}/{id}
 * @param {string} html - HTML content from API
 * @param {string} pageUrl - Page URL for resolving relative URLs
 * @returns {Array<{url: string, title: string}>} Chapter list
 */
function parseChapterLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const chapters = [];

  $('a[href*="/chapter-"]').each((_, el) => {
    const $a = $(el);
    let href = ($a.attr('href') || '').trim();
    const text = $a.text().trim();
    if (!href) return;
    href = resolveUrl(pageUrl, href);
    if (!href) return;
    chapters.push({ url: href, title: text || href });
  });

  // Dedup theo URL
  const seen = new Set();
  return chapters.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

/**
 * Parse ảnh từ trang chapter.
 * LuotTruyen: ảnh nằm trong div.reading-detail hoặc div#chapter-content
 * @param {string} html - HTML content
 * @param {string} pageUrl - Page URL for resolving relative URLs
 * @returns {Array<{imageUrl: string, ext: string}>} Image list
 */
function parseChapterImages(html, pageUrl) {
  const $ = cheerio.load(html);
  const out = [];
  const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

  function getExt(src) {
    const noQuery = String(src).split('?')[0];
    const seg = noQuery.split('/').pop() || '';
    const dot = seg.lastIndexOf('.');
    if (dot <= 0) return '';
    const ext = seg.slice(dot + 1).toLowerCase();
    return IMAGE_EXT.has(ext) ? ext : '';
  }

  function pushImage($el, sort_index) {
    const dataSrc = ($el.attr('data-src') || '').trim();
    const src = ($el.attr('src') || '').trim();
    let imgSrc = dataSrc && !/^data:/i.test(dataSrc) ? dataSrc : src;
    if (!imgSrc || /^data:/i.test(imgSrc)) return;
    imgSrc = resolveUrl(pageUrl, imgSrc);
    const ext = getExt(imgSrc);
    if (!ext) return;
    out.push({ sort_index, imageUrl: imgSrc, ext });
  }

  // Real pages are img[data-index]. Extra imgs without data-index are decoys.
  const $indexed_imgs = $('img[data-index]');
  if ($indexed_imgs.length) {
    $indexed_imgs.each((_, el) => {
      const $el = $(el);
      const raw_index = ($el.attr('data-index') || '').trim();
      const parsed_index = parseInt(raw_index, 10);
      const sort_index = Number.isFinite(parsed_index) ? parsed_index : out.length + 1;
      pushImage($el, sort_index);
    });
    out.sort((left, right) => left.sort_index - right.sort_index);
    return out.map(({ imageUrl, ext }) => ({ imageUrl, ext }));
  }

  // Thử container ảnh chapter
  let $imgs = $('div.reading-detail img, div#chapter-content img, div.chapter-content img');
  if (!$imgs.length) $imgs = $('div.page-chapter img');
  if (!$imgs.length) $imgs = $('div.vung-doc img');
  if (!$imgs.length) $imgs = $('img[src*="dichvucdn"], img[data-src*="dichvucdn"]');

  $imgs.each((_, el) => {
    pushImage($(el), out.length + 1);
  });

  return out.map(({ imageUrl, ext }) => ({ imageUrl, ext }));
}

/**
 * LuotTruyen service class extending HtmlConnectorService.
 * Handles cookie authentication and custom API calls for chapter list.
 */
class LuotTruyenService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'luottruyen',
      // imageReferer intentionally omitted — getReferer() returns session.activeDomain dynamically
      selectors: {
        title: 'h1',
        cover: 'img[src*="dichvucdn"]',
        chapterLinks: '', // Not used, we override load()
      },
    });
  }

  /**
   * Override getReferer to return the active domain derived from the current URL.
   * This ensures the correct Referer is used even after a domain change (e.g. luottruyen6.vn).
   * @param {object} payload
   * @returns {string}
   */
  getReferer(payload) {
    return session.activeDomain || this.config.domain || payload?.mangaUrl || payload?.chapterUrl;
  }

  /**
   * Override load to handle LuotTruyen's custom authentication and API.
   * @param {string} url - Manga URL
   * @param {object} [options] - Load options
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    // Derive domain from the actual URL so it works for luottruyen6.vn, etc.
    session.activeDomain = extractDomain(trimmed);

    // Reset and merge cookies
    session.cookieHeader = '';
    mergeAllCookies();

    const fetched = await fetchHtmlWithCookie(trimmed);
    if (!fetched.ok) return { ok: false, error: `${fetched.error} — URL: ${trimmed}` };

    if (fetched.finalUrl) {
      const redirectedDomain = extractDomain(fetched.finalUrl);
      session.activeDomain = redirectedDomain;
      connectorDomainManager.setDomain('luottruyen', redirectedDomain);
    }

    const $ = cheerio.load(fetched.html);

    // Title
    let title = $('h1').first().text().trim();
    if (!title) title = $('title').first().text().trim().split('|')[0].trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    // Cover
    let coverUrl = '';
    const $cover = $('img[src*="dichvucdn"]').first();
    if ($cover.length) {
      const raw = ($cover.attr('data-src') || $cover.attr('src') || '').trim();
      coverUrl = resolveUrl(trimmed, raw);
    }
    if (!coverUrl) {
      const $img = $('div.detail-info img, div.book-info img, div.manga-info img').first();
      if ($img.length) {
        const raw = ($img.attr('data-src') || $img.attr('src') || '').trim();
        coverUrl = resolveUrl(trimmed, raw);
      }
    }

    // Chapter list qua API (HTML tĩnh không có chapter)
    const storyId = extractStoryId(fetched.html, trimmed);
    let chapters = [];
    if (storyId) {
      const chapApi = await fetchChapterList(storyId, trimmed);
      if (chapApi.ok) {
        chapters = parseChapterLinks(chapApi.html, trimmed);
      }
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: storyId,
        siteId: 'luottruyen',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Override fetchChapterImages to handle LuotTruyen's custom image parsing.
   * @param {string} chapterUrl - Chapter URL
   * @param {string} referer - Referer header value
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>}
   */
  async fetchChapterImages(chapterUrl, referer) {
    // Ensure cookies are merged
    session.cookieHeader = '';
    mergeAllCookies();

    // Update activeDomain from chapter URL so API calls use the correct base
    session.activeDomain = extractDomain(chapterUrl);

    const fetched = await fetchHtmlWithCookie(chapterUrl);
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const rawList = parseChapterImages(fetched.html, chapterUrl);
    if (!rawList.length) {
      throw new Error(
        'Không tìm thấy ảnh. Chapter có thể bị khóa — vào Settings → Cookie để đăng nhập LuotTruyen.'
      );
    }

    return rawList;
  }

  /**
   * Override getImageHeaders to include cookies for image requests.
   * @param {string} referer - Referer header value
   * @returns {object} Headers object
   */
  getImageHeaders(referer) {
    const headers = super.getImageHeaders(referer || session.activeDomain);
    if (session.cookieHeader) {
      headers.Cookie = session.cookieHeader;
    }
    return headers;
  }
}

// Create service instance
const service = new LuotTruyenService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  parseChapterImages,
};
