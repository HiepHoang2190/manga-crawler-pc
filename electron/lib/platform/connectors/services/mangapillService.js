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

function parseMangapillLatestHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  $('a[href^="/manga/"]').each((_, el) => {
    const $mangaLink = $(el);
    const href = String($mangaLink.attr('href') || '').trim();
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    if (!mangaUrl || seen.has(mangaUrl)) return;

    const title = $mangaLink.text().trim().replace(/\s+/g, ' ');
    if (!title) return;
    seen.add(mangaUrl);

    const $card = $mangaLink.closest('div').parent();
    let coverUrl = '';
    const $img = $card.find('img').first();
    if ($img.length) {
      const raw = ($img.attr('data-src') || $img.attr('src') || '').trim();
      if (raw && !/^data:/i.test(raw)) coverUrl = resolveUrl(pageUrl, raw);
    }

    const latestChapterLabel = $card
      .find('a[href^="/chapters/"]')
      .map((__, cEl) => $(cEl).text().trim().replace(/\s+/g, ' '))
      .get()
      .find(Boolean) || '';

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  return items;
}

function parseMangapillSearchHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  $('a[href^="/manga/"]').each((_, el) => {
    const $link = $(el);
    const href = String($link.attr('href') || '').trim();
    if (!href) return;
    const mangaUrl = resolveUrl(pageUrl, href);
    if (!mangaUrl || seen.has(mangaUrl)) return;

    const title = $link.text().trim().replace(/\s+/g, ' ');
    if (!title) return;
    seen.add(mangaUrl);

    const $card = $link.closest('div').parent();
    let coverUrl = '';
    const $img = $card.find('img').first();
    if ($img.length) {
      const raw = ($img.attr('data-src') || $img.attr('src') || '').trim();
      if (raw && !/^data:/i.test(raw)) coverUrl = resolveUrl(pageUrl, raw);
    }

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel: '' });
  });

  return items;
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'mangapill', page: 1, totalPages: 1, items: [] };
  }
  const fetchImpl = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  const listingUrl = searchQuery
    ? `${DOMAIN}search?q=${encodeURIComponent(searchQuery)}`
    : `${DOMAIN}chapters`;

  let fetched;
  try {
    fetched = await fetchImpl(listingUrl, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: DOMAIN,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'mangapill', page: 1, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: 'mangapill', page: 1, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: fetched?.error || 'Không tải được danh sách Mangapill.' };
  }

  const items = searchQuery
    ? parseMangapillSearchHtml(fetched.html, listingUrl)
    : parseMangapillLatestHtml(fetched.html, listingUrl);

  return {
    ok: true,
    siteId: 'mangapill',
    page: 1,
    totalPages: 1,
    items,
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
  parseMangapillLatestHtml,
  parseMangapillSearchHtml,
};
