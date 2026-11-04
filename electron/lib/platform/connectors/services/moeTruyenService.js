/**
 * MoeTruyen family service (moetruyen.net and truyen.moe mirror).
 * Features: Multi-page chapter list, reader-specific image parsing, IMGX decode.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  parseMangaPage,
  collectReaderPageImages,
  resolveUrl,
  getImageSrcFromEl,
  isValidImgSrc,
  getFileExt,
  getChromiumFetch,
} = require('../../../download/connector/htmlConnectorUtils');
const {
  decodeImgxImage,
  parseImgxReaderConfig,
  fetchImgxPageGrants,
  isImgxEncrypted,
} = require('../../../download/connector/moetruyenImgx');
const { downloadChapterWithBrowserCapture } = require('./moetruyenBrowserCapture');

/** Error prefix for chapters gated behind comments/purchases; never worth retrying via browser capture. */
const LOCKED_CHAPTER_ERROR_PREFIX = 'Chương đang bị khoá trên MoeTruyen';

function buildLockedChapterError(reason) {
  const detail = reason ? ` (${String(reason).trim()})` : '';
  return new Error(`${LOCKED_CHAPTER_ERROR_PREFIX}${detail}. Hãy mở khoá chương trên web rồi tải lại.`);
}

function isLockedChapterError(message) {
  return typeof message === 'string' && message.includes(LOCKED_CHAPTER_ERROR_PREFIX);
}

const DEFAULT_SITE = {
  domain: 'https://moetruyen.net/',
  label: 'MoeTruyen',
  siteId: 'moetruyen',
};

const SELECTORS = {
  chapterLinks: 'ul.chapter-list a.chapter-link',
  title: 'h1.manga-detail-title',
  cover: 'div.detail-cover img',
};

/**
 * Deduplicate chapters by URL.
 */
