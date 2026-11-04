/**
 * GocTruyenTranh Service - Migrated to HtmlConnectorService
 * Site: goctruyentranh.com (Next.js SSR with Cloudflare protection)
 * 
 * Features:
 * - Custom API calls with cookie/token management
 * - Complex session management
 * - CDN image fetching with cookie authentication
 *
 * Architecture:
 *  - HTML: Direct fetch with Settings cookie
 *  - Full chapter list: GET /api/comic/{comicId}/chapter?offset=0&limit=-1
 *  - Chapter page: Images from RSC / API / HTML
 *  - CDN: db.goctruyentranh.*, *gtt-bk* — requires cookie session (cf_clearance / X-TOKEN)
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const cookieManager = require('../../cookies/cookieManager');
const { USER_AGENT, resolveUrl, fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');

const DOMAIN = 'https://goctruyentranhvui31.com/';
const LABEL = 'GocTruyenTranh';
const DEFAULT_ORIGIN = 'https://goctruyentranhvui31.com';

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function refererForUrl(url) {
  try {
    return new URL(url).origin + '/';
  } catch {
    return DEFAULT_ORIGIN;
  }
}

async function fetchHtmlWrapper(url) {
  return fetchHtml(url, {
    siteId: 'goctruyentranh',
    requiresCookie: true,
    referer: refererForUrl(url),
    includeSetCookie: true,
  });
}

async function fetchApi(url, referer, sessionCookie = '') {
  try {
    const siteCookie = cookieManager.getEffectiveCookie('goctruyentranh') || '';
    let finalCookie = siteCookie;
    if (sessionCookie) {
      finalCookie = finalCookie ? `${finalCookie}; ${sessionCookie}` : sessionCookie;
    }
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: finalCookie,
        Accept: 'application/json, text/plain, */*',
        Referer: referer || refererForUrl(url),
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function fetchApiJsonWithFlareFallback(apiUrl, referer, sessionCookie = '') {
  return fetchApi(apiUrl, referer, sessionCookie);
}

/** Get origin from user-provided URL */
function getOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

/** Escape path segment(s) for use inside RegExp */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Manga path prefix (no leading/trailing /), used to match chapter hrefs.
 * Example: /foo-bar → foo-bar; /truyen/foo-bar → truyen/foo-bar
 */
function getMangaPathPrefix(url) {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, '');
  } catch {
    return '';
  }
}

/** comicId from inline script / payload in manga page */
function parseComicMeta(html) {
  const m1 = /const comic\s*=\s*\{[^}]*id:\s*["']([^"']+)["']/s.exec(html);
  if (m1) return { comicId: m1[1].trim() };
  const m2 = /"comicId"\s*:\s*"([^"]+)"/.exec(html);
  if (m2) return { comicId: m2[1].trim() };
  const m3 = /comicId["']?\s*:\s*["']([^"']+)["']/.exec(html);
  if (m3) return { comicId: m3[1].trim() };
  return { comicId: '' };
}

/** Parse title from <title> tag, remove suffix " - Goctruyentranh" */
function parseTitle(html) {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return '';
  return m[1]
    .replace(/\s*\[Tới Chương[^\]]*\]\s*$/i, '')
    .replace(/\s*-\s*Goctruyentranh\s*$/i, '')
    .replace(/^Truyện Tranh\s+/i, '')
    .trim();
}

/** Parse cover from og:image / twitter / embedded JSON */
function parseCoverUrl(html, pageUrl) {
  const metaPair = (re) => {
    const x = re.exec(html);
    if (!x) return '';
    const src = x[1].trim();
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    return resolveUrl(pageUrl, src);
  };
  let u =
    metaPair(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    metaPair(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    metaPair(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (u) return u;
  const j = /"(?:thumb|thumbnail|coverUrl|cover|avatar)"\s*:\s*"([^"]+)"/i.exec(html);
  if (j && /^https?:\/\//i.test(j[1])) return j[1].trim();
  return '';
}

/**
 * Parse chapter list from JSON-LD ItemList (usually only subset of chapters).
 */
function parseJsonLdChapters(html, baseUrl) {
  const chapters = [];
  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRegex.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
        for (const item of obj.itemListElement) {
          const itemUrl = item.url || '';
          if (!itemUrl) continue;
          const abs = /^https?:\/\//i.test(itemUrl) ? itemUrl : resolveUrl(baseUrl, itemUrl);
          if (!abs) continue;
          const numMatch = /chuong-(\d+(?:\.\d+)?)/i.exec(abs);
          const title = numMatch ? `Chương ${numMatch[1]}` : abs;
          chapters.push({ url: abs, title: formatChapterTitle(title) });
        }
        break;
      }
    } catch {
      /* skip */
    }
  }
  return chapters;
}

