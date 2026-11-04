/**
 * TruyenQQ — truyenqqko.com (HTML + ảnh trang chương).
 *
 * Manga page:
 *   - Title:    h1[itemprop="name"]
 *   - Cover:    div.book_avatar img (fallback meta og:image)
 *   - Chapters: div.list_chapter div.works-chapter-item a
 *
 * Chapter page:
 *   - Images:   div.chapter_content div.page-chapter img (collectTruyenQQChapterImages)
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  collectTruyenQQChapterImages,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://truyenqqko.com/';
const ORIGIN_BASE = String(DOMAIN || '').replace(/\/$/, '');
const LABEL = 'TruyenQQ';

/** Try mirrors in order (GET/POST). truyenqqko.com is the live domain; truyenqqno.com kept as fallback. */
const TRUYENQQ_MIRROR_ORIGINS = ['https://truyenqqko.com', 'https://truyenqqno.com'];

/** Latest listing (HTML): `/truyen-moi-cap-nhat`, `/truyen-moi-cap-nhat/trang-{n}`. */
const LATEST_UPDATES_PATH = '/truyen-moi-cap-nhat';

function normalizeTruyenQQOriginBase(origin) {
  return String(origin || '').trim().replace(/\/$/, '');
}

const SELECTORS = {
  chapterLinks: 'div.list_chapter div.works-chapter-item a',
  title: 'h1[itemprop="name"]',
  cover: 'div.book_avatar img',
};

/** Gợi ý khi server trả 403 (VPN / DNS WARP 1.1.1.1 thường gây chặn). */
const HTTP403_HINT = ' — Thử tắt VPN WARP 1.1.1.1';

function appendTruyenQQ403Hint(message) {
  const s = String(message || '');
  if (/\b403\b/.test(s) && !s.includes('Thử tắt VPN')) return s + HTTP403_HINT;
  return s;
}

/** Chỉ lọc meta trang chủ / logo — không lọc ảnh bìa .jpg từ CDN. */
const BAD_META_COVER_MARKERS = ['og-image.png', '/template/frontend/images/og-image'];

function isBadMetaCoverUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const u = url.trim().toLowerCase();
  return BAD_META_COVER_MARKERS.some((m) => u.includes(m));
}

/**
 * Build URL for latest-updates HTML listing (page 1 = canonical path without /trang-1).
 * @param {number} page  1-based
 */
function buildLatestUpdatesListUrlForOrigin(originBase, page) {
  const clean = normalizeTruyenQQOriginBase(originBase || ORIGIN_BASE);
  const p = Math.max(1, Math.floor(Number(page) || 1));
  if (p <= 1) return `${clean}${LATEST_UPDATES_PATH}`;
  return `${clean}${LATEST_UPDATES_PATH}/trang-${p}`;
}

function buildLatestUpdatesListUrl(page) {
  return buildLatestUpdatesListUrlForOrigin(ORIGIN_BASE, page);
}

/**
 * @param {string} query
 * @returns {string}  `search=…` body (x-www-form-urlencoded)
 */
function buildTruyenQQSearchPostBody(query) {
  const q = String(query || '').trim();
  return `search=${encodeURIComponent(q)}`;
}

/**
 * Parse max page from bottom pager (`div.page_redirect`).
 * @param {string} html
 */
function parseTruyenQQLatestPagerMaxPageFromHtml(html) {
  const $ = cheerio.load(html);
  let max_page = 1;
  $('div.page_redirect a[href]').each((_, el) => {
    const href = String($(el).attr('href') || '').trim();
    if (!href || href.startsWith('javascript:')) return;
    let m = href.match(/\/trang-(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max_page) max_page = n;
      return;
    }
    m = href.match(/[?&]page=(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max_page) max_page = n;
    }
  });
  return max_page;
}

/**
 * Rows for Latest updates tab from listing or search HTML.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {{ title: string, mangaUrl: string, coverUrl: string, latestChapterLabel: string }[]}
 */
function parseTruyenQQLatestListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('ul.list_grid.grid > li').each((_, li) => {
    const $li = $(li);
    const $title_a = $li.find('div.book_name h3 a').first();
    let href = String($title_a.attr('href') || '').trim();
    if (!href) {
      href = String($li.find('div.book_avatar a').first().attr('href') || '').trim();
    }
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    const title =
      String($title_a.attr('title') || '').trim() ||
      $title_a.text().trim().replace(/\s+/g, ' ') ||
      mangaUrl;
    let coverUrl = '';
    const $img = $li.find('div.book_avatar img').first();
    if ($img.length) {
      const raw = getImageSrcLikeJava($img);
      coverUrl = raw ? resolveUrl(pageUrl, raw) : '';
    }
    const $ch = $li.find('div.last_chapter a').first();
    const latestChapterLabel =
      $ch.text().trim().replace(/\s+/g, ' ') ||
      String($ch.attr('title') || '').trim() ||
      '';
    items.push({
      title: title || mangaUrl,
      mangaUrl,
      coverUrl,
      latestChapterLabel,
    });
  });
  return items;
}

