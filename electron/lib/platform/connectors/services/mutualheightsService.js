/**
 * MutualHeights Service — mutualheights.net
 *
 * Vietnamese manga aggregator (WordPress, branded TruyenQQ). Chapter images
 * use data-src (src is a base64 SVG lazy placeholder).
 *
 * Two CDN variants exist depending on the manga:
 *   - Direct:  https://*.tintruyen.net/...  → requires Referer: truyenqqko.com
 *   - Proxy:   https://mutualheights.net/storage/?url=...  → tolerates any Referer
 * Using TRUYENQQNO_IMAGE_REFERER for all cases (proxy accepts it; CDN requires it).
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  getFileExt,
  resolveUrl,
  isValidImgSrc,
  VPN_REQUIRED_HINT,
} = require('../../../download/connector/htmlConnectorUtils');
const { TRUYENQQNO_IMAGE_REFERER } = require('../../../download/connector/connectorReferer');
const logger = require('../../../shared/logger').createLogger('MutualHeightsService');

const DOMAIN = 'https://mutualheights.net/';
const LABEL = 'MutualHeights';

const SELECTORS = {
  title: 'h1.tieu-de-truyen',
  cover: 'div.thumb-main img',
  chapterLinks: '.chapter-list .cl-row .ten-chapter a',
};

function collectChapterImages(html, chapterUrl) {
  const $ = cheerio.load(html);
  const images = [];
  const seen = new Set();

  $('div.chapter-images img').each((_, el) => {
    const $el = $(el);
    // data-src holds the real URL; src is a base64 SVG placeholder
    let src = ($el.attr('data-src') || '').trim();
    if (!src || /^data:/i.test(src)) src = ($el.attr('src') || '').trim();
    if (!src || /^data:/i.test(src) || !isValidImgSrc(src)) return;
    const resolved = resolveUrl(chapterUrl, src);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    const ext = getFileExt(resolved) || 'jpg';
    images.push({ imageUrl: resolved, ext });
  });

  return images;
}

class MutualHeightsService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'mutualheights',
      imageReferer: TRUYENQQNO_IMAGE_REFERER,
      selectors: SELECTORS,
    });
  }

  async load(url, options = {}) {
    const result = await super.load(url, options);
    if (!result.ok && result.error) {
      const error_text = String(result.error);
      if (/HTTP|\bmạng\b|tải được trang/i.test(error_text)) {
        return { ...result, error: error_text + VPN_REQUIRED_HINT };
      }
    }
    return result;
  }

  async fetchChapterImages(chapterUrl) {
    const fetched = await fetchHtml(chapterUrl, { referer: DOMAIN });
    if (!fetched.ok) {
      throw new Error(`Không tải được trang chương: ${fetched.error}${VPN_REQUIRED_HINT}`);
    }

    const images = collectChapterImages(fetched.html, chapterUrl);
    if (!images.length) {
      throw new Error('Không tìm thấy ảnh trong chương.');
    }

    logger.debug(`Found ${images.length} images in chapter`);
    return images;
  }
}

const service = new MutualHeightsService();

const MUTUALHEIGHTS_MAX_PAGES = 500;

function pickMutualHeightsCover($img, pageUrl) {
  if (!$img || !$img.length) return '';
  for (const raw of [$img.attr('data-src'), $img.attr('data-lazy-src'), $img.attr('src')]) {
    const s = String(raw || '').trim();
    if (!s || /^data:/i.test(s)) continue;
    return resolveUrl(pageUrl, s);
  }
  return '';
}

function parseMutualHeightsListingHtml(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const items = [];
  const seen = new Set();

  $('a[href*="/truyen-tranh/"]').each((_, el) => {
    const $a = $(el);
    if ($a.closest('.swiper-slide').length) return;
    const $img = $a.find('img').first();
    if (!$img.length) return;

    const href = ($a.attr('href') || '').trim();
    const mangaUrl = resolveUrl(pageUrl, href);
    if (!mangaUrl || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const $card = $a.closest('.truyen-item, .manga-item, .manga-inner, article, li, div').parent();
    const $scope = $a.closest('.truyen-item, .manga-item').length ? $a.closest('.truyen-item, .manga-item') : $card;

    const title = (
      $scope.find('.truyen-title a, .manga-info h3 a, h3 a').first().text() ||
      $a.attr('title') ||
      $img.attr('alt') ||
      ''
    ).trim().replace(/\s+/g, ' ');
    if (!title) return;

    const coverUrl = pickMutualHeightsCover($img, pageUrl);
    const rawChapter = (
      $scope.find('.chapter, .truyen-chap, .chap, a[href*="/chuong-"]').first().text() || ''
    ).trim().replace(/\s+/g, ' ');
    const latestChapterLabel = rawChapter.replace(/^(?:»|Chương mới:?)\s*/i, '').trim();

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  let totalPages = 1;
  $('a[href*="/page/"]').each((_, el) => {
    const m = String($(el).attr('href') || '').match(/\/page\/(\d+)/i);
    if (m) {
      const p = parseInt(m[1], 10);
      if (Number.isFinite(p) && p > totalPages) totalPages = p;
    }
  });

  return {
    items,
    totalPages: Math.min(MUTUALHEIGHTS_MAX_PAGES, Math.max(1, totalPages)),
  };
}

async function fetchLatestUpdates(options = {}) {
  const signal = options.signal || null;
  if (signal?.aborted) {
    return { ok: false, aborted: true, siteId: 'mutualheights', page: 1, totalPages: 1, items: [] };
  }
  const page = Math.min(MUTUALHEIGHTS_MAX_PAGES, Math.max(1, Math.floor(Number(options.page) || 1)));
  const fetchImpl = typeof options.fetchHtmlImpl === 'function' ? options.fetchHtmlImpl : fetchHtml;

  const listingUrl = page > 1
    ? `${DOMAIN}truyen-moi-cap-nhat/page/${page}/`
    : `${DOMAIN}truyen-moi-cap-nhat/`;

  let fetched;
  try {
    fetched = await fetchImpl(listingUrl, {
      referer: DOMAIN,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: false, aborted: true, siteId: 'mutualheights', page, totalPages: 1, items: [] };
    }
    return { ok: false, error: String(err?.message || err) + VPN_REQUIRED_HINT };
  }
  if (signal?.aborted || fetched?.aborted) {
    return { ok: false, aborted: true, siteId: 'mutualheights', page, totalPages: 1, items: [] };
  }
  if (!fetched?.ok) {
    return { ok: false, error: (fetched?.error || 'Không tải được danh sách MutualHeights.') + VPN_REQUIRED_HINT };
  }

  const parsed = parseMutualHeightsListingHtml(fetched.html, fetched.finalUrl || listingUrl);
  return {
    ok: true,
    siteId: 'mutualheights',
    page,
    totalPages: Math.max(page, parsed.totalPages),
    items: parsed.items,
  };
}

module.exports = {
  DOMAIN,
  LABEL,
  SELECTORS,
  collectChapterImages,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
};
