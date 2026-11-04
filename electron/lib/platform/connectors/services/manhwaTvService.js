/**
 * ManhwaTV connector — manhwatv6.com
 * Site yêu cầu đăng nhập (cookie) để đọc chapter.
 * Migrated to use HtmlConnectorService base class.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { USER_AGENT_JSOUP, resolveUrl } = require('../../../download/connector/htmlConnectorUtils');
const cookieManager = require('../../cookies/cookieManager');

const DOMAIN = 'https://manhwatv6.com/';
const LABEL = 'ManhwaTV';

// Session state for cookie management
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
  const uiCookie = cookieManager.getEffectiveCookie('manhwatv');
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
 * Fetch HTML with cookie support for ManhwaTV.
 * @param {string} url - URL to fetch
 * @param {string} [referer] - Referer header
 * @returns {Promise<{ok: boolean, html?: string, error?: string}>}
 */
async function fetchHtmlWithCookie(url, referer) {
  const headers = {
    'User-Agent': USER_AGENT_JSOUP,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: referer || session.activeDomain,
  };
  if (session.cookieHeader) headers.Cookie = session.cookieHeader;
  
  try {
    const res = await fetch(url, { headers, redirect: 'follow' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = await res.text();
    
    // Check if we got a valid HTML response
    if (!html || html.length < 100) {
      return { ok: false, error: 'Empty or invalid response' };
    }
    
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Extract manga ID from URL or HTML.
 * @param {string} url - Manga URL
 * @param {string} html - HTML content
 * @returns {string} Manga ID
 */
function extractMangaId(url, html) {
  // Try to extract from URL: /truyen-tranh/name-{id}.html or /truyen-tranh/name-{id}/
  const urlMatch = url.match(/truyen-tranh\/[^\/]+-(\d+)(?:\.html)?/);
  if (urlMatch) return urlMatch[1];
  
  // Try to find in HTML
  if (html) {
    const $ = cheerio.load(html);
    const idInput = $('input[name="truyen"], input#truyen, input[data-truyen], [truyen], [data-truyen]').first();
    if (idInput.length) {
      const val = idInput.val() || idInput.attr('data-truyen') || idInput.attr('truyen') || '';
      if (val) return String(val).trim();
    }
  }
  
  return '';
}

/**
 * Fetch chapter list from API.
 * @param {string} mangaId - Manga ID
 * @param {string} pageUrl - Page URL for referer
 * @returns {Promise<Array<{url: string, title: string}>>}
 */
async function fetchChapterListFromApi(mangaId, pageUrl) {
  const apiUrl = new URL('/process.php', session.activeDomain).href;
  const headers = {
    'User-Agent': USER_AGENT_JSOUP,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: pageUrl,
  };
  if (session.cookieHeader) headers.Cookie = session.cookieHeader;
  
  // 1. Try action=list_chap first (official chapter list with real chapter URLs)
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: `action=list_chap&truyen=${encodeURIComponent(mangaId)}`,
      redirect: 'follow',
    });
    
    if (res.ok) {
      const json = await res.json();
      if (json && json.ok === 1 && json.list) {
        const $ = cheerio.load(json.list);
        const chapters = [];
        
        $('a[href]').each((_, el) => {
          const $a = $(el);
          const href = $a.attr('href');
          if (!href) return;
          const fullUrl = resolveUrl(session.activeDomain, href);
          
          const isLocked = $a.find('.fa-lock').length > 0;
          const $clone = $a.clone();
          $clone.find('.price, i').remove();
          let title = $clone.text().replace(/\s+/g, ' ').trim();
          if (!title) {
            title = ($a.attr('title') || '').trim();
          }
          if (isLocked && !title.includes('[Lock]')) {
            title = `${title} [Lock]`;
          }
          
          chapters.push({ url: fullUrl, title: title || 'Chapter' });
        });
        
        // list_chap returns newest-first, reverse to place Chap 1 first (ascending)
        if (chapters.length) {
          return chapters.reverse();
        }
      }
    }
  } catch (err) {
    // Fall back to load_chap
  }

  // 2. Fallback to action=load_chap
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: `action=load_chap&truyen=${encodeURIComponent(mangaId)}`,
      redirect: 'follow',
    });
    
    if (!res.ok) return [];
    
    const json = await res.json();
    if (!json || json.ok !== 1 || !json.list) return [];
    
    // Parse HTML options
    const $ = cheerio.load(json.list);
    const chapters = [];
    
    $('option[value]').each((_, el) => {
      const $opt = $(el);
      const chapId = $opt.attr('value');
      const text = $opt.text().trim();
      
      if (!chapId || chapId === '') return;
      
      // Extract manga slug from page URL
      const mangaSlug = pageUrl.match(/truyen-tranh\/([^\/\.]+)/)?.[1] || 'manga';
      
      // Build chapter URL: /truyen-tranh/manga-slug/chap-{chapId}.html
      const chapUrl = `${session.activeDomain}truyen-tranh/${mangaSlug}/chap-${chapId}.html`;
      
      chapters.push({ url: chapUrl, title: text || `Chap ${chapId}` });
    });
    
    return chapters;
  } catch (err) {
    return [];
  }
}

