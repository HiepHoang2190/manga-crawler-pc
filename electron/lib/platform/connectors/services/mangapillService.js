/**
 * Mangapill Service - HtmlConnectorService implementation
 * Site: mangapill.com
 *
 * - Manga page URL: /manga/{id}/{slug}
 * - Chapter page URL: /chapters/{mangaId}-{chapterId}/{slug}
 * - Chapter images: img.js-page[data-src] (lazy loaded)
 * - CDN: cdn.readdetectiveconan.com
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  USER_AGENT_JSOUP,
  fetchHtml,
  resolveUrl,
  getFileExt,
} = require('../../../download/connector/htmlConnectorUtils');

const DOMAIN = 'https://mangapill.com/';
const LABEL = 'Mangapill';

/** Detect if the URL points to a chapter page instead of a manga page. */
function isChapterUrl(url) {
  try {
    return new URL(url).pathname.startsWith('/chapters/');
  } catch {
    return false;
  }
}

/**
 * Extract manga ID from chapter URL.
 * Pattern: /chapters/{mangaId}-{chapterId}/...
 */
function mangaIdFromChapterUrl(url) {
  try {
    const seg = new URL(url).pathname.split('/')[2] || '';
    return seg.split('-')[0] || '';
  } catch {
    return '';
  }
}

class MangapillService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'mangapill',
      selectors: {
        title: 'h1',
        cover: 'img.lazy',
        chapterLinks: '#chapters a',
      },
    });
  }

  /**
   * Load manga info. Accepts both manga page URLs and chapter page URLs.
   * When a chapter URL is given, the manga page is resolved via the manga ID
   * embedded in the chapter URL path.
   */
  async load(url) {
    const trimmedUrl = String(url || '').trim();
    if (!trimmedUrl) return { ok: false, error: 'URL trống.' };

    // Resolve manga page URL when user pastes a chapter URL
    let mangaUrl = trimmedUrl;
    if (isChapterUrl(trimmedUrl)) {
      const mangaId = mangaIdFromChapterUrl(trimmedUrl);
      if (!mangaId) {
        return { ok: false, error: 'Không xác định được manga ID từ URL chapter.' };
      }
      mangaUrl = `${DOMAIN}manga/${mangaId}`;
    }

    const fetched = await fetchHtml(mangaUrl, {
      userAgent: USER_AGENT_JSOUP,
      referer: DOMAIN,
    });
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    const mangaTitle = $('h1').first().text().trim();
    if (!mangaTitle) {
      return { ok: false, error: 'Không đọc được tên truyện.' };
    }

    // Cover image is lazy-loaded; src may be empty and real URL is in data-src
    let coverUrl = '';
    const $coverImg = $('img.lazy').first();
    if ($coverImg.length) {
      const rawSrc =
        ($coverImg.attr('data-src') || $coverImg.attr('src') || '').trim();
      if (rawSrc) {
        coverUrl = /^https?:\/\//i.test(rawSrc) ? rawSrc : resolveUrl(mangaUrl, rawSrc);
      }
    }

    // Chapter links in #chapters container, already absolute or relative paths
    const chapterList = [];
    $('#chapters a').each((_, el) => {
      const $a = $(el);
      let href = ($a.attr('href') || '').trim();
      if (!href) return;
      href = /^https?:\/\//i.test(href) ? href : resolveUrl(mangaUrl, href);
      const chapterTitle = $a.text().trim();
      chapterList.push({ url: href, title: chapterTitle || href });
    });

    return {
      ok: true,
      manga: {
        title: mangaTitle,
        coverUrl,
        mangaUrl,
        mangaId: '',
        siteId: 'mangapill',
        sourceLabel: LABEL,
      },
      chapters: chapterList,
    };
  }

  /**
   * Fetch chapter images. Mangapill renders img.js-page elements with the
   * real image URL in the data-src attribute (lazy loading pattern).
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

    $('img.js-page').each((_, el) => {
      const rawSrc = ($(el).attr('data-src') || '').trim();
      if (!rawSrc) return;

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

const service = new MangapillService();

function load(url) {
  return service.load(url);
}

function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = { DOMAIN, LABEL, load, downloadChapter };
