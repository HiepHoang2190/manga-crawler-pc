/**
 * SuicaoDex API Client for ApiConnectorService
 * SuicaoDex uses API at wd.suicaodex.com (not api.suicaodex.com).
 */

const API_BASE = 'https://wd.suicaodex.com';
const SITE_DOMAIN = 'https://suicaodex.com/';
const CHAPTER_LIMIT = 100;
const COVER_CDN_HOST = 'https://i.suicaodex.com';
const MANGA_ID_RE = /\/manga\/([a-zA-Z0-9]+)/;
const CHAPTER_ID_RE = /\/chapter\/([a-zA-Z0-9]+)/;

const API_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'manga-downloader/1.0',
  Referer: SITE_DOMAIN,
};

function extractMangaId(urlString) {
  const url = String(urlString || '').trim();
  const m = url.match(MANGA_ID_RE);
  if (m) return m[1];
  return null;
}

function extractChapterId(urlString) {
  const url = String(urlString || '').trim();
  const m = url.match(CHAPTER_ID_RE);
  if (m) return m[1];
  return null;
}

function buildMangaPageUrl(mangaId) {
  return `${SITE_DOMAIN}manga/${mangaId}`;
}

/**
 * Chuẩn hóa URL truyện — hỗ trợ cả link chương (user thường copy từ trình đọc).
 */
async function resolveMangaUrl(urlString) {
  const url = String(urlString || '').trim();
  const mangaId = extractMangaId(url);
  if (mangaId) return buildMangaPageUrl(mangaId);

  const chapterId = extractChapterId(url);
  if (!chapterId) return null;

  const resp = await fetchJson(`${API_BASE}/chapter/${chapterId}`);
  if (!resp.ok || !resp.data) return null;

  const mangaRef = resp.data.relationships?.manga;
  const resolvedId = mangaRef && mangaRef.id ? String(mangaRef.id) : '';
  if (!resolvedId) return null;
  return buildMangaPageUrl(resolvedId);
}

function extractAuthor(relationships) {
  if (!relationships || typeof relationships !== 'object') return '';
  const authors = relationships.authors;
  if (!Array.isArray(authors) || !authors.length) return '';
  const names = authors.map((a) => (a && a.name ? String(a.name).trim() : '')).filter(Boolean);
  return names.join(', ');
}

function extractDescription(root) {
  const raw = root && root.description != null ? String(root.description) : '';
  if (!raw.trim()) return '';
  return raw.replace(/\n___\n/g, '\n\n').trim();
}

