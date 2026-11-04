/**
 * Sang Chảnh Team connector service — https://sangchanhteam.com/
 * WordPress + UIKit (init-manga theme).
 */
const cheerio = require('cheerio');
const pLimit = require('p-limit');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('SangchanhteamService');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://sangchanhteam.com/';
const LABEL = 'Sang Chảnh Team';

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
  return connectorDomainManager.getDomain('sangchanhteam', DOMAIN);
}

const RESERVED_FIRST_SEGMENTS = new Set([
  'moi-cap-nhat',
  'danh-sach-a-z',
  'truyen-da-hoan-thanh',
  'dang-thinh-hanh',
  'bang-xep-hang-truyen',
  'bo-loc-nang-cao',
  'blog',
  'wp-content',
  'wp-includes',
  'wp-admin',
  'wp-json',
]);

/**
 * Extract manga slug from story or chapter URL.
 * e.g. /truyen/het-nhu-han-quang-gap-nang-gat/ or /truyen/het-nhu-han-quang-gap-nang-gat/chap-181/
 * -> 'het-nhu-han-quang-gap-nang-gat'
 */
function extractMangaSlug(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const parsed = new URL(raw, DOMAIN);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';

    if (parts[0].toLowerCase() === 'truyen' && parts[1]) {
      return parts[1];
    }

    if (!RESERVED_FIRST_SEGMENTS.has(parts[0].toLowerCase())) {
      return parts[0];
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * Clean story title from raw title tag or header.
 * e.g. "Hệt Như Hàn Quang Gặp Nắng Gắt [Tới 181] – Sang Chảnh Team"
 * -> "Hệt Như Hàn Quang Gặp Nắng Gắt"
 */
function cleanMangaTitle(rawTitle) {
  if (!rawTitle) return '';
  return String(rawTitle)
    .replace(/\s*\[Tới\s*[^\]]+\]/i, '')
    .replace(/\s*–\s*Sang\s*Chảnh\s*Team.*$/i, '')
    .replace(/\s*\|\s*Sang\s*Chảnh\s*Team.*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parse chapter number from chapter title or URL slug.
 * e.g. "/chap-181/" or "Chap 181" -> 181
 */
function parseChapterNumber(title, url) {
  const urlMatch = String(url || '').match(/chap(?:ter)?-([0-9]+(?:[.-][0-9]+)?)/i);
  if (urlMatch) {
    const num = parseFloat(urlMatch[1].replace('-', '.'));
    if (!isNaN(num)) return num;
  }
  const titleMatch = String(title || '').match(/(?:chapter|chap|chương|tập|bài)\s*([0-9]+(?:[.-][0-9]+)?)/i);
  if (titleMatch) {
    const num = parseFloat(titleMatch[1].replace('-', '.'));
    if (!isNaN(num)) return num;
  }
  const anyNum = String(title || '').match(/([0-9]+(?:[.-][0-9]+)?)/);
  if (anyNum) {
    const num = parseFloat(anyNum[1].replace('-', '.'));
    if (!isNaN(num)) return num;
  }
  return 0;
}

/**
 * Parse chapter items from a single page's HTML.
 */
function parseChaptersFromHtml($, mangaUrl) {
  const chapters = [];
  const seen = new Set();

  $('.chapter-list a, .chapter-item a, a.uk-link-toggle').each((_, el) => {
    const $a = $(el);
    if ($a.hasClass('uk-button')) return;
    if ($a.closest('.reading-buttons').length) return;
    const href = $a.attr('href');
    if (!href) return;
    if (!/\/chap(?:ter)?-[0-9]+/i.test(href)) return;

    const fullUrl = resolveUrl(mangaUrl, href);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    let rawTitle = $a.find('h3, .uk-h5, .chapter-title').first().text().trim() || $a.text().trim();
    rawTitle = rawTitle.replace(/\s+/g, ' ');

    const chapterNum = parseChapterNumber(rawTitle, fullUrl);

    // If title has manga name prefix like "Tên truyện […] – Chap 181", extract chapter part
    const splitMatch = rawTitle.match(/(?:–|-)\s*(chap(?:ter)?\s*[0-9]+(?:[.-][0-9]+)?.*)/i);
    let title = splitMatch ? splitMatch[1].trim() : rawTitle;
    if (!title) {
      title = `Chap ${chapterNum}`;
    }

    chapters.push({
      url: fullUrl,
      title,
      chapterNumber: chapterNum,
    });
  });

  return chapters;
}

/**
 * Extract total chapter pages from pagination.
 */
function extractTotalChapterPages($) {
  let maxPage = 1;
  $('.uk-pagination a, nav[aria-label="Pagination"] a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/chap\/page\/([0-9]+)/i);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (pageNum > maxPage) maxPage = pageNum;
    }
    const textNum = parseInt($(el).text().trim(), 10);
    if (!isNaN(textNum) && textNum > maxPage) {
      maxPage = textNum;
    }
  });
  return maxPage;
}

/**
 * Safely parse JSON-LD from HTML.
 */
function extractJsonLd(html) {
  if (!html) return null;
  const match = html.match(/<script type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    logger.warn('Failed to parse JSON-LD:', err?.message || err);
    return null;
  }
}

/**
 * Parse story metadata from HTML and JSON-LD.
 */
function parseMangaMetadata($, html, mangaUrl, activeDomain) {
  const jsonLd = extractJsonLd(html);

  let title = '';
  if (jsonLd && jsonLd.name) {
    title = cleanMangaTitle(jsonLd.name);
  }
  if (!title) {
    title = cleanMangaTitle(
      $('h1.uk-heading-small, h1.uk-h2, .manga-title, h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim()
    );
  }

  let coverUrl = '';
  if (jsonLd && jsonLd.image) {
    coverUrl = typeof jsonLd.image === 'string' ? jsonLd.image : (jsonLd.image.url || '');
  }
  if (!coverUrl) {
    coverUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('.manga-info img, .uk-cover-container img, img.custom-logo').first().attr('src') ||
      '';
  }
  if (coverUrl) {
    coverUrl = resolveUrl(mangaUrl, coverUrl);
  }

  let description = '';
  if (jsonLd && jsonLd.description) {
    description = String(jsonLd.description).trim();
  }
  if (!description) {
    description =
      $('.manga-info .uk-text-justify, .manga-desc, .summary__content, .entry-content').first().text().trim() ||
      $('meta[property="og:description"]').attr('content') ||
      '';
  }

  let author = '';
  if (jsonLd && jsonLd.author) {
    author = typeof jsonLd.author === 'string' ? jsonLd.author : (jsonLd.author.name || '');
  }
  if (!author && jsonLd && jsonLd.translator) {
    author = typeof jsonLd.translator === 'string' ? jsonLd.translator : (jsonLd.translator.name || '');
  }
  if (!author) {
    author = $('.manga-info .author, .author-content, a[href*="/tac-gia/"]').first().text().trim() || 'Sang Chảnh Team';
  }

  const genres = [];
  if (jsonLd && Array.isArray(jsonLd.genre)) {
    genres.push(...jsonLd.genre);
  } else {
    $('.genres-content a, .manga-info a[href*="/the-loai/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });
  }

  let status = 'Đang tiến hành';
  if (jsonLd && Array.isArray(jsonLd.additionalProperty)) {
    const statusProp = jsonLd.additionalProperty.find((p) => p.name === 'status');
    if (statusProp && statusProp.value) {
      status = statusProp.value === 'completed' ? 'Hoàn thành' : 'Đang tiến hành';
    }
  }

  return {
    title,
    coverUrl,
    description,
    author,
    genres,
    status,
    mangaUrl,
  };
}

/**
 * Parse cards on search or latest updates page.
 */
function parseMangaCards($, baseUrl) {
  const items = [];
  const seen = new Set();

  $('.uk-panel, article, .manga-card, .type-manga, div.uk-card').each((_, card) => {
    const $card = $(card);
    const $a = $card.find('h2 a, h3 a, a.uk-link-toggle, a.uk-link-heading').first();
    let href = $a.attr('href');
    if (!href) {
      href = $card.find('a[href*="/truyen/"]').first().attr('href');
    }
    if (!href) return;
    const mangaUrl = resolveUrl(baseUrl, href);
    if (seen.has(mangaUrl)) return;
    if (mangaUrl.includes('/chap-') || mangaUrl.includes('/chapter-')) return;
    seen.add(mangaUrl);

    let title = $a.text().trim();
    if (!title) {
      title = $card.find('h2, h3, .uk-h5, .uk-h4').first().text().trim();
    }
    title = cleanMangaTitle(title);
    if (!title) return;

    let coverUrl =
      $card.find('img.image-3-4, img').first().attr('src') ||
      $card.find('img').first().attr('data-src') ||
      '';
    if (coverUrl) {
      coverUrl = resolveUrl(baseUrl, coverUrl);
    }

    let latestChapterLabel = '';
    const $chA = $card.find('.chapter-item a, ul li a').first();
    if ($chA.length) {
      latestChapterLabel = $chA.text().trim().replace(/\s+/g, ' ');
    }

    items.push({
      title,
      mangaUrl,
      coverUrl,
      latestChapterLabel,
    });
  });

  return items;
}

const SELECTORS = {
  title: 'h1',
  cover: 'meta[property="og:image"]',
  chapterLinks: '.chapter-list a',
};

function parseImagesFromHtml($, chapterUrl) {
  const rawImages = [];

  $('.uk-article.image-based img, .reading-content img, .entry-content img, #chapter-content img').each((i, el) => {
    const $el = $(el);
    const parentClass = String($el.parent().attr('class') || '');
    if (parentClass.includes('chapter-ad')) return;

    const src =
      $el.attr('data-original-src') ||
      $el.attr('src') ||
      $el.attr('data-src') ||
      $el.attr('data-lazy-src');

    if (!src) return;
    const clean = src.trim();
    if (!clean || /^data:/i.test(clean)) return;

    // Loại bỏ ảnh logo, banner, ad
    if (/LOGO|wallcat|De-Dau-Trang/i.test(clean)) return;

    const orderAttr = $el.attr('data-imc-order');
    const order = orderAttr ? parseInt(orderAttr, 10) : i + 1;
    const fullUrl = resolveUrl(chapterUrl, clean);

    rawImages.push({
      imageUrl: fullUrl,
      order: isNaN(order) ? i + 1 : order,
    });
  });

  // Sắp xếp đúng theo cờ thứ tự của server
  rawImages.sort((a, b) => a.order - b.order);

  const seen = new Set();
  const images = [];

  for (const item of rawImages) {
    if (seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    images.push({
      imageUrl: item.imageUrl,
      ext: getFileExt(item.imageUrl) || 'jpg',
    });
  }

  return images;
}

class SangchanhteamService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      name: LABEL,
      label: LABEL,
      siteId: 'sangchanhteam',
      imageReferer: DOMAIN,
      selectors: SELECTORS,
    });
    this.siteId = 'sangchanhteam';
    this.domain = DOMAIN;
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL không được để trống.' };

    const activeDomain = getActiveDomain(trimmed);
    if (activeDomain) {
      connectorDomainManager.setDomain('sangchanhteam', activeDomain);
    }

    const slug = extractMangaSlug(trimmed);
    if (!slug) {
      return {
        ok: false,
        error: `URL không hợp lệ. Vui lòng nhập link truyện Sang Chảnh Team (ví dụ: ${activeDomain}truyen/ten-truyen/).`,
      };
    }

    const mangaUrl = `${activeDomain}truyen/${slug}/`;

    let fetched;
    try {
      fetched = await fetchHtml(mangaUrl, {
        referer: activeDomain,
        userAgent: USER_AGENT,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);
    const metadata = parseMangaMetadata($, fetched.html, mangaUrl, activeDomain);

    if (!metadata.title) {
      return { ok: false, error: 'Không trích xuất được tiêu đề truyện.' };
    }

    // 1. Lấy danh sách chương trang 1
    const allChapters = parseChaptersFromHtml($, mangaUrl);

    // 2. Kiểm tra phân trang danh sách chương
    const totalPages = extractTotalChapterPages($);

    if (totalPages > 1) {
      const limit = pLimit(3);
      const pagePromises = [];

      for (let p = 2; p <= totalPages; p++) {
        const pageUrl = `${mangaUrl}chap/page/${p}/`;
        pagePromises.push(
          limit(async () => {
            try {
              const res = await fetchHtml(pageUrl, {
                referer: mangaUrl,
                userAgent: USER_AGENT,
              });
              if (res.ok) {
                const pageCheerio = cheerio.load(res.html);
                return parseChaptersFromHtml(pageCheerio, mangaUrl);
              }
            } catch (err) {
              logger.warn(`Failed to fetch chapter page ${p}:`, err?.message || err);
            }
            return [];
          })
        );
      }

      const additionalPages = await Promise.all(pagePromises);
      for (const pageChaps of additionalPages) {
        allChapters.push(...pageChaps);
      }
    }

    // 3. Khử trùng lặp và sắp xếp theo số chương tăng dần (Chap 1 -> Chap N)
    const uniqueMap = new Map();
    for (const ch of allChapters) {
      if (!uniqueMap.has(ch.url)) {
        uniqueMap.set(ch.url, ch);
      }
    }

    const chapters = Array.from(uniqueMap.values()).sort((a, b) => {
      if (a.chapterNumber !== b.chapterNumber) {
        return a.chapterNumber - b.chapterNumber;
      }
      return 0;
    });

    return {
      ok: true,
      manga: {
        title: metadata.title,
        coverUrl: metadata.coverUrl,
        mangaUrl,
        mangaId: slug,
        siteId: 'sangchanhteam',
        sourceLabel: LABEL,
        author: metadata.author,
        description: metadata.description,
        genres: metadata.genres,
        status: metadata.status,
      },
      chapters,
    };
  }

  async parseChapterImages(chapterUrl, options = {}) {
    const activeDomain = getActiveDomain(chapterUrl);
    let fetched;
    try {
      fetched = await fetchHtml(chapterUrl, {
        referer: activeDomain,
        userAgent: USER_AGENT,
      });
    } catch (err) {
      logger.warn('Failed to fetch chapter reader page:', err?.message || err);
      return [];
    }

    if (!fetched.ok) return [];

    const $ = cheerio.load(fetched.html);
    return parseImagesFromHtml($, chapterUrl);
  }
}

const service = new SangchanhteamService();

async function fetchLatestUpdates(options = {}) {
  const activeDomain = getActiveDomain();
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const rawQuery = options.latestUpdatesSearch ?? options.searchQuery ?? options.query;
  const query = String(rawQuery || '').trim();

  let targetUrl = '';
  if (query) {
    targetUrl = page === 1
      ? `${activeDomain}?s=${encodeURIComponent(query)}`
      : `${activeDomain}page/${page}/?s=${encodeURIComponent(query)}`;
  } else {
    targetUrl = page === 1 ? `${activeDomain}moi-cap-nhat/` : `${activeDomain}moi-cap-nhat/page/${page}/`;
  }

  let fetched;
  try {
    fetched = await fetchHtml(targetUrl, {
      referer: activeDomain,
      userAgent: USER_AGENT,
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err), items: [] };
  }

  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Failed to fetch updates.', items: [] };
  }

  const $ = cheerio.load(fetched.html);
  $('aside, [id*="sidebar"], .sidebar-section, header, [id*="header"], footer').remove();
  const items = parseMangaCards($, activeDomain);

  let hasMore = false;
  if ($('.uk-pagination li.uk-active + li:not(.uk-disabled)').length > 0) {
    hasMore = true;
  }

  return {
    ok: true,
    items,
    page,
    hasMore,
  };
}

module.exports = {
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, label) => service.downloadChapter(payload, label || LABEL),
  fetchLatestUpdates: (options) => fetchLatestUpdates(options),
  // Helpers exported for unit testing
  extractMangaSlug,
  cleanMangaTitle,
  parseChapterNumber,
  parseChaptersFromHtml,
  parseMangaMetadata,
  parseMangaCards,
  parseImagesFromHtml,
};
