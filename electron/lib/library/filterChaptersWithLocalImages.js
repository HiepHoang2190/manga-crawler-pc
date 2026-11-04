const fs = require('fs');
const path = require('path');
const { resolveMangaDir, resolveChapterDir } = require('../download/connector/connectorPathUtils');
const { formatChapterTitle, extractChapterNumberString, isFlatChapterLayout, getFlatChapterImageNamePrefix } = require('../shared/mangaUtils');
const { listChapterImageFiles, IMAGE_EXT } = require('./listChapterImageFiles');
const {
  scanChaptersFromImageFoldersOnly,
  folderTieBreakScore,
  pickBestFolderBasename,
  chapterDirHasNonEmptyImages,
} = require('../reader/loaders/loadOfflineMangaFromDisk');

const DB_FILENAME = 'download_db.json';

function dirHasImages(chapterDir) {
  return chapterDirHasNonEmptyImages(chapterDir);
}

function flatChapterHasImages(mangaDir, chapterTitle, chapterFolderFormat) {
  const prefix = getFlatChapterImageNamePrefix(chapterTitle, chapterFolderFormat);
  if (!prefix) return false;
  let names;
  try {
    names = fs.readdirSync(mangaDir);
  } catch {
    return false;
  }
  return names.some((name) => {
    if (!name.startsWith(prefix)) return false;
    return IMAGE_EXT.has(path.extname(name).toLowerCase());
  });
}

function filterChaptersWithFlatLayoutNoDb(baseSaveDir, mangaTitle, chapters, chapterFolderFormat) {
  const base = String(baseSaveDir || '').trim();
  const mt = String(mangaTitle || '').trim();
  if (!base || !mt || !Array.isArray(chapters)) return [];

  const mangaDir = resolveMangaDir(base, mt);
  if (!fs.existsSync(mangaDir)) return [];

  const out = [];
  for (const ch of chapters) {
    if (!ch || typeof ch !== 'object') continue;
    const ct = String(ch.title || '').trim();
    if (!ct || !flatChapterHasImages(mangaDir, ct, chapterFolderFormat)) continue;
    out.push({ url: ch.url, title: ch.title });
  }
  return sortByChapterNumber(out);
}

/**
 * Không có download_db.json (hoặc không có chương completed): khớp danh sách chương API với thư mục ảnh.
 * @param {string} baseSaveDir
 * @param {string} mangaTitle
 * @param {Array<{ url: string, title: string, folderBasename?: string }>} chapters
 * @param {object} chapterFolderFormat
 * @returns {Array<{ url: string, title: string, folderBasename?: string }>}
 */
function filterChaptersWithLocalImagesNoDb(baseSaveDir, mangaTitle, chapters, chapterFolderFormat) {
  const base = String(baseSaveDir || '').trim();
  const mt = String(mangaTitle || '').trim();
  if (!base || !mt || !Array.isArray(chapters)) return [];

  if (isFlatChapterLayout(chapterFolderFormat)) {
    return filterChaptersWithFlatLayoutNoDb(base, mt, chapters, chapterFolderFormat);
  }

  const mangaDir = resolveMangaDir(base, mt);
  if (!fs.existsSync(mangaDir)) return [];

  const scanned = scanChaptersFromImageFoldersOnly(mangaDir);
  const unusedFolders = new Set(scanned.map((c) => c.folderBasename).filter(Boolean));
  if (unusedFolders.size === 0) return [];

  const listChapters = chapters.filter((c) => c && typeof c === 'object');
  const usedIndex = new Set();
  const out = [];

  for (let i = 0; i < listChapters.length; i++) {
    const ch = listChapters[i];
    const ct = String(ch.title || '').trim();
    if (!ct) continue;
    let chapterDir;
    try {
      chapterDir = resolveChapterDir(base, mt, ch.title, chapterFolderFormat);
    } catch {
      continue;
    }
    const fb = path.basename(chapterDir);
    if (!unusedFolders.has(fb)) continue;
    if (!dirHasImages(chapterDir)) continue;
    unusedFolders.delete(fb);
    usedIndex.add(i);
    const row = { url: ch.url, title: ch.title, folderBasename: fb };
    out.push(row);
  }

  const usedFolder = new Set(out.map((r) => r.folderBasename).filter(Boolean));

  const rows = [];
  for (let i = 0; i < listChapters.length; i++) {
    if (usedIndex.has(i)) continue;
    const ch = listChapters[i];
    const key = formatChapterTitle(ch.title) || String(ch.title || '').trim();
    const cands = [...unusedFolders].filter((f) => !usedFolder.has(f));
    const scored = cands.map((f) => ({ f, s: folderTieBreakScore(key, f) }));
    const positive = scored.filter((x) => x.s > 0).map((x) => x.f);
    const candidates = positive.length ? positive : cands;
    rows.push({ i, ch, key, candidates });
  }

  rows.sort((a, b) => a.candidates.length - b.candidates.length);

  for (const row of rows) {
    const avail = row.candidates.filter((f) => !usedFolder.has(f));
    if (avail.length === 0) continue;
    const chosen = pickBestFolderBasename(row.key, avail);
    usedFolder.add(chosen);
    out.push({
      url: row.ch.url,
      title: row.ch.title,
      folderBasename: chosen,
    });
  }

  return sortByChapterNumber(out);
}

function normalizeChapterUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const x = new URL(s);
    const pathname = String(x.pathname || '').replace(/\/{2,}/g, '/');
    return `${x.origin}${pathname}`.replace(/\/$/, '');
  } catch {
    return s.replace(/\/{2,}/g, '/');
  }
}

/** MangaPlus (và site dùng /viewer/:id) — khớp khi URL lệch dấu / hoặc query. */
function extractViewerChapterId(url) {
  const m = String(url || '').match(/\/viewer\/(\d+)/);
  return m ? m[1] : '';
}

function sortByChapterNumber(rows) {
  return [...rows].sort((a, b) => {
    const na = extractChapterNumberString(a.title);
    const nb = extractChapterNumberString(b.title);
    if (na != null && nb != null) {
      const fa = parseFloat(na);
      const fb = parseFloat(nb);
      if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fa - fb;
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (na != null) return -1;
    if (nb != null) return 1;
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

/**
 * Chương đã tải xong theo download_db.json (status === 'completed').
 *
 * Duyệt theo **từng khóa trong DB** (một chương hoàn thành = một dòng), rồi tìm **một** dòng
 * tương ứng trong danh sách nguồn — tránh lặp khi API trả nhiều dòng cùng tiêu đề / cùng URL
 * hoặc khi khớp tiêu đề trùng với nhiều khóa DB.
 *
 * @param {string} baseSaveDir
 * @param {string} mangaTitle
 * @param {Array<{ url: string, title: string, folderBasename?: string }>} chapters
 * @param {object} [chapterFolderFormat] — bắt buộc khi không có DB (resolveChapterDir)
 * @returns {Array<{ url: string, title: string, folderBasename?: string }>}
 */
function filterChaptersWithLocalImages(baseSaveDir, mangaTitle, chapters, chapterFolderFormat) {
  const base = String(baseSaveDir || '').trim();
  const mt = String(mangaTitle || '').trim();
  if (!base || !mt || !Array.isArray(chapters)) return [];

  const mangaDir = resolveMangaDir(base, mt);
  const fmt = chapterFolderFormat || {};

  const dbFile = path.join(mangaDir, DB_FILENAME);
  let parsed;
  let record = {};
  if (fs.existsSync(dbFile)) {
    try {
      parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      record = parsed.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {};
    } catch {
      record = {};
    }
  }

  /** @type {Array<{ key: string, entry: object }>} */
  const completed = [];
  for (const [key, entry] of Object.entries(record)) {
    if (!entry || entry.status !== 'completed') continue;
    completed.push({ key: String(key), entry });
  }

  const useDbPath = completed.length > 0;
  if (!useDbPath) {
    return filterChaptersWithLocalImagesNoDb(base, mt, chapters, fmt);
  }

  const listChapters = chapters.filter((c) => c && typeof c === 'object');
  const usedListIndex = new Set();
  const out = [];

  for (const { key, entry } of completed) {
    const dbUrl = entry.url != null ? normalizeChapterUrl(entry.url) : '';
    let matchedIndex = -1;

    for (let i = 0; i < listChapters.length; i++) {
      if (usedListIndex.has(i)) continue;
      const ch = listChapters[i];
      const urlNorm = normalizeChapterUrl(ch.url);
      if (dbUrl && urlNorm && dbUrl === urlNorm) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex < 0) {
      const dbViewerId = extractViewerChapterId(entry.url);
      for (let i = 0; i < listChapters.length; i++) {
        if (usedListIndex.has(i)) continue;
        const ch = listChapters[i];
        const listViewerId = extractViewerChapterId(ch.url);
        if (dbViewerId && listViewerId && listViewerId === dbViewerId) {
          matchedIndex = i;
          break;
        }
      }
    }

    if (matchedIndex < 0) {
      for (let i = 0; i < listChapters.length; i++) {
        if (usedListIndex.has(i)) continue;
        const ch = listChapters[i];
        const rawTitle = String(ch.title || '').trim();
        const titleKey = formatChapterTitle(ch.title);
        if (key === titleKey || key === rawTitle) {
          matchedIndex = i;
          break;
        }
      }
    }

    if (matchedIndex >= 0) {
      usedListIndex.add(matchedIndex);
      const ch = listChapters[matchedIndex];
      const row = { url: ch.url, title: ch.title };
      if (ch.folderBasename != null && String(ch.folderBasename).trim()) {
        row.folderBasename = ch.folderBasename;
      }
      out.push(row);
    }
  }

  const sorted = sortByChapterNumber(out);
  if (sorted.length === 0 && scanChaptersFromImageFoldersOnly(mangaDir).length > 0) {
    return filterChaptersWithLocalImagesNoDb(base, mt, chapters, fmt);
  }
  return sorted;
}

/**
 * Lọc chapters có ảnh trên đĩa khi biết đường dẫn tuyệt đối tới thư mục manga.
 * Dùng khi manga được mở từ offline folder (không có baseSaveDir / mangaTitle chuẩn).
 *
 * @param {string} absoluteMangaDir — đường dẫn tuyệt đối tới thư mục manga
 * @param {Array<{ url: string, title: string, folderBasename?: string }>} chapters
 * @returns {Array<{ url: string, title: string, folderBasename?: string }>}
 */
function filterChaptersWithLocalImagesAbsolute(absoluteMangaDir, chapters) {
  const mangaDir = path.resolve(String(absoluteMangaDir || '').trim());
  if (!mangaDir || !fs.existsSync(mangaDir)) return [];
  if (!Array.isArray(chapters) || chapters.length === 0) return [];

  // Nếu chapters đã có folderBasename (từ loadOfflineMangaAtResolvedDir), dùng trực tiếp
  const withFolder = chapters.filter(
    (c) => c && typeof c === 'object' && String(c.folderBasename || '').trim()
  );
  if (withFolder.length > 0) {
    const out = [];
    for (const ch of withFolder) {
      const fb = String(ch.folderBasename).trim();
      const chapterDir = path.join(mangaDir, fb);
      if (chapterDirHasNonEmptyImages(chapterDir)) {
        out.push({ url: ch.url, title: ch.title, folderBasename: fb });
      }
    }
    if (out.length > 0) return sortByChapterNumber(out);
  }

  // Fallback: scan thư mục và khớp theo title
  const scanned = scanChaptersFromImageFoldersOnly(mangaDir);
  if (scanned.length === 0) return [];

  // Nếu chapters có url offline: (từ scanChaptersFromImageFoldersOnly), trả về trực tiếp
  const allOffline = chapters.every((c) => String(c?.url || '').startsWith('offline:'));
  if (allOffline) {
    return sortByChapterNumber(
      scanned.map((c) => ({ url: c.url, title: c.title, folderBasename: c.folderBasename }))
    );
  }

  // Khớp chapters với scanned folders theo title
  const unusedFolders = new Set(scanned.map((c) => c.folderBasename));
  const out = [];
  for (const ch of chapters) {
    if (!ch || typeof ch !== 'object') continue;
    const key = formatChapterTitle(ch.title) || String(ch.title || '').trim();
    const cands = [...unusedFolders];
    const scored = cands.map((f) => ({ f, s: folderTieBreakScore(key, f) }));
    const positive = scored.filter((x) => x.s > 0).map((x) => x.f);
    const avail = positive.length ? positive : cands;
    if (avail.length === 0) continue;
    const chosen = pickBestFolderBasename(key, avail);
    unusedFolders.delete(chosen);
    out.push({ url: ch.url, title: ch.title, folderBasename: chosen });
  }
  return sortByChapterNumber(out);
}

module.exports = {
  filterChaptersWithLocalImages,
  filterChaptersWithLocalImagesNoDb,
  filterChaptersWithLocalImagesAbsolute,
};
