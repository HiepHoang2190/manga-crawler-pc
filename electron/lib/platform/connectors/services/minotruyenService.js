/**
 * Minotruyen service - migrated to use BaseConnectorService.
 * Uses API for manga/chapter loading and chapter images API
 * (fallback: HTML digest decryption / Next.js RSC plaintext).
 * Handles special DRM descrambling for protected images.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BaseConnectorService } = require('../base/BaseConnectorService');
const { runStripDescramble } = require('../../../download/drmHeavyWorkerPool');
const { formatChapterTitle, formatChapterPageFileName } = require('../../../shared/mangaUtils');
const { USER_AGENT } = require('../../../download/connector/htmlConnectorUtils');

/** Site frontend uses NEXT_PUBLIC_API_URL (was api.cloudkk.art; v5 domain now hits cloudkk-v1). */
const API_BASE = 'https://api.cloudkk-v1.xyz/api';
const DOMAIN = 'https://minotruyenv7.xyz/';
/** Default frontend origin (no trailing slash) for API headers when URL has no mirror host. */
const DEFAULT_SITE_ORIGIN = DOMAIN.replace(/\/+$/, '');
const MINOTRUYEN_FRONTEND_HOST_RE = /^minotruyenv\d+\.xyz$/i;
const LABEL = 'Minotruyen';
const SECRET_KEY = 'GCERKSmf28E6nWwrnR8Lz4f7TacKpzMy7aK0rxSB';
const DRM_XOR_KEY = '3141592653589793';
const ENCRYPTED_BLOCK_RE = /([0-9a-f]{32}):([A-Za-z0-9+/=]{100,})/g;

/** Latest tab — `/manga/truyen-moi` vs `/comics/truyen-moi` (GET `/api/books?category=`). */
const LATEST_LISTING_CATEGORY_MANGA = 'manga';
const LATEST_LISTING_CATEGORY_COMICS = 'comics';
const DEFAULT_LATEST_PER_PAGE = 30;

/**
 * @param {string} [raw]
 * @returns {'manga'|'comics'}
 */
function normalizeLatestListingCategory(raw) {
  const s = String(raw || LATEST_LISTING_CATEGORY_MANGA).trim().toLowerCase();
  return s === LATEST_LISTING_CATEGORY_COMICS
    ? LATEST_LISTING_CATEGORY_COMICS
    : LATEST_LISTING_CATEGORY_MANGA;
}

function latestListingRefererPath(category, searchMode) {
  const cat = normalizeLatestListingCategory(category);
  return searchMode ? `/${cat}/search` : `/${cat}/truyen-moi`;
}

function booksPathPrefix(category, book) {
  const fromBook =
    book && book.category != null ? String(book.category).trim().toLowerCase() : '';
  const cat = fromBook === LATEST_LISTING_CATEGORY_COMICS ||
    fromBook === LATEST_LISTING_CATEGORY_MANGA
    ? fromBook
    : normalizeLatestListingCategory(category);
  return cat;
}

/**
 * Resolve Minotruyen frontend origin (https://minotruyenv{n}.xyz) from a page URL, or null.
 * @param {string} urlString
 * @returns {string|null}
 */
function resolveSiteOriginFromUrl(urlString) {
  try {
    const host = new URL(String(urlString).trim()).hostname.toLowerCase();
    if (MINOTRUYEN_FRONTEND_HOST_RE.test(host)) return `https://${host}`;
  } catch {
    /* */
  }
  return null;
}

/**
 * Extract book ID from URL.
 * @param {string} url - Manga URL
 * @returns {string|null} Book ID
 */