/**
 * Parse HTML fragment from `POST /frontend/search/search` (dropdown / quick search).
 * @param {string} html
 * @param {string} [originForRelative]  base URL for relative manga links (mirror-specific)
 */
function parseTruyenQQPostSearchListingHtml(html, originForRelative = DOMAIN) {
  const base_for_resolve = String(originForRelative || DOMAIN).trim() || DOMAIN;
  const wrapped = `<ul id="truyenqq-search-root">${String(html || '').trim()}</ul>`;
  const $ = cheerio.load(wrapped);
  const items = [];
  $('#truyenqq-search-root > li').each((_, li) => {
    const $li = $(li);
    if ($li.find('.no_result').length) return;
    const $a = $li.find('a[href*="truyen-tranh"]').first();
    const href = String($a.attr('href') || '').trim();
    if (!href) return;
    const mangaUrl = /^https?:\/\//i.test(href) ? href : resolveUrl(base_for_resolve, href);
    const title =
      $li.find('p.name').first().text().trim().replace(/\s+/g, ' ') || mangaUrl;
    let coverUrl = '';
    const $img = $li.find('div.search_avatar img').first();
    if ($img.length) {
      const raw = getImageSrcLikeJava($img);
      coverUrl = raw ? resolveUrl(mangaUrl, raw) : '';
    }
    const latestChapterLabel = $li
      .find('div.search_info p')
      .filter((__, p) => !$(p).hasClass('name') && !$(p).hasClass('name_other'))
      .first()
      .text()
      .trim()
      .replace(/\s+/g, ' ');
    items.push({
      title: title || mangaUrl,
      mangaUrl,
      coverUrl,
      latestChapterLabel,
    });
  });
  return items;
}

/**
 * Tab Mới cập nhật — HTML `/truyen-moi-cap-nhat` hoặc tìm `POST /frontend/search/search` (body `search=`).
 *
 * @param {object} [options]
 * @param {number} [options.page]  1-based (chỉ áp dụng danh sách mới; tìm POST trả một trang kết quả)
 * @param {string} [options.latestUpdatesSearch]
 * @param {string} [options.searchQuery]  alias
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const ua = options.userAgent || USER_AGENT_JSOUP;
  const cookie = options.cookie;

  if (search_query) {
    let last_error = '';
    let had_ok_response = false;
    for (const origin_raw of TRUYENQQ_MIRROR_ORIGINS) {
      const clean = normalizeTruyenQQOriginBase(origin_raw);
      const search_url = `${clean}/frontend/search/search`;
      const referer = `${clean}/`;
      const fetched = await fetchHtml(search_url, {
        method: 'POST',
        body: buildTruyenQQSearchPostBody(search_query),
        contentType: 'application/x-www-form-urlencoded',
        accept: 'text/html,*/*',
        userAgent: ua,
        referer,
        cookie,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Origin: clean,
        },
      });
      if (!fetched.ok) {
        last_error = fetched.error || '';
        continue;
      }
      had_ok_response = true;
      const items = parseTruyenQQPostSearchListingHtml(fetched.html, referer);
      // truyenqqno.com often returns "no result" from some networks while truyenqqko.com still has hits — try mirrors until we get rows
      if (items.length > 0) {
        return {
          ok: true,
          siteId: 'truyenqq',
          page: 1,
          totalPages: 1,
          items,
        };
      }
    }
    if (had_ok_response) {
      return {
        ok: true,
        siteId: 'truyenqq',
        page: 1,
        totalPages: 1,
        items: [],
      };
    }
    return {
      ok: false,
      error: appendTruyenQQ403Hint(
        last_error || 'Không tải được kết quả tìm TruyenQQ (đã thử mirror no/ko).',
      ),
    };
  }

  let last_listing_error = '';
  for (const origin_raw of TRUYENQQ_MIRROR_ORIGINS) {
    const clean = normalizeTruyenQQOriginBase(origin_raw);
    const listingUrl = buildLatestUpdatesListUrlForOrigin(clean, page);
    const fetched = await fetchHtml(listingUrl, {
      accept: 'text/html,application/xhtml+xml',
      userAgent: ua,
      referer: `${clean}/`,
      cookie,
    });
    if (!fetched.ok) {
      last_listing_error = fetched.error || '';
      continue;
    }
    const items = parseTruyenQQLatestListingHtml(fetched.html, listingUrl);
    const totalPages = Math.max(1, parseTruyenQQLatestPagerMaxPageFromHtml(fetched.html));
    return {
      ok: true,
      siteId: 'truyenqq',
      page,
      totalPages,
      items,
    };
  }
  return {
    ok: false,
    error: appendTruyenQQ403Hint(
      last_listing_error || 'Không tải được danh sách TruyenQQ (đã thử mirror no/ko).',
    ),
  };
}

