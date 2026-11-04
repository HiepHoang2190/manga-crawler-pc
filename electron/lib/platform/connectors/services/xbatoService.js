/**
 * xBato Service - HTML connector
 * Site: xbato.co.uk (Batoto)
 * 
 * Manga: /manga/{slug}
 * Chapter: /read/{manga-slug}/{chapter-slug}
 * Images: Lazy-loaded via data-src attributes from CDN (cdn2.merrypsycho.xyz)
 *
 * Cloudflare blocks Node.js HTTP (TLS fingerprint). Strategy:
 *   1. Fast path: cookie-based fetchHtml (works if user pasted cf_clearance)
 *   2. Fallback: Electron BrowserWindow via renderedFetch (auto-solves CF challenge)
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const cookieManager = require('../../cookies/cookieManager');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('xBato');

const DOMAIN = 'https://xbato.co.uk/';
const ORIGIN_BASE = DOMAIN.replace(/\/$/, '');
const LABEL = 'xBato';
const MISSING_COOKIE_ERROR =
  'Chưa cấu hình cookie Cloudflare. Vào Settings → xBato → Lấy cookie (hoặc dán cf_clearance).';

function isCloudflareBlockedHtml(html) {
  const text = String(html || '');
  if (!text) return true;
  return (
    /cf-browser-verification|cf_chl_|Just a moment|Performing security verification|Enable JavaScript and cookies to continue/i.test(
      text,
    ) && text.length < 20000
  );
}

function buildXbatoFetchOptions(url, options = {}) {
  const cookie = String(options.cookie || cookieManager.getEffectiveCookie('xbato') || '').trim();
  const referer = String(options.referer || url || DOMAIN).trim();
  return {
    cookie,
    referer,
    acceptLanguage: 'en-US,en;q=0.9',
    headers: options.headers,
  };
}

/**
 * Fetch xBato HTML with Settings cookie (Cloudflare blocks unauthenticated Node fetch).
 * Returns { ok, html?, error? }. Does NOT throw.
 */
async function fetchXbatoHtml(url, options = {}) {
  const fetch_options = buildXbatoFetchOptions(url, options);
  if (!fetch_options.cookie) {
    return { ok: false, error: MISSING_COOKIE_ERROR };
  }

  const fetched = await fetchHtml(url, fetch_options);
  if (!fetched.ok) {
    return fetched;
  }
  if (isCloudflareBlockedHtml(fetched.html)) {
    return {
      ok: false,
      error: 'Cookie Cloudflare không hợp lệ hoặc đã hết hạn. Hãy lấy lại cookie trong Settings.',
    };
  }
  return fetched;
}

/**
 * Lazy-load renderedFetch (Electron-only). Returns null outside Electron.
 */
function _getRenderedFetch() {
  try {
    return require('../../renderedFetch');
  } catch {
    return null;
  }
}

/**
 * Fetch xBato HTML via hidden BrowserWindow (Cloudflare bypass).
 * Electron's Chromium auto-solves CF challenge. Falls back gracefully.
 */
async function fetchXbatoHtmlViaBrowser(url) {
  const rf = _getRenderedFetch();
  if (!rf) {
    return { ok: false, error: 'BrowserWindow không khả dụng (không chạy trong Electron).' };
  }
  try {
    logger.info('BrowserWindow fallback: loading ' + url);
    const html = await rf.fetchRenderedHtml(url, { timeout: 90000, waitAfterLoad: 3000 });
    if (!html || isCloudflareBlockedHtml(html)) {
      return { ok: false, error: 'BrowserWindow: Cloudflare challenge không giải được.' };
    }
    logger.info('BrowserWindow fallback: success (' + html.length + ' chars)');
    return { ok: true, html };
  } catch (err) {
    logger.warn('BrowserWindow fallback failed: ' + (err.message || err));
    return { ok: false, error: 'BrowserWindow lỗi: ' + (err.message || err) };
  }
}

/**
 * Fetch xBato JSON API with the same session cookie.
 */
