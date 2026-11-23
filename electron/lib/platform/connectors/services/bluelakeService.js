/**
 * BlueLake connector service — www.bluelakeaccelerator.com (branded: TruyenQQ)
 *
 * Manga page:
 *   - Title:    div.info h1
 *   - Cover:    .detail-image img  (relative URL)
 *   - Chapters: .chapts .card .d-flex span a  (listed newest-first → reversed)
 *
 * Chapter page:
 *   - Images:   section.wrapper.page-view img.img-thumbnail  (relative URLs, same domain)
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT_JSOUP,
  VPN_REQUIRED_HINT,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('BlueLakeService');

const DOMAIN = 'https://www.bluelakeaccelerator.com/';
const LABEL = 'BlueLake';
const IMG_REFERER = DOMAIN;

/**
 * Extract manga slug from detail URL.
 * Expected: /truyen-tranh/{slug}
 */
function extractMangaSlug(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'truyen-tranh') return parts[1];
  } catch {
    /* ignore */
  }
  return '';
}

class BlueLakeService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'bluelake',
      imageReferer: IMG_REFERER,
      selectors: {},
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const slug = extractMangaSlug(trimmed);
    if (!slug) {
      return {
        ok: false,
        error:
          'URL không hợp lệ. Vui lòng dùng URL trang truyện, vd: https://www.bluelakeaccelerator.com/truyen-tranh/ten-truyen',
      };
    }

    let fetched;
    try {
      fetched = await fetchHtml(trimmed, { userAgent: options.userAgent || USER_AGENT_JSOUP });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) + VPN_REQUIRED_HINT };
    }
    if (!fetched.ok) return { ok: false, error: (fetched.error || 'Không tải được trang truyện.') + VPN_REQUIRED_HINT };

    const $ = cheerio.load(fetched.html);

    // Title
    let title = $('div.info h1').first().text().trim();
    if (!title) title = $('h1').first().text().trim();
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    // Cover — relative URL on same domain
    let coverUrl = '';
    const $cover = $('.detail-image img').first();
    if ($cover.length) {
      const src = ($cover.attr('src') || '').trim();
      if (src && !/^data:/i.test(src)) coverUrl = resolveUrl(trimmed, src);
    }
    if (!coverUrl) {
      const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImage) coverUrl = resolveUrl(trimmed, ogImage);
    }

    // Chapters — newest listed first in HTML, reverse to oldest-first
    const chapters = [];
    $('.chapts .card .d-flex span a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      const chapterTitle = $(el).text().trim();
      if (!href || !chapterTitle) return;
      chapters.push({ url: resolveUrl(trimmed, href), title: chapterTitle });
    });

    if (!chapters.length) {
      logger.warn('Không tìm thấy chương nào tại', trimmed);
      return { ok: false, error: 'Không tìm thấy chương nào.' };
    }

    chapters.reverse();

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: trimmed,
        mangaId: slug,
        siteId: 'bluelake',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, {
      referer: referer || DOMAIN,
      userAgent: USER_AGENT_JSOUP,
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}${VPN_REQUIRED_HINT}`);
    }

    const $ = cheerio.load(fetched.html);
    const images = [];

    // Chapter images have class "img-thumbnail" inside the reading wrapper.
    // Ad images are plain <img> without this class → selector is safe.
    $('section.wrapper.page-view img.img-thumbnail').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (!src || /^data:/i.test(src)) return;
      const resolved = resolveUrl(chapterUrl, src);
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

const service = new BlueLakeService();

const BLUELAKE_MAX_PAGES = 20;

function cleanBluelakeTitle(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^Truyện tranh\s+/i, '')
    .replace(/\s*-\s*TruyenQQ\s*$/i, '')
    .trim();
}

function parseBluelakeListingHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  $('a[href*="/truyen-tranh/"]').each((_, el) => {
    const $a = $(el);
    const $img = $a.find('img').first();
    if (!$img.length) return;

    const href = ($a.attr('href') || '').trim();
    const mangaUrl = resolveUrl(pageUrl, href);
    if (!mangaUrl || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const $card = $a.closest('figure, article, li, .item, div');
    const rawTitle =
      $card.find('figcaption a').first().text() ||
      $a.attr('title') ||
      $img.attr('alt') ||
      '';
    const title = cleanBluelakeTitle(rawTitle);
    if (!title) return;

    const rawCover = ($img.attr('data-src') || $img.attr('src') || '').trim();
    const coverUrl = rawCover && !/^data:/i.test(rawCover) ? resolveUrl(pageUrl, rawCover) : '';

    const latestChapterLabel = (
      $card.find('.info span.fw-normal, .info span').first().text() ||
      $card.find('a[href*="/chuong-"]').first().text() ||
      ''
    ).trim().replace(/\s+/g, ' ');

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  let totalPages = 1;
  $('a[href*="trang-"], a[href*="page="]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const m = href.match(/trang-(\d+)/i) || href.match(/[?&]page=(\d+)/i);
    if (m) {
      const p = parseInt(m[1], 10);
      if (Number.isFinite(p) && p > totalPages) totalPages = p;
    }
  });

  return {
    items,
    totalPages: Math.min(BLUELAKE_MAX_PAGES, Math.max(1, totalPages)),
  };
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'bluelake', page: 1, totalPages: 1, items: [] };
  }
  const page = Math.min(BLUELAKE_MAX_PAGES, Math.max(1, Math.floor(Number(options.page) || 1)));
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  const fetchImpl = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;

  const listingUrl = searchQuery
    ? `${DOMAIN}tim-truyen?q=${encodeURIComponent(searchQuery)}`
    : page > 1
      ? `${DOMAIN}truyen-moi-nhat/trang-${page}`
      : DOMAIN;

  let fetched;
  try {
    fetched = await fetchImpl(listingUrl, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: DOMAIN,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'bluelake', page, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) + VPN_REQUIRED_HINT };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: 'bluelake', page, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: (fetched?.error || 'Không tải được danh sách BlueLake.') + VPN_REQUIRED_HINT };
  }

  const parsed = parseBluelakeListingHtml(fetched.html, fetched.finalUrl || listingUrl);
  return {
    ok: true,
    siteId: 'bluelake',
    page,
    totalPages: Math.max(page, parsed.totalPages),
    items: parsed.items,
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
};
