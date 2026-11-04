/**
 * Flame Comics connector service — https://flamecomics.xyz/
 * Details, chapters, and chapter reader images parsed from Next.js SSR __NEXT_DATA__
 * with Cheerio HTML fallback.
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const {
  fetchHtml,
  resolveUrl,
  getFileExt,
  USER_AGENT,
} = require('../../../download/connector/htmlConnectorUtils');
const logger = require('../../../shared/logger').createLogger('FlamecomicsService');
const { connectorDomainManager } = require('../domain/ConnectorDomainManager');

const DOMAIN = 'https://flamecomics.xyz/';
const LABEL = 'Flame Comics';
const CDN_BASE = 'https://cdn.flamecomics.xyz/uploads/images/series/';

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
  return connectorDomainManager.getDomain('flamecomics', DOMAIN);
}

/**
 * Extract series ID from URL.
 * e.g. /series/2 or /series/2-omniscient-readers-viewpoint or /series/2/364db6fd6bef182e
 * -> '2'
 */
function extractSeriesId(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const parsed = new URL(raw, DOMAIN);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';

    if (parts[0].toLowerCase() === 'series' && parts[1]) {
      const match = parts[1].match(/^(\d+)/);
      if (match) return match[1];
      return parts[1];
    }

    const firstMatch = parts[0].match(/^(\d+)/);
    if (firstMatch) return firstMatch[1];

    return '';
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
    .replace(/\s*\|\s*Flame\s*Comics.*$/i, '')
    .replace(/\s*-\s*Flame\s*Comics.*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract clean chapter label from chapter number and optional subtitle.
 * e.g. chapter "311.00", title "Dokja’s Fable (Part 13)" -> "Chapter 311: Dokja’s Fable (Part 13)"
 */
function formatChapterLabel(chapterNum, rawTitle) {
  const num = parseFloat(chapterNum);
  const numStr = isNaN(num) ? String(chapterNum || '').trim() : String(num);
  const prefix = numStr ? `Chapter ${numStr}` : 'Chapter';
  const subtitle = String(rawTitle || '').trim();
  if (subtitle && subtitle.toLowerCase() !== prefix.toLowerCase()) {
    return `${prefix}: ${subtitle}`;
  }
  return prefix;
}

/**
 * Safely parse __NEXT_DATA__ JSON from HTML.
 */
function extractNextData(html) {
  if (!html) return null;
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    logger.warn('Failed to parse __NEXT_DATA__ JSON:', err?.message || err);
    return null;
  }
}

/**
 * Strips HTML tags from description string.
 */
function stripHtml(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tab Mới cập nhật / Tìm kiếm truyện Flame Comics.
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const activeDomain = getActiveDomain();

  if (search_query) {
    // Browse page has all series with full catalog
    const browseUrl = `${activeDomain}browse`;
    let fetched;
    try {
      fetched = await fetchHtml(browseUrl, {
        referer: activeDomain,
        userAgent: options.userAgent || USER_AGENT,
      });
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }

    if (!fetched.ok) {
      return { ok: false, error: fetched.error || 'Failed to fetch search catalog from Flame Comics.' };
    }

    const nextData = extractNextData(fetched.html);
    const allSeries = nextData?.props?.pageProps?.series;
    if (!Array.isArray(allSeries)) {
      return { ok: true, items: [], page: 1, totalPages: 1 };
    }

    const qLower = search_query.toLowerCase();
    const matched = allSeries.filter((s) => {
      const t = String(s.title || '').toLowerCase();
      const desc = String(s.description || '').toLowerCase();
      return t.includes(qLower) || desc.includes(qLower);
    });

    const pageSize = 24;
    const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
    const sliceStart = (page - 1) * pageSize;
    const pageItems = matched.slice(sliceStart, sliceStart + pageSize);

    const items = pageItems.map((s) => {
      const seriesId = String(s.series_id || '');
      const mangaUrl = `${activeDomain}series/${seriesId}`;
      const coverUrl = s.cover ? `${CDN_BASE}${seriesId}/${s.cover}?${s.last_edit || ''}` : '';
      return {
        title: cleanComicTitle(s.title || ''),
        mangaUrl,
        coverUrl,
        latestChapterLabel: s.status || '',
      };
    });

    return {
      ok: true,
      items,
      page,
      totalPages,
    };
  }

  // No search query: fetch homepage for latest updates
  let fetched;
  try {
    fetched = await fetchHtml(activeDomain, {
      referer: activeDomain,
      userAgent: options.userAgent || USER_AGENT,
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }

  if (!fetched.ok) {
    return { ok: false, error: fetched.error || 'Failed to fetch latest updates from Flame Comics.' };
  }

  const nextData = extractNextData(fetched.html);
  const latestEntries = nextData?.props?.pageProps?.latestEntries;
  const items = [];
  const seenIds = new Set();

  if (latestEntries && typeof latestEntries === 'object') {
    // If latestEntries has blocks or direct series list
    const seriesList = [];
    if (Array.isArray(latestEntries)) {
      seriesList.push(...latestEntries);
    } else if (Array.isArray(latestEntries.blocks)) {
      for (const b of latestEntries.blocks) {
        if (Array.isArray(b.series)) {
          seriesList.push(...b.series);
        }
      }
    } else {
      for (const k of Object.keys(latestEntries)) {
        const val = latestEntries[k];
        if (Array.isArray(val)) {
          seriesList.push(...val);
        } else if (val && typeof val === 'object' && Array.isArray(val.series)) {
          seriesList.push(...val.series);
        }
      }
    }

    for (const s of seriesList) {
      const seriesId = String(s.series_id || '');
      if (!seriesId || seenIds.has(seriesId)) continue;
      seenIds.add(seriesId);

      const mangaUrl = `${activeDomain}series/${seriesId}`;
      const coverUrl = s.cover ? `${CDN_BASE}${seriesId}/${s.cover}?${s.last_edit || ''}` : '';
      let latestChapterLabel = '';
      if (Array.isArray(s.chapters) && s.chapters.length > 0) {
        const latestCh = s.chapters[0];
        const num = parseFloat(latestCh.chapter);
        latestChapterLabel = isNaN(num) ? String(latestCh.chapter || '') : `Chapter ${num}`;
      }

      items.push({
        title: cleanComicTitle(s.title || ''),
        mangaUrl,
        coverUrl,
        latestChapterLabel,
      });
    }
  }

  // Fallback to /browse if homepage didn't yield entries
  if (items.length === 0) {
    const browseRes = await fetchLatestUpdates({ ...options, latestUpdatesSearch: ' ' });
    return browseRes;
  }

  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const sliceStart = (page - 1) * pageSize;
  const pageItems = items.slice(sliceStart, sliceStart + pageSize);

  return {
    ok: true,
    items: pageItems,
    page,
    totalPages,
  };
}

const SELECTORS = {
  title: 'h1',
  cover: 'img[src*="thumbnail"]',
  chapterLinks: 'a[href*="/series/"]',
};

class FlamecomicsService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      name: LABEL,
      label: LABEL,
      siteId: 'flamecomics',
      imageReferer: DOMAIN,
      selectors: SELECTORS,
    });
    this.siteId = 'flamecomics';
    this.domain = DOMAIN;
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL cannot be empty.' };

    const activeDomain = getActiveDomain(trimmed);
    if (activeDomain) {
      connectorDomainManager.setDomain('flamecomics', activeDomain);
    }

    const seriesId = extractSeriesId(trimmed);
    if (!seriesId) {
      return {
        ok: false,
        error: `Invalid URL format. Please use a comic URL (e.g. ${activeDomain}series/2).`,
      };
    }

    const targetUrl = resolveUrl(activeDomain, `/series/${seriesId}`);

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
      return { ok: false, error: fetched.error || 'Failed to fetch comic details from Flame Comics.' };
    }

    const nextData = extractNextData(fetched.html);
    const series = nextData?.props?.pageProps?.series;
    const chaptersData = nextData?.props?.pageProps?.chapters;

    let title = '';
    let coverUrl = '';
    let description = '';
    let author = '';
    let artist = '';
    let status = '';
    let genres = [];
    const chapters = [];

    if (series) {
      title = cleanComicTitle(series.title || '');
      if (series.cover) {
        coverUrl = `${CDN_BASE}${series.series_id || seriesId}/${series.cover}?${series.last_edit || ''}`;
      }
      description = stripHtml(series.description || '');
      author = Array.isArray(series.author) ? series.author.join(', ') : String(series.author || '');
      artist = Array.isArray(series.artist) ? series.artist.join(', ') : String(series.artist || '');
      status = String(series.status || '');
      if (Array.isArray(series.tags)) {
        genres.push(...series.tags);
      }
      if (Array.isArray(series.categories)) {
        for (const c of series.categories) {
          if (!genres.includes(c)) genres.push(c);
        }
      }
    }

    // HTML fallback for metadata if series missing
    if (!title) {
      const $ = cheerio.load(fetched.html);
      title =
        $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').first().text().trim();
      title = cleanComicTitle(title);
      if (!title) return { ok: false, error: 'Could not parse comic title from Flame Comics.' };

      const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
      if (ogImage) {
        coverUrl = resolveUrl(targetUrl, ogImage);
      }
      description =
        ($('meta[property="og:description"]').attr('content') || '').trim() ||
        ($('meta[name="description"]').attr('content') || '').trim();
    }

    if (Array.isArray(chaptersData)) {
      const seenTokens = new Set();
      for (const ch of chaptersData) {
        const token = String(ch.token || '').trim();
        if (!token || seenTokens.has(token)) continue;
        seenTokens.add(token);

        const chUrl = resolveUrl(activeDomain, `/series/${seriesId}/${token}`);
        const label = formatChapterLabel(ch.chapter, ch.title);

        chapters.push({
          url: chUrl,
          title: label,
          name: label,
          order: chapters.length,
          rawChapter: ch.chapter,
        });
      }
    } else {
      // Fallback from HTML links
      const $ = cheerio.load(fetched.html);
      const seenHrefs = new Set();
      $(`a[href*="/series/${seriesId}/"]`).each((_, el) => {
        const rawHref = ($(el).attr('href') || '').trim();
        if (!rawHref) return;
        const fullHref = resolveUrl(targetUrl, rawHref);
        if (seenHrefs.has(fullHref)) return;
        seenHrefs.add(fullHref);

        const rawText = $(el).text().trim().replace(/\s+/g, ' ');
        chapters.push({
          url: fullHref,
          title: rawText || 'Chapter',
          name: rawText || 'Chapter',
          order: chapters.length,
        });
      });
    }

    // Sort chapters in ascending order (earliest chapter first)
    chapters.sort((a, b) => {
      const numA = parseFloat(a.rawChapter != null ? a.rawChapter : (a.title.match(/Chapter\s*(\d+(\.\d+)?)/i) || [])[1] || '0');
      const numB = parseFloat(b.rawChapter != null ? b.rawChapter : (b.title.match(/Chapter\s*(\d+(\.\d+)?)/i) || [])[1] || '0');
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numA - numB;
      }
      return 0;
    });

    chapters.forEach((ch, idx) => {
      ch.order = idx + 1;
      delete ch.rawChapter;
    });

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        mangaUrl: targetUrl,
        mangaId: seriesId,
        siteId: 'flamecomics',
        sourceLabel: LABEL,
        author,
        artist,
        status,
        genres: genres.length ? genres : undefined,
        description: description || '',
      },
      chapters,
      data: {
        title,
        coverUrl,
        author,
        artist,
        status,
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
      throw new Error(fetched.error || 'Failed to fetch chapter HTML from Flame Comics.');
    }

    const nextData = extractNextData(fetched.html);
    const chapterData = nextData?.props?.pageProps?.chapter;
    const images = [];

    if (chapterData && chapterData.images) {
      const imgMap = chapterData.images;
      const keys = Object.keys(imgMap).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

      const seriesId = String(chapterData.series_id || '');
      const token = String(chapterData.token || nextData?.props?.pageProps?.token || '');
      const editTime = chapterData.edit_time || chapterData.release_date || '';

      for (const k of keys) {
        const imgObj = imgMap[k];
        if (!imgObj || !imgObj.name) continue;
        const fullUrl = `${CDN_BASE}${seriesId}/${token}/${imgObj.name}?${editTime}`;
        const ext = getFileExt(imgObj.name) || (imgObj.type ? imgObj.type.replace('image/', '') : 'jpg');
        images.push({
          imageUrl: fullUrl,
          ext: ext === 'jpeg' ? 'jpg' : ext,
        });
      }
    }

    // Fallback: search <img> elements in HTML
    if (images.length === 0) {
      const $ = cheerio.load(fetched.html);
      const seen = new Set();
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (!src) return;
        const clean = src.trim();
        if (!clean || /^data:/i.test(clean)) return;
        if (clean.includes('/uploads/images/series/')) {
          const full = resolveUrl(chapterUrl, clean);
          if (!seen.has(full)) {
            seen.add(full);
            images.push({
              imageUrl: full,
              ext: getFileExt(full) || 'jpg',
            });
          }
        }
      });
    }

    return images;
  }
}

const service = new FlamecomicsService();

module.exports = {
  service,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, label) => service.downloadChapter(payload, label || LABEL),
  fetchLatestUpdates: (options) => fetchLatestUpdates(options),
  // Helpers exported for unit testing
  extractSeriesId,
  cleanComicTitle,
  formatChapterLabel,
  extractNextData,
  stripHtml,
};