async function fetchXbatoJson(url, options = {}) {
  const fetched = await fetchXbatoHtml(url, {
    ...options,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {}),
    },
  });
  if (!fetched.ok) return fetched;

  let json_text = String(fetched.html || '').trim();
  if (!json_text) {
    return { ok: false, error: 'API trả về rỗng.' };
  }

  if (json_text.startsWith('<')) {
    const $ = cheerio.load(fetched.html);
    const pre_text = $('pre').first().text().trim();
    if (pre_text) {
      json_text = pre_text;
    } else {
      const body_text = $('body').text().trim();
      if (body_text.startsWith('{') || body_text.startsWith('[')) {
        json_text = body_text;
      } else {
        return { ok: false, error: 'Không đọc được JSON từ API.' };
      }
    }
  }

  try {
    return { ok: true, data: JSON.parse(json_text) };
  } catch (err) {
    return { ok: false, error: 'JSON API không hợp lệ: ' + String(err?.message || err) };
  }
}

const SELECTORS = {
  // Chapter links trong manga page
  chapterLinks: 'a[href*="/read/"]',
  // Title trong manga page
  title: 'h1',
  // Cover trong manga page - xBato uses div.poster img.image-thumb
  cover: 'div.poster img.image-thumb, img[src*="thumb/"], img[data-src*="thumb/"]',
};

function parseXbatoMangaPage(html, pageUrl) {
  const $ = cheerio.load(html);
  
  // Title
  const title = $('h1').first().text().trim() || $('title').first().text().trim() || '';
  
  // Cover - xBato uses lazy loading, so data-src has the real URL, src has placeholder
  let coverUrl = '';
  
  // Priority: data-src (real URL) over src (placeholder)
  const selectors = [
    'div.poster img.image-thumb',
    'div.poster img',
    'img.image-thumb',
  ];
  
  for (const sel of selectors) {
    const $img = $(sel).first();
    if ($img.length) {
      // Try data-src first (lazy-loaded images)
      const dataSrc = String($img.attr('data-src') || '').trim();
      const src = String($img.attr('src') || '').trim();
      
      // Prefer data-src if it's a CDN URL
      let raw = '';
      if (dataSrc && dataSrc.includes('cdn2.merrypsycho.xyz')) {
        raw = dataSrc;
      } else if (src && !src.startsWith('data:image/svg') && !src.includes('image-default')) {
        raw = src;
      } else if (dataSrc && !dataSrc.startsWith('data:image/svg')) {
        raw = dataSrc;
      }
      
      if (raw) {
        coverUrl = resolveUrl(pageUrl, raw);
        if (coverUrl && !coverUrl.includes('image-default')) {
          break; // Found a valid cover
        }
      }
    }
  }
  
  // Chapters - xBato có link format: /read/{manga-slug}/{chapter-slug}
  const chapters = [];
  
  // First, try to parse from JavaScript variable (if site embeds data)
  const scriptText = $('script').map((_, el) => $(el).html()).get().join('\n');
  
  // Look for chapter data in JavaScript
  // Common patterns: var chapters = [...], window.chapters = [...], etc.
  const chapterDataMatch = scriptText.match(/(?:var|let|const|window\.)\s*chapters\s*=\s*(\[[\s\S]*?\]);/);
  if (chapterDataMatch) {
    try {
      const chapterData = JSON.parse(chapterDataMatch[1]);
      if (Array.isArray(chapterData)) {
        chapterData.forEach(ch => {
          if (ch.url && ch.title) {
            const href = resolveUrl(pageUrl, ch.url);
            if (!chapters.find(existing => existing.url === href)) {
              chapters.push({ url: href, title: ch.title });
            }
          }
        });
      }
    } catch (e) {
      // Failed to parse, fall through to HTML parsing
    }
  }
  
  // If no chapters from JavaScript, parse from HTML
  if (chapters.length === 0) {
    $('a[href*="/read/"]').each((_, el) => {
      const $a = $(el);
      let href = String($a.attr('href') || '').trim();
      if (!href) return;
      
      // Skip duplicate links (READ FIRST, READ LAST buttons)
      if (href.includes('#') || href === 'javascript:void(0)') return;
      
      // Parse chapter title
      let text = $a.text().trim().replace(/\s+/g, ' ');
      
      // If no text, try to extract from href
      if (!text) {
        const parts = href.split('/').filter(Boolean);
        if (parts.length >= 3) {
          text = parts[2].replace(/-/g, ' ');
        }
      }
      
      href = resolveUrl(pageUrl, href);
      
      // Avoid duplicates
      if (!chapters.find(ch => ch.url === href)) {
        chapters.push({ url: href, title: text || href });
      }
    });
  }
  
  // Description
  const description = $('div.description, div[class*="summary"], p[class*="description"]')
    .first()
    .text()
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 1000);
  
  return { title, coverUrl, chapters, description };
}