/**
 * org.example.utils.MangaUtils.getImageSrc — chỉ src / data-src (không data-fb).
 */
function getImageSrcLikeJava($img) {
  const src = $img.attr('src') || '';
  const dataSrc = $img.attr('data-src') || '';
  return src.length > 0 ? src.trim() : dataSrc.trim();
}

/**
 * Trang đọc chương: không có div.book_avatar — lấy meta như og:image (đúng bìa truyện).
 */
function extractMetaCoverWhenNoBookAvatar(html) {
  const $ = cheerio.load(html);
  const pick = (sel) => {
    const v = $(sel).first().attr('content');
    return v ? v.trim().split(/\s+/)[0] : '';
  };
  let u = pick('meta[itemprop="image"][content]');
  if (u && !isBadMetaCoverUrl(u)) return u;
  u = pick('meta[property="og:image"][content]');
  if (u && !isBadMetaCoverUrl(u)) return u;
  u = pick('meta[name="twitter:image"][content]');
  if (u && !isBadMetaCoverUrl(u)) return u;
  const m = html.match(
    /<meta[^>]+itemprop\s*=\s*["']image["'][^>]*content\s*=\s*["']([^"']+)["']/i
  );
  if (m && m[1]) {
    const x = m[1].trim().split(/\s+/)[0];
    if (x && !isBadMetaCoverUrl(x)) return x;
  }
  return '';
}

/**
 * Khớp Java: document.select("div.book_avatar img").first() + getImageSrc.
 */
function extractTruyenQQCover(html, pageUrl) {
  const $ = cheerio.load(html);
  const $img = $('div.book_avatar img').first();
  if ($img.length) {
    const raw = getImageSrcLikeJava($img);
    if (raw) {
      const url = /^https?:\/\//i.test(raw) ? raw : resolveUrl(DOMAIN, raw);
      if (url) return url;
    }
  }
  const metaUrl = extractMetaCoverWhenNoBookAvatar(html);
  return metaUrl ? resolveUrl(pageUrl, metaUrl) : '';
}

/**
 * TruyenQQ service implementation.
 * Extends HtmlConnectorService with custom cover extraction and TruyenQQ image parsing.
 */
class TruyenQQService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'truyenqq',
      selectors: SELECTORS,
    });
  }

  /**
   * Override load() to handle custom cover extraction and 403 hints.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const fetched = await fetchHtml(trimmed, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      return {
        ok: false,
        error: appendTruyenQQ403Hint(fetched.error || 'Không tải được trang truyện.'),
      };
    }

    const { title, coverUrl: coverFallback, chapters, description } = this.parseMangaPage(
      fetched.html,
      trimmed
    );

    if (!title) {
      return { ok: false, error: 'Không đọc được tên truyện (selector trang có thể đổi).' };
    }

    const coverUrl = extractTruyenQQCover(fetched.html, trimmed) || coverFallback;

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description: description || '',
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'truyenqq',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Helper to parse manga page (uses parent class logic with custom selectors).
   */
  parseMangaPage(html, pageUrl) {
    const $ = cheerio.load(html);
    const title =
      $(SELECTORS.title).first().text().trim() || $('title').first().text().trim() || '';
    let coverUrl = '';
    const $img = $(SELECTORS.cover).first();
    if ($img.length) {
      const raw = getImageSrcLikeJava($img);
      coverUrl = resolveUrl(pageUrl, raw);
    }
    const chapters = [];
    $(SELECTORS.chapterLinks).each((_, el) => {
      const $a = $(el);
      let href = ($a.attr('href') || '').trim();
      const text = $a.text().trim();
      if (!href) return;
      href = resolveUrl(pageUrl, href);
      chapters.push({ url: href, title: text || href });
    });
    let description = '';
    const $desc = $('[itemprop="description"]:not(meta), .detail-content').first();
    if ($desc.length) {
      description = $desc.text().trim().replace(/\s+/g, ' ').slice(0, 1000);
    }
    return { title, coverUrl, chapters, description };
  }

  /**
   * Override fetchChapterImages() to use collectTruyenQQChapterImages.
   * This handles the special TruyenQQ image structure with page-chapter divs.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, { referer });
    if (!fetched.ok) {
      throw new Error(appendTruyenQQ403Hint(`Không tải được trang chương: ${fetched.error}`));
    }
    return collectTruyenQQChapterImages(fetched.html, referer);
  }
}

const service = new TruyenQQService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
  parseTruyenQQLatestListingHtml,
  parseTruyenQQLatestPagerMaxPageFromHtml,
  parseTruyenQQPostSearchListingHtml,
  buildLatestUpdatesListUrl,
  buildTruyenQQSearchPostBody,
};
