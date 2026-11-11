const cheerio = require('cheerio');
const { fetchHtml, resolveUrl, USER_AGENT_JSOUP } = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger');

const DOMAIN = 'https://kingdomhoiquan.com/';
const LABEL = 'Kingdom Hội Quán';
const SITE_ID = 'kingdomhoiquan';
const DEFAULT_LIST_JSON_URL = 'https://kingdomhoiquan.com/wp-content/uploads/khq/list.json';

/**
 * Format chapter key into chapter number label string.
 * e.g.: 8930 -> "893", 8875 -> "887.5", 10 -> "1"
 */
function formatChapterLabel(k) {
  const num = Number(k);
  if (isNaN(num)) return String(k);
  return num % 10 ? (num / 10).toFixed(1) : String(Math.floor(num / 10));
}

/**
 * Build chapter URL from chapter key and base home URL.
 */
function buildChapterUrl(homeUrl, k) {
  const label = formatChapterLabel(k);
  const base = homeUrl.endsWith('/') ? homeUrl : `${homeUrl}/`;
  return `${base}chap/${label.replace('.', '-')}/`;
}

/**
 * Normalize input URL to main manga page URL.
 */
function normalizeToMangaUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('kingdomhoiquan')) {
      return `${parsed.protocol}//${parsed.host}/`;
    }
    return url;
  } catch {
    return DOMAIN;
  }
}

class KingdomHoiQuanApiClient {
  /**
   * Load manga metadata and chapter list.
   * Accepts both manga homepage URL and individual chapter URL.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL không hợp lệ.' };
    }

    const mangaUrl = normalizeToMangaUrl(trimmed);
    const fetched = await fetchHtml(mangaUrl, {
      userAgent: options.userAgent || USER_AGENT_JSOUP,
      referer: DOMAIN,
    });

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Không tải được trang truyện.' };
    }

    const $ = cheerio.load(fetched.html);

    // Title
    const title = $('h1.t').first().text().trim() || $('h1').first().text().trim() || 'Kingdom';

    // Cover
    let coverUrl = '';
    const coverDataSrc = $('.cover img').attr('data-src') || $('.cover img').attr('src') || '';
    if (coverDataSrc && !coverDataSrc.startsWith('data:')) {
      coverUrl = resolveUrl(mangaUrl, coverDataSrc);
    }
    if (!coverUrl) {
      const ogImage = $('meta[property="og:image"]').attr('content') || '';
      if (ogImage) {
        coverUrl = resolveUrl(mangaUrl, ogImage);
      }
    }

    // Author
    let author = $('dl.meta a[href*="tac-gia"]').first().text().trim();
    if (!author) {
      $('dl.meta div').each((_, el) => {
        const dt = $(el).find('dt').text().trim();
        if (dt.toLowerCase().includes('tác giả')) {
          author = $(el).find('dd').text().trim();
        }
      });
    }

    // Description
    const description = $('p.sum').first().text().trim() || $('meta[name="description"]').attr('content') || '';

    // Chapters extraction
    // Preferred: fetch list.json
    let chapters = [];
    const gridDataSrc = $('#grid').attr('data-src') || '';
    const listJsonUrl = gridDataSrc ? resolveUrl(mangaUrl, gridDataSrc) : DEFAULT_LIST_JSON_URL;

    try {
      const fetchFn = typeof global.fetch === 'function' ? global.fetch : require('node-fetch');
      const jsonRes = await fetchFn(listJsonUrl, {
        headers: {
          'User-Agent': options.userAgent || USER_AGENT_JSOUP,
          'Referer': mangaUrl,
        },
      });

      if (jsonRes.ok) {
        const data = await jsonRes.json();
        const list = Array.isArray(data.c) ? data.c : [];
        if (list.length > 0) {
          const home = $('#grid').attr('data-home') || mangaUrl;
          chapters = list.map(item => {
            const key = Array.isArray(item) ? item[0] : item;
            const label = formatChapterLabel(key);
            return {
              url: buildChapterUrl(home, key),
              title: `Chap ${label}`,
            };
          });
        }
      }
    } catch (err) {
      logger.warn(`[KingdomHoiQuan] Không tải được list.json (${err.message}), fallback sang HTML`);
    }

    // Fallback: scrape static chapters from HTML
    if (chapters.length === 0) {
      const seen = new Set();
      $('#grid a.ch, .grid a.ch').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const absUrl = resolveUrl(mangaUrl, href);
        if (seen.has(absUrl)) return;
        seen.add(absUrl);

        let chTitle = $(el).find('b').text().trim();
        if (!chTitle) {
          chTitle = $(el).text().trim();
        }
        chapters.push({
          url: absUrl,
          title: chTitle || href,
        });
      });
    }

    if (chapters.length === 0) {
      return { ok: false, error: 'Không tìm thấy danh sách chương.' };
    }

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl,
        mangaId: 'kingdom',
        siteId: SITE_ID,
        sourceLabel: LABEL,
        author: author || undefined,
        description: description || undefined,
      },
      chapters,
    };
  }

  /**
   * Fetch image list for a chapter.
   */
  async fetchChapterImages(chapterUrl, referer) {
    const trimmed = String(chapterUrl || '').trim();
    if (!trimmed) {
      throw new Error('URL chương không hợp lệ.');
    }

    const fetched = await fetchHtml(trimmed, {
      referer: referer || DOMAIN,
      userAgent: USER_AGENT_JSOUP,
    });

    if (!fetched.ok) {
      throw new Error(fetched.error || 'Không tải được trang chương.');
    }

    const $ = cheerio.load(fetched.html);
    const images = [];
    const seen = new Set();

    let $imgs = $('.pages img, main.pages img');
    if ($imgs.length === 0) {
      $imgs = $('main img, .single-chap img');
    }

    $imgs.each((_, el) => {
      const dataSrc = $(el).attr('data-src') || '';
      const src = $(el).attr('src') || '';
      const candidate = (dataSrc || src).trim();

      if (!candidate || candidate.startsWith('data:') || seen.has(candidate)) {
        return;
      }

      const absUrl = resolveUrl(trimmed, candidate);
      if (!absUrl || seen.has(absUrl)) return;
      seen.add(absUrl);

      // Determine extension
      let ext = 'webp';
      const extMatch = candidate.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
      if (extMatch) {
        ext = extMatch[1].toLowerCase().replace('jpeg', 'jpg');
      }

      images.push({
        imageUrl: absUrl,
        ext,
      });
    });

    return images;
  }
}

module.exports = new KingdomHoiQuanApiClient();
