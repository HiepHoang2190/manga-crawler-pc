/**
 * CuuTruyen service using ApiConnectorService base class.
 * Wraps cuuTruyenClient functions into the expected interface for ApiConnectorService.
 */
const { ApiConnectorService } = require('../base/ApiConnectorService');
const {
  extractMangaId,
  extractChapterId,
  fetchCuuTruyenApi,
  getCuuTruyenOriginFromUrl,
  shouldParallelCuuTruyenLoad,
  downloadAndDescramble,
  rewriteCuuTruyenImageUrl,
} = require('../api-clients/cuuTruyenClient');

const DOMAIN = 'https://cuutruyen.net/';
const LABEL = 'Cứu Truyện';

const VPN_HINT =
  ' Vui lòng bật VPN hoặc 1.1.1.1 (Warp) nếu bạn đang ở Việt Nam vì trang này có thể chặn IP VN.';

function formatCuuTruyenApiError(resp, shortLabel) {
  if (resp && resp.failureHint) {
    return `API ${shortLabel}: ${resp.failureHint}${VPN_HINT}`;
  }
  return `API không trả dữ liệu ${shortLabel}.${VPN_HINT}`;
}

/** Ưu tiên mirror có API `/mangas/recently_updated` (đúng theo đường dẫn user cung cấp). */
const LATEST_UPDATES_CONTEXT_URL = 'https://cuutruyen.net/';
const DEFAULT_LATEST_PER_PAGE = 30;
/** API đôi khi trả last_page thấp; cho phép lật tối thiểu số trang này trong UI. */
const CUUTRUYEN_LATEST_UPDATES_MIN_TOTAL_PAGES = 5;

function extractRecentlyUpdatedList(root) {
  if (!root || typeof root !== 'object') return [];
  const d = root.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object' && Array.isArray(d.data)) return d.data;
  if (Array.isArray(root.mangas)) return root.mangas;
  return [];
}

