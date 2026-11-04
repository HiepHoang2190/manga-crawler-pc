/**
 * ComicVN Service - Migrated to HtmlConnectorService
 * Site: comicvn19.net
 *
 * Special handling:
 * - Uses API endpoint to fetch chapters (thong-tin-ca-nhan?manga_id=)
 * - Extracts manga_id from URL pattern
 * - Custom cookie handling (env + cookieManager)
 * - Custom image URL parsing for token-based URLs
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { USER_AGENT, resolveUrl, fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const { mergeCookieHeaders } = require('../api-clients/flareCookieSession');
const cookieManager = require('../../cookies/cookieManager');

const DOMAIN = 'https://comicvn19.net/';
const LABEL = 'ComicVN';
const MANGA_ID_RE = /-([a-f0-9]{24})\.html$/i;
const MOI_NHAT_PATH = 'danh-muc/moi-nhat';
const MOI_NHAT_MAX_PAGES_CAP = 15;
const TOKEN_DOWNLOAD_DELAY_MS = 500;

/**
 * True when HTML shows ComicVN's login lock screen (no chapter images served).
 */
function isComicvnChapterLoginLocked(html) {
  return /center-lock-screen/i.test(String(html || ''));
}

/**
 * Accept chapter page image URLs ComicVN embeds in HTML.
 * - token proxy: /static?token=...
 * - CDN chapter path: .../chapter/...
 * - dated CDN pages: .../cdn/2021/07/25/16/xxx.jpg (not /cdn/manga/ covers)
 */
function isComicvnChapterImageUrl(src) {
  const s = String(src || '').trim();
  if (!s) return false;
  if (s.includes('/static?token=') || s.includes('static?token=')) return true;
  if (!/cdn/i.test(s)) return false;
  if (s.includes('/chapter/')) return true;
  // Page images use /cdn/YYYY/... ; covers use /cdn/manga/ or /images/manga/
  if (/\/cdn\/\d{4}\//i.test(s)) return true;
  return false;
}

/**
 * Parse chapter image URLs from ComicVN chapter HTML.
 */
function parseComicvnImageUrls(html) {
  const $ = cheerio.load(String(html || ''));
  const urls = [];
  $('img[src]').each((_, el) => {
    const src = ($(el).attr('src') || '').trim();
    if (!src || !isComicvnChapterImageUrl(src)) return;
    urls.push(src);
  });
  return urls;
}

function isComicvnMangaListingUrl(href) {
  const s = String(href || '').trim();
  if (!s || /\/chapter-/i.test(s)) return false;
  return MANGA_ID_RE.test(s.split('?')[0]);
}

function buildMoiNhatListingUrl(page) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const base = `${DOMAIN}${MOI_NHAT_PATH}`;
  return p <= 1 ? base : `${base}?page=${p}`;
}