function dedupeChaptersByUrl(chapters) {
  const seen = new Set();
  const out = [];
  for (const ch of chapters) {
    const u = String(ch.url || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(ch);
  }
  return out;
}

/**
 * Extract manga synopsis from the description block (full text in data-description-content).
 */
function extractMoeTruyenDescription(html) {
  const $ = cheerio.load(html);
  const $span = $('span[data-description-content]').first();
  if ($span.length) {
    return $span.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
  }
  const $paragraph = $('p.lede.manga-description__text').first();
  if (!$paragraph.length) return '';
  const $clone = $paragraph.clone();
  $clone.find('button[data-description-toggle], .manga-description__toggle').remove();
  return $clone.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
}

/**
 * Parse MoeTruyen chapter list from HTML.
 */
function parseMoeChapterList(html, pageUrl) {
  const $ = cheerio.load(html);
  const chapters = [];
  $(SELECTORS.chapterLinks).each((_, el) => {
    const $a = $(el);
    let href = ($a.attr('href') || '').trim();
    if (!href) return;
    href = resolveUrl(pageUrl, href);
    const fromRow = $a.find('.chapter-title-row').first().text().trim().replace(/\s+/g, ' ');
    const text = fromRow || $a.text().trim().replace(/\s+/g, ' ');
    chapters.push({ url: href, title: text || href });
  });
  return chapters;
}

/**
 * Parse total number of chapter list pages from pagination.
 */
function parseTotalChapterPages(html) {
  const $ = cheerio.load(html);
  let max = 1;
  $('.admin-pagination__numbers span.chip, .admin-pagination__numbers a').each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max;
}

/** Full /manga catalog scan for Quét Tất Cả — site currently ~67 pages. */
const MANGA_BULK_SCAN_MAX_PAGES_CAP = 80;

/**
 * Total pages on /manga catalog (chips + ?page= links + data-manga-catalog-page).
 */
function parseMangaCatalogMaxPage(html) {
  let max = parseTotalChapterPages(html);
  const $ = cheerio.load(String(html || ''));
  $('a[href*="page="], a[href*="/manga"]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = href.match(/[?&]page=(\d+)/i);
    if (!m) return;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  $('[data-manga-catalog-page]').each((_, el) => {
    const n = parseInt(String($(el).attr('data-manga-catalog-page') || ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return Math.max(1, max);
}

/**
 * Map one entry from GET /manga/search JSON to Latest updates row shape.
 *
 * @param {object} entry
 * @param {string} originBase  e.g. https://moetruyen.net
 */
function mapSearchApiItemToListingRow(entry, originBase) {
  const slug = String(entry?.slug || '').trim();
  const base = String(originBase || '').replace(/\/$/, '');
  if (!slug || !base) {
    return null;
  }
  const mangaUrl = `${base}/manga/${slug}`;
  const title = String(entry?.title || '').trim();
  const coverUrl = String(entry?.cover || '').trim();
  const latestChapterLabel = String(entry?.status || '').trim();
  return {
    title: title || mangaUrl,
    mangaUrl,
    coverUrl,
    latestChapterLabel,
  };
}

/**
 * @param {unknown[]} rawItems
 * @param {string} originBase
 */
function parseMangaSearchApiItems(rawItems, originBase) {
  if (!Array.isArray(rawItems)) return [];
  const out = [];
  for (const ent of rawItems) {
    const row = mapSearchApiItemToListingRow(ent, originBase);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Parse /manga listing (recent / catalog ordering from site).
 *
 * @param {string} html
 * @param {string} pageUrl
 */
function parseMangaCatalogListing(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('article.manga-card').each((_, article) => {
    const $article = $(article);
    const $a = $article.find('a[href^="/manga/"]').first();
    const href = ($a.attr('href') || '').trim();
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    let title = ($a.find('h3').first().attr('title') || '').trim().replace(/\s+/g, ' ');
    if (!title) title = ($a.find('h4.manga-hover-popup__title').first().text() || '').trim().replace(/\s+/g, ' ');
    if (!title) {
      const alt = ($a.find('img').first().attr('alt') || '').trim().replace(/^Bìa\s+/i, '').trim();
      title = alt.replace(/\s+/g, ' ');
    }
    const coverUrl = ($a.find('img').first().attr('src') || '').trim();
    const latestChapterLabel = ($article.find('.manga-chapter-label').first().text() || '').trim().replace(/\s+/g, ' ');
    items.push({
      title: title || mangaUrl,
      mangaUrl,
      coverUrl: coverUrl || '',
      latestChapterLabel: latestChapterLabel || '',
    });
  });
  return items;
}

/**
 * Create a MoeTruyen-family service bound to one origin (moetruyen.net or truyen.moe).
 *
 * @param {{ domain?: string, label?: string, siteId?: string }} [siteConfig]
 */
function createMoeTruyenFamilyService(siteConfig = {}) {
  const DOMAIN = String(siteConfig.domain || DEFAULT_SITE.domain);
  const LABEL = String(siteConfig.label || DEFAULT_SITE.label);
  const SITE_ID = String(siteConfig.siteId || DEFAULT_SITE.siteId);
  const ORIGIN_BASE = DOMAIN.replace(/\/$/, '');
  const LISTING_PATH = `${ORIGIN_BASE}/manga`;

  function buildMangaCatalogListingUrl(page) {
    const p = Math.max(1, Math.floor(Number(page) || 1));
    return p <= 1 ? LISTING_PATH : `${LISTING_PATH}?page=${p}`;
  }

  /**
   * GET /manga/search?q=&limit= — JSON API for Latest updates search.
   *
   * @param {string} searchQuery
   * @param {object} [options]
   */
  async function fetchMangaSearchFromApi(searchQuery, options = {}) {
    const q = String(searchQuery || '').trim();
    if (!q) {
      return { ok: false, error: 'Từ khóa tìm kiếm trống.' };
    }
    const limit = Math.min(100, Math.max(1, Math.floor(Number(options.searchLimit) || 50)));
    const url = new URL(`${LISTING_PATH}/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url.href, {
      headers: {
        'User-Agent': options.userAgent || USER_AGENT_JSOUP,
        Accept: 'application/json',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
        Referer: DOMAIN,
      },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return { ok: false, error: 'Phản hồi tìm kiếm không phải JSON.' };
    }
    if (!body || body.ok !== true || !Array.isArray(body.items)) {
      return { ok: false, error: 'JSON tìm kiếm không hợp lệ.' };
    }
    const items = parseMangaSearchApiItems(body.items, ORIGIN_BASE);
    return { ok: true, items };
  }

  /**
   * Recent / catalog manga rows for Latest updates UI.
   *
   * @param {object} [options]
   * @param {number} [options.page]  1-based
   */
  async function fetchLatestUpdates(options = {}) {
    const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
    const searchQuery = String(rawSearch || '').trim();
    if (searchQuery) {
      const r = await fetchMangaSearchFromApi(searchQuery, options);
      if (!r.ok) {
        return { ok: false, error: r.error || 'Không tải được kết quả tìm kiếm.' };
      }
      return {
        ok: true,
        siteId: SITE_ID,
        page: 1,
        totalPages: 1,
        items: r.items,
      };
    }

    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const listingUrl = buildMangaCatalogListingUrl(page);
    const fetched = await fetchHtml(listingUrl, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: DOMAIN,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được danh sách truyện.' };
    }
    const totalPages = parseMangaCatalogMaxPage(fetched.html);
    const items = parseMangaCatalogListing(fetched.html, listingUrl);
    return {
      ok: true,
      siteId: SITE_ID,
      page,
      totalPages: Math.max(1, totalPages),
      items,
    };
  }

  /**
   * Quét Tất Cả: crawl /manga across pages (same item shape as ComicVN bulk scan).
   *
   * @param {object} [options]
   * @param {number} [options.maxPages]
   * @param {(p: { page: number, totalPages: number }) => void} [options.onProgress]
   * @param {typeof fetchHtml} [options.fetchHtmlImpl]
   */
  async function fetchBulkScanListing(options = {}) {
    const fetchImpl =
      typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;
    const ua = options.userAgent || USER_AGENT_JSOUP;
    const cap = Math.min(
      MANGA_BULK_SCAN_MAX_PAGES_CAP,
      Math.max(1, Math.floor(Number(options.maxPages) || MANGA_BULK_SCAN_MAX_PAGES_CAP)),
    );
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    const page1Url = buildMangaCatalogListingUrl(1);
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
        siteId: SITE_ID,
        pagesFetched: 0,
        totalPagesDetected: 1,
        items: [],
        error: String(err?.message || err),
      };
    }
    if (!fetched?.ok) {
      return {
        ok: false,
        siteId: SITE_ID,
        pagesFetched: 0,
        totalPagesDetected: 1,
        items: [],
        error: fetched?.error || `Không tải được danh sách ${LABEL} /manga.`,
      };
    }

    const detected = Math.min(cap, Math.max(1, parseMangaCatalogMaxPage(fetched.html)));
    const byUrl = new Map();
    const mergeItems = (list) => {
      for (const it of list) {
        if (!it?.mangaUrl || byUrl.has(it.mangaUrl)) continue;
        byUrl.set(it.mangaUrl, it);
      }
    };

    mergeItems(parseMangaCatalogListing(fetched.html, page1Url));
    if (onProgress) onProgress({ page: 1, totalPages: detected });

    let pagesFetched = 1;
    let warn = '';

    for (let page = 2; page <= detected; page += 1) {
      const url = buildMangaCatalogListingUrl(page);
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
      mergeItems(parseMangaCatalogListing(pageRes.html, url));
      pagesFetched += 1;
      if (onProgress) onProgress({ page, totalPages: detected });
    }

    return {
      ok: true,
      siteId: SITE_ID,
      pagesFetched,
      totalPagesDetected: detected,
      items: Array.from(byUrl.values()),
      ...(warn ? { error: warn } : {}),
    };
  }

  class MoeTruyenFamilyService extends HtmlConnectorService {
    constructor() {
      super({
        domain: DOMAIN,
        label: LABEL,
        siteId: SITE_ID,
        selectors: SELECTORS,
      });
    }

    async load(url, options = {}) {
      const trimmed = String(url || '').trim();
      if (!trimmed) {
        return { ok: false, error: 'URL trống.' };
      }

      let baseUrl = trimmed;
      try {
        const u = new URL(trimmed);
        u.searchParams.delete('chapterPage');
        u.hash = '';
        baseUrl = u.href;
      } catch {
        /* keep original */
      }

      const userCookie = this._effectiveUserCookie();
      const fetched = await fetchHtml(baseUrl, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        referer: DOMAIN,
        cookie: userCookie,
      });
      if (!fetched.ok) {
        return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
      }

      const { title, coverUrl } = parseMangaPage(fetched.html, baseUrl, SELECTORS);
      if (!title) {
        return { ok: false, error: 'Không đọc được tên truyện.' };
      }
      const description = extractMoeTruyenDescription(fetched.html);

      const totalPages = parseTotalChapterPages(fetched.html);
      let chapters = parseMoeChapterList(fetched.html, baseUrl);

      if (totalPages > 1) {
        const pageNums = [];
        for (let p = 2; p <= totalPages; p++) pageNums.push(p);
        const extraResults = await Promise.all(
          pageNums.map(async (p) => {
            const pageUrl = `${baseUrl}?chapterPage=${p}#chapters`;
            const r = await fetchHtml(pageUrl, {
              userAgent: options.userAgent || USER_AGENT_JSOUP,
              referer: DOMAIN,
              cookie: userCookie,
            });
            if (!r.ok) return [];
            return parseMoeChapterList(r.html, pageUrl);
          })
        );
        for (const list of extraResults) chapters = chapters.concat(list);
      }

      chapters = dedupeChaptersByUrl(chapters);
      return {
        ok: true,
        manga: {
          title,
          coverUrl,
          description: description || '',
          mangaUrl: baseUrl,
          mangaId: '',
          siteId: SITE_ID,
          sourceLabel: LABEL,
        },
        chapters,
      };
    }

    async fetchChapterImages(chapterUrl, referer) {
      // Capture the session cookie set by the chapter page: the IMGX page-access
      // endpoint binds its Reader JS proof to that session, so grants fail without it.
      const chromiumFetch = getChromiumFetch();
      const userCookie = this._effectiveUserCookie();
      const fetched = await fetchHtml(chapterUrl, {
        referer,
        userAgent: USER_AGENT_JSOUP,
        cookie: userCookie,
        includeSetCookie: true,
        preferChromiumNet: true,
      });
      if (!fetched.ok) {
        throw new Error(`Không tải được trang chương: ${fetched.error}`);
      }

      // If chapter is not encrypted with IMGX, extract direct static images directly
      if (!isImgxEncrypted(fetched.html, chapterUrl)) {
        const directImages = collectReaderPageImages(fetched.html, referer);
        if (directImages.length) return directImages;
        // No images and no reader runtime: the chapter may be interaction-locked.
        const lockedConfig = parseImgxReaderConfig(fetched.html, chapterUrl);
        if (lockedConfig && lockedConfig.locked) throw buildLockedChapterError(lockedConfig.lockedReason);
        return directImages;
      }

      // IMGX-protected chapters expose only placeholder <img> tags; the real pages
      // are obfuscated binaries fetched via a page-access endpoint and decoded here.
      const imgxConfig = parseImgxReaderConfig(fetched.html, chapterUrl);
      if (imgxConfig && imgxConfig.locked) throw buildLockedChapterError(imgxConfig.lockedReason);
      const grantsByIndex = new Map();

      if (imgxConfig && (imgxConfig.bootstrapUrl || imgxConfig.accessUrl)) {
        const pages = await fetchImgxPageGrants({
          accessUrl: imgxConfig.accessUrl,
          bootstrapUrl: imgxConfig.bootstrapUrl,
          chapterId: imgxConfig.chapterId,
          initialIndexes: imgxConfig.initialIndexes,
          totalPages: imgxConfig.totalPages,
          initialPages: imgxConfig.initialPages,
          media: imgxConfig.media,
          referer: chapterUrl,
          userAgent: USER_AGENT_JSOUP,
          proofToken: imgxConfig.proofToken,
          cookie: fetched.cookie,
          fetchImpl: chromiumFetch,
        });
        for (const page of pages) {
          if (page && page.pageIndex !== undefined) {
            grantsByIndex.set(Number(page.pageIndex), page);
          }
        }
      }

      if (grantsByIndex.size > 0) {
        const $ = cheerio.load(fetched.html);
        const resolvedPages = [];
        let $imgs = $('[data-reader-lazy-pages] img.page-media');
        if (!$imgs.length) $imgs = $('img.page-media');

        $imgs.each((i, el) => {
          const $el = $(el);
          const pageIndexRaw = $el.attr('data-page-index');
          let sort = i;
          if (pageIndexRaw !== undefined && pageIndexRaw !== '') {
            const n = parseInt(pageIndexRaw, 10);
            if (!Number.isNaN(n)) sort = n;
          }

          const imgxIdxRaw = $el.attr('data-imgx-page-index');
          if (imgxIdxRaw !== undefined && imgxIdxRaw !== '') {
            const grant = grantsByIndex.get(parseInt(imgxIdxRaw, 10));
            if (grant && grant.downloadUrl) {
              resolvedPages.push({
                sort,
                imageUrl: grant.downloadUrl,
                ext: 'webp',
                imgx: buildImgxImageInfo(grant),
              });
              return;
            }
          }

          let src = getImageSrcFromEl($el);
          if (!src || !isValidImgSrc(src)) return;
          src = resolveUrl(chapterUrl, src);
          const ext = getFileExt(src);
          if (!ext) return;
          resolvedPages.push({ sort, imageUrl: src, ext });
        });

        if (resolvedPages.length > 0) {
          resolvedPages.sort((a, b) => a.sort - b.sort);
          return resolvedPages.map(({ imageUrl, ext, imgx }) => ({
            imageUrl,
            ext,
            ...(imgx ? { imgx } : {}),
          }));
        }

        // Direct fallback: return sorted pages from grantsByIndex if DOM <img> elements differ
        return Array.from(grantsByIndex.values())
          .sort((a, b) => Number(a.pageIndex) - Number(b.pageIndex))
          .map((page) => ({
            imageUrl: page.downloadUrl,
            ext: 'webp',
            imgx: buildImgxImageInfo(page),
          }));
      }

      return collectReaderPageImages(fetched.html, referer);
    }

    /**
     * Download chapter with smart encryption branching:
     * - If encrypted with IMGX: decode directly over HTTP (reader-channel grants +
     *   IMGX v2/v3/v4 decoder). Browser capturePage is only used as a fallback
     *   when the HTTP pipeline cannot obtain grants or decode the pages.
     * - If standard unencrypted: uses direct multi-threaded HTTP download pipeline.
     */
    async downloadChapter(payload, connectorLabel) {
      const { chapterUrl, onLog } = payload || {};
      const log = (msg, level = 'info') => {
        if (typeof onLog === 'function') onLog(msg, level);
      };

      const userCookie = this._effectiveUserCookie();
      const fetched = await fetchHtml(chapterUrl, {
        referer: this.getReferer(payload),
        userAgent: USER_AGENT_JSOUP,
        cookie: userCookie,
        includeSetCookie: true,
        preferChromiumNet: true,
      });

      if (fetched && fetched.ok && isImgxEncrypted(fetched.html, chapterUrl)) {
        log('[MoeTruyen] Phát hiện chương mã hoá IMGX — giải mã trực tiếp qua HTTP (không cần Chromium ngầm).', 'info');
        const httpResult = await super.downloadChapter(payload, connectorLabel);
        if (!httpResult || httpResult.ok || httpResult.aborted) return httpResult;
        if (isLockedChapterError(httpResult.error)) return httpResult;

        log(`[MoeTruyen] Giải mã IMGX qua HTTP thất bại (${httpResult.error || 'không rõ lỗi'}) — chuyển sang chụp trang capturePage qua Chromium ngầm.`, 'warn');
        return downloadChapterWithBrowserCapture(payload, {
          connectorLabel: connectorLabel || LABEL,
          cookie: fetched.cookie || userCookie,
          userAgent: this.getUserAgent(),
        });
      }

      log('[MoeTruyen] Chương thông thường không mã hoá — tải trực tiếp qua luồng HTTP.', 'info');
      return super.downloadChapter(payload, connectorLabel);
    }

    /**
     * Override to decode IMGX-protected pages after download. Non-IMGX pages use
     * the default direct-download behavior from the base class.
     *
     * Sources are tried in order: the fallback CDN (`imageUrl`, serves the raw
     * IMGX binary) then `primaryUrl` (PNG pixel carrier). The first source that
     * downloads and decodes successfully wins.
     */
    async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}, shouldAbort) {
      if (!imageInfo || !imageInfo.imgx) {
        return super.downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo, shouldAbort);
      }

      const IMAGE_FETCH_TIMEOUT_MS = 30_000;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), IMAGE_FETCH_TIMEOUT_MS);
      let pollInterval;
      if (typeof shouldAbort === 'function') {
        pollInterval = setInterval(() => { if (shouldAbort()) ac.abort(); }, 300);
      }

      const { grant, storageKey, primaryUrl } = imageInfo.imgx;
      const sourceUrls = [imageUrl, primaryUrl].filter((url, i, arr) => url && arr.indexOf(url) === i);
      let lastFailure = { ok: false };

      try {
        const fetchFn = getChromiumFetch() || fetch;
        for (const sourceUrl of sourceUrls) {
          if (ac.signal.aborted) break;
          try {
            const res = await fetchFn(sourceUrl, { headers, redirect: 'follow', signal: ac.signal });
            if (!res.ok) {
              lastFailure = { ok: false, status: res.status };
              continue;
            }
            const raw = await res.arrayBuffer();
            const decoded = await decodeImgxImage(raw, grant, storageKey);
            if (!decoded || !decoded.length) {
              lastFailure = { ok: false, error: 'IMGX decode produced empty output' };
              continue;
            }
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, decoded);
            return { ok: true, fileSize: decoded.length };
          } catch (err) {
            lastFailure = { ok: false, error: err.message };
            if (ac.signal.aborted) break;
          }
        }
        return lastFailure;
      } finally {
        clearTimeout(timer);
        if (pollInterval) clearInterval(pollInterval);
      }
    }
  }

  /** Shape the per-page IMGX info consumed by `downloadImageWithRetry`. */
  function buildImgxImageInfo(page) {
    const info = { grant: page.grant, storageKey: page.storageKey };
    if (page.primaryUrl) info.primaryUrl = page.primaryUrl;
    return info;
  }

  const service = new MoeTruyenFamilyService();

  return {
    DOMAIN,
    LABEL,
    SITE_ID,
    LISTING_PATH,
    MANGA_BULK_SCAN_MAX_PAGES_CAP,
    load: (url, options) => service.load(url, options),
    downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
    fetchChapterImages: (url, ref) => service.fetchChapterImages(url, ref),
    downloadImageWithRetry: (...args) => service.downloadImageWithRetry(...args),
    fetchLatestUpdates,
    fetchBulkScanListing,
    buildMangaCatalogListingUrl,
    parseMangaCatalogMaxPage,
    parseMangaCatalogListing,
    parseMangaSearchApiItems,
    mapSearchApiItemToListingRow,
    extractMoeTruyenDescription,
  };
}

const defaultService = createMoeTruyenFamilyService(DEFAULT_SITE);

module.exports = {
  ...defaultService,
  createMoeTruyenFamilyService,
};
