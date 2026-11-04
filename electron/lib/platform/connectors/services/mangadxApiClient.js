/**
 * MangaDex API Client for ApiConnectorService
 * Extracted from mangadexService.js to separate API logic from download logic
 */

const API_BASE = 'https://api.mangadex.org';
const SITE_DOMAIN = 'https://mangadex.org/';
const FEED_LIMIT = 100;
const MANGA_ID_RE = /\/title\/([0-9a-fA-F-]{36})/;
const CHAPTER_ID_RE = /\/chapter\/([0-9a-fA-F-]{36})/;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function extractMangaId(urlString) {
  const url = String(urlString || '').trim();
  const m = url.match(MANGA_ID_RE);
  if (m) return m[1];
  const sanitized = url.split('?')[0].replace(/\/+$/, '');
  const parts = sanitized.split('/');
  const last = parts[parts.length - 1] || '';
  return UUID_RE.test(last) ? last : null;
}

function extractChapterId(urlString) {
  const url = String(urlString || '').trim();
  const m = url.match(CHAPTER_ID_RE);
  if (m) return m[1];
  const sanitized = url.split('?')[0].replace(/\/+$/, '');
  const parts = sanitized.split('/');
  const last = parts[parts.length - 1] || '';
  return UUID_RE.test(last) ? last : null;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // No User-Agent - let Node.js set default or none
    },
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  try {
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

function extractTitle(attributes) {
  if (!attributes) return '';
  const titleObj = attributes.title;
  if (titleObj && typeof titleObj === 'object') {
    if (titleObj.en) return String(titleObj.en);
    if (titleObj['ja-ro']) return String(titleObj['ja-ro']);
    const keys = Object.keys(titleObj);
    if (keys.length) return String(titleObj[keys[0]]);
  }
  const alt = attributes.altTitles;
  if (Array.isArray(alt)) {
    for (const altObj of alt) {
      if (altObj && altObj.en) return String(altObj.en);
    }
    if (alt[0] && typeof alt[0] === 'object') {
      const k = Object.keys(alt[0])[0];
      if (k) return String(alt[0][k]);
    }
  }
  return '';
}

function extractCoverUrl(data) {
  const mangaId = data.id;
  const rels = data.relationships;
  if (!Array.isArray(rels)) return '';
  for (const rel of rels) {
    if (rel.type === 'cover_art' && rel.attributes && rel.attributes.fileName) {
      const fn = rel.attributes.fileName;
      // Use uploads.mangadex.org CDN — not DNS-blocked by Vietnamese ISPs
      return `https://uploads.mangadex.org/covers/${mangaId}/${fn}.512.jpg`;
    }
  }
  return '';
}

/**
 * Fetch all available covers for a manga
 * @param {string} mangaId - Manga UUID
 * @returns {Promise<{ok: boolean, covers?: array, error?: string}>}
 */
async function fetchMangaCovers(mangaId) {
  if (!mangaId || !UUID_RE.test(mangaId)) {
    return { ok: false, error: 'Manga ID không hợp lệ.' };
  }

  const apiUrl = `${API_BASE}/cover?manga[]=${encodeURIComponent(mangaId)}&limit=100&order[volume]=asc`;
  const resp = await fetchJson(apiUrl);
  
  if (!resp.ok || !resp.data) {
    return { ok: false, error: resp.error || 'Lỗi khi lấy danh sách cover.' };
  }

  const data = resp.data.data;
  if (!Array.isArray(data)) {
    return { ok: false, error: 'Dữ liệu cover không hợp lệ.' };
  }

  const covers = data.map(coverEntity => {
    const id = coverEntity.id;
    const attributes = coverEntity.attributes || {};
    const fileName = attributes.fileName;
    const volume = attributes.volume;
    const description = attributes.description;
    
    if (!fileName) return null;
    
    return {
      id,
      fileName,
      volume: volume || null,
      description: description || '',
      url256: `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`,
      url512: `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`,
      urlOriginal: `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`,
    };
  }).filter(Boolean);

  return { ok: true, covers };
}

function extractDescription(attributes, language) {
  const d = attributes && attributes.description;
  if (!d || typeof d !== 'object') return '';
  const lang = String(language || 'vi').toLowerCase();
  const text = String(d[lang] || d.en || d[Object.keys(d)[0]] || '').trim();
  return text.slice(0, 1000);
}

/** Public listing ratings (excludes pornographic) — aligns with mangadex.org. */
function buildMangaDexContentRatingQuery() {
  return ['safe', 'suggestive', 'erotica']
    .map((r) => `contentRating[]=${encodeURIComponent(r)}`)
    .join('&');
}

const CHAPTER_SCAN_BATCH_SIZE = 100;
const MAX_CHAPTER_SCAN_PER_PAGE = 2500;

async function fetchMangaDexListingJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // No User-Agent or Referer - MangaDex blocks custom User-Agents
    },
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  try {
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

/** Align with connector `load` language options — default vi. */
function normalizeMangadexListLanguage(raw) {
  const s = String(raw || 'vi').toLowerCase();
  if (s === 'en' || s === 'ja') return s;
  return 'vi';
}

/**
 * Display title for Latest updates rows; prefers [preferredLanguage] then en / ja-ro.
 *
 * @param {object} attributes  manga.attributes from API
 * @param {string} [preferredLanguage]
 */
function extractMangadexListingTitle(attributes, preferredLanguage) {
  if (!attributes || typeof attributes !== 'object') return '';
  const preferred = normalizeMangadexListLanguage(preferredLanguage);

  function fromMap(titleMap) {
    if (!titleMap || typeof titleMap !== 'object') return '';
    const primary = titleMap[preferred];
    if (primary != null && String(primary).trim() !== '') return String(primary).trim();
    if (titleMap.en != null && String(titleMap.en).trim() !== '') return String(titleMap.en).trim();
    if (titleMap['ja-ro'] != null && String(titleMap['ja-ro']).trim() !== '') {
      return String(titleMap['ja-ro']).trim();
    }
    for (const value of Object.values(titleMap)) {
      const v = String(value ?? '').trim();
      if (v) return v;
    }
    return '';
  }

  const alt = attributes.altTitles;
  if (Array.isArray(alt)) {
    for (const entry of alt) {
      if (!entry || typeof entry !== 'object') continue;
      const primary = entry[preferred];
      if (primary != null && String(primary).trim() !== '') return String(primary).trim();
    }
  }

  const titleFromMain = fromMap(attributes.title);
  if (titleFromMain) return titleFromMain;

  if (Array.isArray(alt)) {
    for (const entry of alt) {
      const t = fromMap(entry);
      if (t) return t;
    }
  }
  return '';
}

/**
 * Subtitle for Latest updates row (last chapter or upload date).
 *
 * @param {object} attributes  manga.attributes from API
 */
function mangaDexListingLatestLabel(attributes) {
  if (!attributes || typeof attributes !== 'object') return '';
  const lc = attributes.lastChapter;
  if (lc != null && String(lc).trim() !== '') {
    const lv = attributes.lastVolume;
    if (lv != null && String(lv).trim() !== '') {
      return `Ch. ${lc} · Vol ${lv}`;
    }
    return `Ch. ${lc}`;
  }
  const up = attributes.updatedAt;
  if (up && typeof up === 'string') return `Updated ${up.slice(0, 10)}`;
  return '';
}

/**
 * Subtitle from chapter entity attributes (readableAt ordering feed).
 *
 * @param {object} chapterAttributes  chapter.attributes from API
 */
function mangaDexChapterListingLabel(chapterAttributes) {
  if (!chapterAttributes || typeof chapterAttributes !== 'object') return '';
  const ch = chapterAttributes.chapter;
  const vol = chapterAttributes.volume;
  if (ch != null && String(ch).trim() !== '') {
    if (vol != null && String(vol).trim() !== '') {
      return `Ch. ${ch} · Vol ${vol}`;
    }
    return `Ch. ${ch}`;
  }
  const readableAt = chapterAttributes.readableAt;
  if (readableAt && typeof readableAt === 'string') return `Updated ${readableAt.slice(0, 10)}`;
  return '';
}

function mangaIdFromChapterEntity(chapterEntity) {
  const rels = chapterEntity && chapterEntity.relationships;
  if (!Array.isArray(rels)) return null;
  for (const rel of rels) {
    if (rel && rel.type === 'manga' && rel.id) {
      const id = String(rel.id).trim();
      if (id) return id;
    }
  }
  return null;
}

/**
 * One manga entity from GET /manga collection → Latest updates row.
 *
 * @param {object} mangaEntity  { id, type, attributes, relationships }
 * @param {object} [options]
 * @param {string} [options.preferredLanguage]
 * @param {string} [options.latestChapterLabel]
 */
function mapMangaDexListingEntity(mangaEntity, options = {}) {
  const id = mangaEntity && mangaEntity.id;
  if (!id) return null;
  const attributes = mangaEntity.attributes || {};
  const preferredLanguage = options.preferredLanguage;
  const title =
    preferredLanguage != null && String(preferredLanguage).trim() !== ''
      ? extractMangadexListingTitle(attributes, preferredLanguage)
      : extractTitle(attributes);
  const origin = String(SITE_DOMAIN || '').replace(/\/+$/, '');
  const mangaUrl = `${origin}/title/${id}`;
  return {
    title: title || mangaUrl,
    mangaUrl,
    coverUrl: extractCoverUrl(mangaEntity) || '',
    latestChapterLabel:
      options.latestChapterLabel != null && String(options.latestChapterLabel).trim() !== ''
        ? options.latestChapterLabel
        : mangaDexListingLatestLabel(attributes),
  };
}

async function fetchMangaDexMangaListQuery(apiUrl, { preferredLanguage } = {}) {
  const resp = await fetchMangaDexListingJson(apiUrl);
  if (!resp.ok || !resp.data) {
    return { ok: false, error: resp.error || 'MangaDex API lỗi.', items: [], total: 0 };
  }
  const body = resp.data;
  const arr = Array.isArray(body.data) ? body.data : [];
  const total = typeof body.total === 'number' ? body.total : arr.length;
  const items = [];
  for (const ent of arr) {
    const row = mapMangaDexListingEntity(ent, { preferredLanguage });
    if (row) items.push(row);
  }
  return { ok: true, items, total };
}

/**
 * Latest feed by translatedLanguage chapter uploads (readableAt), deduped per manga.
 * Matches mangadex.org/titles/latest when a chapter language is selected.
 */
async function fetchLatestByTranslatedChapters({ page, limit, language }) {
  const mangaSkip = (page - 1) * limit;
  const mangaTake = limit;
  const langEnc = encodeURIComponent(language);

  const orderedMangaIds = [];
  const chapterLabels = new Map();
  const seenManga = new Set();
  let chapterOffset = 0;
  let chapterTotal = 0;
  let done = false;

  while (
    !done &&
    orderedMangaIds.length < mangaSkip + mangaTake &&
    chapterOffset < MAX_CHAPTER_SCAN_PER_PAGE
  ) {
    // Build query string manually - MangaDex API rejects URL-encoded brackets
    const apiUrl =
      `${API_BASE}/chapter?limit=${CHAPTER_SCAN_BATCH_SIZE}&offset=${chapterOffset}` +
      `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica` +
      `&translatedLanguage[]=${langEnc}` +
      `&order[readableAt]=desc`;
    const resp = await fetchMangaDexListingJson(apiUrl);
    if (!resp.ok || !resp.data) {
      return { ok: false, error: resp.error || 'MangaDex API lỗi.' };
    }
    const body = resp.data;
    const chapters = Array.isArray(body.data) ? body.data : [];
    if (typeof body.total === 'number') {
      chapterTotal = body.total;
    }

    if (chapters.length === 0) {
      done = true;
      break;
    }

    for (const ent of chapters) {
      const mangaId = mangaIdFromChapterEntity(ent);
      if (!mangaId || seenManga.has(mangaId)) continue;
      seenManga.add(mangaId);
      const chAttrs = ent && ent.attributes;
      if (chAttrs && typeof chAttrs === 'object') {
        chapterLabels.set(mangaId, mangaDexChapterListingLabel(chAttrs));
      }
      orderedMangaIds.push(mangaId);
      if (orderedMangaIds.length >= mangaSkip + mangaTake) {
        done = true;
        break;
      }
    }

    chapterOffset += CHAPTER_SCAN_BATCH_SIZE;
    if (chapters.length < CHAPTER_SCAN_BATCH_SIZE) done = true;
  }

  const pageIds = orderedMangaIds.slice(mangaSkip, mangaSkip + mangaTake);
  if (pageIds.length === 0) {
    const totalPages = chapterTotal > 0 ? Math.max(1, Math.ceil(chapterTotal / limit)) : 1;
    return { ok: true, items: [], totalPages, page };
  }

  // Build query string manually - MangaDex API rejects URL-encoded brackets
  const idsQuery = pageIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
  const mangaUrl = `${API_BASE}/manga?${idsQuery}&limit=${pageIds.length}&includes[]=cover_art`;
  const mangaResp = await fetchMangaDexListingJson(mangaUrl);
  if (!mangaResp.ok || !mangaResp.data) {
    return { ok: false, error: mangaResp.error || 'MangaDex API lỗi.' };
  }

  const mangaById = new Map();
  const mangaArr = Array.isArray(mangaResp.data.data) ? mangaResp.data.data : [];
  for (const ent of mangaArr) {
    if (ent && ent.id) mangaById.set(ent.id, ent);
  }

  const items = [];
  for (const id of pageIds) {
    const ent = mangaById.get(id);
    if (!ent) continue;
    const row = mapMangaDexListingEntity(ent, {
      preferredLanguage: language,
      latestChapterLabel: chapterLabels.get(id) || '',
    });
    if (row) items.push(row);
  }

  const totalPages = chapterTotal > 0 ? Math.max(1, Math.ceil(chapterTotal / limit)) : 1;
  return { ok: true, items, totalPages, page };
}

const LATEST_UPDATES_PAGE_LIMIT = 30;

/**
 * Latest / search listing for tab «Mới cập nhật» (public api.mangadex.org).
 * Latest feed uses chapter readableAt per translatedLanguage (matches mangadex.org).
 *
 * @param {object} [options]
 * @param {number} [options.page]  1-based when not searching
 * @param {string} [options.latestUpdatesSearch]  non-empty → title search
 * @param {string} [options.mangadexLanguage]  translated chapter language (default vi)
 */
async function fetchMangaDexLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  const listLang = normalizeMangadexListLanguage(options.mangadexLanguage ?? options.language);
  const limitCap = 100;
  const limitRaw = Number(options.mangadexListLimit ?? options.searchLimit);
  const limit = Math.min(
    limitCap,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : LATEST_UPDATES_PAGE_LIMIT,
    ),
  );
  const page = Math.max(1, Math.floor(Number(options.page) || 1));

  if (searchQuery) {
    // Build query string manually - MangaDex API rejects URL-encoded brackets
    const apiUrl =
      `${API_BASE}/manga?title=${encodeURIComponent(searchQuery)}` +
      `&limit=${limit}` +
      `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica` +
      `&availableTranslatedLanguage[]=${encodeURIComponent(listLang)}` +
      `&includes[]=cover_art` +
      `&order[followedCount]=desc&order[relevance]=desc`;
    const r = await fetchMangaDexMangaListQuery(apiUrl, { preferredLanguage: listLang });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      siteId: 'mangadex',
      page: 1,
      totalPages: 1,
      items: r.items,
    };
  }

  const r = await fetchLatestByTranslatedChapters({ page, limit, language: listLang });
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    siteId: 'mangadex',
    page: r.page,
    totalPages: r.totalPages,
    items: r.items,
  };
}

