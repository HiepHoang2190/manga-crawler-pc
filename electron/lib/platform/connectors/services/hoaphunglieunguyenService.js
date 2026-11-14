/**
 * Hỏa Phụng Liêu Nguyên Connector Service — https://hoaphunglieunguyen.com/
 * Manhua Chan Mou (Trần Mưu)
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT_JSOUP,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('HoaphunglieunguyenService');

const DOMAIN = 'https://hoaphunglieunguyen.com/';
const LABEL = 'Hỏa Phụng Liêu Nguyên';
const SITE_ID = 'hoaphunglieunguyen';

/**
 * Normalize any URL from the site to the base manga URL.
 * e.g. /tap/tap-1/hoi-1/ or /tap/tap-82/ -> https://hoaphunglieunguyen.com/
 */
function normalizeToMangaUrl(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return DOMAIN;
    const parsed = new URL(raw, DOMAIN);
    if (parsed.hostname.includes('hoaphunglieunguyen')) {
      return `https://${parsed.host}/`;
    }
    return DOMAIN;
  } catch {
    return DOMAIN;
  }
}

/**
 * Clean manga title from suffixes.
 */
function cleanMangaTitle(rawTitle) {
  if (!rawTitle) return LABEL;
  return String(rawTitle)
    .replace(/^Đọc\s+/i, '')
    .replace(/\s*[-–|]\s*(?:Đọc Full.*|Cập Nhật.*|Đọc Online.*|Danh sách.*)$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parse chapter number from title or URL.
 * e.g. "Hồi 637: Tri kỷ đồng hành", "/hoi-637/" -> 637
 */
function parseChapterNumber(title, url) {
  const urlMatch = String(url || '').match(/hoi-([0-9]+(?:[.-][0-9]+)?)/i);
  if (urlMatch) {
    const num = parseFloat(urlMatch[1].replace('-', '.'));
    if (!isNaN(num)) return num;
  }
  const titleMatch = String(title || '').match(/(?:hồi|hoi|chap|chapter|chương)\s*([0-9]+(?:[.-][0-9]+)?)/i);
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
 * Parse manga metadata from homepage HTML.
 */
function parseMangaMetadata($, html, baseUrl) {
  let title = cleanMangaTitle(
    $('.hero-title, h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim()
  );

  let coverUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('.hp-hero-art img, .hero img, .summary_image img').first().attr('src') ||
    $('img[src*="bia-hero"]').first().attr('src') ||
    '';
  if (coverUrl) {
    coverUrl = resolveUrl(baseUrl, coverUrl);
  }

  let description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('.hero p').first().text().trim() ||
    '';

  const author = 'Chan Mou (Trần Mưu)';
  const status = 'Đang tiến hành';

  // Extract latest chapter URL from #moi-cap-nhat
  let latestChapterUrl = '';
  $('#moi-cap-nhat a, .hp-latest a').each((_, el) => {
    if (latestChapterUrl) return;
    const href = $(el).attr('href');
    if (href && /\/hoi-\d+/i.test(href)) {
      latestChapterUrl = resolveUrl(baseUrl, href);
    }
  });

  return {
    title: title || LABEL,
    coverUrl,
    description,
    author,
    status,
    mangaUrl: DOMAIN,
    latestChapterUrl,
  };
}

/**
 * Parse chapters from select.hoi-select.
 * Every option inside optgroup represents a chapter.
 */
function parseChaptersFromSelect($, baseUrl) {
  const chapters = [];
  const seen = new Set();

  $('select.hoi-select optgroup').each((_, group) => {
    const $group = $(group);
    const volumeLabel = ($group.attr('label') || '').trim();
    const volMatch = volumeLabel.match(/(\d+)/);
    const volume = volMatch ? volMatch[1] : null;

    $group.find('option').each((_, opt) => {
      const $opt = $(opt);
      const val = ($opt.attr('value') || '').trim();
      if (!val || val === '#' || val.includes('javascript:')) return;

      const fullUrl = resolveUrl(baseUrl, val);
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const optionText = $opt.text().trim().replace(/\s+/g, ' ');
      const chapterNum = parseChapterNumber(optionText, fullUrl);

      chapters.push({
        url: fullUrl,
        title: optionText || `Hồi ${chapterNum}`,
        chapterNumber: chapterNum,
        volume: volume,
      });
    });
  });

  // Sort ascending by chapterNumber
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  return chapters;
}

/**
 * Parse reader images from chapter page.
 */
function parseReaderImages($, chapterUrl) {
  const images = [];
  const seen = new Set();

  $('#hpln-reader-stage img, .reader-stage img, img.hpln-page').each((_, el) => {
    const $img = $(el);
    const raw =
      $img.attr('data-src') ||
      $img.attr('src') ||
      '';

    if (!raw || raw.startsWith('data:') || seen.has(raw)) return;

    // Filter ad banners, trackers, gifs
    if (/\.(gif|svg)(\?|$)/i.test(raw) || /tracker|banner|google|analytics/i.test(raw)) {
      return;
    }

    const fullUrl = resolveUrl(chapterUrl, raw);
    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      const ext = getFileExt(fullUrl) || 'webp';
      images.push({ imageUrl: fullUrl, ext });
    }
  });

  return images;
}

const SELECTORS = {
  title: '.hero-title, h1',
  cover: '.hero img, meta[property="og:image"]',
  chapterLinks: 'select.hoi-select option',
};

class HoaphunglieunguyenService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      name: LABEL,
      label: LABEL,
      siteId: SITE_ID,
      imageReferer: DOMAIN,
      selectors: SELECTORS,
    });
    this.siteId = SITE_ID;
    this.domain = DOMAIN;
  }

  /**
   * Load manga details and all chapters (fast 2-request extract).
   * @param {string} url - Any hoaphunglieunguyen.com URL
   * @param {object} [options]
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL không hợp lệ hoặc để trống.' };
    }

    const baseMangaUrl = normalizeToMangaUrl(trimmed);

    // 1. Fetch homepage to get manga metadata & sample chapter url
    let homeRes;
    try {
      homeRes = await fetchHtml(baseMangaUrl, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        referer: DOMAIN,
      });
    } catch (err) {
      return { ok: false, error: `Lỗi kết nối trang chủ: ${err?.message || err}` };
    }

    if (!homeRes || !homeRes.ok) {
      return { ok: false, error: homeRes?.error || 'Không tải được trang chủ Hỏa Phụng Liêu Nguyên.' };
    }

    const $home = cheerio.load(homeRes.html);
    const meta = parseMangaMetadata($home, homeRes.html, baseMangaUrl);

    // 2. Fetch sample chapter to get all chapters from select.hoi-select
    const chapterFetchUrl = meta.latestChapterUrl || `${DOMAIN}tap/tap-1/hoi-1/`;

    let chapterRes;
    try {
      chapterRes = await fetchHtml(chapterFetchUrl, {
        userAgent: options.userAgent || USER_AGENT_JSOUP,
        referer: baseMangaUrl,
      });
    } catch (err) {
      return { ok: false, error: `Lỗi kết nối trang đọc chương: ${err?.message || err}` };
    }

    if (!chapterRes || !chapterRes.ok) {
      return { ok: false, error: chapterRes?.error || 'Không tải được danh sách chương.' };
    }

    const $chapter = cheerio.load(chapterRes.html);
    const chapters = parseChaptersFromSelect($chapter, baseMangaUrl);

    if (!chapters || !chapters.length) {
      return { ok: false, error: 'Không tìm thấy danh sách chương trong trang đọc.' };
    }

    return {
      ok: true,
      manga: {
        title: meta.title || LABEL,
        coverUrl: meta.coverUrl,
        mangaUrl: baseMangaUrl,
        mangaId: 'hoaphunglieunguyen',
        siteId: SITE_ID,
        sourceLabel: LABEL,
        author: meta.author,
        description: meta.description,
        status: meta.status,
      },
      chapters,
    };
  }

  /**
   * Fetch all images for a chapter.
   * @param {string} chapterUrl
   * @param {string} [referer]
   */
  async fetchChapterImages(chapterUrl, referer) {
    const rawUrl = String(chapterUrl || '').trim();
    if (!rawUrl) {
      throw new Error('URL chương không được để trống.');
    }

    let fetched;
    try {
      fetched = await fetchHtml(rawUrl, {
        referer: referer || DOMAIN,
        userAgent: USER_AGENT_JSOUP,
      });
    } catch (err) {
      throw new Error(`Không tải được trang chương: ${err?.message || err}`);
    }

    if (!fetched || !fetched.ok) {
      throw new Error(fetched?.error || 'Không tải được trang chương.');
    }

    const $ = cheerio.load(fetched.html);
    const images = parseReaderImages($, rawUrl);

    if (!images || !images.length) {
      throw new Error('Không tìm thấy ảnh trong trang chương.');
    }

    return images;
  }
}

const service = new HoaphunglieunguyenService();

module.exports = {
  DOMAIN,
  LABEL,
  SITE_ID,
  HoaphunglieunguyenService,
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, label) => service.downloadChapter(payload, label || LABEL),
  fetchChapterImages: (chapterUrl, referer) => service.fetchChapterImages(chapterUrl, referer),
  normalizeToMangaUrl,
  cleanMangaTitle,
  parseChapterNumber,
  parseMangaMetadata,
  parseChaptersFromSelect,
  parseReaderImages,
};
