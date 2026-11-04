/**
 * KingOfShojo Service - HtmlConnectorService implementation
 * Site: https://kingofshojo.com
 * Theme: WordPress Mangareader
 *
 * - Manga page URL: /manga/{slug}/
 * - Chapter page URL: /{slug}-chapter-{num}/
 * - Chapter list: #chapterlist ul li .eph-num a
 * - Chapter images: #readerarea img[src]
 * - CDN: cdn.kingofshojo.com
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  getFileExt,
  isValidImgSrc,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://kingofshojo.com/';
const LABEL = 'KingOfShojo';

/** Detect if the URL points to a chapter page instead of a manga page. */
function isChapterUrl(url) {
  try {
    const path = new URL(url).pathname;
    // Chapter URLs: /{slug}-chapter-{num}/
    return /chapter-\d+/i.test(path) && !path.startsWith('/manga/');
  } catch {
    return false;
  }
}

/**
 * Try to extract the manga page URL from a chapter URL.
 * Chapter page HTML contains a link back to the manga page via
 * the breadcrumb or the manga title link.
 */
async function resolveMangaUrlFromChapter(chapterUrl) {
  const fetched = await fetchHtml(chapterUrl, {
    userAgent: USER_AGENT_JSOUP,
    referer: DOMAIN,
  });
  if (!fetched.ok) return null;

  const $ = cheerio.load(fetched.html);
  // The breadcrumb link "allc" class links back to the manga page
  const mangaLink = $('div.allc a').attr('href') || '';
  if (mangaLink) return resolveUrl(chapterUrl, mangaLink);

  return null;
}

class KingOfShojoService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'kingofshojo',
      selectors: {
        title: 'h1.entry-title',
        cover: '.seriestucontl .thumb img',
        chapterLinks: '#chapterlist ul li .eph-num a',
      },
    });
  }

  /**
   * Load manga info. Accepts both manga page URLs and chapter page URLs.
   * When a chapter URL is given, the manga page is resolved via the
   * breadcrumb link in the chapter HTML.
   */
  async load(url) {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) return { ok: false, error: 'URL trống.' };

    let mangaUrl = trimmedUrl;
    if (isChapterUrl(trimmedUrl)) {
      const resolved = await resolveMangaUrlFromChapter(trimmedUrl);
      if (!resolved) {
        return { ok: false, error: 'Không xác định được URL manga từ URL chapter.' };
      }
      mangaUrl = resolved;
    }

    const fetched = await fetchHtml(mangaUrl, {
      userAgent: USER_AGENT_JSOUP,
      referer: DOMAIN,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    const mangaTitle = $('h1.entry-title').first().text().trim();
    if (!mangaTitle) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    // Cover image
    let coverUrl = '';
    const $coverImg = $('.seriestucontl .thumb img').first();
    if ($coverImg.length) {
      const rawSrc = ($coverImg.attr('src') || $coverImg.attr('data-src') || '').trim();
      if (rawSrc) {
        coverUrl = /^https?:\/\//i.test(rawSrc) ? rawSrc : resolveUrl(mangaUrl, rawSrc);
      }
    }

    // Chapter list: #chapterlist ul li .eph-num a
    const chapterList = [];
    $('#chapterlist ul li .eph-num a').each((_, el) => {
      const $a = $(el);
      let href = ($a.attr('href') || '').trim();
      if (!href) return;
      href = /^https?:\/\//i.test(href) ? href : resolveUrl(mangaUrl, href);

      // Chapter title: inside span.chapternum
      const chapterTitle = $a.find('.chapternum').text().trim() || $a.text().trim();
      chapterList.push({ url: href, title: chapterTitle || href });
    });

    return {
      ok: true,
      manga: {
        title: mangaTitle,
        coverUrl,
        mangaUrl,
        mangaId: '',
        siteId: 'kingofshojo',
        sourceLabel: LABEL,
      },
      chapters: chapterList,
    };
  }

  /**
   * Fetch chapter images. KingOfShojo uses the "mangareader" WP theme.
   * Images are in #readerarea img with src attribute (not lazy-loaded).
   * CDN: cdn.kingofshojo.com
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fetched = await fetchHtml(chapterUrl, {
      userAgent: USER_AGENT_JSOUP,
      referer: referer || DOMAIN,
    });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}`);
    }

    const $ = cheerio.load(fetched.html);
    const imageList = [];
    const seenUrls = new Set();

    $('#readerarea img').each((_, el) => {
      const $el = $(el);
      const rawSrc = ($el.attr('src') || $el.attr('data-src') || '').trim();
      if (!rawSrc) return;

      // Filter out non-content images (tracking pixels, ads, etc.)
      if (!isValidImgSrc(rawSrc)) return;

      const absoluteUrl = /^https?:\/\//i.test(rawSrc)
        ? rawSrc
        : resolveUrl(chapterUrl, rawSrc);
      if (!absoluteUrl || seenUrls.has(absoluteUrl)) return;

      seenUrls.add(absoluteUrl);
      const fileExt = getFileExt(absoluteUrl) || 'jpg';
      imageList.push({ imageUrl: absoluteUrl, ext: fileExt });
    });

    if (!imageList.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return imageList;
  }
}

const service = new KingOfShojoService();

function load(url) {
  return service.load(url);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = { DOMAIN, LABEL, load, downloadChapter };