function chapterNumFromChapterUrl(url) {
  const m = /chuong-(\d+(?:\.\d+)?)/i.exec(url || '');
  return m ? parseFloat(m[1]) : 0;
}

function dedupeChaptersByUrl(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    if (!c.url || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  out.sort((a, b) => chapterNumFromChapterUrl(a.url) - chapterNumFromChapterUrl(b.url));
  return out;
}

/** Normalize chapter array from API body */
function rowsFromChapterApiPayload(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.result)) return data.result;
  const nested =
    data.result && typeof data.result === 'object' && !Array.isArray(data.result) ? data.result : null;
  const root = nested || data;
  const raw = root.chapters || root.data || root.items || (Array.isArray(root) ? root : []);
  return Array.isArray(raw) ? raw : [];
}

function chapterNumberFromApiRow(ch) {
  if (!ch || typeof ch !== 'object') return '';
  const n = ch.numberChapter ?? ch.number ?? ch.chapter_num ?? ch.chapterNum ?? ch.num ?? '';
  return n === '' || n === null ? '' : String(n);
}

/**
 * Parse chapter list from <a href="/{mangaPathPrefix}/chuong-X"> links.
 * Returns deduplicated array { url, title } sorted ascending by chapter number.
 */
function parseChapterLinks(html, mangaPathPrefix, origin) {
  const escaped = escapeRegExp(mangaPathPrefix);
  const pattern = new RegExp(`href="(/${escaped}/(chuong-[^"]+))"`, 'gi');
  const seen = new Set();
  const chapters = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const chapterPath = m[1];
    const chapterSlug = m[2];
    if (seen.has(chapterSlug)) continue;
    seen.add(chapterSlug);
    const numMatch = /chuong-(\d+(?:\.\d+)?)/.exec(chapterSlug);
    const num = numMatch ? numMatch[1] : chapterSlug;
    chapters.push({
      url: `${origin}${chapterPath}`,
      title: formatChapterTitle(`Chương ${num}`),
      _num: parseFloat(num) || 0,
    });
  }
  // Sort ascending
  chapters.sort((a, b) => a._num - b._num);
  return chapters.map(({ url, title }) => ({ url, title }));
}

function isLikelyChapterCdnUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes('goctruyentranh') || h.includes('gtt-bk') || h.includes('gttbk');
  } catch {
    return false;
  }
}

/**
 * Normalize CDN subdomain: db.goctruyentranh.net / db.goctruyentranh.org → db.goctruyentranh.com.
 * The .net and .org subdomains currently return HTTP 404; .com is the live CDN.
 */
function normalizeCdnDomain(url) {
  if (!url || typeof url !== 'string') return url;
  return url
    .replace(/\bdb\.goctruyentranh\.net\b/g, 'db.goctruyentranh.com')
    .replace(/\bdb\.goctruyentranh\.org\b/g, 'db.goctruyentranh.com');
}

/**
 * Accept any URL returned by the /api/chapter/loadAll endpoint.
 * The API already filters to valid image URLs so we trust them directly.
 */
function isApiImageUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  return true;
}

/**
 * Chapter images: lazy data-src, src after JS, or .image-section block (site changes CDN frequently).
 */
