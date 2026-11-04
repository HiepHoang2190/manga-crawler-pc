/**
 * MangaPlus API Client for ApiConnectorService
 * Official Shueisha API with XOR image encryption (protobuf wire format).
 */

const crypto = require('crypto');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const {
  decodeMangaPlusResponse,
  formatMangaPlusApiError,
} = require('./mangaPlusProtobuf');

const API_BASE = 'https://jumpg-webapi.tokyo-cdn.com/api';
const SITE_DOMAIN = 'https://mangaplus.shueisha.co.jp/';
const TITLE_ID_RE = /\/titles\/(\d+)/;
const VIEWER_ID_RE = /\/viewer\/(\d+)/;

function sessionToken() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function extractTitleId(urlString) {
  const url = String(urlString || '').trim();
  const m = url.match(TITLE_ID_RE);
  if (m) return m[1];
  const sanitized = url.split('?')[0].replace(/\/+$/, '');
  const parts = sanitized.split('/');
  const last = parts[parts.length - 1] || '';
  return /^\d+$/.test(last) ? last : null;
}

function extractChapterId(urlString) {
  const url = String(urlString || '').trim();
  const m = url.match(VIEWER_ID_RE);
  if (m) return m[1];
  const sanitized = url.split('?')[0].replace(/\/+$/, '');
  const parts = sanitized.split('/');
  const last = parts[parts.length - 1] || '';
  return /^\d+$/.test(last) ? last : null;
}

function getJsonString(obj, key) {
  if (!obj || obj[key] == null) return '';
  const v = obj[key];
  return typeof v === 'string' ? v : String(v);
}