function deriveRecentlyUpdatedTotalPages(root, page, perPage, itemCount) {
  const meta =
    root && typeof root === 'object' ? (root.meta ?? root.pagination ?? {}) : {};
  const pagination = typeof meta.pagination === 'object' ? meta.pagination : meta;
  const buckets = [
    pagination.last_page,
    pagination.total_pages,
    pagination.lastPage,
    pagination.totalPages,
    meta.last_page,
    meta.total_pages,
    root.total_pages,
  ];
  for (const c of buckets) {
    const n = typeof c === 'string' ? parseInt(c, 10) : Number(c);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  const total = pagination.total ?? meta.total ?? root.total;
  const tNum = typeof total === 'string' ? parseInt(total, 10) : Number(total);
  if (Number.isFinite(tNum) && tNum >= 0 && perPage > 0) {
    const tp = Math.ceil(tNum / perPage);
    return Math.max(1, tp);
  }
  if (itemCount < perPage) return Math.max(1, page);
  return page + 1;
}

function resolveCoverOriginStyle(u, originBase) {
  const base = String(originBase || '').replace(/\/+$/, '');
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${base}${s}`;
  return s;
}

function unwrapCuutruyenMangaData(root) {
  if (!root || typeof root !== 'object') return null;
  const d = root.data;
  if (!d || typeof d !== 'object') return null;
  if (d.manga && typeof d.manga === 'object') return d.manga;
  return d;
}

/** Build manga metadata from API `mangas/{id}` JSON (unit-testable). */
function buildCuuTruyenMangaFromApiRoot(root, url) {
  const data = unwrapCuutruyenMangaData(root);
  if (!data) return null;
  const origin = getCuuTruyenOriginFromUrl(url);
  const title = String(data.name || data.title || '').trim();
  const rawCover = String(
    data.cover_url ?? data.cover ?? data.coverUrl ?? data.thumbnail ?? '',
  ).trim();
  const coverUrl = rewriteCuuTruyenImageUrl(resolveCoverOriginStyle(rawCover, origin));
  const rawDesc = String(data.description ?? data.summary ?? data.desc ?? '').trim();
  const description = rawDesc.length > 1000 ? rawDesc.slice(0, 1000) : rawDesc;
  const mangaId = extractMangaId(url);
  return {
    title,
    coverUrl,
    description,
    mangaUrl: url,
    mangaId,
    siteId: 'cuutruyen',
    sourceLabel: LABEL,
  };
}

function formatRecentlyUpdatedChapterLabel(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const nested =
    entry.latest_chapter ??
    entry.latestChapter ??
    entry.new_chapter ??
    entry.newest_chapter ??
    null;
  if (nested && typeof nested === 'object') {
    const num = nested.number ?? nested.chapter_number ?? nested.chapterNumber;
    const name = nested.name ?? nested.title ?? nested.chapter_title ?? nested.chapterTitle ?? '';
    if (num != null && `${num}`.trim() !== '') {
      const nm = name ? `${String(name).trim()}` : '';
      return nm ? `Ch. ${num} · ${nm}` : `Ch. ${num}`;
    }
  }
  const flat =
    entry.latest_chapter_number ??
    entry.newest_chapter_number ??
    entry.latestChapterNumber ??
    entry.chapter_number ??
    entry.chapterNumber;
  if (flat != null && `${flat}`.trim() !== '') return `Ch. ${flat}`;
  return '';
}

function recentlyUpdatedRow(entry, originBase) {
  const base = String(originBase || 'https://cuutruyen.net').replace(/\/+$/, '');
  const rawId = entry?.id ?? entry?.manga_id ?? entry?.mangaId ?? null;
  const hrefRaw = entry?.href ?? entry?.url ?? entry?.manga_url ?? entry?.slug_url ?? '';

  let mangaUrl = '';
  if (rawId != null && `${rawId}`.trim() !== '') mangaUrl = `${base}/mangas/${rawId}`;
  else if (hrefRaw && /^https?:\/\//i.test(String(hrefRaw))) mangaUrl = String(hrefRaw).trim();
  else if (hrefRaw && String(hrefRaw).trim().startsWith('/')) mangaUrl = `${base}${String(hrefRaw).trim()}`;

  const title =
    (entry?.name != null && `${entry.name}`.trim() !== '' && `${entry.name}`.trim()) ||
    (entry?.title != null && `${entry.title}`.trim() !== '' && `${entry.title}`.trim()) ||
    mangaUrl ||
    '—';

  const rawCover =
    entry?.cover_url != null && `${entry.cover_url}`.trim() !== ''
      ? entry.cover_url
      : entry?.cover ??
        entry?.coverUrl ??
        entry?.thumbnail ??
        entry?.poster ??
        '';

  const coverUrl = rewriteCuuTruyenImageUrl(resolveCoverOriginStyle(rawCover, base));
  const latestChapterLabel = formatRecentlyUpdatedChapterLabel(entry);

  return {
    title,
    mangaUrl,
    coverUrl,
    latestChapterLabel,
  };
}

/**
 * Chuẩn hóa JSON API `mangas/recently_updated` cho UI Mới cập nhật (test được).
 *
 * @param {object} root
 * @param {string} originBase
 * @param {number} page
 * @param {number} perPage
 */
function parseRecentlyUpdatedResponse(root, originBase, page, perPage) {
  const rows = [];
  const list = extractRecentlyUpdatedList(root);
  const ob = originBase || getCuuTruyenOriginFromUrl(LATEST_UPDATES_CONTEXT_URL);
  for (const ent of list) {
    const row = recentlyUpdatedRow(ent, ob);
    if (row.mangaUrl) rows.push(row);
  }
  const tp = deriveRecentlyUpdatedTotalPages(root, page, perPage, list.length);
  return { items: rows, totalPages: Math.max(1, tp) };
}

/**
 * `GET …/api/v2/mangas/quick_search?q=` — same row shape as recently_updated (testable).
 *
 * @param {object} root  parsed JSON (`data` array)
 * @param {string} originBase
 */
function parseQuickSearchResponse(root, originBase) {
  const list = root && typeof root === 'object' && Array.isArray(root.data) ? root.data : [];
  const ob = originBase || getCuuTruyenOriginFromUrl(LATEST_UPDATES_CONTEXT_URL);
  const rows = [];
  for (const ent of list) {
    const row = recentlyUpdatedRow(ent, ob);
    if (row.mangaUrl) rows.push(row);
  }
  return { items: rows };
}

/**
 * Tab Mới cập nhật — `GET …/api/v2/mangas/recently_updated?page=&per_page=`.
 *
 * @param {object} [options]
 * @param {number} [options.page]  1-based
 * @param {number} [options.perPage]
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const searchQuery = String(rawSearch || '').trim();
  if (searchQuery) {
    const path = `mangas/quick_search?q=${encodeURIComponent(searchQuery)}`;
    const resp = await fetchCuuTruyenApi(path, LATEST_UPDATES_CONTEXT_URL);
    if (!resp.body) {
      return { ok: false, error: formatCuuTruyenApiError(resp, 'tìm kiếm') };
    }
    let root;
    try {
      root = JSON.parse(resp.body);
    } catch {
      return { ok: false, error: 'JSON tìm kiếm không hợp lệ.' };
    }
    const originBase = getCuuTruyenOriginFromUrl(LATEST_UPDATES_CONTEXT_URL);
    const { items } = parseQuickSearchResponse(root, originBase);
    return {
      ok: true,
      siteId: 'cuutruyen',
      page: 1,
      totalPages: 1,
      items,
    };
  }

  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const perPageRaw = Number(options.perPage);
  const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0
    ? Math.min(60, Math.floor(perPageRaw))
    : DEFAULT_LATEST_PER_PAGE;
  const path = `mangas/recently_updated?page=${page}&per_page=${perPage}`;
  const resp = await fetchCuuTruyenApi(path, LATEST_UPDATES_CONTEXT_URL);
  if (!resp.body) {
    return { ok: false, error: formatCuuTruyenApiError(resp, 'mới cập nhật') };
  }
  let root;
  try {
    root = JSON.parse(resp.body);
  } catch {
    return { ok: false, error: 'JSON danh sách mới cập nhật không hợp lệ.' };
  }
  const originBase = getCuuTruyenOriginFromUrl(LATEST_UPDATES_CONTEXT_URL);
  const { items, totalPages: rawTotal } = parseRecentlyUpdatedResponse(root, originBase, page, perPage);
  const totalPages = Math.max(rawTotal, CUUTRUYEN_LATEST_UPDATES_MIN_TOTAL_PAGES);
  return {
    ok: true,
    siteId: 'cuutruyen',
    page,
    totalPages,
    items,
  };
}

/**
 * CuuTruyen API client wrapper that provides the expected interface for ApiConnectorService.
 * Handles DRM data and custom download logic for CuuTruyen's image descrambling.
 */
class CuuTruyenApiClient {
  /**
   * Load manga information from URL.
   * @param {string} url - Manga URL
   * @param {object} [options] - Load options
   * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
   */
  async load(url, options = {}) {
    if (shouldParallelCuuTruyenLoad(url)) {
      const [mangaResult, chResult] = await Promise.all([
        this.fetchManga(url),
        this.fetchChapters(url),
      ]);
      if (!mangaResult.ok) {
        return mangaResult;
      }
      if (!chResult.ok) {
        return { ok: false, error: chResult.error, manga: mangaResult.manga, chapters: [] };
      }
      return {
        ok: true,
        manga: mangaResult.manga,
        chapters: chResult.chapters,
      };
    }

    const mangaResult = await this.fetchManga(url);
    if (!mangaResult.ok) {
      return mangaResult;
    }
    const chResult = await this.fetchChapters(url);
    if (!chResult.ok) {
      return { ok: false, error: chResult.error, manga: mangaResult.manga, chapters: [] };
    }
    return {
      ok: true,
      manga: mangaResult.manga,
      chapters: chResult.chapters,
    };
  }

  /**
   * Fetch chapter images from chapter URL.
   * Returns image data with DRM information for descrambling.
   * @param {string} chapterUrl - Chapter URL
   * @returns {Promise<Array<{imageUrl: string, ext: string, drmData?: string}>>}
   */
  async fetchChapterImages(chapterUrl) {
    const chapterId = extractChapterId(chapterUrl);
    if (!chapterId) {
      throw new Error(`Could not extract chapter ID from: ${chapterUrl}`);
    }

    const resp = await fetchCuuTruyenApi(`chapters/${chapterId}`, chapterUrl);
    if (!resp.body) {
      const msg = formatCuuTruyenApiError(resp, 'dữ liệu chương');
      throw new Error(msg);
    }

    let root;
    try {
      root = JSON.parse(resp.body);
    } catch {
      throw new Error('Invalid chapter JSON');
    }

    const data = root.data;
    if (!data || !data.pages) {
      throw new Error('No pages found in chapter data');
    }

    const pages = data.pages;
    if (!pages.length) {
      throw new Error('Chapter has no pages');
    }

    return pages.map((page) => ({
      imageUrl: rewriteCuuTruyenImageUrl(page.image_url),
      ext: 'jpg', // CuuTruyen images are typically JPG
      drmData: page.drm_data != null && page.drm_data !== undefined && page.drm_data !== ''
        ? String(page.drm_data)
        : null,
    }));
  }

  /**
   * Fetch manga information from URL.
   * @param {string} url - Manga URL
   * @returns {Promise<{ok: boolean, manga?: object, error?: string}>}
   */
  async fetchManga(url) {
    const mangaId = extractMangaId(url);
    if (!mangaId) {
      return { ok: false, error: 'Không lấy được ID truyện từ URL (cần dạng .../mangas/123).' };
    }
    const resp = await fetchCuuTruyenApi(`mangas/${mangaId}`, url);
    if (!resp.body) {
      return { ok: false, error: formatCuuTruyenApiError(resp, 'dữ liệu truyện') };
    }
    let root;
    try {
      root = JSON.parse(resp.body);
    } catch {
      return { ok: false, error: 'JSON truyện không hợp lệ.' };
    }
    const manga = buildCuuTruyenMangaFromApiRoot(root, url);
    if (!manga) {
      return { ok: false, error: 'Không có data truyện.' };
    }
    return { ok: true, manga };
  }

  /**
   * Fetch chapters from URL.
   * @param {string} url - Manga URL
   * @returns {Promise<{ok: boolean, chapters?: array, error?: string}>}
   */
  async fetchChapters(url) {
    const mangaId = extractMangaId(url);
    if (!mangaId) {
      return { ok: false, error: 'Không lấy được ID truyện từ URL.', chapters: [] };
    }
    const resp = await fetchCuuTruyenApi(`mangas/${mangaId}/chapters`, url);
    if (!resp.body) {
      return {
        ok: false,
        error: formatCuuTruyenApiError(resp, 'danh sách chương'),
        chapters: [],
      };
    }
    let root;
    try {
      root = JSON.parse(resp.body);
    } catch {
      return { ok: false, error: 'JSON chương không hợp lệ.', chapters: [] };
    }
    const data = root.data;
    if (!Array.isArray(data)) {
      return { ok: true, chapters: [] };
    }
    const origin = getCuuTruyenOriginFromUrl(url);
    const chapters = [];
    for (const obj of data) {
      const status = obj.status || '';
      if (status !== 'processed') continue;
      const chapterId = obj.id;
      const number = obj.number != null ? String(obj.number) : '';
      const name = obj.name != null && obj.name !== '' ? String(obj.name) : '';
      let title = `Chương ${number}`;
      if (name) title += ` - ${name}`;
      chapters.push({
        url: `${origin}/chapters/${chapterId}`,
        title,
        chapterId: String(chapterId),
      });
    }
    return { ok: true, chapters };
  }
}

/**
 * CuuTruyen service extending ApiConnectorService.
 * Handles DRM-specific requirements and custom download logic.
 */
class CuuTruyenService extends ApiConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'cuutruyen',
      apiClient: new CuuTruyenApiClient(),
      imageReferer: 'https://cuutruyen.net/',
    });
  }

  /**
   * Override downloadChapter to handle DRM descrambling.
   * CuuTruyen requires custom download logic that can't use the standard downloadImageToFile.
   */
  async downloadChapter(payload, connectorLabel = LABEL) {
    const fs = require('fs');
    const path = require('path');
    const pLimit = require('p-limit');
    const { loadOrCreate } = require('../../storage/downloadDb');
    const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');
    const { formatChapterTitle, formatChapterPageFileName } = require('../../../shared/mangaUtils');
    const { resolveMangaDir, resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
    const { downloadCoverIfNeeded } = require('../../../download/connector/connectorDownloadUtils');

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

    const log = (msg, level = 'info') => {
      if (typeof onLog === 'function') onLog(msg, level);
    };
    const report = (payload) => {
      if (typeof onProgress === 'function') onProgress(payload);
    };

    // Step 1: Setup paths and logging
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
    const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connectorLabel);
    if (!db.record.mangaTitle) {
      db.record.mangaTitle = mangaTitle;
      db.record.mangaUrl = mangaUrl;
      db.record.connector = connectorLabel;
      db.save();
    }

    // Step 6: Check if chapter already complete
    if (db.isChapterComplete(dbChapterTitle, chapterDir)) {
      log('Chapter already complete, skipping.', 'info');
      return { ok: true, skipped: true };
    }

    // Step 7: Fetch chapter images (with DRM data)
    let rawImageList;
    try {
      rawImageList = await this.fetchChapterImages(chapterUrl, referer);
    } catch (error) {
      log(`Error fetching chapter images: ${error.message}`, 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: error.message };
    }

    if (!rawImageList || rawImageList.length === 0) {
      log('Không tìm thấy ảnh trong trang chương.', 'error');
      cleanup_empty_chapter_dir();
      return { ok: false, error: 'No images' };
    }

    if (typeof shouldAbort === 'function' && shouldAbort()) {
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    log(`Found ${rawImageList.length} pages`, 'info');

    // Step 8: Build page info array with DRM data
    const pageInfos = rawImageList.map((page, i) => {
      const idx = i + 1;
      const fileName = formatChapterPageFileName(chapterTitle, idx, 'jpg', chapterFolderFormat);
      const filePath = path.join(chapterDir, fileName);
      return {
        index: idx,
        imageUrl: page.imageUrl,
        drmData: page.drmData,
        filePath,
        fileName,
      };
    });

    const fullChapterPageCount = rawImageList.length;
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

    // Step 11: Parallel download with DRM descrambling
    const threads = Math.max(1, Math.min(Number(numberOfThreads) || 5, 5));
    const limit = pLimit(threads);
    const totalPages = pageInfos.length;
    const progress = new Int32Array(new SharedArrayBuffer(4));
    const downloadResults = [];
    const failedPageIndices = [];

    report({
      mangaTitle,
      chapterTitle,
      chapterUrl,
      current: 0,
      total: totalPages,
    });

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

            // Use CuuTruyen's custom download and descramble function
            if (await downloadAndDescramble(pi)) {
              if (fs.existsSync(pi.filePath) && fs.statSync(pi.filePath).size > 0) {
                success = true;
                const n = Atomics.add(progress, 0, 1) + 1;
                const kb = (fs.statSync(pi.filePath).size / 1024).toFixed(1);
                log(` [${n}/${totalPages}] ${path.basename(pi.filePath)} done (${kb}KB)`, 'info');
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
              if (typeof shouldAbort === 'function' && shouldAbort()) break;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          downloadResults.push(success);
          if (!success) {
            if (!(typeof shouldAbort === 'function' && shouldAbort())) {
              const n = Atomics.add(progress, 0, 1) + 1;
              log(` [${n}/${totalPages}] ${path.basename(pi.filePath)} FAILED`, 'error');
              report({
                mangaTitle,
                chapterTitle,
                chapterUrl,
                current: n,
                total: totalPages,
              });
              db.markPageFailed(dbChapterTitle, pi.index);
              failedPageIndices.push(pi.index);
            }
          }

          await new Promise((r) => setTimeout(r, 150));
        })
      )
    );

    // Step 12: Check abort after download
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      db.markChapterIncomplete(dbChapterTitle);
      log('Đã dừng tải chương (người dùng).', 'warn');
      cleanup_empty_chapter_dir();
      return { ok: false, aborted: true };
    }

    // Step 13: Mark chapter status
    const successCount = downloadResults.filter(Boolean).length;
    const allSuccess = downloadResults.length > 0 && downloadResults.every(Boolean);
    if (allSuccess) {
      log(`Chapter done: ${successCount}/${totalPages} pages downloaded.`, 'success');
      db.markChapterCompleted(dbChapterTitle);
    } else {
      log(`Chapter incomplete: ${successCount}/${totalPages} pages succeeded.`, 'warn');
      db.markChapterIncomplete(dbChapterTitle);
      cleanup_empty_chapter_dir();
    }

    return {
      ok: allSuccess,
      successCount,
      totalPages,
      failedPageIndices: allSuccess ? undefined : [...failedPageIndices].sort((a, b) => a - b),
    };
  }
}

const service = new CuuTruyenService();

module.exports = {
  DOMAIN,
  LABEL,
  load: (url, options) => service.load(url, options),
  downloadChapter: (payload, connector) => service.downloadChapter(payload, connector || LABEL),
  fetchLatestUpdates,
  parseRecentlyUpdatedResponse,
  parseQuickSearchResponse,
  unwrapCuutruyenMangaData,
  buildCuuTruyenMangaFromApiRoot,
  resolveCoverOriginStyle,
};