function extractChapterImageUrls(html) {
  const urls = [];
  const seen = new Set();
  const push = (raw) => {
    const url = String(raw || '').trim();
    if (!url || seen.has(url)) return;
    if (/logo|icon|favicon|avatar-user|placeholder/i.test(url)) return;
    if (!isLikelyChapterCdnUrl(url)) return;
    seen.add(url);
    urls.push(url);
  };

  try {
    const $ = cheerio.load(html);
    $('.image-section .img-block img, .image-section img, .img-block img').each((_, el) => {
      const $el = $(el);
      push($el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('src'));
    });
    $('[data-src*="goctruyentranh"], [data-src*="gtt-bk"], [data-src*="gtt"]').each((_, el) => {
      push($(el).attr('data-src') || $(el).attr('data-lazy-src'));
    });
  } catch {
    /* cheerio optional */
  }

  const re =
    /(?:data-src|data-lazy-src|src)=["'](https?:\/\/[^"']*(?:goctruyentranh|gtt-bk|gttbk)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) push(m[1]);

  if (!urls.length) {
    try {
      const $ = cheerio.load(html);
      $('.image-section .img-block img, .image-section img').each((_, el) => {
        const raw = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
        const url = String(raw || '').trim();
        if (!url || seen.has(url)) return;
        if (!/^https?:\/\//i.test(url)) return;
        if (/logo|icon|favicon|avatar|placeholder/i.test(url)) return;
        seen.add(url);
        urls.push(url);
      });
    } catch {
      /* */
    }
  }

  return urls.map(normalizeCdnDomain);
}

/**
 * Parse comicId, chapterNumber, nameEn from the inline <script> block in chapter HTML.
 * The page always contains:
 *   const comic = { id: "...", nameEn: "...", currentNumber: "...", ... }
 */
function parseChapterMeta(html) {
  const idM = /\bid\s*:\s*`([^`]+)`/.exec(html) || /\bid\s*:\s*["']([^"']+)["']/.exec(html);
  const nameM = /nameEn\s*:\s*`([^`]+)`/.exec(html) || /nameEn\s*:\s*["']([^"']+)["']/.exec(html);
  const numM = /currentNumber\s*:\s*`([^`]+)`/.exec(html) || /currentNumber\s*:\s*["']([^"']+)["']/.exec(html);
  return {
    comicId: idM ? idM[1].trim() : '',
    nameEn: nameM ? nameM[1].trim() : '',
    chapterNumber: numM ? numM[1].trim() : '',
  };
}

/**
 * Call /api/chapter/loadAll with the session cookies obtained from the chapter page.
 * Returns { ok, imageUrls } or { ok: false, error, needsLogin }.
 *
 * Flow (discovered by reverse-engineering view_addition.js):
 *  1. GET chapter page → server sets usid + X-TOKEN cookies
 *  2. POST /api/chapter/loadAll { comicId, chapterNumber, nameEn }
 *  3. Response: { status, result: { codeState, data: [...urls] } }
 *     codeState "00" → free chapter, data = image URL array
 *     codeState "01" → requires login
 *     codeState "02" → requires account level 2+
 */
async function fetchChapterImagesViaApi(chapterUrl, log) {
  const origin = getOrigin(chapterUrl);
  const referer = refererForUrl(chapterUrl);

  // Step 1: fetch chapter page to get session cookies (usid, X-TOKEN)
  const pageRes = await fetchHtmlWrapper(chapterUrl);
  if (!pageRes.ok) return pageRes;

  const meta = parseChapterMeta(pageRes.html);
  if (!meta.comicId || !meta.nameEn || !meta.chapterNumber) {
    return { ok: false, error: 'Không parse được thông tin chapter (comicId/nameEn/chapterNumber).' };
  }

  if (typeof log === 'function') {
    log(`Gọi API loadAll: comicId=${meta.comicId} chapter=${meta.chapterNumber}`, 'info');
  }

  // Step 2: POST /api/chapter/loadAll — X-TOKEN is HttpOnly so it's sent automatically via Cookie header
  const apiUrl = `${origin}/api/chapter/loadAll`;
  const body = new URLSearchParams({
    comicId: meta.comicId,
    chapterNumber: meta.chapterNumber,
    nameEn: meta.nameEn,
  });

  const buildApiHeaders = () => {
    const siteCookie = cookieManager.getEffectiveCookie('goctruyentranh') || '';
    let finalCookie = siteCookie;
    if (pageRes.cookie) {
      finalCookie = finalCookie ? `${finalCookie}; ${pageRes.cookie}` : pageRes.cookie;
    }
    return {
      'User-Agent': USER_AGENT,
      Cookie: finalCookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer,
    };
  };

  let apiRes;
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: body.toString(),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `API HTTP ${res.status}` };
    apiRes = await res.json();
  } catch (e) {
    return { ok: false, error: `API fetch lỗi: ${e.message || e}` };
  }

  // Step 3: parse response
  if (!apiRes.status) {
    const msg = (apiRes.messages && apiRes.messages[0]) || 'API trả về lỗi.';
    return { ok: false, error: msg };
  }

  const result = apiRes.result || {};
  const codeState = result.codeState;

  if (codeState === '01') {
    return {
      ok: false,
      needsLogin: true,
      error: 'Chapter này yêu cầu đăng nhập. Vui lòng đặt cookie đăng nhập trong Cài đặt → Cookie.',
    };
  }
  if (codeState === '02') {
    return {
      ok: false,
      needsLogin: true,
      error: 'Chapter này yêu cầu tài khoản cấp 2+. Vui lòng đăng nhập tài khoản đủ cấp.',
    };
  }

  const data = result.data;
  if (!Array.isArray(data) || !data.length) {
    return { ok: false, error: `API không trả về danh sách ảnh (codeState: ${codeState}).` };
  }

  return { ok: true, imageUrls: data.filter(Boolean) };
}

/**
 * Fetch chapter images via the Next.js RSC (React Server Components) endpoint.
 * The site migrated to Next.js App Router; chapter images are embedded in the
 * RSC payload under currentChapter.images[] as {src, page} objects.
 *
 * CDN domain normalisation: the RSC embeds db.goctruyentranh.org URLs which
 * currently return HTTP 404 — normalized to db.goctruyentranh.com (live CDN).
 */
async function fetchChapterImagesViaRsc(chapterUrl, log) {
  const referer = refererForUrl(chapterUrl);

  let rscText = '';
  try {
    const siteCookie = cookieManager.getEffectiveCookie('goctruyentranh') || '';
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'text/x-component',
      RSC: '1',
      'Next-Router-State-Tree':
        '%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D',
      Referer: referer,
      Cookie: siteCookie,
    };

    const res = await fetch(`${chapterUrl}?_rsc=1`, { headers, redirect: 'follow' });
    if (!res.ok) return { ok: false, error: `RSC HTTP ${res.status}` };
    rscText = await res.text();
  } catch (e) {
    return { ok: false, error: `RSC fetch lỗi: ${e.message || e}` };
  }

  if (!rscText) return { ok: false, error: 'RSC không trả về dữ liệu.' };

  // Check if chapter is behind a paywall (price > 0)
  const priceM = /"currentChapter"\s*:\s*\{[^}]{0,300}"price"\s*:\s*(\d+)/.exec(rscText);
  if (priceM && parseInt(priceM[1]) > 0) {
    return {
      ok: false,
      needsLogin: true,
      error: 'Chapter này yêu cầu đăng nhập. Vui lòng đặt cookie đăng nhập trong Cài đặt → Cookie.',
    };
  }

  // Extract images from currentChapter.images[]: {"src":"URL","page":N}
  const seen = new Set();
  const imageUrls = [];
  const imgRe = /\{"src":"(https?:\/\/[^"]+)","page":\d+\}/g;
  let m;
  while ((m = imgRe.exec(rscText)) !== null) {
    let url = m[1];
    // Only accept the CDN proxy pattern (db.goctruyentranh.* / gtt-bk)
    if (!isLikelyChapterCdnUrl(url)) continue;
    // Normalize CDN domain to the live endpoint
    url = normalizeCdnDomain(url);
    if (seen.has(url)) continue;
    seen.add(url);
    imageUrls.push(url);
  }

  if (!imageUrls.length) return { ok: false, error: 'RSC không chứa ảnh chapter.' };

  if (typeof log === 'function') log(`RSC: tìm thấy ${imageUrls.length} ảnh`, 'info');
  return { ok: true, imageUrls };
}

/**
 * Fetch chapter images: RSC first, then legacy API, then HTML scraping.
 */
async function fetchChapterHtmlForImages(chapterUrl, log) {
  // Primary: Next.js RSC endpoint
  const rscResult = await fetchChapterImagesViaRsc(chapterUrl, log);
  if (rscResult.ok) return rscResult;
  if (rscResult.needsLogin) return rscResult;

  if (typeof log === 'function') {
    log(`RSC thất bại (${rscResult.error}) — thử API...`, 'info');
  }

  // Secondary: legacy /api/chapter/loadAll (kept as fallback in case site restores it)
  const apiResult = await fetchChapterImagesViaApi(chapterUrl, log);
  if (apiResult.ok) return apiResult;
  if (apiResult.needsLogin) return apiResult;

  if (typeof log === 'function') {
    log(`API thất bại (${apiResult.error}) — thử scrape HTML...`, 'info');
  }

  // Fallback: scrape rendered HTML
  const first = await fetchHtmlWrapper(chapterUrl);
  if (!first.ok) return first;

  const urls = extractChapterImageUrls(first.html);
  if (urls.length) {
    return { ok: true, html: first.html, imageUrls: urls };
  }

  return {
    ok: false,
    error: rscResult.error || apiResult.error || 'Không tìm thấy ảnh chương.',
  };
}

/**
 * GocTruyenTranh connector service extending HtmlConnectorService.
 * Overrides most methods due to complex cookie and API integration.
 */
class GocTruyenTranhService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'goctruyentranh',
      selectors: {}, // Not used - custom parsing
      requiresCookie: true,
    });
  }

  /**
   * Override load() with custom cookie and API logic.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const origin = getOrigin(trimmed);
    const mangaPathPrefix = getMangaPathPrefix(trimmed);
    if (!mangaPathPrefix) return { ok: false, error: 'Không parse được slug truyện từ URL.' };

    const fetched = await fetchHtmlWrapper(trimmed);
    if (!fetched.ok) return { ok: false, error: fetched.error };

    const html = fetched.html;
    const title = parseTitle(html);
    if (!title) return { ok: false, error: 'Không đọc được tiêu đề truyện.' };

    const coverUrl = normalizeCdnDomain(parseCoverUrl(html, trimmed));
    const comicId = parseComicMeta(html).comicId;

    const chapters = [];
    if (comicId && mangaPathPrefix) {
      const apiUrl = `${origin}/api/comic/${encodeURIComponent(comicId)}/chapter?offset=0&limit=-1`;
      const apiRes = await fetchApiJsonWithFlareFallback(apiUrl, trimmed, fetched.cookie);
      const envelope = apiRes.ok ? apiRes.data : null;
      const rows = envelope ? rowsFromChapterApiPayload(envelope) : [];
      const denied = envelope && (envelope.status === false || envelope.success === false);
      if (apiRes.ok && rows.length && !denied) {
        for (const ch of rows) {
          const num = chapterNumberFromApiRow(ch);
          if (!num) continue;
          chapters.push({
            url: `${origin}/${mangaPathPrefix}/chuong-${num}`,
            title: formatChapterTitle(`Chương ${num}`),
          });
        }
      }
    }

    let merged = chapters;
    if (!merged.length) {
      merged = [...parseJsonLdChapters(html, trimmed)];
    }
    if (!merged.length) {
      merged = parseChapterLinks(html, mangaPathPrefix, origin);
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: comicId || undefined,
        siteId: 'goctruyentranh',
        sourceLabel: LABEL,
      },
      chapters: dedupeChaptersByUrl(merged),
    };
  }

  /**
   * Override fetchChapterImages() — uses /api/chapter/loadAll, falls back to HTML scraping.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchChapterHtmlForImages(chapterUrl, null);
    if (!fetched.ok) {
      throw new Error(fetched.error || 'Không tải được trang chương');
    }
    if (!fetched.imageUrls || !fetched.imageUrls.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương');
    }

    // Convert to format expected by base class.
    // API URLs are signed (exp= & verify= params) — treat as jpg unless extension is clear.
    const path = require('path');
    return fetched.imageUrls.map((url) => {
      const cleanUrl = url.split('?')[0];
      const ext = path.extname(cleanUrl).toLowerCase().replace(/^\./, '') || 'jpg';
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext) ? ext : 'jpg';
      return { imageUrl: url, ext: safeExt };
    });
  }


}

// Create singleton instance
const service = new GocTruyenTranhService();

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

/**
 * Get image fetch headers for remote UI (fetchRemoteImageForUi).
 * Returns headers with session cookies for CDN authentication.
 * @returns {object|null} Headers object or null if no session
 */
function getImageFetchHeadersForRemoteUi() {
  return null;
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  getImageFetchHeadersForRemoteUi,
};