/**
 * Fetch MangaPlus API as protobuf (do not append format=json — nginx returns 403).
 * @param {string} apiUrl
 * @param {string} sess
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
async function fetchApiProtobuf(apiUrl, sess) {
  const res = await fetch(apiUrl, {
    headers: {
      Origin: SITE_DOMAIN.replace(/\/+$/, ''),
      Referer: SITE_DOMAIN,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Session-Token': sess,
      Accept: '*/*',
    },
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  try {
    const buffer = Buffer.from(await res.arrayBuffer());
    const data = decodeMangaPlusResponse(buffer);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Invalid protobuf: ${err?.message || err}` };
  }
}

function buildChapterTitle(name, subTitle) {
  let s = '';
  if (name) s += name;
  if (subTitle) {
    if (s) s += ' - ';
    s += subTitle;
  }
  if (!s) s = 'Chapter';
  return formatChapterTitle(s.trim());
}

function collectChaptersFromList(chapterArray, chapters, seen) {
  if (!Array.isArray(chapterArray)) return;
  for (const chapterObj of chapterArray) {
    const subTitle = getJsonString(chapterObj, 'subTitle');
    if (!subTitle) continue;
    const chapterId = chapterObj.chapterId != null ? Number(chapterObj.chapterId) : 0;
    if (!chapterId) continue;
    const name = getJsonString(chapterObj, 'name');
    const displayTitle = buildChapterTitle(name, subTitle);
    const chapterUrl = `${SITE_DOMAIN}viewer/${chapterId}`;
    if (!seen.has(chapterUrl)) {
      seen.add(chapterUrl);
      chapters.push({ url: chapterUrl, title: displayTitle });
    }
  }
}

async function fetchManga(url) {
  const titleId = extractTitleId(url);
  if (!titleId) {
    return { ok: false, error: 'Không lấy được title_id từ URL.' };
  }
  const sess = sessionToken();
  const apiUrl = `${API_BASE}/title_detailV3?title_id=${titleId}`;
  const resp = await fetchApiProtobuf(apiUrl, sess);
  if (!resp.ok || !resp.data) {
    return { ok: false, error: resp.error || 'API lỗi.' };
  }
  const success = resp.data.success;
  if (!success) {
    return { ok: false, error: formatMangaPlusApiError(resp.data.error) };
  }
  const titleDetailView = success.titleDetailView;
  if (!titleDetailView) return { ok: false, error: 'Không có titleDetailView.' };
  const titleObj = titleDetailView.title || {};
  const name = getJsonString(titleObj, 'name');
  const coverUrl = getJsonString(titleObj, 'portraitImageUrl');
  const author = getJsonString(titleObj, 'author').trim();
  // overview lives on titleDetailView, not title (see title_detailV3 API)
  const description = getJsonString(titleDetailView, 'overview').trim();
  const manga = {
    title: name,
    coverUrl,
    mangaUrl: url,
    mangaId: titleId,
    siteId: 'mangaplus',
    sourceLabel: 'MangaPlus',
  };
  if (author) manga.author = author;
  if (description) manga.description = description;
  return {
    ok: true,
    manga,
  };
}

async function fetchChapters(url) {
  const titleId = extractTitleId(url);
  if (!titleId) {
    return { ok: false, error: 'Không lấy được title_id.', chapters: [] };
  }
  const sess = sessionToken();
  const apiUrl = `${API_BASE}/title_detailV3?title_id=${titleId}`;
  const resp = await fetchApiProtobuf(apiUrl, sess);
  if (!resp.ok || !resp.data) {
    return { ok: false, error: resp.error || 'API lỗi.', chapters: [] };
  }
  const success = resp.data.success;
  if (!success) return { ok: true, chapters: [] };
  const titleDetailView = success.titleDetailView;
  if (!titleDetailView) return { ok: true, chapters: [] };

  const chapters = [];
  const seen = new Set();
  const chapterListGroup = titleDetailView.chapterListGroup;
  if (Array.isArray(chapterListGroup)) {
    for (const group of chapterListGroup) {
      collectChaptersFromList(group.firstChapterList, chapters, seen);
      collectChaptersFromList(group.midChapterList, chapters, seen);
      collectChaptersFromList(group.lastChapterList, chapters, seen);
    }
  }
  if (chapters.length === 0) {
    collectChaptersFromList(titleDetailView.firstChapterList, chapters, seen);
    collectChaptersFromList(titleDetailView.lastChapterList, chapters, seen);
  }
  return { ok: true, chapters };
}

/**
 * MangaPlus API Client
 * Implements the interface required by ApiConnectorService
 */
class MangaPlusApiClient {
  /**
   * Load manga information and chapters
   * @param {string} url - Manga URL
   * @param {object} options - Options (unused for MangaPlus)
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const m = await fetchManga(trimmed);
    if (!m.ok) return m;
    const ch = await fetchChapters(trimmed);
    return {
      ok: true,
      manga: m.manga,
      chapters: ch.chapters || [],
    };
  }

  /**
   * Fetch chapter images with encryption keys
   * Returns images with encryptionKey property for XOR decryption
   * @param {string} chapterUrl - Chapter URL
   * @returns {Promise<Array<{imageUrl: string, ext: string, encryptionKey: string}>>}
   */
  async fetchChapterImages(chapterUrl) {
    const chapterId = extractChapterId(chapterUrl);
    if (!chapterId) {
      throw new Error('Không lấy được chapter ID từ URL.');
    }

    const sess = sessionToken();
    const apiUrl = `${API_BASE}/manga_viewer?chapter_id=${chapterId}&split=no&img_quality=super_high`;
    const resp = await fetchApiProtobuf(apiUrl, sess);
    if (!resp.ok || !resp.data) {
      throw new Error(`manga_viewer lỗi: ${resp.error || 'unknown'}`);
    }

    const success = resp.data.success;
    if (!success || !success.mangaViewer) {
      throw new Error(formatMangaPlusApiError(resp.data.error) || 'Không có mangaViewer trong protobuf.');
    }

    const pages = success.mangaViewer.pages;
    if (!Array.isArray(pages) || !pages.length) {
      throw new Error('Không có trang ảnh.');
    }

    const mangaPages = [];
    for (const pageEl of pages) {
      const pageObj = pageEl.mangaPage;
      if (!pageObj) continue;
      const type = getJsonString(pageEl, 'type');
      if (type && type !== 'main') continue;
      const imageUrl = getJsonString(pageObj, 'imageUrl');
      const encryptionKey = getJsonString(pageObj, 'encryptionKey');
      if (!imageUrl) continue;
      mangaPages.push({
        imageUrl,
        ext: 'jpg',
        encryptionKey, // Pass encryption key for decryption
        sessionToken: sess, // Pass session token for download
      });
    }

    if (!mangaPages.length) {
      throw new Error('Không có ảnh main.');
    }

    return mangaPages;
  }
}

module.exports = {
  MangaPlusApiClient,
  API_BASE,
  SITE_DOMAIN,
  extractTitleId,
  extractChapterId,
  sessionToken,
  fetchManga,
  fetchChapters,
  fetchApiProtobuf,
};