function getJsonString(obj, key) {
  if (!obj || obj[key] == null) return '';
  const v = obj[key];
  return typeof v === 'string' ? v : String(v);
}

function extractGroupName(chapterObj) {
  const rels = chapterObj.relationships;
  if (!Array.isArray(rels)) return '';
  for (const rel of rels) {
    if (rel.type === 'scanlation_group' && rel.attributes && rel.attributes.name) {
      return String(rel.attributes.name);
    }
  }
  return '';
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
  const mangaId = extractMangaId(url);
  if (!mangaId) {
    return { ok: false, error: 'Không lấy được ID truyện từ URL (dạng .../title/<uuid>).' };
  }
  // Build query string manually - MangaDex API rejects URL-encoded brackets
  const apiUrl = `${API_BASE}/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
  const resp = await fetchJson(apiUrl);
  if (!resp.ok || !resp.data) {
    return { ok: false, error: resp.error || 'API truyện lỗi.' };
  }
  const data = resp.data.data;
  if (!data) return { ok: false, error: 'Không có data truyện.' };
  const attributes = data.attributes || {};
  const title = extractTitle(attributes);
  const coverUrl = extractCoverUrl(data);
  const description = extractDescription(attributes, language);
  return {
    ok: true,
    manga: {
      title,
      coverUrl,
      description,
      mangaUrl: url,
      mangaId,
      siteId: 'mangadex',
      sourceLabel: 'MangaDex',
      mangadexLanguage: language,
    },
  };
}

async function fetchChapters(url, language = 'vi') {
  const mangaId = extractMangaId(url);
  if (!mangaId) {
    return { ok: false, error: 'Không lấy được ID truyện.', chapters: [] };
  }
  const chapters = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    // Build query string manually - MangaDex API rejects URL-encoded brackets
    const apiUrl =
      `${API_BASE}/manga/${mangaId}/feed` +
      `?offset=${offset}` +
      `&translatedLanguage[]=${encodeURIComponent(language)}` +
      `&includes[]=scanlation_group&includes[]=user` +
      `&order[volume]=desc&order[chapter]=desc` +
      `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic` +
      `&limit=${FEED_LIMIT}`;

    const resp = await fetchJson(apiUrl);
    if (!resp.ok || !resp.data) break;
    const root = resp.data;
    total = typeof root.total === 'number' ? root.total : 0;
    const data = root.data;
    if (!Array.isArray(data) || data.length === 0) break;

    for (const obj of data) {
      const chapterId = obj.id;
      const attributes = obj.attributes || {};
      const chapterNumber = getJsonString(attributes, 'chapter');
      const volume = getJsonString(attributes, 'volume');
      const rawTitle = getJsonString(attributes, 'title');
      const translatedLanguage = getJsonString(attributes, 'translatedLanguage');
      const groupName = extractGroupName(obj);
      const displayTitle = buildChapterTitle(
        volume,
        chapterNumber,
        rawTitle,
        translatedLanguage,
        groupName
      );
      const chapterUrl = `${SITE_DOMAIN}chapter/${chapterId}`;
      if (!chapters.some((c) => c.url === chapterUrl)) {
        chapters.push({ url: chapterUrl, title: displayTitle });
      }
    }
    offset += data.length;
    if (offset >= total) break;
  }

  return { ok: true, chapters };
}

/**
 * MangaDex API Client
 * Implements the interface required by ApiConnectorService
 */
class MangaDexApiClient {
  constructor() {
    this.defaultLanguage = 'vi';
  }

  /**
   * Load manga information and chapters
   * @param {string} url - Manga URL
   * @param {object} options - Options including language
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    
    // Extract language from options (supports connector wrapper language selection)
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

  /**
   * Fetch chapter images using at-home API
   * @param {string} chapterUrl - Chapter URL
   * @returns {Promise<Array<{imageUrl: string, ext: string}>>}
   */
  async fetchChapterImages(chapterUrl) {
    const chapterId = extractChapterId(chapterUrl);
    if (!chapterId) {
      throw new Error('Không lấy được chapter ID từ URL.');
    }

    const atHomeUrl = `${API_BASE}/at-home/server/${chapterId}?forcePort443=false`;
    const atResp = await fetchJson(atHomeUrl);
    if (!atResp.ok || !atResp.data) {
      throw new Error(`At-home API lỗi: ${atResp.error || 'unknown'}`);
    }
    
    const root = atResp.data;
    const chapter = root.chapter;
    const baseUrl = root.baseUrl;
    if (!chapter || !baseUrl || !chapter.hash) {
      throw new Error('Phản hồi at-home không hợp lệ.');
    }

    let dataArray = chapter.data;
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      dataArray = chapter.dataSaver;
    }
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      throw new Error('Không có danh sách ảnh.');
    }

    const hash = chapter.hash;
    
    return dataArray.map((fileName) => {
      const imageUrl = `${baseUrl}/data/${hash}/${fileName}`;
      const ext = getFileExtFromUrl(imageUrl) || 'jpg';
      return { imageUrl, ext };
    });
  }
}

module.exports = {
  MangaDexApiClient,
  API_BASE,
  SITE_DOMAIN,
  extractMangaId,
  extractChapterId,
  fetchManga,
  fetchChapters,
  fetchMangaCovers,
  fetchMangaDexLatestUpdates,
  fetchLatestByTranslatedChapters,
  mapMangaDexListingEntity,
  extractMangadexListingTitle,
  mangaDexListingLatestLabel,
  mangaDexChapterListingLabel,
  mangaIdFromChapterEntity,
  normalizeMangadexListLanguage,
};