function extractBookIdFromUrl(url) {
  const s = String(url || '');
  const booksMatch = s.match(/\/books\/(\d+)(?:\/|$|\?|#)/i);
  if (booksMatch) return booksMatch[1];
  const re = /(?:^|[-/])(\d+)(?:\/|$)/g;
  let last = null;
  let m;
  while ((m = re.exec(s)) !== null) {
    last = m[1];
  }
  return last;
}

/**
 * `/manga/books/{bookId}/{chapterId}` → chapterId; null when path has no chapter.
 * @param {string} url
 * @returns {string|null}
 */
function extractChapterIdFromUrl(url) {
  const match = String(url || '').trim().match(/\/books\/(\d+)\/(\d+)(?:\/|$|\?|#)/i);
  return match ? match[2] : null;
}

/**
 * Prefer full memo JPEG when both CDN mirrors are listed.
 * @param {object} imageMap
 * @returns {{imageUrl: string, drmData?: string|null}|null}
 */
function pageSpecFromImageServers(imageMap) {
  const serversRaw = imageMap && imageMap.servers;
  if (!Array.isArray(serversRaw) || serversRaw.length === 0) return null;
  let chosenUrl = null;
  let chosenDrm = null;
  for (const serverObj of serversRaw) {
    if (!serverObj || typeof serverObj !== 'object') continue;
    const imageUrl = String(serverObj.imageUrl || '').trim();
    if (!imageUrl) continue;
    const drmRaw = serverObj.drmData != null ? serverObj.drmData : serverObj.drm_data;
    const drmStr = drmRaw != null && String(drmRaw).trim() !== '' ? String(drmRaw).trim() : null;
    if (chosenUrl == null) {
      chosenUrl = imageUrl;
      chosenDrm = drmStr;
    }
    const lowerUrl = imageUrl.toLowerCase();
    if (
      imageUrl.includes('phinf.pstatic.net/memo') ||
      lowerUrl.endsWith('.jpeg') ||
      lowerUrl.endsWith('.jpg')
    ) {
      chosenUrl = imageUrl;
      chosenDrm = drmStr;
      break;
    }
  }
  if (chosenUrl == null) return null;
  return { imageUrl: chosenUrl, drmData: chosenDrm };
}

/**
 * Maps `GET /api/books/{bookId}/chapters/{chapterId}` → page specs.
 * @param {object|null|undefined} root
 * @returns {Array<{imageUrl: string, drmData?: string|null}>}
 */
function pagesFromChapterApi(root) {
  if (!root || root.success !== true) return [];
  const chapterRaw = root.data && root.data.chapter;
  if (!chapterRaw || typeof chapterRaw !== 'object') return [];
  const imagesRaw = chapterRaw.images;
  if (!Array.isArray(imagesRaw) || imagesRaw.length === 0) return [];
  const imageMaps = imagesRaw.filter((row) => row && typeof row === 'object');
  imageMaps.sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : parseInt(String(a.order), 10) || 0;
    const bo = typeof b.order === 'number' ? b.order : parseInt(String(b.order), 10) || 0;
    return ao - bo;
  });
  const pages = [];
  for (const imageMap of imageMaps) {
    const page = pageSpecFromImageServers(imageMap);
    if (page) pages.push(page);
  }
  return pages;
}

/**
 * Origin for Latest updates API headers (default v5; optional hint URL for v7, etc.).
 * @param {object} [options]
 * @param {string} [options.latestUpdatesFrontendOrigin]  full URL or origin hint
 */
function resolveLatestUpdatesSiteOrigin(options) {
  const raw =
    options &&
    typeof options.latestUpdatesFrontendOrigin === 'string' &&
    options.latestUpdatesFrontendOrigin.trim();
  if (raw) {
    const o = resolveSiteOriginFromUrl(raw);
    if (o) return o.replace(/\/+$/, '');
  }
  return DEFAULT_SITE_ORIGIN;
}

/**
 * @param {string} [searchQuery]  non-empty → search mode (`q=`)
 * @param {number} page  1-based
 * @param {number} perPage  clamped 1..60
 */
function buildMinotruyenBooksListingUrl(searchQuery, page, perPage, listingCategory) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const take = Math.min(60, Math.max(1, Math.floor(Number(perPage) || DEFAULT_LATEST_PER_PAGE)));
  const category = normalizeLatestListingCategory(listingCategory);
  const qs = new URLSearchParams();
  const q = String(searchQuery || '').trim();
  if (q) {
    qs.set('q', q);
    qs.set('take', String(take));
    qs.set('page', String(p));
    qs.set('category', category);
  } else {
    qs.set('order', 'desc');
    qs.set('take', String(take));
    qs.set('page', String(p));
    qs.set('category', category);
  }
  return `${API_BASE}/books?${qs.toString()}`;
}

function pickCoverUrlFromMinotruyenBookRow(book) {
  if (!book || typeof book !== 'object') return '';
  const cov = book.cover?.imageUrl ?? book.cover?.url;
  if (cov) return String(cov).trim();
  const covs = book.covers;
  if (Array.isArray(covs) && covs[0] && covs[0].url) return String(covs[0].url).trim();
  const th = book.thumbnail;
  if (th && /^https?:\/\//i.test(String(th))) return String(th).trim();
  return '';
}

function formatLatestChapterLabelFromMinotruyenBook(book) {
  const chapters = book && book.chapters;
  if (!Array.isArray(chapters) || !chapters.length) return '';
  const ch0 = chapters[0];
  if (!ch0 || typeof ch0 !== 'object') return '';
  const num = ch0.num != null ? ch0.num : ch0.chapterNumber;
  if (num != null && String(num).trim() !== '') return `Ch. ${num}`;
  return '';
}

/**
 * @param {object} book  API `books[]` element
 * @param {string} siteOrigin  no trailing slash
 * @returns {{ title: string, mangaUrl: string, coverUrl: string, latestChapterLabel: string }|null}
 */
function mapMinotruyenBookToLatestRow(book, siteOrigin, listingCategory) {
  const origin = String(siteOrigin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  const rawId = book && (book.bookId != null ? book.bookId : book.id);
  const bookId = rawId != null ? String(rawId).trim() : '';
  if (!bookId) return null;
  const bookTitle = book.info?.title ?? book.title;
  const titleRaw = bookTitle != null ? String(bookTitle).trim() : '';
  const title = titleRaw || `Book ${bookId}`;
  const pathPrefix = booksPathPrefix(listingCategory, book);
  const mangaUrl = `${origin}/${pathPrefix}/books/${bookId}`;
  return {
    title,
    mangaUrl,
    coverUrl: pickCoverUrlFromMinotruyenBookRow(book),
    latestChapterLabel: formatLatestChapterLabelFromMinotruyenBook(book),
  };
}

/** RSC flight HTML embeds `\"book\":{...\"slug\"...\"title\"...\"bookId\"...}`. */
const WEB_SEARCH_BOOK_ROW_RE =
  /\\"slug\\":\\"([^"\\]+)\\",\\"title\\":\\"([^"\\]*)\\",\\"bookId\\":(\d+)/g;

/** First cover inside a `\"book\":{...}` slice (`[{` not escaped in RSC flight). */
const WEB_SEARCH_COVER_URL_RE = /,\\"covers\\":\[{\\"url\\":\\"([^"\\]+)\\"/;

function extractWebSearchCoverUrlNearMatch(htmlStr, matchIndex) {
  const slice = htmlStr.slice(
    matchIndex,
    Math.min(htmlStr.length, matchIndex + 2800),
  );
  const cm = slice.match(WEB_SEARCH_COVER_URL_RE);
  return cm && cm[1] ? String(cm[1]).trim() : '';
}

/**
 * Parse `/manga/search` HTML for embedded book rows (web index ≠ public `q=` API index).
 *
 * @param {string} html
 * @param {string} siteOrigin  no trailing slash
 * @returns {{ title: string, mangaUrl: string, coverUrl: string, latestChapterLabel: string }[]}
 */
function parseMinotruyenWebSearchRows(html, siteOrigin, listingCategory) {
  const base = String(siteOrigin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  const pathPrefix = booksPathPrefix(listingCategory);
  const htmlStr = String(html || '');
  const seen = new Set();
  const out = [];
  let m;
  WEB_SEARCH_BOOK_ROW_RE.lastIndex = 0;
  while ((m = WEB_SEARCH_BOOK_ROW_RE.exec(htmlStr)) !== null) {
    const bookId = m[3];
    if (!bookId || seen.has(bookId)) continue;
    seen.add(bookId);
    const titleRaw = m[2] != null ? String(m[2]).trim() : '';
    const slug = m[1] != null ? String(m[1]).trim() : '';
    const title = titleRaw || slug || `Book ${bookId}`;
    const coverUrl = extractWebSearchCoverUrlNearMatch(htmlStr, m.index);
    out.push({
      title,
      mangaUrl: `${base}/${pathPrefix}/books/${bookId}`,
      coverUrl,
      latestChapterLabel: '',
    });
  }
  return out;
}

/**
 * @param {string} siteOrigin
 * @param {string} searchQuery
 * @returns {Promise<{ title: string, mangaUrl: string, coverUrl: string, latestChapterLabel: string }[]>}
 */
async function fetchMinotruyenWebSearchRows(siteOrigin, searchQuery, listingCategory) {
  const origin = String(siteOrigin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  const category = normalizeLatestListingCategory(listingCategory);
  const q = String(searchQuery || '').trim();
  if (!q) return [];
  const url = `${origin}/${category}/search?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': USER_AGENT,
        Origin: origin,
        Referer: `${origin}/`,
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseMinotruyenWebSearchRows(html, origin, category);
  } catch {
    return [];
  }
}

function extractBookIdFromMangaUrlRow(row) {
  const m = String(row?.mangaUrl || '').match(/\/books\/(\d+)/);
  return m ? m[1] : '';
}

/**
 * Reads `bookId` (fallback `id`) as int. Returns -1 when missing so it sinks in bookId-DESC sort.
 * @param {object} book
 * @returns {number}
 */
function bookIdAsInt(book) {
  const raw = book && (book.bookId != null ? book.bookId : book.id);
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw);
  const n = parseInt(String(raw != null ? raw : '').trim(), 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Sort API `books[]` by bookId DESC — matches `/manga/truyen-moi` on the web.
 * `GET /api/books?order=desc` actually sorts by book.updatedAt (latest chapter time), not createdAt.
 *
 * @param {object[]} rawBooks
 * @returns {object[]}
 */
function sortBooksByBookIdDesc(rawBooks) {
  return [...rawBooks].sort(
    (a, b) => bookIdAsInt(b) - bookIdAsInt(a),
  );
}

/**
 * Tab Truyện mới — `GET …/api/books?order=desc&take=&page=` (danh sách như `/manga/truyen-moi`)
 * hoặc `GET …/api/books?q=&take=&page=` (tìm như `/manga/search`, không dùng `_rsc` RSC).
 *
 * Backend chỉ chấp nhận `order=asc|desc` và mặc định sắp theo `book.updatedAt`
 * (≈ thời điểm chương mới nhất). Trang `/manga/truyen-moi` sắp theo `book.createdAt DESC`
 * (≈ `bookId DESC`), nên ta sắp lại phía client khi không ở chế độ tìm kiếm.
 *
 * @param {object} [options]
 * @param {number} [options.page]
 * @param {number} [options.perPage]
 * @param {string} [options.latestUpdatesSearch]
 * @param {string} [options.searchQuery]  alias
 * @param {string} [options.latestUpdatesFrontendOrigin]  mirror hint for Origin/Referer
 * @param {string} [options.minotruyenListingCategory]  `manga` | `comics`
 */
async function fetchLatestUpdates(options = {}) {
  const site_origin = resolveLatestUpdatesSiteOrigin(options || {});
  const listing_category = normalizeLatestListingCategory(
    options.minotruyenListingCategory,
  );
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '')
    .trim()
    .normalize('NFC');
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const perPageRaw = Number(options.perPage);
  const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0
    ? Math.min(60, Math.floor(perPageRaw))
    : DEFAULT_LATEST_PER_PAGE;
  const url = buildMinotruyenBooksListingUrl(
    search_query,
    page,
    perPage,
    listing_category,
  );
  const refererPath = latestListingRefererPath(
    listing_category,
    Boolean(search_query),
  );
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Origin: site_origin,
      Referer: `${site_origin}${refererPath}`,
    },
  });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  let root;
  try {
    root = await res.json();
  } catch {
    return { ok: false, error: 'JSON danh sách không hợp lệ.' };
  }
  if (!root || root.success !== true || !root.data || !Array.isArray(root.data.books)) {
    return { ok: false, error: 'API không trả danh sách hợp lệ.' };
  }
  const apiBooks = search_query
    ? root.data.books
    : sortBooksByBookIdDesc(root.data.books);
  const rows = [];
  for (const b of apiBooks) {
    const row = mapMinotruyenBookToLatestRow(b, site_origin, listing_category);
    if (row) rows.push(row);
  }
  const countRaw = root.meta?.itemCount ?? root.countBook;
  const countNum = typeof countRaw === 'string' ? parseInt(countRaw, 10) : Number(countRaw);
  const total = Number.isFinite(countNum) && countNum >= 0 ? countNum : rows.length;
  let totalPages = Math.max(1, Math.ceil(total / perPage));
  let items = rows;
  if (search_query && page === 1) {
    const webRows = await fetchMinotruyenWebSearchRows(
      site_origin,
      search_query,
      listing_category,
    );
    const apiIds = new Set(
      rows.map((r) => extractBookIdFromMangaUrlRow(r)).filter(Boolean),
    );
    const merged = [...rows];
    for (const w of webRows) {
      const bid = extractBookIdFromMangaUrlRow(w);
      if (bid && !apiIds.has(bid)) {
        apiIds.add(bid);
        merged.push(w);
      }
    }
    items = merged;
    if (rows.length === 0 && merged.length > 0) {
      totalPages = 1;
    }
  }
  return {
    ok: true,
    siteId: 'minotruyen',
    page,
    totalPages,
    items,
  };
}

/**
 * OpenSSL EVP_BytesToKey implementation for CryptoJS compatibility.
 */
function evpBytesToKeyOpenSSL(password, salt, keyLen, ivLen) {
  const pass = Buffer.from(password, 'utf8');
  let prev = Buffer.alloc(0);
  const joint = Buffer.alloc(keyLen + ivLen);
  let offset = 0;
  while (offset < keyLen + ivLen) {
    const hash = crypto.createHash('md5');
    hash.update(Buffer.concat([prev, pass, salt]));
    prev = hash.digest();
    const toCopy = Math.min(prev.length, keyLen + ivLen - offset);
    prev.copy(joint, offset, 0, toCopy);
    offset += toCopy;
  }
  return {
    key: joint.slice(0, keyLen),
    iv: joint.slice(keyLen, keyLen + ivLen),
  };
}

/**
 * Decrypt CryptoJS OpenSSL format encrypted data.
 * @param {string} encryptedB64 - Base64 encrypted data
 * @returns {string|null} Decrypted text or null if failed
 */
function decryptCryptoJSOpenSSL(encryptedB64) {
  let encryptedRaw;
  try {
    encryptedRaw = Buffer.from(encryptedB64, 'base64');
  } catch {
    return null;
  }
  if (encryptedRaw.length < 16) return null;
  const header = encryptedRaw.slice(0, 8).toString('ascii');
  if (header !== 'Salted__') return null;
  const salt = encryptedRaw.slice(8, 16);
  const ciphertext = encryptedRaw.slice(16);
  const { key, iv } = evpBytesToKeyOpenSSL(SECRET_KEY, salt, 32, 16);
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Fetch JSON from API endpoint.
 * @param {string} url - API URL
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function fetchJson(url, siteOrigin, refererPath) {
  const origin = String(siteOrigin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  const referer = refererPath
    ? `${origin}${String(refererPath).startsWith('/') ? refererPath : `/${refererPath}`}`
    : `${origin}/`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Origin: origin,
      Referer: referer,
    },
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

/**
 * Decrypt DRM data using XOR cipher.
 * @param {string} base64DrmData - Base64 encoded DRM data
 * @returns {string|null} Decrypted DRM data or null if failed
 */
function decryptDrmData(base64DrmData) {
  try {
    const raw = Buffer.from(String(base64DrmData).trim(), 'base64');
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw[i] ^ DRM_XOR_KEY.charCodeAt(i % DRM_XOR_KEY.length));
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Descramble image using DRM data.
 * @param {Buffer} scrambledBuffer - Scrambled image buffer
 * @param {string} drmData - DRM descrambling instructions
 * @returns {Promise<Buffer>} Descrambled image buffer
 */
async function descrambleToBuffer(scrambledBuffer, drmData) {
  return runStripDescramble(scrambledBuffer, drmData);
}

/**
 * Get file extension from URL.
 * @param {string} url - Image URL
 * @returns {string} File extension
 */
function getFileExtension(url) {
  try {
    const pathPart = String(url).split('?')[0];
    const parts = pathPart.split('.');
    if (parts.length > 1) {
      const ext = parts[parts.length - 1].toLowerCase();
      if (/^(jpg|jpeg|png|gif|webp)$/.test(ext)) return ext;
    }
  } catch {
    /* */
  }
  return 'jpg';
}

/**
 * Minotruyen service implementation.
 * Extends BaseConnectorService with API-based loading and custom image decryption.
 */
class MinotruyenService extends BaseConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'minotruyen',
      imageReferer: DOMAIN,
    });
  }

  /**
   * Prefer Referer/Origin from the mirror host in the user URL (v5, v7, …).
   * @param {object} payload
   * @returns {string}
   */
  getReferer(payload) {
    const chapterUrl = payload && payload.chapterUrl ? String(payload.chapterUrl) : '';
    const mangaUrl = payload && payload.mangaUrl ? String(payload.mangaUrl) : '';
    const resolved_origin =
      resolveSiteOriginFromUrl(chapterUrl) || resolveSiteOriginFromUrl(mangaUrl);
    if (resolved_origin) return `${resolved_origin.replace(/\/+$/, '')}/`;
    return super.getReferer(payload);
  }

  /**
   * Load manga information from URL using API.
   * @param {string} url - Manga URL
   * @param {object} [options] - Load options
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    
    const bookId = extractBookIdFromUrl(trimmed);
    if (!bookId) return { ok: false, error: 'Không lấy được bookId từ URL.' };

    const site_origin = resolveSiteOriginFromUrl(trimmed) || DEFAULT_SITE_ORIGIN;

    // Fetch manga info
    const mangaResult = await this.fetchManga(bookId, site_origin);
    if (!mangaResult.ok || !mangaResult.manga.title) {
      return { ok: false, error: mangaResult.error || 'Không tải được thông tin truyện.' };
    }
    
    mangaResult.manga.mangaUrl = trimmed;
    
    // Fetch chapters
    const chaptersResult = await this.fetchChapters(trimmed);
    
    return { 
      ok: true, 
      manga: mangaResult.manga, 
      chapters: chaptersResult.chapters || [] 
    };
  }

  /**
   * Fetch manga information from API.
   * @param {string} bookId - Book ID
   * @param {string} [siteOrigin] - Frontend origin for Origin/Referer (e.g. v7 mirror)
   * @returns {Promise<{ok: boolean, manga?: object, error?: string}>}
   */
  async fetchManga(bookId, siteOrigin) {
    const apiUrl = `${API_BASE}/books/${bookId}`;
    const resp = await fetchJson(apiUrl, siteOrigin);
    if (!resp.ok || !resp.data) return { ok: false, error: resp.error };
    
    const root = resp.data;
    if (!root.success || !root.data || !root.data.book) return { ok: false, error: 'API success=false' };
    
    const book = root.data.book;
    const bookTitle = book.info?.title ?? book.title;
    const title = bookTitle ? String(bookTitle) : '';
    let coverUrl = '';
    if (book.cover?.imageUrl) {
      coverUrl = String(book.cover.imageUrl);
    } else if (book.cover?.url) {
      coverUrl = String(book.cover.url);
    } else if (Array.isArray(book.covers) && book.covers.length > 0 && book.covers[0].url) {
      coverUrl = String(book.covers[0].url);
    }
    const description = String(book.description || book.summary || book.desc || '').trim().slice(0, 1000);

    return {
      ok: true,
      manga: {
        title,
        coverUrl,
        description,
        mangaUrl: '',
        mangaId: bookId,
        siteId: 'minotruyen',
        sourceLabel: 'Minotruyen',
      },
    };
  }

  /**
   * Fetch chapters from API.
   * @param {string} url - Manga URL
   * @returns {Promise<{ok: boolean, chapters?: array, error?: string}>}
   */
  async fetchChapters(url) {
    const bookId = extractBookIdFromUrl(url);
    if (!bookId) {
      return { ok: false, error: 'Không lấy được bookId.', chapters: [] };
    }
    
    const apiUrl = `${API_BASE}/books/${bookId}/chapters?order=asc&take=5000`;
    const site_origin = resolveSiteOriginFromUrl(url) || DEFAULT_SITE_ORIGIN;
    const resp = await fetchJson(apiUrl, site_origin);
    if (!resp.ok || !resp.data) {
      return { ok: false, error: resp.error || 'API lỗi', chapters: [] };
    }
    
    const root = resp.data;
    if (!root.success || !root.data || !Array.isArray(root.data.chapters)) {
      return { ok: true, chapters: [] };
    }
    
    const urlBase = `${site_origin}/manga/books/${bookId}`;
    const chapters = [];
    
    for (const obj of root.data.chapters) {
      const num = obj.chapterNumber != null ? String(obj.chapterNumber) : (obj.num != null ? String(obj.num) : '');
      const chapterNumber = obj.chapterNumber != null ? String(obj.chapterNumber) : num;
      const chapterId = obj.chapterId != null ? String(obj.chapterId) : chapterNumber;
      const title = obj.title != null && obj.title !== '' ? String(obj.title) : '';
      const chapterTitle = formatChapterTitle(title ? `Chapter ${num} - ${title}` : `Chapter ${num}`);
      const chapterUrl = `${urlBase}/${chapterId}`;
      chapters.push({ url: chapterUrl, title: chapterTitle });
    }
    
    return { ok: true, chapters };
  }

  /**
   * Fetch chapter images — prefer chapter API; fallback HTML digest / RSC.
   * @param {string} chapterUrl - Chapter URL
   * @param {string} referer - Referer header value
   * @returns {Promise<Array<{imageUrl: string, ext: string, drmData?: string}>>}
   */
  async fetchChapterImages(chapterUrl, referer) {
    const fromApi = await this.fetchChapterPagesFromApi(chapterUrl);
    if (fromApi.length) {
      return fromApi.map(({ imageUrl, drmData }) => ({
        imageUrl,
        ext: drmData ? 'jpg' : getFileExtension(imageUrl),
        drmData,
      }));
    }

    const res = await fetch(chapterUrl, {
      headers: {
        'User-Agent': this.getUserAgent(),
        Referer: referer,
      },
    });

    if (!res.ok) {
      throw new Error(`Không tải được trang chương: HTTP ${res.status}`);
    }

    const html = await res.text();
    let pages = this.extractImageUrlsFromChapterHtml(html);
    if (!pages.length) {
      pages = this.extractImageUrlsFromRscChapterHtml(html);
    }
    if (!pages.length) {
      throw new Error('No images');
    }

    return pages.map(({ imageUrl, drmData }) => ({
      imageUrl,
      ext: drmData ? 'jpg' : getFileExtension(imageUrl),
      drmData,
    }));
  }

  /**
   * Prefer `GET /api/books/{bookId}/chapters/{chapterId}` — site HTML no longer embeds digest payloads.
   * @param {string} chapterUrl
   * @returns {Promise<Array<{imageUrl: string, drmData?: string|null}>>}
   */
  async fetchChapterPagesFromApi(chapterUrl) {
    const bookId = extractBookIdFromUrl(chapterUrl);
    const chapterId = extractChapterIdFromUrl(chapterUrl);
    if (!bookId || !chapterId) return [];
    const resolvedSiteOrigin = resolveSiteOriginFromUrl(chapterUrl) || DEFAULT_SITE_ORIGIN;
    const apiUrl = `${API_BASE}/books/${bookId}/chapters/${chapterId}`;
    const resp = await fetchJson(
      apiUrl,
      resolvedSiteOrigin,
      `/manga/books/${bookId}/${chapterId}`,
    );
    if (!resp.ok || !resp.data) return [];
    return pagesFromChapterApi(resp.data);
  }

  /**
   * Extract image URLs from encrypted HTML.
   * @param {string} html - Chapter HTML
   * @returns {Array<{imageUrl: string, drmData?: string}>}
   */
  extractImageUrlsFromChapterHtml(html) {
    const pages = [];
    let m;
    const re = new RegExp(ENCRYPTED_BLOCK_RE.source, 'g');

    while ((m = re.exec(html)) !== null) {
      const encryptedB64 = m[2];
      try {
        const decrypted = decryptCryptoJSOpenSSL(encryptedB64);
        if (!decrypted || !decrypted.includes('imageUrl')) continue;

        const parsed = JSON.parse(decrypted);
        if (!Array.isArray(parsed) || parsed.length === 0) continue;

        const firstServer = parsed[0];
        const content = firstServer.content;
        if (!Array.isArray(content)) continue;

        for (const imgEl of content) {
          if (imgEl && imgEl.imageUrl) {
            const drmRaw = imgEl.drm_data != null && imgEl.drm_data !== '' ? String(imgEl.drm_data) : null;
            pages.push({ imageUrl: String(imgEl.imageUrl), drmData: drmRaw });
          }
        }

        if (pages.length) break;
      } catch {
        /* next block */
      }
    }

    return pages;
  }

  /**
   * Fallback when API is down but Next.js RSC still embeds plaintext images.
   * @param {string} html
   * @returns {Array<{imageUrl: string, drmData?: string|null}>}
   */
  extractImageUrlsFromRscChapterHtml(html) {
    const blockRe =
      /\\"chapterImageId\\":(\d+),\\"order\\":(\d+),[^]]*\\"servers\\":\[(.*?)\]\}/gs;
    const serverRe =
      /\\"drmData\\":(null|\\"[^\\"]*\\"),\\"imageUrl\\":\\"(https?:\/\/[^\\"]+)\\"/g;
    const ordered = [];
    let block;
    while ((block = blockRe.exec(html)) !== null) {
      const order = parseInt(block[2], 10) || 0;
      const serversRaw = block[3] || '';
      let chosenUrl = null;
      let chosenDrm = null;
      let sm;
      serverRe.lastIndex = 0;
      while ((sm = serverRe.exec(serversRaw)) !== null) {
        const drmToken = sm[1] || 'null';
        const imageUrl = sm[2] || '';
        if (!imageUrl) continue;
        const drmStr =
          drmToken === 'null' ? null : drmToken.replace(/\\"/g, '').replace(/"/g, '');
        if (chosenUrl == null) {
          chosenUrl = imageUrl;
          chosenDrm = drmStr;
        }
        const lowerUrl = imageUrl.toLowerCase();
        if (
          imageUrl.includes('phinf.pstatic.net/memo') ||
          lowerUrl.endsWith('.jpeg') ||
          lowerUrl.endsWith('.jpg')
        ) {
          chosenUrl = imageUrl;
          chosenDrm = drmStr;
          break;
        }
      }
      if (chosenUrl == null) continue;
      ordered.push({ order, imageUrl: chosenUrl, drmData: chosenDrm });
    }
    ordered.sort((a, b) => a.order - b.order);
    return ordered.map(({ imageUrl, drmData }) => ({ imageUrl, drmData }));
  }

  /**
   * Override downloadChapter to handle custom image downloading with DRM descrambling.
   * This is necessary because the base class doesn't handle the special DRM logic.
   */
  async downloadChapter(payload, connectorLabel) {
    // We need to override the entire download process because of the special DRM handling
    // First, let the base class handle setup, but we'll intercept the image download part
    
    const {
      mangaTitle,
      mangaUrl,
      chapterUrl,
      chapterTitle,
      baseSaveDir,
      numberOfThreads = 5,
      coverUrl,
      chapterFolderFormat,
      onLog,
      onProgress,
      shouldAbort,
    } = payload;

    const connector = connectorLabel || this.config.label;
    const { resolveMangaDir, resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
    const { downloadCoverIfNeeded } = require('../../../download/connector/connectorDownloadUtils');
    const { loadOrCreate } = require('../../storage/downloadDb');
    const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');
    const pLimit = require('p-limit');

    // Step 1: Setup paths and logging
    const log = (msg, level = 'info') => {
      if (typeof onLog === 'function') onLog(msg, level);
    };
    const report = (progressPayload) => {
      if (typeof onProgress === 'function') onProgress(progressPayload);
    };

    const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
    const dbChapterTitle = formatChapterTitle(chapterTitle);
    const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);
    const referer = this.getReferer(payload);

    // Step 2: Create directories
    fs.mkdirSync(chapterDir, { recursive: true });

    const cleanup_empty_chapter_dir = () => {
      if (removeEmptyChapterDir(chapterDir)) {
        log('Removed empty chapter folder after failed download.', 'info');
      }
    };

    // Step 3: Download cover
    await downloadCoverIfNeeded(coverUrl, mangaDir, referer, this.getUserAgent(), log);

    // Step 4: Check abort
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 5: Load/init download database
    const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connector);
    if (!db.record.mangaTitle) {
      db.record.mangaTitle = mangaTitle;
      db.record.mangaUrl = mangaUrl;
      db.record.connector = connector;
      db.save();
    }

    // Step 6: Check if chapter already complete
    if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
      log('Chapter already complete, skipping.', 'info');
      return { ok: true, skipped: true };
    }

    // Step 7: Fetch chapter images
    let rawList;
    try {
      rawList = await this.fetchChapterImages(chapterUrl, referer);
    } catch (err) {
      log(`Lỗi khi fetch images: ${err.message}`, 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: 'Failed to fetch images' };
    }

    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    if (!rawList || !rawList.length) {
      log('Không tìm thấy ảnh (API / HTML / RSC).', 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: 'No images' };
    }

    log(`Found ${rawList.length} images`, 'info');

    // Step 8: Build page info array with DRM data
    const pageInfos = rawList.map((item, i) => {
      const idx = i + 1;
      const fileName = formatChapterPageFileName(chapterTitle, idx, item.ext, chapterFolderFormat);
      const filePath = path.join(chapterDir, fileName);
      return {
        index: idx,
        imageUrl: item.imageUrl,
        drmData: item.drmData,
        filePath,
        fileName,
      };
    });

    const fullChapterPageCount = rawList.length;
    if (typeof payload.onChapterTotal === 'function') {
      payload.onChapterTotal(fullChapterPageCount);
    }

    // Step 9: Init chapter in DB if not exists
    if (!db.hasChapter(dbChapterTitle) || !db.hasDownloadablePages(dbChapterTitle)) {
      const allPages = pageInfos.map((pi) => ({
        index: pi.index,
        fileName: pi.fileName,
        sourceUrl: pi.imageUrl,
        status: 'pending',
      }));
      db.initChapter(dbChapterTitle, chapterUrl, allPages.length, allPages, {
        force: !db.hasDownloadablePages(dbChapterTitle),
      });
    }

    // Step 10: Resume logic - filter missing pages
    if (db.hasChapter(dbChapterTitle)) {
      const missingPages = db.getMissingPages(dbChapterTitle, chapterDir);
      if (missingPages.length === 0 && db.hasDownloadablePages(dbChapterTitle)) {
        db.markChapterCompleted(dbChapterTitle);
        if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
          log('Chapter already complete (verified), skipping.', 'info');
          return { ok: true, skipped: true };
        }
        db.markChapterIncomplete(dbChapterTitle);
      }
      const missing_after = db.getMissingPages(dbChapterTitle, chapterDir);
      const missingIndices = new Set(missing_after.map((p) => p.index));
      const filtered = pageInfos.filter((pi) => missingIndices.has(pi.index));
      if (filtered.length === 0) {
        db.markChapterIncomplete(dbChapterTitle);
        cleanup_empty_chapter_dir();
        return { ok: false, error: 'Không có trang hợp lệ để tải.', successCount: 0, totalPages: 0 };
      }
      log(`Resuming: ${filtered.length} pages to download.`, 'info');
      pageInfos.splice(0, pageInfos.length, ...filtered);
    }

    // Step 11: Parallel download with custom DRM handling
    const threads = Math.max(1, Math.min(Number(numberOfThreads) || 5, 5));
    const limit = pLimit(threads);
    const totalPages = pageInfos.length;
    const downloadResults = [];
    const failedPageIndices = [];
    const progress = new Int32Array(new SharedArrayBuffer(4));

    report({ mangaTitle, chapterTitle, chapterUrl, current: 0, total: totalPages });

    await Promise.all(
      pageInfos.map((pi) =>
        limit(async () => {
          if (typeof shouldAbort === 'function' && shouldAbort()) {
            downloadResults.push(false);
            return;
          }

          let success = false;
          for (let attempt = 1; attempt <= 3 && !success; attempt++) {
            if (typeof shouldAbort === 'function' && shouldAbort()) break;

            // Use custom download and descramble logic
            if (await this.downloadAndDescramble(pi, referer)) {
              if (fs.existsSync(pi.filePath) && fs.statSync(pi.filePath).size > 0) {
                success = true;
                const n = Atomics.add(progress, 0, 1) + 1;
                log(` [${n}/${totalPages}] ${path.basename(pi.filePath)} done`, 'info');
                report({
                  mangaTitle,
                  chapterTitle,
                  chapterUrl,
                  current: n,
                  total: totalPages,
                });
                db.markPageCompleted(dbChapterTitle, pi.index, fs.statSync(pi.filePath).size);
                if (typeof payload.onPageDownloaded === 'function') {
                  payload.onPageDownloaded(path.basename(pi.filePath), pi.index, fullChapterPageCount);
                }
              }
            }

            if (!success && attempt < 3) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          downloadResults.push(success);
          if (!success) {
            db.markPageFailed(dbChapterTitle, pi.index);
            failedPageIndices.push(pi.index);
          }

          await new Promise((r) => setTimeout(r, 150));
        })
      )
    );

    // Step 12: Check abort after download
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      db.markChapterIncomplete(dbChapterTitle);
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 13: Mark chapter status
    const allSuccess = downloadResults.length > 0 && downloadResults.every(Boolean);
    if (allSuccess) {
      db.markChapterCompleted(dbChapterTitle);
      log(`Chapter done: ${totalPages} pages.`, 'success');
    } else {
      db.markChapterIncomplete(dbChapterTitle);
      log('Chapter incomplete.', 'warn');
      cleanup_empty_chapter_dir();
    }

    return {
      ok: allSuccess,
      successCount: downloadResults.filter(Boolean).length,
      totalPages,
      failedPageIndices: allSuccess ? undefined : [...failedPageIndices].sort((a, b) => a - b),
    };
  }

  /**
   * Download and descramble image with DRM handling.
   * @param {object} pageInfo - Page information
   * @param {string} pageInfo.imageUrl - Image URL
   * @param {string} pageInfo.drmData - DRM data for descrambling
   * @param {string} pageInfo.filePath - Output file path
   * @param {string} imageReferer - Referer for CDN (mirror host)
   * @returns {Promise<boolean>} Success status
   */
  async downloadAndDescramble(pageInfo, imageReferer) {
    const { imageUrl, drmData, filePath } = pageInfo;
    const referer_header = String(imageReferer || DOMAIN).trim() || DOMAIN;
    try {
      const res = await fetch(imageUrl, {
        headers: { 
          Referer: referer_header, 
          'User-Agent': this.getUserAgent() 
        },
      });
      if (!res.ok) return false;
      
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) return false;
      
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      
      if (drmData) {
        const descrambled = decryptDrmData(drmData);
        if (descrambled && descrambled.startsWith('#mino-v1')) {
          const jpeg = await descrambleToBuffer(buf, descrambled);
          fs.writeFileSync(filePath, jpeg);
          return true;
        }
      }
      
      fs.writeFileSync(filePath, buf);
      return true;
    } catch {
      return false;
    }
  }
}

const service = new MinotruyenService();

module.exports = {
  DOMAIN,
  LABEL,
  API_BASE,
  extractBookIdFromUrl,
  extractChapterIdFromUrl,
  pagesFromChapterApi,
  resolveSiteOriginFromUrl,
  normalizeLatestListingCategory,
  buildMinotruyenBooksListingUrl,
  bookIdAsInt,
  sortBooksByBookIdDesc,
  mapMinotruyenBookToLatestRow,
  parseMinotruyenWebSearchRows,
  fetchLatestUpdates,
  load: (url) => service.load(url),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
};