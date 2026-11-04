/**
 * TCB Scan Manga connector service — https://tcbscanmanga.com/
 * Laravel + Madara theme.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('TcbscanmangaService');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://tcbscanmanga.com/';
const LABEL = 'TCB Scan';

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
  return connectorDomainManager.getDomain('tcbscanmanga', DOMAIN);
}

const RESERVED_FIRST_SEGMENTS = new Set([
  'manga',
  'search',
  'genres',
  'bookmark',
  'login',
  'register',
  'webapi',
  'css',
  'js',
  'images',
]);

/**
 * Extract manga slug from story or chapter URL.
 * e.g. /manga/futago-matomete-kanojo-ni-shinai- or /manga/futago-matomete-kanojo-ni-shinai-/chapter-23.1
 * -> 'futago-matomete-kanojo-ni-shinai-'
 */
function extractMangaSlug(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const parsed = new URL(raw, DOMAIN);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';

    if (parts[0].toLowerCase() === 'manga') {
      if (parts[1]) {
        return parts[1];
      }
      return '';
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
 * Clean story title from suffixes.
 * e.g. "Futago Matomete Kanojo ni Shinai? | TCB Scan"
 * -> "Futago Matomete Kanojo ni Shinai?"
 */
function cleanMangaTitle(rawTitle) {
  if (!rawTitle) return '';
  return String(rawTitle)
    .replace(/\s*\|\s*TCB\s*Scan.*$/i, '')
    .replace(/\s*–\s*TCB\s*Scan.*$/i, '')
    .replace(/\s*-\s*TCB\s*Scan.*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parse chapter number from chapter title or URL.
 * e.g. "Chapter 23.1" -> 23.1
 */
function parseChapterNumber(title, url) {
  const urlMatch = String(url || '').match(/chapter-([0-9]+(?:[.-][0-9]+)?)/i);
  if (urlMatch) {
    const num = parseFloat(urlMatch[1].replace('-', '.'));
    if (!isNaN(num)) return num;
  }
  const titleMatch = String(title || '').match(/(?:chapter|chap|chương|tập|bài|ch\.)\s*([0-9]+(?:[.-][0-9]+)?)/i);
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
 * Parse chapters from webapi HTML response.
 * Expects `<select name="chapter_list"><option data-redirect="...">Chapter X</option>...</select>`
 */
function parseChaptersFromApiHtml(apiHtml, storyUrl) {
  const chapters = [];
  const $ = typeof apiHtml === 'string' ? cheerio.load(apiHtml) : apiHtml;
  const seen = new Set();

  $('option').each((_, el) => {
    const $opt = $(el);
    const redirect = $opt.attr('data-redirect') || $opt.attr('value') || '';
    if (!redirect || redirect === '#' || redirect.includes('javascript:')) return;

    const fullUrl = resolveUrl(storyUrl, redirect);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const title = $opt.text().trim().replace(/\s+/g, ' ');
    const chapterNum = parseChapterNumber(title, fullUrl);

    chapters.push({
      url: fullUrl,
      title: title || `Chapter ${chapterNum}`,
      chapterNumber: chapterNum,
    });
  });

  // Sort ascending by chapterNumber
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  return chapters;
}

/**
 * Parse chapters from HTML page DOM fallback.
 */
function parseChaptersFromHtml(html, storyUrl) {
  const chapters = [];
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const seen = new Set();

  $(
    '.listing-chapters_wrap a, .sub-chap a, .version-chap a, .chapter-list a, li.wp-manga-chapter a'
  ).each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    if (!href) return;
    if (!/\/chapter-[0-9]+/i.test(href)) return;

    const fullUrl = resolveUrl(storyUrl, href);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const title = $a.text().trim().replace(/\s+/g, ' ');
    const chapterNum = parseChapterNumber(title, fullUrl);

    chapters.push({
      url: fullUrl,
      title: title || `Chapter ${chapterNum}`,
      chapterNumber: chapterNum,
    });
  });

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  return chapters;
}

/**
 * Parse manga metadata from story page.
 */
function parseMangaMetadata($, html, mangaUrl, activeDomain) {
  let title = cleanMangaTitle(
    $('.post-title h1, .post-title, h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim()
  );

  let coverUrl =
    $('.summary_image img, .tab-summary img, .summary_image').first().find('img').attr('src') ||
    $('.summary_image img, .tab-summary img').first().attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    '';
  if (coverUrl) {
    coverUrl = resolveUrl(mangaUrl, coverUrl);
  }

  let description =
    $('.description-summary, .summary__content, .manga-about').first().text().trim() ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  let author = '';
  $('.author-content a, .post-content_item:contains("Author") .summary-content').each((_, el) => {
    const a = $(el).text().trim();
    if (a && !author) author = a;
  });
  if (!author) {
    author = $('.author-content').first().text().trim() || 'TCB Scan';
  }
  author = author.replace(/^Author\s*/i, '').trim();

  const genres = [];
  $('.genres-content a').each((_, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  let status = 'Đang tiến hành';
  const statusRaw = $('.post-status .summary-content, .post-status').first().text().trim();
  if (statusRaw) {
    if (/complete|hoàn thành/i.test(statusRaw)) {
      status = 'Hoàn thành';
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
 * Parse reader images from chapter HTML.
 */
function parseReaderImages(html, chapterUrl) {
  const images = [];
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const seen = new Set();

  $(
    '.reading-content img, .page-break img, img.wp-manga-chapter-img, img[id^="image-"]'
  ).each((_, el) => {
    const $img = $(el);
    let src =
      $img.attr('data-src') ||
      $img.attr('data-lazy-src') ||
      $img.attr('src') ||
      '';
    src = src.trim();
    if (!src || src.startsWith('data:')) return;

    // Filter ad banners & trackers
    if (
      /movementssubscriptionobjection|google|analytics|facebook|adservice|banner/i.test(
        src
      )
    ) {
      return;
    }

    const fullUrl = resolveUrl(chapterUrl, src);
    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      images.push(fullUrl);
    }
  });

  return images;
}

/**
 * Parse cards on search or latest updates page.
 */
function parseMangaCards(html, baseUrl) {
  const items = [];
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const seen = new Set();

  $('.page-item-detail, .c-tabs-item__content, .badge-pos-1').each((_, card) => {
    const $card = $(card);
    const $a = $card.find('.post-title a, h3 a, h5 a, .item-summary a').first();
    let href = $a.attr('href');
    if (!href) {
      href = $card.find('a[href*="/manga/"]').first().attr('href');
    }
    if (!href) return;

    const mangaUrl = resolveUrl(baseUrl, href);
    if (seen.has(mangaUrl)) return;
    if (mangaUrl.includes('/chapter-')) return;
    seen.add(mangaUrl);

    let title = $a.text().trim();
    if (!title) {
      title = $card.find('.post-title, h3, h5').first().text().trim();
    }
    title = cleanMangaTitle(title);
    if (!title) return;

    let coverUrl =
      $card.find('img').first().attr('src') ||
      $card.find('img').first().attr('data-src') ||
      '';
    if (coverUrl) {
      coverUrl = resolveUrl(baseUrl, coverUrl);
    }

    const latestChapterLabel =
      $card.find('.list-chapter a, .chapter-item a').first().text().trim() || '';

    items.push({
      title,
      mangaUrl,
      url: mangaUrl,
      coverUrl,
      latestChapterLabel,
      latestChapter: latestChapterLabel,
    });
  });

  let hasNextPage = false;
  if ($('.wp-pagenavi .nextpostslink, .pagination a.next, a[rel="next"]').length > 0) {
    hasNextPage = true;
  }

  return { items, hasNextPage };
}

const SELECTORS = {
  title: '.post-title h1, h1',
  cover: '.summary_image img',
  chapterLinks: '.listing-chapters_wrap a',
};

class TcbscanmangaService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      name: LABEL,
      label: LABEL,
      siteId: 'tcbscanmanga',
      imageReferer: DOMAIN,
      selectors: SELECTORS,
    });
    this.siteId = 'tcbscanmanga';
    this.domain = DOMAIN;
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL không được để trống.' };

    const activeDomain = getActiveDomain(trimmed);
    if (activeDomain) {
      connectorDomainManager.setDomain('tcbscanmanga', activeDomain);
    }

    const slug = extractMangaSlug(trimmed);
    if (!slug) {
      return {
        ok: false,
        error: `URL không hợp lệ. Vui lòng nhập link truyện TCB Scan (ví dụ: ${activeDomain}manga/futago-matomete-kanojo-ni-shinai-).`,
      };
    }

    const mangaUrl = `${activeDomain}manga/${slug}`;

    let fetched;
    try {
      fetched = await fetchHtml(mangaUrl, {
        referer: activeDomain,
        userAgent: USER_AGENT,
        includeSetCookie: true,
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

    // Try webapi /webapi/stories/list-chapter first
    let chapters = [];
    const storyIdMatch = fetched.html.match(/["']story_id["']\s*:\s*(\d+)/i);
    const csrfTokenMatch = fetched.html.match(/name=["']csrf-token["']\s+content=["']([^"']+)["']/i);

    if (storyIdMatch && csrfTokenMatch) {
      try {
        const storyId = parseInt(storyIdMatch[1], 10);
        const apiRes = await fetchHtml(`${activeDomain}webapi/stories/list-chapter`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfTokenMatch[1],
            'Referer': mangaUrl,
          },
          cookie: fetched.cookie,
          body: JSON.stringify({ story_id: storyId }),
          userAgent: USER_AGENT,
        });

        if (apiRes.ok && apiRes.html) {
          const resJson = JSON.parse(apiRes.html);
          const optHtml = resJson?.data?.html || '';
          if (optHtml) {
            chapters = parseChaptersFromApiHtml(optHtml, mangaUrl);
          }
        }
      } catch (e) {
        logger.warn('Failed to load chapters via webapi:', e?.message || e);
      }
    }

    // If API returned no chapters, fallback to parsing DOM HTML
    if (!chapters.length) {
      chapters = parseChaptersFromHtml($, mangaUrl);
    }

    return {
      ok: true,
      manga: {
        title: metadata.title,
        coverUrl: metadata.coverUrl,
        mangaUrl,
        mangaId: slug,
        siteId: 'tcbscanmanga',
        sourceLabel: LABEL,
        author: metadata.author,
        description: metadata.description,
        genres: metadata.genres,
        status: metadata.status,
      },
      chapters,
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const rawUrl = String(chapterUrl || '').trim();
    const activeDomain = getActiveDomain(rawUrl);
    const targetReferer = referer || activeDomain;

    let fetched;
    try {
      fetched = await fetchHtml(rawUrl, {
        referer: targetReferer,
        userAgent: USER_AGENT,
      });
    } catch (err) {
      throw new Error(`Failed to fetch chapter HTML: ${err?.message || err}`);
    }

    if (!fetched.ok) {
      throw new Error(fetched.error || 'Failed to fetch chapter reader page.');
    }

    const $ = cheerio.load(fetched.html);
    const imageUrls = parseReaderImages($, rawUrl);

    if (!imageUrls.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return imageUrls.map((imageUrl) => {
      const ext = getFileExt(imageUrl) || 'jpg';
      return { imageUrl, ext };
    });
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
    return parseReaderImages($, chapterUrl);
  }
}

const service = new TcbscanmangaService();

async function fetchLatestUpdates(options = {}) {
  const activeDomain = getActiveDomain();
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const rawQuery = options.latestUpdatesSearch ?? options.searchQuery ?? options.query;
  const query = String(rawQuery || '').trim();

  let targetUrl = '';
  if (query) {
    targetUrl = `${activeDomain}search?search=${encodeURIComponent(query)}`;
    if (page > 1) {
      targetUrl += `&page=${page}`;
    }
  } else {
    targetUrl = page === 1 ? `${activeDomain}manga` : `${activeDomain}manga?page=${page}`;
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

  const { items, hasNextPage } = parseMangaCards(fetched.html, activeDomain);

  return {
    ok: true,
    items,
    page,
    totalPages: hasNextPage ? page + 1 : page,
    hasMore: hasNextPage,
  };
}

module.exports = {
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, label) => service.downloadChapter(payload, label || LABEL),
  fetchChapterImages: (chapterUrl, referer) => service.fetchChapterImages(chapterUrl, referer),
  fetchLatestUpdates: (options) => fetchLatestUpdates(options),
  // Helpers exported for unit testing
  extractMangaSlug,
  cleanMangaTitle,
  parseChapterNumber,
  parseChaptersFromApiHtml,
  parseChaptersFromHtml,
  parseMangaMetadata,
  parseMangaCards,
  parseReaderImages,
};