/**
 * Parse images from chapter page.
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

  // Try common chapter image containers
  let $imgs = $('div.reading-detail img, div#chapter-content img, div.chapter-content img');
  if (!$imgs.length) $imgs = $('div.page-chapter img');
  if (!$imgs.length) $imgs = $('div.vung-doc img');
  if (!$imgs.length) $imgs = $('div.read-content img');
  if (!$imgs.length) $imgs = $('div.container-chapter-reader img');

  $imgs.each((_, el) => {
    const $el = $(el);
    const dataSrc = ($el.attr('data-src') || '').trim();
    const src = ($el.attr('src') || '').trim();
    let imgSrc = dataSrc && !/^data:/i.test(dataSrc) ? dataSrc : src;
    if (!imgSrc || /^data:/i.test(imgSrc)) return;
    imgSrc = resolveUrl(pageUrl, imgSrc);
    const ext = getExt(imgSrc);
    if (!ext) return;
    out.push({ imageUrl: imgSrc, ext });
  });

  return out;
}

/**
 * ManhwaTV service class extending HtmlConnectorService.
 * Handles cookie authentication for accessing manga content.
 */
class ManhwaTvService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'manhwatv',
      selectors: {
        title: 'h1, h1.title-detail, div.title-detail h1',
        cover: 'div.detail-info img, div.book-info img, div.manga-info img',
        chapterLinks: '', // Not used, we override load()
      },
    });
  }

  /**
   * Override getReferer to return the active domain.
   * @param {object} payload
   * @returns {string}
   */
  getReferer(payload) {
    return session.activeDomain || this.config.domain || payload?.mangaUrl || payload?.chapterUrl;
  }

  /**
   * Override load to handle ManhwaTV's content loading.
   * Cookie is optional for loading manga and chapters list.
   * @param {string} url - Manga URL
   * @param {object} [options] - Load options
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    // Validate URL format
    try {
      new URL(trimmed);
    } catch (e) {
      return { ok: false, error: 'URL không hợp lệ.' };
    }

    // Derive domain from the actual URL
    session.activeDomain = extractDomain(trimmed);

    // Reset and merge cookies if available
    session.cookieHeader = '';
    mergeAllCookies();

    const fetched = await fetchHtmlWithCookie(trimmed);
    if (!fetched.ok) return { ok: false, error: `${fetched.error} — URL: ${trimmed}` };

    const $ = cheerio.load(fetched.html);

    // Title - try multiple selectors
    let title = '';
    const titleSelectors = [
      'h1.title-detail',
      'div.title-detail h1',
      'h1',
      'div.manga-info h1',
      'div.book-info h1',
      'div.detail-info h1',
    ];
    
    for (const sel of titleSelectors) {
      title = $(sel).first().text().trim();
      if (title) break;
    }
    
    if (!title) {
      title = $('title').first().text().trim().split('|')[0].split('-')[0].trim();
    }
    
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    // Cover - try multiple selectors
    let coverUrl = '';
    const coverSelectors = [
      'div.img img',
      'div.detail-info img',
      'div.book-info img',
      'div.manga-info img',
      'div.info-holder img',
      'div.col-image img',
      'img.thumbnail',
    ];
    
    for (const sel of coverSelectors) {
      const $img = $(sel).first();
      if ($img.length) {
        const raw = ($img.attr('data-src') || $img.attr('src') || '').trim();
        if (raw && !raw.startsWith('data:')) {
          coverUrl = resolveUrl(trimmed, raw);
          if (coverUrl) break;
        }
      }
    }

    // Extract manga ID and fetch chapters from API
    const mangaId = extractMangaId(trimmed, fetched.html);
    let chapters = [];
    
    if (mangaId) {
      // Store manga ID for later use in fetchChapterImages
      this.currentMangaId = mangaId;
      chapters = await fetchChapterListFromApi(mangaId, trimmed);
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId,
        siteId: 'manhwatv',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Override fetchChapterImages to fetch from API instead of HTML parsing.
   * @param {string} chapterUrl - Chapter URL
   * @param {string} referer - Referer header value
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>}
   */
  async fetchChapterImages(chapterUrl, referer) {
    // Ensure cookies are merged
    session.cookieHeader = '';
    mergeAllCookies();

    // Update activeDomain from chapter URL
    session.activeDomain = extractDomain(chapterUrl);

    let chapId = '';
    let mangaId = this.currentMangaId || '';

    // Fetch chapter page to extract the real internal db chapId (<input name="chap">)
    const fetched = await fetchHtmlWithCookie(chapterUrl, referer);
    if (fetched.ok) {
      const $ = cheerio.load(fetched.html);
      if (!mangaId) {
        mangaId = extractMangaId(chapterUrl, fetched.html);
      }
      const chapInput = $('input[name="chap"], input#chap, input[data-chap], [chap], [data-chap]').first();
      if (chapInput.length) {
        const val = chapInput.val() || chapInput.attr('data-chap') || chapInput.attr('chap') || '';
        if (val) chapId = String(val).trim();
      }
    }

    // Fallback: extract chapId from URL regex /chap-(\d+)
    if (!chapId) {
      const chapMatch = chapterUrl.match(/\/chap-(\d+)(?:\.html|\/|$)/);
      if (chapMatch) {
        chapId = chapMatch[1];
      }
    }

    if (!chapId) {
      throw new Error('Không tìm thấy chapter ID trong URL hoặc trang chapter.');
    }

    if (!mangaId) {
      throw new Error('Không tìm thấy manga ID. Vui lòng load lại manga từ trang chủ.');
    }

    // Call API to get images
    const apiUrl = new URL('/process.php', session.activeDomain).href;
    const headers = {
      'User-Agent': USER_AGENT_JSOUP,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer || chapterUrl,
    };
    if (session.cookieHeader) headers.Cookie = session.cookieHeader;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: `action=load_img&truyen=${encodeURIComponent(mangaId)}&chap=${encodeURIComponent(chapId)}`,
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`API error: HTTP ${res.status}`);
    }

    const json = await res.json();
    if (!json || json.ok !== 1 || !json.list_img) {
      throw new Error('API không trả về danh sách ảnh.');
    }

    // Parse images from HTML
    const $ = cheerio.load(json.list_img);
    const rawList = [];
    const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

    function getExt(src) {
      const noQuery = String(src).split('?')[0];
      const seg = noQuery.split('/').pop() || '';
      const dot = seg.lastIndexOf('.');
      if (dot <= 0) return '';
      const ext = seg.slice(dot + 1).toLowerCase();
      return IMAGE_EXT.has(ext) ? ext : '';
    }

    $('img[src]').each((_, el) => {
      const $img = $(el);
      const src = ($img.attr('src') || '').trim();
      if (!src || src === '') return;
      
      const ext = getExt(src);
      if (!ext) return;
      
      rawList.push({ imageUrl: src, ext });
    });

    if (!rawList.length) {
      if (!session.cookieHeader) {
        throw new Error(
          'Không tìm thấy ảnh. ManhwaTV yêu cầu đăng nhập tài khoản để đọc — vui lòng vào Trình kết nối (hoặc Cài đặt Cookie) để Đăng nhập ManhwaTV.'
        );
      } else {
        throw new Error(
          'Không tìm thấy ảnh. Chapter có thể bị khóa hoặc cookie đã hết hạn — vui lòng kiểm tra lại tài khoản ManhwaTV.'
        );
      }
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
const service = new ManhwaTvService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};