function parseMoiNhatMaxPage(html) {
  const $ = cheerio.load(String(html || ''));
  let max = 1;
  $('a[href*="danh-muc/moi-nhat"]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = href.match(/[?&]page=(\d+)/i);
    if (!m) return;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return Math.max(1, max);
}

function parseMoiNhatListingHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const base = pageUrl || DOMAIN;
  const items = [];
  const seen = new Set();

  $('#listComic ul.list > li, .listComic ul.list > li').each((_, li) => {
    const $li = $(li);
    const $titleA = $li.find('.detail h3 a[href]').first();
    let href = String($titleA.attr('href') || '').trim();
    if (!href) {
      href = String($li.find('.cover a[href]').first().attr('href') || '').trim();
    }
    if (!href) return;
    const mangaUrl = resolveUrl(base, href);
    if (!isComicvnMangaListingUrl(mangaUrl)) return;
    if (seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const title =
      String($titleA.attr('title') || '').trim() ||
      $titleA.text().trim() ||
      String($li.find('.cover a').attr('title') || '').trim() ||
      mangaUrl;

    let coverUrl = '';
    const $img = $li.find('.cover img').first();
    if ($img.length) {
      const raw =
        String($img.attr('data-src') || '').trim() ||
        String($img.attr('src') || '').trim();
      if (raw && !/default\.png/i.test(raw)) {
        coverUrl = resolveUrl(base, raw);
      }
    }

    const latestChapterLabel = $li
      .find('.chapters h4 a, ul.chapters a')
      .first()
      .text()
      .trim()
      .replace(/\s+/g, ' ');

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  return items;
}

async function fetchMoiNhatListing(options = {}) {
  const fetchImpl =
    typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;
  const ua = options.userAgent || USER_AGENT;
  const cap = Math.min(
    MOI_NHAT_MAX_PAGES_CAP,
    Math.max(1, Math.floor(Number(options.maxPages) || MOI_NHAT_MAX_PAGES_CAP)),
  );
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const page1Url = buildMoiNhatListingUrl(1);
  let fetched;
  try {
    fetched = await fetchImpl(page1Url, {
      userAgent: ua,
      referer: DOMAIN,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
  } catch (err) {
    return {
      ok: false,
      siteId: 'comicvn',
      pagesFetched: 0,
      totalPagesDetected: 1,
      items: [],
      error: String(err?.message || err),
    };
  }
  if (!fetched?.ok) {
    return {
      ok: false,
      siteId: 'comicvn',
      pagesFetched: 0,
      totalPagesDetected: 1,
      items: [],
      error: fetched?.error || 'Không tải được danh sách ComicVN Mới nhất.',
    };
  }

  const detected = Math.min(cap, Math.max(1, parseMoiNhatMaxPage(fetched.html)));
  const byUrl = new Map();
  const mergeItems = (list) => {
    for (const it of list) {
      if (!it?.mangaUrl || byUrl.has(it.mangaUrl)) continue;
      byUrl.set(it.mangaUrl, it);
    }
  };

  mergeItems(parseMoiNhatListingHtml(fetched.html, page1Url));
  if (onProgress) onProgress({ page: 1, totalPages: detected });

  let pagesFetched = 1;
  let warn = '';

  for (let page = 2; page <= detected; page += 1) {
    const url = buildMoiNhatListingUrl(page);
    let pageRes;
    try {
      pageRes = await fetchImpl(url, {
        userAgent: ua,
        referer: page1Url,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });
    } catch (err) {
      warn = String(err?.message || err);
      break;
    }
    if (!pageRes?.ok) {
      warn = pageRes?.error || `HTTP error page ${page}`;
      break;
    }
    mergeItems(parseMoiNhatListingHtml(pageRes.html, url));
    pagesFetched += 1;
    if (onProgress) onProgress({ page, totalPages: detected });
  }

  return {
    ok: true,
    siteId: 'comicvn',
    pagesFetched,
    totalPagesDetected: detected,
    items: Array.from(byUrl.values()),
    ...(warn ? { error: warn } : {}),
  };
}

const SELECTORS = {
  title: 'div.detail h1',
  cover: 'div.cover img',
};

/**
 * ComicVN connector service extending HtmlConnectorService.
 * Implements custom chapter fetching via API and image parsing.
 */
class ComicvnService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'comicvn',
      selectors: SELECTORS,
    });
    this.session = { userAgent: USER_AGENT, cookieHeader: '' };
  }

  /**
   * Merge all cookie sources: env (backward compat) + CookieManager (highest priority).
   */
  mergeAllCookies() {
    if (process.env.COMICVN_COOKIE) {
      this.session.cookieHeader = mergeCookieHeaders(
        this.session.cookieHeader,
        process.env.COMICVN_COOKIE.trim()
      );
    }
    const uiCookie = cookieManager.getEffectiveCookie('comicvn');
    if (uiCookie) {
      this.session.cookieHeader = mergeCookieHeaders(this.session.cookieHeader, uiCookie);
    }
  }

  /**
   * Extract manga ID from URL.
   */
  extractMangaId(url) {
    const m = String(url || '').match(MANGA_ID_RE);
    return m ? m[1] : null;
  }

  /**
   * Fetch HTML with cookie support.
   */
  async fetchHtmlWithCookie(url, log) {
    const headers = {
      'User-Agent': this.session.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: DOMAIN,
    };
    if (this.session.cookieHeader) headers.Cookie = this.session.cookieHeader;
    const res = await fetch(url, { headers, redirect: 'follow' });
    this.mergeSetCookieFromResponse(res);
    if (res.status === 401 || res.status === 403) {
      log?.(
        `[ComicVN] HTTP ${res.status}: Cookie hết hạn hoặc không hợp lệ. Vào Settings → Cookie đăng nhập site để cập nhật cookie ComicVN.`,
        'error'
      );
      return { ok: false, error: `HTTP ${res.status}` };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, html: await res.text() };
  }

  /**
   * Merge Set-Cookie from response.
   */
  mergeSetCookieFromResponse(res) {
    if (!res || !res.headers) return;
    let list = [];
    if (typeof res.headers.getSetCookie === 'function') {
      list = res.headers.getSetCookie();
    } else {
      const sc = res.headers.get('set-cookie');
      if (sc) list = [sc];
    }
    for (const line of list) {
      const pair = String(line).split(';')[0].trim();
      if (pair) {
        this.session.cookieHeader = mergeCookieHeaders(this.session.cookieHeader, pair);
      }
    }
  }

  /**
   * Fetch chapters HTML from API endpoint.
   */
  async fetchChaptersHtmlFromApi(apiUrl, refererUrl) {
    const headers = {
      'User-Agent': this.session.userAgent,
      Cookie: this.session.cookieHeader || '',
      Accept: 'application/json, text/plain, */*',
      Referer: refererUrl,
      'X-Requested-With': 'XMLHttpRequest',
    };
    try {
      const apiRes = await fetch(apiUrl, { headers });
      this.mergeSetCookieFromResponse(apiRes);
      if (!apiRes.ok) return null;
      const root = await apiRes.json();
      if (root && root.status === true && root.data && typeof root.data.chaptersHtml === 'string') {
        return root.data.chaptersHtml;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Get text content from titleComic span (excluding child elements).
   */
  titleComicOwnText($span) {
    if (!$span || !$span.length) return '';
    const $clone = $span.clone();
    $clone.children().remove();
    return $clone.text().trim();
  }

  /**
   * Load manga information from URL.
   * Overrides default to use API for chapter fetching.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    // Reset session and merge cookies
    this.session.cookieHeader = '';
    this.mergeAllCookies();

    // Initial request to establish session
    await this.fetchHtmlWithCookie(DOMAIN, options.log);

    const mangaId = this.extractMangaId(trimmed);
    if (!mangaId) {
      return { ok: false, error: 'Không tìm thấy manga_id trong URL (cần ...-xxxxxxxx.html).' };
    }

    const meta = await this.fetchHtmlWithCookie(trimmed, options.log);
    if (!meta.ok) return { ok: false, error: meta.error || 'HTTP error' };

    const $ = cheerio.load(meta.html);
    let title = $(SELECTORS.title).first().text().trim();
    if (!title) title = $('title').first().text().trim();

    let coverUrl = '';
    const $cov = $(SELECTORS.cover).first();
    if ($cov.length) {
      coverUrl = $cov.attr('data-src') || $cov.attr('src') || '';
      if (coverUrl && !coverUrl.includes('default.png')) {
        if (!/^https?:\/\//i.test(coverUrl)) {
          coverUrl = resolveUrl(DOMAIN, coverUrl.replace(/^\//, ''));
        }
      } else {
        coverUrl = '';
      }
    }

    // Fetch chapters via API
    const chapters = [];
    const apiUrl = `${DOMAIN}thong-tin-ca-nhan?manga_id=${mangaId}`;
    const chaptersHtml = await this.fetchChaptersHtmlFromApi(apiUrl, trimmed);
    if (chaptersHtml) {
      const doc = cheerio.load(chaptersHtml);
      doc('a[href]').each((_, a) => {
        let href = doc(a).attr('href') || '';
        const $span = doc(a).find('span.titleComic').first();
        const t = $span.length ? this.titleComicOwnText($span) : doc(a).text().trim();
        if (!href) return;
        if (!/^https?:\/\//i.test(href)) {
          href = resolveUrl(DOMAIN, href.replace(/^\//, ''));
        }
        chapters.push({ url: href, title: t || href });
      });
    }

    if (!title) return { ok: false, error: 'Không đọc được tiêu đề.' };

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId,
        siteId: 'comicvn',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Parse image URLs from chapter HTML.
   * Looks for token-based URLs and CDN chapter images.
   */
  parseImageUrls(html) {
    return parseComicvnImageUrls(html);
  }

  /**
   * Fetch chapter images from chapter URL.
   * Overrides default to handle token-based URLs and cookie auth.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const headers = {
      'User-Agent': this.session.userAgent,
      Referer: DOMAIN,
      Cookie: this.session.cookieHeader || '',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    const res = await fetch(chapterUrl, {
      method: 'GET',
      redirect: 'manual',
      headers,
    });
    this.mergeSetCookieFromResponse(res);

    if (res.status >= 300 && res.status < 400) {
      throw new Error('Chapter bị khóa (redirect). Thử đặt cookie ComicVN qua Settings → Cookie đăng nhập site.');
    }

    if (res.ok) {
      const html = await res.text();
      const urls = this.parseImageUrls(html);
      if (!urls.length && isComicvnChapterLoginLocked(html)) {
        throw new Error(
          'Chapter yêu cầu đăng nhập ComicVN. Vào Settings → Cookie đăng nhập site để cập nhật cookie ComicVN.'
        );
      }
      return urls.map((url) => {
        const ext = String(url).split('?')[0].split('.').pop() || 'jpg';
        return { imageUrl: url, ext: ext.toLowerCase() };
      });
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `[ComicVN] HTTP ${res.status}: Cookie hết hạn hoặc không hợp lệ. Vào Settings → Cookie đăng nhập site để cập nhật cookie ComicVN.`
      );
    }

    throw new Error(`Không đọc được trang chapter (HTTP ${res.status}).`);
  }

  /**
   * Get headers for image download requests.
   * Overrides default to include cookies.
   */
  getImageHeaders(referer) {
    const headers = super.getImageHeaders(referer);
    if (this.session.cookieHeader) {
      headers.Cookie = this.session.cookieHeader;
    }
    return headers;
  }

  /**
   * Download chapter with custom handling for token-based URLs.
   * Overrides default to add delay for token URLs.
   */
  async downloadChapter(payload, connectorLabel) {
    // Reset session and merge cookies
    this.session.cookieHeader = '';
    this.mergeAllCookies();

    // Initial request to establish session
    await this.fetchHtmlWithCookie(DOMAIN, payload.onLog);

    // Call parent implementation
    return super.downloadChapter(payload, connectorLabel);
  }
}

// Create singleton instance
const service = new ComicvnService();

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
  DOMAIN,
  LABEL,
  MOI_NHAT_MAX_PAGES_CAP,
  isComicvnMangaListingUrl,
  buildMoiNhatListingUrl,
  parseMoiNhatListingHtml,
  parseMoiNhatMaxPage,
  fetchMoiNhatListing,
  isComicvnChapterImageUrl,
  isComicvnChapterLoginLocked,
  parseComicvnImageUrls,
  load,
  downloadChapter,
};