/**
 * xBato connector service extending HtmlConnectorService.
 * Images are lazy-loaded with data-src attributes.
 */
class XbatoService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'xbato',
      selectors: SELECTORS,
      imageReferer: DOMAIN,
      requiresCookie: false, // BrowserWindow auto-solves Cloudflare; cookie is optional fast-path
    });
  }

  /**
   * Override getImageHeaders to ensure proper referer for xBato CDN
   */
  getImageHeaders(referer) {
    const headers = {
      Referer: referer || DOMAIN,
      'User-Agent': USER_AGENT_JSOUP,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    };
    
    // Merge user cookie if available
    const userCookie = this._effectiveUserCookie();
    if (userCookie) {
      headers.Cookie = userCookie;
    }
    
    return headers;
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    // Extract manga slug from URL: /manga/{slug}
    const slugMatch = trimmed.match(/\/manga\/([^/?#]+)/);
    if (!slugMatch) {
      return { ok: false, error: 'URL không hợp lệ (không tìm thấy slug).' };
    }
    const mangaSlug = slugMatch[1];

    // ── Strategy 1: Cookie-based fast path ──
    const user_cookie = this._effectiveUserCookie();
    let fetched = null;
    if (user_cookie) {
      fetched = await fetchXbatoHtml(trimmed, { cookie: user_cookie, referer: trimmed });
    }

    // ── Strategy 2: BrowserWindow fallback (Cloudflare bypass) ──
    if (!fetched || !fetched.ok) {
      const cookie_error = fetched?.error || '';
      logger.info('Cookie fetch failed (' + cookie_error + '), trying BrowserWindow...');
      fetched = await fetchXbatoHtmlViaBrowser(trimmed);
      if (!fetched.ok) {
        return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
      }
    }

    // Parse title, cover, description from HTML (not chapters yet)
    const { title, coverUrl, description } = parseXbatoMangaPage(
      fetched.html,
      trimmed,
    );
    
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    // ── Fetch full chapter list from API ──
    const apiUrl = `${ORIGIN_BASE}/get-chapter-list?slug=${mangaSlug}`;
    let chapters = [];
    
    // Try cookie-based API first, then BrowserWindow
    let apiResult = null;
    if (user_cookie) {
      apiResult = await fetchXbatoJson(apiUrl, { cookie: user_cookie, referer: trimmed });
    }
    if (!apiResult || !apiResult.ok) {
      // BrowserWindow renders JSON in <pre> — extract it
      const browserApiResult = await fetchXbatoHtmlViaBrowser(apiUrl);
      if (browserApiResult.ok) {
        try {
          const $ = cheerio.load(browserApiResult.html);
          const pre_text = $('pre').first().text().trim();
          const body_text = $('body').text().trim();
          const json_text = pre_text || body_text;
          if (json_text && (json_text.startsWith('{') || json_text.startsWith('['))) {
            apiResult = { ok: true, data: JSON.parse(json_text) };
          }
        } catch {
          // JSON parse failed — fall through to HTML parsing
        }
      }
    }

    if (apiResult && apiResult.ok) {
      const response_data = apiResult.data;
      const chapter_list = response_data?.data || response_data;

      if (Array.isArray(chapter_list)) {
        for (const ch of chapter_list) {
          const chapter_slug = ch.chapter_slug || '';
          const chapter_name = ch.chapter_name || ch.chapter_slug || '';
          if (chapter_slug) {
            const chapter_url = `${ORIGIN_BASE}/read/${mangaSlug}/${chapter_slug}`;
            chapters.push({ url: chapter_url, title: chapter_name });
          }
        }
      }
    }

    // Fallback: parse chapters from HTML if API didn't return any
    if (chapters.length === 0) {
      logger.warn('Chapter list API returned 0 chapters, falling back to HTML parsing');
      const html_result = parseXbatoMangaPage(fetched.html, trimmed);
      chapters = html_result.chapters || [];
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description: description || '',
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'xbato',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Override to handle lazy-loaded images with data-src and SVG placeholders.
   * Strategy 1: cookie-based fetchHtml (fast). Strategy 2: BrowserWindow (CF bypass).
   */
  async fetchChapterImages(chapterUrl, referer) {
    // ── Strategy 1: Cookie-based fast path ──
    const user_cookie = this._effectiveUserCookie();
    let fetched = null;
    if (user_cookie) {
      fetched = await fetchXbatoHtml(chapterUrl, {
        cookie: user_cookie,
        referer: referer || chapterUrl,
      });
    }

    // ── Strategy 2: BrowserWindow fallback ──
    if (!fetched || !fetched.ok) {
      logger.info('Chapter cookie fetch failed, trying BrowserWindow for: ' + chapterUrl);
      fetched = await fetchXbatoHtmlViaBrowser(chapterUrl);
      if (!fetched.ok) {
        throw new Error(`Không tải được trang chương: ${fetched.error}`);
      }
    }

    return this._parseChapterImagesFromHtml(fetched.html, chapterUrl);
  }

  /**
   * Parse chapter images from rendered HTML.
   * BrowserWindow renders lazy-loaded images (data-src → src), so all real URLs are available.
   */
  _parseChapterImagesFromHtml(html, chapterUrl) {
    const $ = cheerio.load(html);
    const images = [];
    
    // ── Collect all real CDN image URLs directly ──
    // BrowserWindow resolves lazy-loading: both src and data-src may have real URLs
    const cdnUrls = new Set();
    $('img').each((i, el) => {
      const $img = $(el);
      for (const attr of ['src', 'data-src']) {
        const val = String($img.attr(attr) || '').trim();
        if (val && val.startsWith('https://cdn2.merrypsycho.xyz/') && val.match(/\/\d+\.webp$/)) {
          cdnUrls.add(val);
        }
      }
    });

    if (cdnUrls.size > 0) {
      // Sort by page number (0.webp, 1.webp, 2.webp...)
      const sorted = Array.from(cdnUrls).sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)\.webp$/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/(\d+)\.webp$/)?.[1] || '0', 10);
        return numA - numB;
      });
      for (const imageUrl of sorted) {
        images.push({ imageUrl, ext: 'webp' });
      }
      return images;
    }

    // ── Fallback: pattern-based URL generation ──
    let baseUrl = '';
    $('img').each((i, el) => {
      if (baseUrl) return;
      const $img = $(el);
      const src = String($img.attr('src') || '').trim();
      if (src && src.startsWith('https://cdn2.merrypsycho.xyz/') && src.match(/\/\d+\.webp$/)) {
        const lastSlash = src.lastIndexOf('/');
        baseUrl = src.substring(0, lastSlash + 1);
      }
    });
    
    if (!baseUrl) {
      // Construct from chapter URL: /read/{manga-slug}/{chapter-slug}
      const urlParts = chapterUrl.split('/').filter(Boolean);
      if (urlParts.length >= 4) {
        const mangaSlug = urlParts[urlParts.length - 2];
        const chapterSlug = urlParts[urlParts.length - 1];
        const chapterMatch = chapterSlug.match(/chapter-(\d+(?:\.\d+)?)/);
        if (chapterMatch) {
          baseUrl = `https://cdn2.merrypsycho.xyz/${mangaSlug}/${chapterMatch[1]}/`;
        }
      }
    }
    
    if (!baseUrl) {
      throw new Error('Không xác định được pattern URL ảnh.');
    }
    
    // Count chapter images
    let pageCount = 0;
    $('img').each((i, el) => {
      const $img = $(el);
      const alt = String($img.attr('alt') || '').toLowerCase();
      const src = String($img.attr('src') || '').trim();
      if ((alt.includes('chapter') && alt.includes('image')) || 
          src.startsWith('data:image/svg+xml') ||
          (src.startsWith('https://cdn2.merrypsycho.xyz/') && src.match(/\/\d+\.webp$/))) {
        pageCount++;
      }
    });
    
    if (pageCount === 0) {
      pageCount = $('img[class*="lazy"], .reader img, .chapter-content img, main img').length;
    }
    
    if (pageCount === 0) {
      throw new Error('Không xác định được số trang của chương.');
    }
    
    for (let i = 0; i < pageCount; i++) {
      images.push({ imageUrl: `${baseUrl}${i}.webp`, ext: 'webp' });
    }
    
    return images;
  }
}

