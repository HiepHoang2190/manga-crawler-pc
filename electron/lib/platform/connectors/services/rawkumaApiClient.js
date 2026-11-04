/**
 * RawKuma API Client for ApiConnectorService
 * RawKuma uses WordPress + AJAX API for chapter list
 */

const cheerio = require('cheerio');
const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');

const SITE_DOMAIN = 'https://rawkuma.net';
const IMG_REFERER = 'https://rawkuma.net/';

/** Chapter pages are hosted on KumacDN or Kyut CDN; older chapters may use inline wp uploads only. */
function isChapterCdnUrl(src) {
  const s = String(src || '');
  return s.includes('cdn.kumacdn.club') || s.includes('kyut.dev');
}

function isWpContentChapterFallback(src) {
  const s = String(src || '');
  if (!s.includes('rawkuma.net/wp-content')) return false;
  if (/rawkuma-logo/i.test(s)) return false;
  return true;
}

/** Some responses omit reader <img> nodes; URLs may still appear in JSON/script. */
const CHAPTER_CDN_URL_IN_HTML_RE =
  /https:\/\/(?:[a-z0-9-]+\.)*(?:kyut\.dev|cdn\.kumacdn\.club)\/[^"'\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi;

function extractChapterCdnUrlsFromHtmlString(htmlString) {
  const text = String(htmlString || '');
  const seen = new Set();
  const ordered = [];
  for (const m of text.matchAll(CHAPTER_CDN_URL_IN_HTML_RE)) {
    const u = m[0];
    if (seen.has(u)) continue;
    seen.add(u);
    ordered.push(u);
  }
  return ordered;
}

function extractMangaId(html) {
  const match = html.match(/manga_id["\s:=]+(\d+)/);
  return match ? match[1] : null;
}

function extractSlug(urlString) {
  const s = String(urlString || '').trim();
  // /manga/<slug> or /manga/<slug>/
  const m = s.match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : null;
}

/** Manga pages have multiple h1 (e.g. sidebar "Last Updates"); prefer schema.org name. */
function extractMangaTitle($, slug) {
  let t = $('h1[itemprop="name"]').first().text().trim();
  if (t) return t;

  const docTitle = $('title').first().text().trim();
  if (docTitle) {
    t = docTitle.replace(/\s*[–—-]\s*Rawkuma\s*$/i, '').trim();
    if (t) return t;
  }

  const ogTitle = String($('meta[property="og:title"]').attr('content') || '').trim();
  if (ogTitle && !/^last updates$/i.test(ogTitle)) return ogTitle;

  for (const el of $('h1').toArray()) {
    const txt = $(el).text().trim();
    if (!txt) continue;
    const low = txt.toLowerCase();
    if (low === 'last updates' || low === 'rawkuma') continue;
    return txt;
  }
  return slug;
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        Referer: SITE_DOMAIN,
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, html: await res.text() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/javascript, */*',
        Referer: SITE_DOMAIN,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (!text.trim()) return { ok: false, error: 'Empty response' };
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function fetchManga(url) {
  const slug = extractSlug(url);
  if (!slug) return { ok: false, error: 'Không lấy được slug từ URL (dạng /manga/<slug>).' };

  const pageUrl = `${SITE_DOMAIN}/manga/${slug}/`;
  const r = await fetchHtml(pageUrl);
  if (!r.ok) return { ok: false, error: r.error };

  const $ = cheerio.load(r.html);
  const title = extractMangaTitle($, slug);
  
  // Cover image - try multiple selectors
  let coverUrl = '';
  const imgSelectors = [
    'div[itemprop="image"] img',
    'img.wp-post-image',
    'img[src*="/wp-content/uploads/"]',
    'meta[property="og:image"]'
  ];
  
  for (const sel of imgSelectors) {
    if (sel.startsWith('meta')) {
      const val = $(sel).attr('content');
      if (val && val.startsWith('http')) {
        coverUrl = val;
        break;
      }
    } else {
      const val = $(sel).attr('src');
      if (val && val.startsWith('http')) {
        coverUrl = val;
        break;
      }
    }
  }

  const mangaId = extractMangaId(r.html);
  if (!mangaId) {
    return { ok: false, error: 'Không tìm thấy manga_id trong trang.' };
  }

  return {
    ok: true,
    slug,
    mangaId,
    manga: {
      title,
      coverUrl,
      mangaUrl: url,
      siteId: 'rawkuma',
      sourceLabel: 'RawKuma',
    },
  };
}

async function fetchChapters(mangaId, slug) {
  const chapters = [];
  const seenUrls = new Set();
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 10) { // Safety limit
    const url = `${SITE_DOMAIN}/wp-admin/admin-ajax.php?manga_id=${mangaId}&page=${page}&action=chapter_list`;
    const r = await fetchHtml(url);
    if (!r.ok) break;

    const $ = cheerio.load(r.html);
    const items = $('a[href*="/chapter-"]');
    
    if (items.length === 0) {
      hasMore = false;
      break;
    }

    items.each((i, el) => {
      const $link = $(el);
      const chapterUrl = $link.attr('href');
      let chapterTitle = $link.find('span').first().text().trim();
      
      // Fallback to link text if span is empty
      if (!chapterTitle) {
        chapterTitle = $link.text().trim();
      }
      
      if (chapterUrl && chapterTitle && chapterUrl.includes('/chapter-') && !seenUrls.has(chapterUrl)) {
        seenUrls.add(chapterUrl);
        chapters.push({
          url: chapterUrl,
          title: formatChapterTitle(chapterTitle),
        });
      }
    });

    page++;
  }

  return { ok: true, chapters };
}

/**
 * RawKuma API Client
 * Implements the interface required by ApiConnectorService
 */
class RawkumaApiClient {
  /**
   * Load manga information and chapters
   * @param {string} url - Manga URL
   * @param {object} options - Options
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    
    const m = await fetchManga(trimmed);
    if (!m.ok) return m;
    
    const ch = await fetchChapters(m.mangaId, m.slug);
    return {
      ok: true,
      manga: m.manga,
      chapters: ch.chapters || [],
    };
  }

  /**
   * Fetch chapter images by parsing HTML
   * @param {string} chapterUrl - Chapter URL
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>}
   */
  async fetchChapterImages(chapterUrl) {
    const r = await fetchHtml(chapterUrl);
    if (!r.ok) {
      throw new Error(`Không tải được trang chương: ${r.error}`);
    }

    const $ = cheerio.load(r.html);
    const domChapterCdnUrls = [];
    const wpFallbackUrls = [];

    $('img').each((i, el) => {
      const $img = $(el);
      const src =
        $img.attr('src') ||
        $img.attr('data-src') ||
        $img.attr('data-lazy-src') ||
        '';

      if (!src) return;
      if (isChapterCdnUrl(src)) {
        domChapterCdnUrls.push(src);
      } else if (isWpContentChapterFallback(src)) {
        wpFallbackUrls.push(src);
      }
    });

    const regexChapterCdnUrls = extractChapterCdnUrlsFromHtmlString(r.html);
    const resolvedChapterCdnUrls =
      regexChapterCdnUrls.length > domChapterCdnUrls.length
        ? regexChapterCdnUrls
        : domChapterCdnUrls;
    const images = resolvedChapterCdnUrls.length ? resolvedChapterCdnUrls : wpFallbackUrls;

    if (!images.length) {
      throw new Error('Không có ảnh trong chương.');
    }

    return images.map(imageUrl => {
      const ext = getFileExt(imageUrl);
      return { imageUrl, ext };
    });
  }
}

function getFileExt(u) {
  try {
    const p = String(u).split('?')[0];
    const e = p.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(e)) return e;
  } catch { /* */ }
  return 'jpg';
}

module.exports = {
  RawkumaApiClient,
  SITE_DOMAIN,
  IMG_REFERER,
  extractSlug,
  extractMangaId,
  extractMangaTitle,
  fetchManga,
  fetchChapters,
};
