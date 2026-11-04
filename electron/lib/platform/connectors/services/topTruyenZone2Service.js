/**
 * TopTruyenZone2 Service — toptruyenzone2.com
 *
 * Vietnamese manga aggregator. Chapter images live in .page-chapter img
 * (src attribute, protocol-relative //sNN.anhvip.xyz/image_comics/...).
 * The CDN requires Referer: https://www.toptruyenzone2.com/ or returns 403.
 *
 * The chapter list (#list-chapter-dt) contains one hidden spam link pointing
 * to a different manga (display:none). We filter it out by keeping only
 * chapters whose resolved URL contains the source manga's slug.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { fetchHtml, getFileExt, resolveUrl, USER_AGENT_JSOUP } = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('TopTruyenZone2Service');

const DOMAIN = 'https://www.toptruyenzone13.com/';
const ORIGIN_BASE = DOMAIN.replace(/\/$/, '');
const LABEL = 'TopTruyenZone2';

function refererForUrl(url) {
  try {
    return new URL(url).origin + '/';
  } catch {
    return DOMAIN;
  }
}

function _extractMangaSlug(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    // pathname: /truyen-tranh/{slug}/{id}
    return parts.length >= 2 ? parts[1] : null;
  } catch {
    return null;
  }
}

function extractTopTruyenZone2Description(html) {
  const $ = cheerio.load(html);
  const $desc = $('p.detail-summary').first();
  if (!$desc.length) return '';
  return $desc.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
}

function parseTopTruyenZone2MangaPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const title =
    $('h1.title-manga').first().text().trim() ||
    $('title').first().text().trim() ||
    '';
  let coverUrl = '';
  const $img = $('img.image-comic').first();
  if ($img.length) {
    const raw = String($img.attr('src') || $img.attr('data-src') || '').trim();
    if (raw) coverUrl = resolveUrl(pageUrl, raw);
  }
  const chapters = [];
  $('#list-chapter-dt a.chapter').each((_, el) => {
    const $a = $(el);
    let href = String($a.attr('href') || '').trim();
    const text = $a.text().trim().replace(/\s+/g, ' ');
    if (!href) return;
    href = resolveUrl(pageUrl, href);
    chapters.push({ url: href, title: text || href });
  });
  const description = extractTopTruyenZone2Description(html);
  return { title, coverUrl, chapters, description };
}

function buildTopTruyenZone2ListingUrl(page) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p <= 1) return `${ORIGIN_BASE}/`;
  return `${ORIGIN_BASE}/?page=${p}`;
}

function buildTopTruyenZone2SearchUrl(query, page) {
  const q = encodeURIComponent(String(query || '').trim());
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const base = `${ORIGIN_BASE}/tim-truyen?keyword=${q}`;
  if (p <= 1) return base;
  return `${base}&page=${p}`;
}

function parseTopTruyenZone2ListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  $('a.page-link[href*="page="]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = /[?&]page=(\d+)/i.exec(href);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    }
  });
  return maxPage;
}

function parseTopTruyenZone2ListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('div.item-manga').each((_, el) => {
    const $el = $(el);
    const $titleLink = $el.find('a.title-manga').first();
    const href = String($titleLink.attr('href') || '').trim();
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    const title =
      $titleLink.text().trim().replace(/\s+/g, ' ') ||
      String($titleLink.attr('title') || '').trim() ||
      mangaUrl;
    let coverUrl = '';
    const $img = $el.find('img.image-item').first();
    if ($img.length) {
      const raw = String($img.attr('data-original') || $img.attr('src') || '').trim();
      if (raw && !raw.includes('image_default')) {
        coverUrl = resolveUrl(pageUrl, raw);
      }
    }
    const $chLink = $el.find('a.chapter').first();
    const latestChapterLabel =
      $chLink.text().trim().replace(/\s+/g, ' ') ||
      String($chLink.attr('title') || '').trim() ||
      '';
    items.push({ title: title || mangaUrl, mangaUrl, coverUrl, latestChapterLabel });
  });
  return items;
}

/**
 * Tab Mới cập nhật — HTML trang chủ `/?page=` hoặc tìm `/tim-truyen?keyword=`.
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));

  const listingUrl = search_query
    ? buildTopTruyenZone2SearchUrl(search_query, page)
    : buildTopTruyenZone2ListingUrl(page);

  let fetched;
  try {
    fetched = await fetchHtml(listingUrl, {
      referer: DOMAIN,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Không tải được danh sách TopTruyenZone2.' };
  }

  const items = parseTopTruyenZone2ListingHtml(fetched.html, listingUrl);
  const totalPages = Math.max(1, parseTopTruyenZone2ListingMaxPage(fetched.html));

  return {
    ok: true,
    siteId: 'toptruyenzone2',
    page,
    totalPages,
    items,
  };
}

class TopTruyenZone2Service extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'toptruyenzone2',
      selectors: {
        title: 'h1.title-manga',
        cover: 'img.image-comic',
        chapterLinks: '#list-chapter-dt a.chapter',
      },
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    const userCookie = this._effectiveUserCookie();
    let fetched;
    try {
      fetched = await fetchHtml(trimmed, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        referer: refererForUrl(trimmed),
        ...(userCookie ? { cookie: userCookie } : {}),
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const { title, coverUrl, chapters, description } = parseTopTruyenZone2MangaPage(
      fetched.html,
      trimmed,
    );
    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    const slug = _extractMangaSlug(trimmed);
    let filteredChapters = chapters;
    if (slug) {
      const prefix = '/truyen-tranh/' + slug + '/';
      filteredChapters = chapters.filter((ch) => {
        try {
          return new URL(ch.url).pathname.startsWith(prefix);
        } catch {
          return false;
        }
      });
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description: description || '',
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'toptruyenzone2',
        sourceLabel: LABEL,
      },
      chapters: filteredChapters,
    };
  }

  async fetchChapterImages(chapterUrl) {
    const referer = refererForUrl(chapterUrl);
    const fetched = await fetchHtml(chapterUrl, { referer });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const $ = cheerio.load(fetched.html);
    const images = [];

    $('.page-chapter img').each((_, el) => {
      const raw = ($(el).attr('src') || $(el).attr('data-src') || '').trim();
      if (!raw) return;
      // Skip banners and UI images — only keep actual chapter image paths
      if (!raw.includes('/image_comics/')) return;
      const src = resolveUrl(referer, raw);
      const ext = getFileExt(src) || 'jpg';
      images.push({ imageUrl: src, ext });
    });

    if (!images.length) {
      throw new Error('Không tìm thấy ảnh trong chương.');
    }

    logger.debug(`Found ${images.length} images in chapter`);
    return images;
  }

  getReferer(payload) {
    return refererForUrl(payload.chapterUrl || payload.mangaUrl);
  }
}

const service = new TopTruyenZone2Service();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
  parseTopTruyenZone2ListingHtml,
  parseTopTruyenZone2ListingMaxPage,
  buildTopTruyenZone2ListingUrl,
  buildTopTruyenZone2SearchUrl,
  extractTopTruyenZone2Description,
  parseTopTruyenZone2MangaPage,
};
