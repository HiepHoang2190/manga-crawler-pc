/**
 * Asura Scans connector service — https://asurascans.com/
 * Details, chapters, and chapter reader images parsed from HTML.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('AsurascansService');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://asurascans.com/';
const LABEL = 'Asura Scans';
const IMG_REFERER = DOMAIN;

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
  return connectorDomainManager.getDomain('asurascans', DOMAIN);
}

const SELECTORS = {
  title: 'h1',
  cover: 'img[src*="covers/"]',
  chapterLinks: 'a[href*="/chapter/"]',
};

const RESERVED_FIRST_SEGMENTS = new Set([
  'browse',
  'bookmarks',
  'novels',
  'images',
  'icons',
  'api',
  'login',
  'register',
  'contact',
  'terms',
  'privacy',
]);

/**
 * Extract comic slug from story or chapter URL.
 * e.g. /comics/solo-swordmaster-11fe7da3 or /series/solo-swordmaster-11fe7da3/chapter/1
 * -> solo-swordmaster-11fe7da3
 */
function extractComicSlug(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const parsed = new URL(raw, DOMAIN);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';

    // Handle /comics/{slug} or /series/{slug}
    if ((parts[0].toLowerCase() === 'comics' || parts[0].toLowerCase() === 'series') && parts[1]) {
      return parts[1];
    }

    if (RESERVED_FIRST_SEGMENTS.has(parts[0].toLowerCase())) {
      return '';
    }

    return parts[0];
  } catch {
    return '';
  }
}

/**
 * Clean comic title from raw title tag or header.
 */
