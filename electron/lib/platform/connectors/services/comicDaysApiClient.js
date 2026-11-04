/**
 * ComicDays API Client for ApiConnectorService
 * Extracted from comicDaysService.js to separate API logic from download logic
 * Handles ComicDays (Kodansha) official API with image descrambling
 */

const Jimp = require('jimp');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const { runComicDaysGrid } = require('../../../download/drmHeavyWorkerPool');

const COMIC_DAYS_DOMAIN = 'https://comic-days.com/';
const CHAPTER_LIST_API = 'https://comic-days.com/api/viewer/pagination_readable_products';
const CHAPTER_FETCH_LIMIT = 50;
const DESCRAMBLE_GRID = 4;
const DESCRAMBLE_MULTIPLE = 8;

const EPISODE_JSON_DATA_VALUE_RE =
  /<script[^>]+id=['"]episode-json['"][^>]+data-value=['"]([^'"]+)['"]/is;
const EPISODE_JSON_CONTENT_RE = /<script[^>]+id=['"]episode-json['"][^>]*>([^<]+)<\/script>/is;

/**
 * Get string value from object property
 * @param {object} obj - Object to extract from
 * @param {string} key - Property key
 * @returns {string} String value or empty string
 */
function getJsonString(obj, key) {
  if (!obj || obj[key] == null) return '';
  return typeof obj[key] === 'string' ? obj[key] : String(obj[key]);
}

/**
 * Unescape HTML entities in text
 * @param {string} text - Text to unescape
 * @returns {string} Unescaped text
 */
function unescapeHtmlEntities(text) {
  if (!text) return '';
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Extract episode JSON from HTML page
 * @param {string} html - HTML content
 * @returns {string|null} JSON string or null
 */
function extractEpisodeJsonFromHtml(html) {
  let m = html.match(EPISODE_JSON_DATA_VALUE_RE);
  if (m) return unescapeHtmlEntities(m[1]);
  m = html.match(EPISODE_JSON_CONTENT_RE);
  if (m) return unescapeHtmlEntities(m[1].trim());
  return null;
}

/**
 * Fetch and parse episode JSON from URL
 * @param {string} episodeUrl - Episode URL
 * @returns {Promise<object|null>} Parsed JSON or null
 */
async function fetchEpisodeJson(episodeUrl) {
  const res = await fetch(episodeUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const jsonStr = extractEpisodeJsonFromHtml(html);
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Extract series ID from episode URL
 * @param {string} url - Episode URL
 * @returns {Promise<string|null>} Series ID or null
 */
async function extractSeriesId(url) {
  const episodeJson = await fetchEpisodeJson(url);
  if (!episodeJson) return null;
  const series = episodeJson.readableProduct && episodeJson.readableProduct.series;
  if (!series || series.id == null) return null;
  return String(series.id);
}

/**
 * Fetch manga information from episode URL
 * @param {string} url - Episode URL
 * @returns {Promise<{ok: boolean, manga?: object, error?: string}>}
 */
async function fetchManga(url) {
  const episodeJson = await fetchEpisodeJson(url);
  if (!episodeJson) {
    return { ok: false, error: 'Không đọc được episode-json từ trang.' };
  }
  const readableProduct = episodeJson.readableProduct;
  if (!readableProduct) {
    return { ok: false, error: 'Không có readableProduct.' };
  }
  const series = readableProduct.series;
  let title = '';
  if (series && series.title) title = String(series.title);
  if (!title && readableProduct.title) title = String(readableProduct.title);
  let coverUrl = '';
  if (series && series.thumbnailUri) coverUrl = String(series.thumbnailUri);
  return {
    ok: true,
    manga: {
      title,
      coverUrl,
      mangaUrl: url,
      mangaId: series && series.id != null ? String(series.id) : '',
      siteId: 'comicdays',
      sourceLabel: 'ComicDays',
    },
  };
}

/**
 * Fetch chapters list from series API
 * @param {string} url - Episode URL
 * @returns {Promise<{ok: boolean, chapters?: array, error?: string}>}
 */
async function fetchChapters(url) {
  const seriesId = await extractSeriesId(url);
  if (!seriesId) {
    return { ok: false, error: 'Không lấy được series ID.', chapters: [] };
  }
  const chapters = [];
  let offset = 0;

  while (true) {
    const apiUrl =
      `${CHAPTER_LIST_API}?type=episode&aggregate_id=${encodeURIComponent(seriesId)}` +
      `&offset=${offset}&limit=${CHAPTER_FETCH_LIMIT}&sort_order=asc&is_guest=1`;

    const res = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        Referer: COMIC_DAYS_DOMAIN,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!res.ok) break;
    let data;
    try {
      data = await res.json();
    } catch {
      break;
    }
    if (!Array.isArray(data) || data.length === 0) break;

    for (const obj of data) {
      const viewerUri = getJsonString(obj, 'viewer_uri');
      if (!viewerUri) continue;
      const title = getJsonString(obj, 'title');
      const status = obj.status;
      const isFree = status && status.label === 'is_free';
      let displayTitle = title;
      if (!isFree) displayTitle = `${title} [有料]`;
      if (!chapters.some((c) => c.url === viewerUri)) {
        chapters.push({ url: viewerUri, title: formatChapterTitle(displayTitle) });
      }
    }

    if (data.length < CHAPTER_FETCH_LIMIT) break;
    offset += data.length;
  }

  return { ok: true, chapters };
}

/**
 * Descramble ComicDays image using grid-based algorithm
 * @param {Jimp} src - Source scrambled image
 * @returns {Promise<Jimp>} Descrambled image
 */
async function descrambleImage(src) {
  const width = src.bitmap.width;
  const height = src.bitmap.height;
  const cellW = Math.floor(width / (DESCRAMBLE_GRID * DESCRAMBLE_MULTIPLE)) * DESCRAMBLE_MULTIPLE;
  const cellH = Math.floor(height / (DESCRAMBLE_GRID * DESCRAMBLE_MULTIPLE)) * DESCRAMBLE_MULTIPLE;

  const tiles = [];
  for (let col = 0; col < DESCRAMBLE_GRID; col++) {
    tiles[col] = [];
    for (let row = 0; row < DESCRAMBLE_GRID; row++) {
      tiles[col][row] = src.clone().crop(col * cellW, row * cellH, cellW, cellH);
    }
  }

  const dest = new Jimp(width, height);
  dest.composite(src, 0, 0);
  for (let col = 0; col < DESCRAMBLE_GRID; col++) {
    for (let row = 0; row < DESCRAMBLE_GRID; row++) {
      dest.composite(tiles[col][row], row * cellW, col * cellH);
    }
  }
  return dest;
}

/**
 * Download and descramble image buffer
 * @param {Buffer} scrambledBuf - Scrambled image buffer
 * @returns {Promise<Buffer>} Descrambled image buffer
 */
async function downloadImageBuffer(scrambledBuf) {
  return runComicDaysGrid(scrambledBuf);
}

/**
 * ComicDays API Client
 * Implements the interface required by ApiConnectorService
 */
class ComicDaysApiClient {
  constructor() {
    this.domain = COMIC_DAYS_DOMAIN;
  }

  /**
   * Load manga information and chapters
   * @param {string} url - Manga URL
   * @param {object} options - Load options (unused for ComicDays)
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    
    const m = await fetchManga(trimmed);
    if (!m.ok) return m;
    const ch = await fetchChapters(trimmed);
    return { ok: true, manga: m.manga, chapters: ch.chapters || [] };
  }

  /**
   * Fetch chapter images with descrambling metadata
   * @param {string} chapterUrl - Chapter URL
   * @returns {Promise<Array<{imageUrl: string, ext: string, needsDescrambling: boolean}>>}
   */
  async fetchChapterImages(chapterUrl) {
    const episodeJson = await fetchEpisodeJson(chapterUrl);
    if (!episodeJson || !episodeJson.readableProduct) {
      throw new Error('Không đọc được episode JSON.');
    }
    
    const pageStructure = episodeJson.readableProduct.pageStructure;
    if (!pageStructure || !Array.isArray(pageStructure.pages)) {
      throw new Error('Không có pageStructure.');
    }

    const imageUrls = [];
    for (const page of pageStructure.pages) {
      if (getJsonString(page, 'type') !== 'main') continue;
      const src = getJsonString(page, 'src');
      if (src) {
        imageUrls.push({
          imageUrl: src,
          ext: 'jpg', // ComicDays images are always JPG after descrambling
          needsDescrambling: true, // All ComicDays images need descrambling
        });
      }
    }
    
    if (!imageUrls.length) {
      throw new Error('Không có ảnh main.');
    }

    return imageUrls;
  }

  /**
   * Download and descramble image buffer (for custom download logic)
   * @param {Buffer} scrambledBuf - Scrambled image buffer
   * @returns {Promise<Buffer>} Descrambled image buffer
   */
  async downloadImageBuffer(scrambledBuf) {
    return downloadImageBuffer(scrambledBuf);
  }
}

module.exports = {
  ComicDaysApiClient,
  COMIC_DAYS_DOMAIN,
  CHAPTER_LIST_API,
  fetchEpisodeJson,
  extractSeriesId,
  fetchManga,
  fetchChapters,
  descrambleImage,
  downloadImageBuffer,
};