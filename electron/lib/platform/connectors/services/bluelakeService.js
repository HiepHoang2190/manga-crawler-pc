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

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};
