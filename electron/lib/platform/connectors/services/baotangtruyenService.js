/**
 * Bảo Tàng Truyện connector service — https://baotangtruyen.net/
 * Details and chapters parsed from HTML; chapter images loaded via changeServer API.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('BaotangtruyenService');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://baotangtruyen.net/';
const LABEL = 'Bảo Tàng Truyện';
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
  return connectorDomainManager.getDomain('baotangtruyen', DOMAIN);
}

const SELECTORS = {
  title: 'h1.info-title',
  cover: '.info-cover img',
  chapterLinks: '.chapter-card a.chap-name',
};

const RESERVED_FIRST_SEGMENTS = new Set([
  'danh-sach',
  'the-loai',
  'tim-kiem-nang-cao',
  'assets',
  'build',
  'api',
  'login',
  'register',
  'tac-gia',
]);

/**
 * Extract manga slug from story or chapter URL.
 * e.g. /nguyen-tac-cua-serim or /nguyen-tac-cua-serim/chuong-20 -> nguyen-tac-cua-serim
 */
function extractMangaSlug(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const parsed = new URL(raw, DOMAIN);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    const first = parts[0].toLowerCase();
    if (RESERVED_FIRST_SEGMENTS.has(first)) return '';
    return parts[0];
  } catch {
    return '';
  }
}

/**
 * Clean story title from raw header or title tag.
 */
function cleanMangaTitle(rawTitle) {
  if (!rawTitle) return '';
  return String(rawTitle)
    .replace(/^Truyện\s+/i, '')
    .replace(/\s*-\s*Bảo tàng truyện.*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parse listing cards from HTML.
 */
function parseBaotangtruyenListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  $('.comic-grid .comic-card').each((_, card) => {
    const $card = $(card);
    const $titleA = $card.find('.c-title').first();
    let href = String($titleA.attr('href') || '').trim();
    if (!href) {
      href = String($card.find('.thumb a').first().attr('href') || '').trim();
    }
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    const title =
      $titleA.text().trim().replace(/\s+/g, ' ') ||
      String($card.find('.thumb a').attr('title') || '').trim() ||
      mangaUrl;

    let coverUrl = '';
    const $img = $card.find('.thumb img').first();
    if ($img.length) {
      const raw = ($img.attr('data-src') || $img.attr('src') || '').trim();
      if (raw && !/^data:/i.test(raw)) {
        coverUrl = resolveUrl(pageUrl, raw);
      }
    }

    const $ch = $card.find('.c-chap').first();
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
 * Extract maximum page number from pagination links.
 */
function parseBaotangtruyenListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;
  $('.phan-trang a, .pagination a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/[?&]page=(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxPage) maxPage = n;
    }
    const txt = parseInt($(el).text().trim(), 10);
    if (Number.isFinite(txt) && txt > maxPage) maxPage = txt;
  });
  return maxPage;
}

/**
 * Parse results from keyword search JSON API.
 */
function parseBaotangtruyenSearchJson(json, baseDomain) {
  const comics = Array.isArray(json?.comics) ? json.comics : [];
  const base = baseDomain || DOMAIN;
  return comics
    .map((c) => {
      const slug = String(c.slug || '').trim();
      const mangaUrl = slug ? resolveUrl(base, `/${slug}`) : '';
      const title = String(c.name || '').trim();
      let coverUrl = '';
      if (c.thumbnail) {
        coverUrl = resolveUrl(base, c.thumbnail);
      }
      const chapName = c.last_chapter?.title || (c.last_chapter?.name ? `Chapter ${c.last_chapter.name}` : '');
      const latestChapterLabel = String(chapName || '').trim();

      return {
        title: title || mangaUrl,
        mangaUrl,
        coverUrl,
        latestChapterLabel,
      };
    })
    .filter((item) => Boolean(item.mangaUrl));
}

/**
 * Tab Mới cập nhật — `/danh-sach/truyen-moi-cap-nhat` hoặc API tìm kiếm `/api/comics/search?keyword=`.
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const activeDomain = getActiveDomain();

  if (search_query) {
    const apiUrl = `${activeDomain}api/comics/search?keyword=${encodeURIComponent(search_query)}`;
    let fetched;
    try {
      fetched = await fetchHtml(apiUrl, {
        referer: activeDomain,
        accept: 'application/json, text/plain, */*',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được kết quả tìm kiếm Bảo Tàng Truyện.' };
    }

    try {
      const data = JSON.parse(fetched.html);
      const items = parseBaotangtruyenSearchJson(data, activeDomain);
      return {
        ok: true,
        siteId: 'baotangtruyen',
        page: 1,
        totalPages: 1,
        items,
      };
    } catch (err) {
      return { ok: false, error: 'Không phân tích được phản hồi tìm kiếm JSON.' };
    }
  }

  const listingUrl = `${activeDomain}danh-sach/truyen-moi-cap-nhat?page=${page}`;
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
    return { ok: false, error: fetched.error || 'Không tải được danh sách Bảo Tàng Truyện.' };
  }

  const items = parseBaotangtruyenListingHtml(fetched.html, listingUrl);
  const totalPages = Math.max(page, parseBaotangtruyenListingMaxPage(fetched.html));

  return {
    ok: true,
    siteId: 'baotangtruyen',
    page,
    totalPages,
    items,
  };
}