const service = new XbatoService();

function load(url, options) {
  return service.load(url, options);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

/**
 * Fetch search results from xBato search API
 * @param {string} query - Search keyword
 * @param {object} options - Additional options
 * @returns {Promise<object>} Search results
 */
async function fetchSearchResults(query, options = {}) {
  if (!query || !query.trim()) {
    return { ok: false, error: 'Search query is empty' };
  }

  const search_url = `${ORIGIN_BASE}/ajax/search-suggest?keyword=${encodeURIComponent(query)}`;
  const api_result = await fetchXbatoJson(search_url, options);
  if (!api_result.ok) {
    return { ok: false, error: api_result.error || 'Search failed' };
  }

  const json_data = api_result.data;
  const items = [];

  const data_array = Array.isArray(json_data?.data) ? json_data.data : [];

  for (const item of data_array) {
      const slug = String(item.slug || '').trim();
      if (!slug) continue;

      const title = String(item.name || slug).trim();
      const mangaUrl = `${ORIGIN_BASE}/manga/${slug}`;
      
      // Cover URL from API or fallback to pattern
      let coverUrl = String(item.cover_url || '').trim();
      if (!coverUrl) {
        coverUrl = `https://cdn2.merrypsycho.xyz/thumb/${slug}.webp`;
      }
      
      // Latest chapter info - API has chapter_latest as number
      let latestChapterLabel = '';
      if (item.chapter_latest != null) {
        latestChapterLabel = `Chapter ${item.chapter_latest}`;
      }

      items.push({
        title,
        mangaUrl,
        coverUrl,
        latestChapterLabel,
      });
    }

  return {
    ok: true,
    siteId: 'xbato',
    page: 1,
    totalPages: 1,
    items,
  };
}

/**
 * Fetch latest updates from xBato /newest page or search via API
 */
async function fetchLatestUpdates(options = {}) {
  const raw_search = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(raw_search || '').trim();

  if (search_query) {
    return fetchSearchResults(search_query, options);
  }

  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const listing_url = page === 1
    ? `${ORIGIN_BASE}/newest`
    : `${ORIGIN_BASE}/newest/page/${page}`;

  const fetched = await fetchXbatoHtml(listing_url, options);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Không tải được danh sách mới cập nhật.' };
  }

  const $ = cheerio.load(fetched.html);
  const itemsMap = new Map(); // Use map to merge duplicate manga entries

  // Parse manga items from listing page
  // Note: xBato lists each manga twice - once with image, once with title link
  $('a[href*="/manga/"]').each((_, el) => {
    const $link = $(el);
    const href = String($link.attr('href') || '').trim();
    
    if (!href || !href.includes('/manga/')) return;
    
    const mangaUrl = resolveUrl(listing_url, href);
    
    // Get or create item for this manga URL
    let item = itemsMap.get(mangaUrl);
    if (!item) {
      item = {
        title: '',
        mangaUrl,
        coverUrl: '',
        latestChapterLabel: '',
      };
      itemsMap.set(mangaUrl, item);
    }
    
    // Get title if not already set
    if (!item.title) {
      let title = $link.text().trim();
      if (!title || title.length < 3) {
        title = $link.find('h3, h4').first().text().trim();
      }
      if (title && title.length >= 3) {
        item.title = title;
      }
    }
    
    // Get cover image if not already set
    if (!item.coverUrl) {
      const $img = $link.find('img').first();
      if ($img.length) {
        const dataSrc = String($img.attr('data-src') || '').trim();
        const src = String($img.attr('src') || '').trim();
        
        // Prefer data-src for xBato lazy-loaded images
        const raw = dataSrc || src;
        
        if (raw && raw.startsWith('http') && !raw.startsWith('data:image/') && !raw.includes('image-default')) {
          item.coverUrl = resolveUrl(listing_url, raw);
        }
      }
    }
    
    // Get latest chapter info if not already set
    if (!item.latestChapterLabel) {
      const $parent = $link.closest('div, article');
      const $chapterLink = $parent.find('a[href*="/read/"]').first();
      if ($chapterLink.length) {
        item.latestChapterLabel = $chapterLink.text().trim();
      }
    }
  });

  // Convert map to array, filter out items without title
  const items = Array.from(itemsMap.values()).filter(item => item.title);

  // Parse pagination to get total pages
  let totalPages = 1;
  $('a[href*="/newest/page/"]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const match = href.match(/\/page\/(\d+)/);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (pageNum > totalPages) totalPages = pageNum;
    }
  });

  return {
    ok: true,
    siteId: 'xbato',
    page,
    totalPages,
    items,
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
  parseXbatoMangaPage,
  fetchXbatoHtml,
  fetchXbatoHtmlViaBrowser,
  fetchXbatoJson,
  isCloudflareBlockedHtml,
};
