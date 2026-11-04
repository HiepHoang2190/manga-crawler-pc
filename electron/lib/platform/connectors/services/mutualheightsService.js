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

module.exports = {
  DOMAIN,
  LABEL,
  SELECTORS,
  collectChapterImages,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};