class BaotangtruyenService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'baotangtruyen',
      imageReferer: IMG_REFERER,
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const activeDomain = getActiveDomain(trimmed);
    if (activeDomain) {
      connectorDomainManager.setDomain('baotangtruyen', activeDomain);
    }

    const slug = extractMangaSlug(trimmed);
    if (!slug) {
      return {
        ok: false,
        error: `URL không hợp lệ. Vui lòng dùng URL trang truyện (vd: ${activeDomain}ten-truyen).`,
      };
    }

    const targetUrl = resolveUrl(activeDomain, `/${slug}`);

    let fetched;
    try {
      fetched = await fetchHtml(targetUrl, {
        referer: activeDomain,
        userAgent: options.userAgent || USER_AGENT,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    let title =
      $('h1.info-title').first().attr('title') ||
      $('h1.info-title').first().text().trim() ||
      $('title').first().text().trim();
    title = cleanMangaTitle(title);
    if (!title) return { ok: false, error: 'Không đọc được tên truyện.' };

    let coverUrl = '';
    const $cover = $('.info-cover img').first();
    if ($cover.length) {
      const raw = ($cover.attr('src') || $cover.attr('data-src') || '').trim();
      if (raw && !/^data:/i.test(raw)) {
        coverUrl = resolveUrl(targetUrl, raw);
      }
    }
    if (!coverUrl) {
      const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImage) coverUrl = resolveUrl(targetUrl, ogImage);
    }

    // Author
    let author = '';
    $('.meta-row').each((_, el) => {
      const txt = $(el).find('.lbl').text().trim();
      if (txt.includes('Tác giả')) {
        author = $(el).find('.val').text().trim().replace(/\s+/g, ' ');
      }
    });

    // Status
    let status = '';
    $('.meta-row').each((_, el) => {
      const txt = $(el).find('.lbl').text().trim();
      if (txt.includes('Trạng thái')) {
        status = $(el).find('.val').text().trim().replace(/\s+/g, ' ');
      }
    });

    // Genres
    const genres = [];
    $('.genre-link').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    // Description
    const description =
      ($('meta[name="description"]').attr('content') || '').trim() ||
      ($('meta[property="og:description"]').attr('content') || '').trim();

    // Chapters
    const chapters = [];
    const seenUrls = new Set();
    $('.chapter-card li.chapter-item, ul li.chapter-row').each((_, el) => {
      const $el = $(el);
      const $a = $el.find('a.chap-name').first();
      if (!$a.length) return;
      let href = ($a.attr('href') || '').trim();
      if (!href) return;
      href = resolveUrl(targetUrl, href);
      if (seenUrls.has(href)) return;
      seenUrls.add(href);

      const chapTitle = $a.text().trim().replace(/\s+/g, ' ') || href;
      const time = $el.find('.chap-time').text().trim();
      chapters.push({
        url: href,
        title: chapTitle,
        time,
      });
    });

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: targetUrl,
        mangaId: slug,
        siteId: 'baotangtruyen',
        sourceLabel: LABEL,
        author: author || undefined,
        status: status || undefined,
        genres: genres.length ? genres : undefined,
        description: description || '',
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const rawUrl = String(chapterUrl || '').trim();
    const activeDomain = getActiveDomain(rawUrl);
    const normalizedReferer = String(referer || '').trim() || activeDomain;

    const fetched = await fetchHtml(rawUrl, {
      referer: normalizedReferer,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error || 'Lỗi mạng'}`);
    }

    const $ = cheerio.load(fetched.html);
    const chapterId = ($('#chapter_id').val() || '').trim();
    const csrfToken = ($('meta[name="csrf-token"]').attr('content') || '').trim();

    if (!chapterId) {
      // Fallback: check static image tags in reading area
      const staticImages = [];
      $('#image-container img, .read-page img, .chapter-images-container img').each((_, el) => {
        const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
        if (src && !/^data:/i.test(src)) {
          const resolved = resolveUrl(rawUrl, src);
          if (resolved) {
            const ext = getFileExt(resolved) || 'jpg';
            staticImages.push({ imageUrl: resolved, ext });
          }
        }
      });
      if (staticImages.length) return staticImages;
      throw new Error('Không tìm thấy chapter_id hoặc ảnh trong trang chương.');
    }

    // Call POST /api/comics/changeServer
    const apiUrl = `${activeDomain}api/comics/changeServer`;
    const postBody = new URLSearchParams({
      id: chapterId,
      _token: csrfToken,
    }).toString();

    const postRes = await fetchHtml(apiUrl, {
      method: 'POST',
      referer: rawUrl,
      cookie: fetched.cookie,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: postBody,
    });

    if (!postRes.ok) {
      throw new Error(`API tải ảnh trả về lỗi: ${postRes.error || 'Lỗi không xác định'}`);
    }

    let data;
    try {
      data = JSON.parse(postRes.html);
    } catch {
      throw new Error('Không phân tích được phản hồi JSON từ API tải ảnh.');
    }

    const rawImages = data?.chapter?.images || [];
    if (!Array.isArray(rawImages) || !rawImages.length) {
      throw new Error('Không tìm thấy danh sách ảnh trong phản hồi API.');
    }

    const images = rawImages
      .map((item) => {
        const src = String(item.src || item.url || item || '').trim();
        if (!src) return null;
        const resolved = resolveUrl(rawUrl, src);
        if (!resolved) return null;
        const ext = getFileExt(resolved) || 'jpg';
        return { imageUrl: resolved, ext };
      })
      .filter(Boolean);

    if (!images.length) {
      throw new Error('Danh sách ảnh chương rỗng.');
    }

    return images;
  }
}

const service = new BaotangtruyenService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
  parseBaotangtruyenListingHtml,
  parseBaotangtruyenListingMaxPage,
  parseBaotangtruyenSearchJson,
  extractMangaSlug,
  cleanMangaTitle,
};