function cleanComicTitle(rawTitle) {
  if (!rawTitle) return '';
  return String(rawTitle)
    .replace(/\s*\|\s*Asura\s*Scans.*$/i, '')
    .replace(/\s*-\s*Read Manga.*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract clean chapter label from chapter text or URL.
 * e.g. text "Chapter 2318 hours ago" or url "/comics/.../chapter/23" -> "Chapter 23"
 */
function formatChapterLabel(text, href) {
  const matchHref = String(href || '').match(/\/chapter\/([^\/\?#]+)/i);
  if (matchHref) {
    const num = matchHref[1].replace(/^chapter-?/i, '');
    return `Chapter ${num}`;
  }

  const trimmed = String(text || '').trim();
  const matchText = trimmed.match(/Chapter\s*(\d+(\.\d+)?)/i);
  if (matchText) {
    return `Chapter ${matchText[1]}`;
  }

  return trimmed || 'Chapter';
}

/**
 * Parse listing cards from HTML (/comics or /browse/comics).
 */
function parseAsurascansListingHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  $('.series-card, div[data-series-id]').each((_, card) => {
    const $card = $(card);
    const $link = $card.find('a[href^="/comics/"]').first();
    let href = String($link.attr('href') || '').trim();
    if (!href || href.includes('/chapter/')) return;

    const comicUrl = resolveUrl(pageUrl, href);
    if (seenUrls.has(comicUrl)) return;
    seenUrls.add(comicUrl);

    let title =
      $card.find('h3').first().text().trim() ||
      $card.find('img').first().attr('alt') ||
      '';
    title = cleanComicTitle(title);
    if (!title) return;

    let coverUrl = '';
    const $img = $card.find('img').first();
    if ($img.length) {
      const src = ($img.attr('src') || $img.attr('data-src') || '').trim();
      if (src && !/^data:/i.test(src)) {
        coverUrl = resolveUrl(pageUrl, src);
      }
    }

    // Try finding latest chapter label
    let latestChapterLabel = '';
    const $chapSpan = $card.find('span:contains("Chs"), span:contains("Chapter")').first();
    if ($chapSpan.length) {
      const count = $chapSpan.text().trim().replace(/\s+/g, ' ');
      latestChapterLabel = count;
    }

    items.push({
      title,
      mangaUrl: comicUrl,
      coverUrl,
      latestChapterLabel,
    });
  });

  // Fallback: search results or layout variations without .series-card class
  if (items.length === 0) {
    $('a[href^="/comics/"]').each((_, a) => {
      const href = String($(a).attr('href') || '').trim();
      if (!href || href.includes('/chapter/')) return;
      const comicUrl = resolveUrl(pageUrl, href);
      if (seenUrls.has(comicUrl)) return;

      const $container = $(a).closest('div');
      let title =
        $container.find('h3').first().text().trim() ||
        $(a).find('img').first().attr('alt') ||
        $(a).attr('title') ||
        '';
      title = cleanComicTitle(title);
      if (!title) return;

      seenUrls.add(comicUrl);

      let coverUrl = '';
      const $img = $container.find('img').first().length ? $container.find('img').first() : $(a).find('img').first();
      if ($img.length) {
        const src = ($img.attr('src') || $img.attr('data-src') || '').trim();
        if (src && !/^data:/i.test(src)) {
          coverUrl = resolveUrl(pageUrl, src);
        }
      }

      items.push({
        title,
        mangaUrl: comicUrl,
        coverUrl,
        latestChapterLabel: '',
      });
    });
  }

  return items;
}

/**
 * Extract max page number from pagination links.
 */
function parseAsurascansListingMaxPage(html) {
  const $ = cheerio.load(html);
  let maxPage = 1;

  $('a[href*="page="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const match = href.match(/page=(\d+)/i);
    if (match) {
      const p = parseInt(match[1], 10);
      if (!isNaN(p) && p > maxPage) {
        maxPage = p;
      }
    }
  });

  return maxPage;
}

/**
 * Tab Mới cập nhật / Tìm kiếm truyện Asura Scans.
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const activeDomain = getActiveDomain();

  if (search_query) {
    const searchUrl = `${activeDomain}browse/comics?search=${encodeURIComponent(search_query)}`;
    let fetched;
    try {
      fetched = await fetchHtml(searchUrl, {
        referer: activeDomain,
        userAgent: options.userAgent || USER_AGENT,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Failed to fetch Asura Scans search results.' };
    }

    const items = parseAsurascansListingHtml(fetched.html, searchUrl);
    return {
      ok: true,
      siteId: 'asurascans',
      page: 1,
      totalPages: 1,
      items,
    };
  }

  const listingUrl =
    page === 1
      ? `${activeDomain}comics`
      : `${activeDomain}browse/comics?page=${page}`;

  let fetched;
  try {
    fetched = await fetchHtml(listingUrl, {
      referer: activeDomain,
      userAgent: options.userAgent || USER_AGENT,
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Failed to fetch Asura Scans latest comics.' };
  }

  const items = parseAsurascansListingHtml(fetched.html, listingUrl);
  const totalPages = Math.max(page, parseAsurascansListingMaxPage(fetched.html));

  return {
    ok: true,
    siteId: 'asurascans',
    page,
    totalPages,
    items,
  };
}

class AsurascansService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'asurascans',
      imageReferer: IMG_REFERER,
      selectors: SELECTORS,
    });
    this.siteId = 'asurascans';
    this.domain = DOMAIN;
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL cannot be empty.' };

    const activeDomain = getActiveDomain(trimmed);
    if (activeDomain) {
      connectorDomainManager.setDomain('asurascans', activeDomain);
    }

    const slug = extractComicSlug(trimmed);
    if (!slug) {
      return {
        ok: false,
        error: `Invalid URL format. Please use a comic URL (e.g. ${activeDomain}comics/solo-swordmaster-11fe7da3).`,
      };
    }

    const targetUrl = resolveUrl(activeDomain, `/comics/${slug}`);

    let fetched;
    try {
      fetched = await fetchHtml(targetUrl, {
        referer: activeDomain,
        userAgent: options.userAgent || USER_AGENT,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Failed to fetch comic details from Asura Scans.' };
    }

    const $ = cheerio.load(fetched.html);

    let title =
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('title').first().text().trim();
    title = cleanComicTitle(title);
    if (!title) return { ok: false, error: 'Could not parse comic title.' };

    let coverUrl = '';
    const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
    if (ogImage) {
      coverUrl = resolveUrl(targetUrl, ogImage);
    }
    if (!coverUrl) {
      const $cover = $('img[src*="covers/"]').first();
      if ($cover.length) {
        const raw = ($cover.attr('src') || $cover.attr('data-src') || '').trim();
        if (raw && !/^data:/i.test(raw)) {
          coverUrl = resolveUrl(targetUrl, raw);
        }
      }
    }

    // Description
    const description =
      ($('meta[property="og:description"]').attr('content') || '').trim() ||
      ($('meta[name="description"]').attr('content') || '').trim();

    // Genres
    const genres = [];
    $('a[href*="/genres/"], a[href*="genre="], span.badge').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g) && g.length < 30) genres.push(g);
    });

    // Chapters
    const chapters = [];
    const seenUrls = new Set();

    // Look for chapter links
    $('a[href*="/comics/"][href*="/chapter/"]').each((_, el) => {
      const $a = $(el);
      let href = ($a.attr('href') || '').trim();
      if (!href) return;
      href = resolveUrl(targetUrl, href);
      if (seenUrls.has(href)) return;

      const rawText = $a.text().trim().replace(/\s+/g, ' ');
      // Filter out navigation buttons like "Read First Chapter" if they duplicate
      if (/^first chapter$/i.test(rawText)) {
        return;
      }

      seenUrls.add(href);
      const label = formatChapterLabel(rawText, href);

      chapters.push({
        url: href,
        title: label,
        name: label,
        order: chapters.length,
      });
    });

    // Fallback: if button "First Chapter" was skipped and chapter 1 wasn't in list, add it if seen
    if (chapters.length === 0) {
      $('a[href*="/chapter/"]').each((_, el) => {
        const $a = $(el);
        let href = ($a.attr('href') || '').trim();
        if (!href) return;
        href = resolveUrl(targetUrl, href);
        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        const rawText = $a.text().trim().replace(/\s+/g, ' ');
        const label = formatChapterLabel(rawText, href);

        chapters.push({
          url: href,
          title: label,
          name: label,
          order: chapters.length,
        });
      });
    }

    // Sort chapters in natural ascending order by chapter number if possible
    chapters.sort((a, b) => {
      const numA = parseFloat((a.title.match(/Chapter\s*(\d+(\.\d+)?)/i) || [])[1] || '0');
      const numB = parseFloat((b.title.match(/Chapter\s*(\d+(\.\d+)?)/i) || [])[1] || '0');
      if (numA !== 0 && numB !== 0) {
        return numA - numB;
      }
      return 0;
    });

    // Re-index order
    chapters.forEach((ch, idx) => {
      ch.order = idx + 1;
    });

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: targetUrl,
        mangaId: slug,
        siteId: 'asurascans',
        sourceLabel: LABEL,
        author: '',
        status: '',
        genres: genres.length ? genres : undefined,
        description: description || '',
      },
      chapters,
      data: {
        title,
        coverUrl,
        author: '',
        status: '',
        genres,
        description,
        chapters,
      },
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    const targetReferer = referer || getActiveDomain(chapterUrl);
    let fetched;
    try {
      fetched = await fetchHtml(chapterUrl, {
        referer: targetReferer,
      });
    } catch (err) {
      throw new Error(`Failed to fetch chapter HTML: ${err?.message || err}`);
    }
    if (!fetched.ok) {
      throw new Error(fetched.error || 'Failed to fetch chapter HTML from Asura Scans.');
    }

    const $ = cheerio.load(fetched.html);
    const images = [];
    const seenSrc = new Set();

    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;
      const cleanSrc = src.trim();
      if (!cleanSrc || /^data:/i.test(cleanSrc)) return;

      // Only match reader images
      if (cleanSrc.includes('/chapters/') || cleanSrc.includes('asura-images/chapters')) {
        const fullUrl = resolveUrl(chapterUrl, cleanSrc);
        if (!seenSrc.has(fullUrl)) {
          seenSrc.add(fullUrl);
          const ext = getFileExt(fullUrl) || 'webp';
          images.push({
            imageUrl: fullUrl,
            ext,
          });
        }
      }
    });

    return images;
  }
}

const service = new AsurascansService();

module.exports = {
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, label) => service.downloadChapter(payload, label || LABEL),
  fetchLatestUpdates: (options) => fetchLatestUpdates(options),
  // Export helpers for testing
  extractComicSlug,
  cleanComicTitle,
  formatChapterLabel,
  parseAsurascansListingHtml,
  parseAsurascansListingMaxPage,
};
