/**
 * ZetTruyen connector service — www.zettruyen.top
 * Chapters are loaded via API endpoint; images are scraped from chapter HTML.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT_JSOUP,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('ZettruyenService');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://www.zettruyen4.com/';
const LABEL = 'ZetTruyen';
const IMG_REFERER = DOMAIN;

function getActiveDomain(url) {
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol && u.host) {
        return `${u.protocol}//${u.host}/`;
      }
    } catch {
      /* ignore invalid url */
    }
  }
  return connectorDomainManager.getDomain('zettruyen', DOMAIN);
}

const SELECTORS = {
  title: 'h1.comic-title-content',
  cover: '.thumb-cover img',
  chapterLinks: '', // not used — overridden in load()
};

/**
 * Plain-text synopsis from manga detail `p.comic-content`.
 */
function extractZettruyenDescription(html) {
  const $ = cheerio.load(html);
  const $desc =
    $('p.comic-content.desk').first().length > 0
      ? $('p.comic-content.desk').first()
      : $('p.comic-content.mobile').first().length > 0
        ? $('p.comic-content.mobile').first()
        : $('p.comic-content').first();
  if (!$desc.length) return '';
  return $desc.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
}

/**
 * Extract manga slug from a detail URL.
 * Expected format: /truyen-tranh/{slug}
 */
function extractMangaSlug(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'truyen-tranh') {
      return parts[1];
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * Fetch all chapters from the API, following pagination.
 */
async function fetchAllChapters(slug, pageUrl, baseDomain) {
  const chapters = [];
  let page = 1;
  let lastPage = 1;
  const domain = baseDomain || getActiveDomain(pageUrl);

  do {
    const apiUrl = `${domain}api/comics/${slug}/chapters?page=${page}`;
    let res;
    try {
      res = await fetch(apiUrl, {
        headers: {
          'User-Agent': USER_AGENT_JSOUP,
          Accept: 'application/json',
          Referer: pageUrl,
        },
        redirect: 'follow',
      });
    } catch (err) {
      logger.error('Lỗi gọi API chapter', err);
      break;
    }

    if (!res.ok) break;

    let json;
    try {
      json = await res.json();
    } catch {
      break;
    }

    if (!json || !json.success || !json.data) break;

    const data = json.data;
    lastPage = data.last_page || 1;

    for (const ch of data.chapters || []) {
      // chapter_slug: "chapter-43" → "chuong-43"
      const slug_part = String(ch.chapter_slug || '').replace(/^chapter-/i, 'chuong-');
      const chapterUrl = `${domain}truyen-tranh/${slug}/${slug_part}`;
      const title = String(ch.chapter_name || `Chapter ${ch.chapter_num}`).trim();
      chapters.push({ url: chapterUrl, title });
    }

    page++;
  } while (page <= lastPage);

  return chapters;
}

function isZettruyenMangaDetailHref(href) {
  try {
    const parts = new URL(String(href || ''), DOMAIN).pathname.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'truyen-tranh';
  } catch {
    return false;
  }
}

function buildZettruyenListingUrl(page, baseDomain) {
  const origin = (baseDomain || getActiveDomain()).replace(/\/$/, '');
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p <= 1) return `${origin}/tim-kiem-nang-cao`;
  return `${origin}/tim-kiem-nang-cao?page=${p}`;
}

function buildZettruyenSearchUrl(query, page, baseDomain) {
  const origin = (baseDomain || getActiveDomain()).replace(/\/$/, '');
  const q = encodeURIComponent(String(query || '').trim());
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const base = `${origin}/tim-kiem-nang-cao?name=${q}`;
  if (p <= 1) return base;
  return `${base}&page=${p}`;
}

function parseZettruyenListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  $('a[href*="page="]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = /[?&]page=(\d+)/i.exec(href);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    }
  });
  return maxPage;
}

const ZETTRUYEN_LISTING_PAGE_SIZE = 50;
const ZETTRUYEN_ADVANCED_LISTING_PAGE_SIZE = 30;

function resolveZettruyenListingTotalPages(html, currentPage, itemCount, pageSize = ZETTRUYEN_LISTING_PAGE_SIZE) {
  const fromLinks = parseZettruyenListingMaxPage(html);
  let total = Math.max(fromLinks, currentPage);
  if (itemCount >= pageSize) {
    total = Math.max(total, currentPage + 1);
  } else {
    total = currentPage;
  }
  return total;
}

function parseZettruyenListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('div.grid.grid-rows-1.grid-cols-12.m-2').each((_, el) => {
    const $el = $(el);
    let $titleLink = $el.find('.col-span-9 a[href*="/truyen-tranh/"]').first();
    if (!$titleLink.length) {
      $titleLink = $el.find('.thumb-cover a[href*="/truyen-tranh/"]').first();
    }
    const href = String($titleLink.attr('href') || '').trim();
    if (!href || !isZettruyenMangaDetailHref(href)) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    const title =
      $titleLink.text().trim().replace(/\s+/g, ' ') ||
      String($titleLink.attr('title') || '').trim() ||
      mangaUrl;
    let coverUrl = '';
    const $img = $el.find('.thumb-cover img').first();
    if ($img.length) {
      const raw = String($img.attr('src') || $img.attr('data-src') || '').trim();
      if (raw && !/^data:/i.test(raw)) {
        coverUrl = resolveUrl(pageUrl, raw);
      }
    }
    const $ch = $el.find('a.chapter-link p.truncate').first();
    const latestChapterLabel =
      $ch.text().trim().replace(/\s+/g, ' ') ||
      String($ch.attr('title') || '').trim() ||
      '';
    items.push({ title: title || mangaUrl, mangaUrl, coverUrl, latestChapterLabel });
  });
  return items;
}

function parseZettruyenSearchHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();
  $('div.grid.grid-cols-3').each((_, grid) => {
    $(grid)
      .find('a[href*="/truyen-tranh/"]')
      .each((__, el) => {
        const $a = $(el);
        const href = String($a.attr('href') || '').trim();
        if (!href || !isZettruyenMangaDetailHref(href)) return;
        const mangaUrl = resolveUrl(pageUrl, href);
        if (seen.has(mangaUrl)) return;
        seen.add(mangaUrl);
        const title =
          $a.find('span.line-clamp-2').first().text().trim().replace(/\s+/g, ' ') ||
          String($a.find('img').attr('alt') || $a.find('img').attr('title') || '').trim() ||
          mangaUrl;
        let coverUrl = '';
        const $img = $a.find('img[src*="zetimage.com"]').first();
        if ($img.length) {
          const raw = String($img.attr('src') || $img.attr('data-src') || '').trim();
          if (raw && !/^data:/i.test(raw)) {
            coverUrl = resolveUrl(pageUrl, raw);
          }
        }
        const latestChapterLabel =
          $a.find('span.text-txt-secondary').first().text().trim().replace(/\s+/g, ' ') ||
          '';
        items.push({ title: title || mangaUrl, mangaUrl, coverUrl, latestChapterLabel });
      });
  });
  return items;
}

/**
 * Tab Mới cập nhật — `/tim-kiem-nang-cao` (sort Mới cập nhật) hoặc tìm `/tim-kiem-nang-cao?name=`.
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const activeDomain = getActiveDomain();

  const listingUrl = search_query
    ? buildZettruyenSearchUrl(search_query, page, activeDomain)
    : buildZettruyenListingUrl(page, activeDomain);

  let fetched;
  try {
    fetched = await fetchHtml(listingUrl, {
      referer: activeDomain,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Không tải được danh sách ZetTruyen.' };
  }

  const items = parseZettruyenSearchHtml(fetched.html, listingUrl);
  const totalPages = search_query
    ? 1
    : Math.max(
        1,
        resolveZettruyenListingTotalPages(
          fetched.html,
          page,
          items.length,
          ZETTRUYEN_ADVANCED_LISTING_PAGE_SIZE,
        ),
      );

  return {
    ok: true,
    siteId: 'zettruyen',
    page,
    totalPages,
    items,
  };
}

class ZettruyenService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'zettruyen',
      imageReferer: IMG_REFERER,
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    let trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const activeDomain = getActiveDomain(trimmed);
    if (activeDomain) {
      connectorDomainManager.setDomain('zettruyen', activeDomain);
    }

    const slug = extractMangaSlug(trimmed);
    if (!slug) {
      return {
        ok: false,
        error: `URL không hợp lệ. Vui lòng dùng URL trang truyện (vd: ${activeDomain}truyen-tranh/ten-truyen).`,
      };
    }

    let fetched;
    try {
      fetched = await fetchHtml(trimmed, { userAgent: options.userAgent || USER_AGENT_JSOUP });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    let title = $('h1.comic-title-content').first().text().trim();
    if (!title) title = $('title').first().text().trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    // Construct cover URL directly from slug (most reliable — CDN pattern is stable)
    let coverUrl = `https://cdn4.zetimage.com/thumb/${slug}.jpg`;

    // Fallback 1: srcset / src on .thumb-cover img
    const $cover = $('.thumb-cover img').first();
    if ($cover.length) {
      const srcset = ($cover.attr('srcset') || '').trim();
      const src = ($cover.attr('src') || $cover.attr('data-src') || '').trim();
      const candidate = srcset.split(',')[0].trim().split(' ')[0] || src;
      if (candidate && !/^data:/i.test(candidate)) {
        coverUrl = resolveUrl(trimmed, candidate);
      }
    }
    // Fallback 2: og:image meta tag
    if (!coverUrl) {
      const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImage) coverUrl = resolveUrl(trimmed, ogImage);
    }

    const description = extractZettruyenDescription(fetched.html);
    const chapters = await fetchAllChapters(slug, trimmed, activeDomain);

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: slug,
        siteId: 'zettruyen',
        sourceLabel: LABEL,
        description: description || '',
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const rawUrl = String(chapterUrl || '').trim();
    const activeDomain = getActiveDomain(rawUrl);
    const normalizedReferer = String(referer || '').trim() || activeDomain;
    const fetched = await fetchHtml(rawUrl, { referer: normalizedReferer });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const $ = cheerio.load(fetched.html);
    const images = [];

    $('div.chapter-images-container img').each((_, el) => {
      const $el = $(el);
      const src = ($el.attr('src') || $el.attr('data-src') || '').trim();
      if (!src || /^data:/i.test(src)) return;
      const resolved = resolveUrl(rawUrl, src);
      if (!resolved) return;
      const ext = getFileExt(resolved) || 'jpg';
      images.push({ imageUrl: resolved, ext });
    });

    if (!images.length) {
      throw new Error('Không tìm thấy ảnh trong chương này.');
    }

    return images;
  }
}

const service = new ZettruyenService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
  parseZettruyenListingHtml,
  parseZettruyenSearchHtml,
  parseZettruyenListingMaxPage,
  resolveZettruyenListingTotalPages,
  buildZettruyenListingUrl,
  buildZettruyenSearchUrl,
  extractZettruyenDescription,
};