function buildMangaFromApiRoot(root, mangaUrl, mangaId, language) {
  const lang = language === 'en' ? 'en' : 'vi';
  return {
    title: extractLocalizedTitle(root, lang),
    coverUrl: extractCoverUrl(mangaId, root.relationships),
    author: extractAuthor(root.relationships),
    description: extractDescription(root),
    mangaUrl,
    mangaId,
    siteId: 'suicaodex',
    sourceLabel: 'SuicaoDex',
    mangadexLanguage: language,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  try {
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

function extractLocalizedTitle(root, language = 'vi') {
  const alt = root.alt_titles;
  if (alt && typeof alt === 'object' && alt[language]) {
    const val = alt[language];
    if (Array.isArray(val) && val.length) return String(val[0]);
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return root.title != null ? String(root.title) : '';
}

function extractCoverUrl(mangaId, relationships) {
  if (!relationships || typeof relationships !== 'object') return '';
  const cover = relationships.cover;
  if (!cover || typeof cover !== 'object') return '';
  const id = cover.id;
  const ext = cover.ext != null ? String(cover.ext) : '.jpg';
  if (!id) return '';
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `${COVER_CDN_HOST}/covers/${mangaId}/${id}${safeExt}`;
}

function extractGroupName(chapterObj) {
  const rel = chapterObj.relationships;
  if (!rel || !Array.isArray(rel.groups)) return '';
  const g = rel.groups[0];
  return g && g.name ? String(g.name) : '';
}

function buildChapterTitle(volume, chapterNumber, rawTitle, language, groupName) {
  const { formatChapterTitle } = require('../../../shared/mangaUtils');
  let s = '';
  if (chapterNumber) {
    s += `Chapter ${chapterNumber}`;
  } else {
    s += 'Oneshot';
  }
  if (rawTitle) s += ` - ${rawTitle}`;
  if (volume) s += ` (Vol ${volume})`;
  if (language) s += ` [${language}]`;
  if (groupName) s += ` {${groupName}}`;
  return formatChapterTitle(s.trim());
}

function getFileExtFromUrl(imageUrl) {
  const noQuery = String(imageUrl).split('?')[0];
  const seg = noQuery.split('/').pop() || '';
  const dot = seg.lastIndexOf('.');
  if (dot <= 0) return '';
  return seg.slice(dot + 1).toLowerCase();
}

async function fetchManga(url, language = 'vi') {
  const mangaUrl = await resolveMangaUrl(url);
  if (!mangaUrl) {
    return {
      ok: false,
      error: 'Không lấy được ID truyện từ URL (dạng .../manga/<id>/... hoặc .../chapter/<id>).',
    };
  }
  const mangaId = extractMangaId(mangaUrl);
  const apiUrl = `${API_BASE}/manga/${mangaId}`;
  const resp = await fetchJson(apiUrl);
  if (!resp.ok || !resp.data) {
    return { ok: false, error: resp.error || 'API truyện lỗi.' };
  }
  return {
    ok: true,
    manga: buildMangaFromApiRoot(resp.data, mangaUrl, mangaId, language),
  };
}

async function fetchChapters(url, language = 'vi') {
  const mangaUrl = await resolveMangaUrl(url);
  const mangaId = mangaUrl ? extractMangaId(mangaUrl) : null;
  if (!mangaId) {
    return { ok: false, error: 'Không lấy được ID truyện.', chapters: [] };
  }
  const chapters = [];
  const lang = language === 'en' ? 'en' : 'vi';
  let page = 1;
  let total = Infinity;

  while ((page - 1) * CHAPTER_LIMIT < total) {
    const apiUrl =
      `${API_BASE}/manga/${mangaId}/chapters` +
      `?page=${page}` +
      `&limit=${CHAPTER_LIMIT}` +
      `&tlang=${encodeURIComponent(lang)}` +
      '&order=desc&sort=publishedAt';

    const resp = await fetchJson(apiUrl);
    if (!resp.ok || !resp.data) break;
    const root = resp.data;
    total = typeof root.total === 'number' ? root.total : 0;
    const data = root.data;
    if (!Array.isArray(data) || data.length === 0) break;

    for (const ch of data) {
      const chapterId = ch.id;
      const chapterNumber = ch.chapter != null ? String(ch.chapter) : '';
      const volume = ch.volume != null ? String(ch.volume) : '';
      const rawTitle = ch.title != null ? String(ch.title) : '';
      const langCode = ch.language != null ? String(ch.language) : '';
      const groupName = extractGroupName(ch);
      const displayTitle = buildChapterTitle(volume, chapterNumber, rawTitle, langCode, groupName);
      const chapterUrl = `${SITE_DOMAIN}chapter/${chapterId}`;
      if (!chapters.some((c) => c.url === chapterUrl)) {
        chapters.push({ url: chapterUrl, title: displayTitle });
      }
    }

    if (page * CHAPTER_LIMIT >= total) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 220));
  }

  return { ok: true, chapters };
}

/**
 * SuicaoDex API Client
 * Implements the interface required by ApiConnectorService
 */
class SuicaoDexApiClient {
  constructor() {
    this.defaultLanguage = 'vi';
  }

  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const language = options.mangadexLanguage || options.language || this.defaultLanguage;

    const m = await fetchManga(trimmed, language);
    if (!m.ok) return m;
    const ch = await fetchChapters(trimmed, language);
    return {
      ok: true,
      manga: m.manga,
      chapters: ch.chapters || [],
    };
  }

  async fetchChapterImages(chapterUrl) {
    const chapterId = extractChapterId(chapterUrl);
    if (!chapterId) {
      throw new Error('Không lấy được chapter ID từ URL.');
    }

    const chapterApiUrl = `${API_BASE}/chapter/${chapterId}`;
    const chResp = await fetchJson(chapterApiUrl);
    if (!chResp.ok || !chResp.data) {
      throw new Error(`Chapter API lỗi: ${chResp.error || 'unknown'}`);
    }

    const chData = chResp.data;
    const node = chData.node ? String(chData.node).replace(/\/+$/, '') : '';
    const cid = chData.id || chapterId;
    let pages = chData.data;
    if (!Array.isArray(pages) || pages.length === 0) {
      pages = chData.data_optimized;
    }
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new Error('Không có danh sách ảnh.');
    }

    if (!node) {
      throw new Error('Thiếu node CDN trong phản hồi chapter.');
    }

    return pages.map((page) => {
      const name = page && page.name ? String(page.name) : '';
      const imageUrl = `${node}/data/${cid}/${name}`;
      const ext = getFileExtFromUrl(imageUrl) || 'jpg';
      return { imageUrl, ext };
    });
  }
}

module.exports = {
  SuicaoDexApiClient,
  API_BASE,
  SITE_DOMAIN,
  extractMangaId,
  extractChapterId,
  resolveMangaUrl,
  fetchManga,
  fetchChapters,
};
