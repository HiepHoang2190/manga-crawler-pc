const fs = require('fs');
const path = require('path');
const { resolveMangaDir } = require('../../download/connector/connectorPathUtils');
const { extractChapterNumberString } = require('../../shared/mangaUtils');
const { listChapterImageFiles } = require('../../library/listChapterImageFiles');
const { findLocalCoverInMangaDir } = require('../../library/findLocalCoverFile');

const DB_FILENAME = 'download_db.json';

function isExistingDirectoryPath(targetPath) {
  try {
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function normalizeUnicodeVariants(input_path) {
  const normalized_variants = new Set();
  const raw_value = String(input_path || '');
  normalized_variants.add(raw_value);
  for (const normalize_form of ['NFC', 'NFD', 'NFKC', 'NFKD']) {
    try {
      normalized_variants.add(raw_value.normalize(normalize_form));
    } catch {
      /* ignore invalid normalize form */
    }
  }
  return [...normalized_variants];
}

function toLooseComparableName(input_value) {
  const text_value = String(input_value || '');
  let normalized_value = text_value;
  try {
    normalized_value = normalized_value.normalize('NFD');
  } catch {
    /* keep original value */
  }
  return normalized_value
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * macOS có thể gặp mismatch Unicode normalization (NFC/NFD) giữa path nhập tay và tên thật trên đĩa.
 * Hàm này cố gắng map về đường dẫn thư mục tồn tại thực tế.
 * @param {string} input_path
 * @returns {string}
 */
function resolveExistingMangaDirPath(input_path) {
  const resolved_input = path.resolve(String(input_path || '').trim());
  if (isExistingDirectoryPath(resolved_input)) return resolved_input;

  for (const variant_path of normalizeUnicodeVariants(resolved_input)) {
    const resolved_variant = path.resolve(variant_path);
    if (isExistingDirectoryPath(resolved_variant)) return resolved_variant;
  }

  const parent_dir = path.dirname(resolved_input);
  const target_basename = path.basename(resolved_input);
  if (!isExistingDirectoryPath(parent_dir)) return resolved_input;

  const target_nfc = target_basename.normalize('NFC');
  const target_nfd = target_basename.normalize('NFD');
  const target_loose = toLooseComparableName(target_basename);
  try {
    const parent_entries = fs.readdirSync(parent_dir, { withFileTypes: true });
    let loose_match_path = null;
    let loose_match_count = 0;
    for (const entry of parent_entries) {
      if (!entry.isDirectory()) continue;
      const entry_name = String(entry.name || '');
      if (entry_name === target_basename) return path.join(parent_dir, entry_name);
      if (entry_name.normalize('NFC') === target_nfc) return path.join(parent_dir, entry_name);
      if (entry_name.normalize('NFD') === target_nfd) return path.join(parent_dir, entry_name);
      if (toLooseComparableName(entry_name) === target_loose) {
        loose_match_path = path.join(parent_dir, entry_name);
        loose_match_count += 1;
      }
    }
    // Only accept a loose match if it resolves to one unique directory.
    if (loose_match_count === 1 && loose_match_path) {
      return loose_match_path;
    }
  } catch {
    /* ignore and fallback */
  }

  return resolved_input;
}

/**
 * Tên file của mọi trang đã completed (có fileName) trong chapterEntry.pages.
 * @param {object} chapterEntry
 * @returns {string[]}
 */
function getCompletedPageFilenames(chapterEntry) {
  const pages = chapterEntry.pages || [];
  return pages
    .filter((p) => p && p.status === 'completed' && p.fileName)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => p.fileName);
}

/**
 * Số file ảnh kỳ vọng: expectedFileCount từ DB, hoặc độ dài danh sách trang completed nếu thiếu.
 * @param {object} chapterEntry
 * @param {number} requiredLen
 * @returns {number}
 */
function resolveExpectedImageCount(chapterEntry, requiredLen) {
  const n = chapterEntry.expectedFileCount;
  if (n != null && n !== '' && Number.isFinite(Number(n))) {
    const v = Math.floor(Number(n));
    if (v > 0) return v;
  }
  return requiredLen;
}

/**
 * Mỗi trang completed: file tồn tại, không rỗng; nếu có fileSize hữu hạn thì khớp byte với stat.
 * @param {string} chapterDir
 * @param {object} chapterEntry
 * @returns {boolean}
 */
function completedPagesMatchDisk(chapterDir, chapterEntry) {
  const pages = chapterEntry.pages || [];
  let matched = 0;
  for (const p of pages) {
    if (!p || p.status !== 'completed') continue;
    const name = p.fileName;
    if (!name || String(name).trim() === '') return false;
    const fp = path.join(chapterDir, name);
    try {
      if (!fs.existsSync(fp)) return false;
      const st = fs.statSync(fp);
      if (st.size <= 0) return false;
      const fsz = Number(p.fileSize);
      if (Number.isFinite(fsz) && st.size !== fsz) return false;
    } catch {
      return false;
    }
    matched += 1;
  }
  return matched > 0;
}

function allRequiredFilesExistNonEmpty(chapterDir, filenames) {
  for (const name of filenames) {
    const fp = path.join(chapterDir, name);
    try {
      if (!fs.existsSync(fp)) return false;
      if (fs.statSync(fp).size <= 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function readMangaSubdirs(mangaDir) {
  try {
    return fs.readdirSync(mangaDir).filter((name) => {
      if (name === DB_FILENAME || name.startsWith('.') || name.startsWith('._')) return false;
      try {
        return fs.statSync(path.join(mangaDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Liệt kê thư mục con chương khớp: mọi file trang completed có trên đĩa (không rỗng)
 * và số file ảnh trong thư mục khớp expectedFileCount (hoặc số trang completed nếu thiếu).
 * @param {string} mangaDir
 * @param {object} chapterEntry
 * @returns {string[]} basename các thư mục ứng viên
 */
function findCandidateChapterFolders(mangaDir, chapterEntry) {
  const required = getCompletedPageFilenames(chapterEntry);
  if (required.length === 0) return [];

  const expectedCount = resolveExpectedImageCount(chapterEntry, required.length);
  const single_pdf_chapter =
    required.length === 1 && String(required[0] || '').toLowerCase().endsWith('.pdf');
  const subdirs = readMangaSubdirs(mangaDir);
  const out = [];
  const hasAnyFileSize = (chapterEntry.pages || []).some(
    (p) => p && p.status === 'completed' && Number.isFinite(Number(p.fileSize)),
  );

  for (const d of subdirs) {
    const chapterDir = path.join(mangaDir, d);
    const filesOk = hasAnyFileSize
      ? completedPagesMatchDisk(chapterDir, chapterEntry)
      : allRequiredFilesExistNonEmpty(chapterDir, required);
    if (!filesOk) continue;
    const listed = listChapterImageFiles(chapterDir);
    if (!listed.ok) continue;
    if (single_pdf_chapter) {
      if (listed.files.length > 0) {
        out.push(d);
        continue;
      }
      const pdf_path = path.join(chapterDir, required[0]);
      try {
        if (fs.existsSync(pdf_path) && fs.statSync(pdf_path).size > 0) {
          out.push(d);
        }
      } catch {
        /* skip */
      }
      continue;
    }
    if (listed.files.length !== expectedCount) continue;
    out.push(d);
  }
  return out;
}

/**
 * Điểm ưu tiên khi chọn 1 folder trong nhiều ứng viên: khớp số chương (db key vs tên folder), chứa chuỗi key.
 * @param {string} dbKey
 * @param {string} folderBasename
 * @returns {number}
 */
function folderTieBreakScore(dbKey, folderBasename) {
  let score = 0;
  const nk = extractChapterNumberString(dbKey);
  const nf = extractChapterNumberString(folderBasename);
  if (nk != null && nf != null) {
    if (nk === nf) {
      score += 1000;
    } else {
      const fa = parseFloat(nk);
      const fb = parseFloat(nf);
      if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa === fb) score += 500;
    }
  }
  const dk = String(dbKey).toLowerCase();
  const df = String(folderBasename).toLowerCase();
  if (dk && df && (df.includes(dk) || dk.includes(df))) score += 100;
  return score;
}

function pickBestFolderBasename(dbKey, candidates) {
  if (candidates.length <= 1) return candidates[0];
  let best = candidates[0];
  let bestScore = folderTieBreakScore(dbKey, best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const s = folderTieBreakScore(dbKey, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    } else if (s === bestScore) {
      const cmp = c.localeCompare(best, undefined, { numeric: true, sensitivity: 'base' });
      if (cmp < 0) best = c;
    }
  }
  return best;
}

/**
 * Gán mỗi chương hoàn thành một thư mục đĩa duy nhất: sort theo số ứng viên tăng dần, greedy;
 * tie-break bằng khớp số chương / chứa chuỗi key.
 * @param {string} mangaDir
 * @param {Array<{ dbKey: string, entry: object }>} completedEntries
 * @returns {Map<string, string>} dbKey → folderBasename
 */
function assignFoldersToChapters(mangaDir, completedEntries) {
  const rows = completedEntries.map(({ dbKey, entry }) => ({
    dbKey,
    entry,
    candidates: findCandidateChapterFolders(mangaDir, entry),
  }));
  rows.sort((a, b) => a.candidates.length - b.candidates.length);

  const used = new Set();
  const assignment = new Map();

  for (const row of rows) {
    const avail = row.candidates.filter((d) => !used.has(d));
    if (avail.length === 0) continue;
    const chosen = pickBestFolderBasename(row.dbKey, avail);
    used.add(chosen);
    assignment.set(row.dbKey, chosen);
  }

  return assignment;
}

function chapterDirHasNonEmptyListedImages(chapterDir, listed) {
  if (!listed.ok || listed.files.length === 0) return false;
  for (const name of listed.files) {
    try {
      const fp = path.join(chapterDir, name);
      if (fs.existsSync(fp) && fs.statSync(fp).size > 0) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

function chapterDirHasNonEmptyImagesInImmediateSubdirs(chapterDir) {
  if (fs.existsSync(path.join(chapterDir, DB_FILENAME))) {
    return false;
  }
  let entries;
  try {
    entries = fs.readdirSync(chapterDir, { withFileTypes: true });
  } catch {
    return false;
  }
  let subdirsWithImages = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = String(entry.name || '');
    if (name.startsWith('.') || name.startsWith('._')) continue;
    const subDir = path.join(chapterDir, name);
    if (fs.existsSync(path.join(subDir, DB_FILENAME))) return false;
    const listed = listChapterImageFiles(subDir);
    if (chapterDirHasNonEmptyListedImages(subDir, listed)) {
      subdirsWithImages++;
    }
  }
  // A single chapter folder can have at most ONE inner wrapper folder with images (e.g. Ch1/inner/001.jpg).
  // If it has 2 or more subdirectories containing images (e.g. MangaA/Ch1 and MangaA/Ch2),
  // then chapterDir is a manga, NOT a chapter!
  return subdirsWithImages === 1;
}

function chapterDirHasNonEmptyImages(chapterDir) {
  const listed = listChapterImageFiles(chapterDir);
  if (chapterDirHasNonEmptyListedImages(chapterDir, listed)) return true;
  return chapterDirHasNonEmptyImagesInImmediateSubdirs(chapterDir);
}

/**
 * Kiểm tra xem một thư mục có phải là thư mục gốc chứa nhiều truyện khác nhau hay không.
 * Thư mục gốc chứa nhiều truyện khi:
 * 1. Bản thân thư mục không có ảnh trực tiếp và không có download_db.json.
 * 2. Có ít nhất một thư mục con chứa download_db.json hoặc file .cbz.
 * 3. Hoặc có thư mục con chứa >= 2 thư mục chương có ảnh (tức thư mục con đó là một bộ truyện).
 * 4. Hoặc có >= 2 thư mục con mà mỗi thư mục con lại có thư mục chương mang mẫu số chương.
 * @param {string} dir
 * @returns {boolean}
 */
function isMultiMangaRootDir(dir) {
  if (!dir || !fs.existsSync(dir)) return false;

  const direct = listChapterImageFiles(dir);
  if (direct.ok && direct.files.length > 0) return false;

  if (fs.existsSync(path.join(dir, DB_FILENAME))) return false;

  let subdirs;
  try {
    subdirs = readMangaSubdirs(dir);
  } catch {
    return false;
  }
  // Thư mục gốc chứa nhiều truyện BẮT BUỘC phải có từ 2 thư mục con trở lên (mỗi thư mục con là một bộ truyện)
  if (subdirs.length <= 1) return false;

  let childrenWithNestedChapters = 0;

  for (const sub of subdirs) {
    const subPath = path.join(dir, sub);

    // 1. Thư mục con có download_db.json -> thư mục con chắc chắn là một truyện -> dir là thư mục gốc!
    if (fs.existsSync(path.join(subPath, DB_FILENAME))) {
      return true;
    }

    // 2. Thư mục con chứa file .cbz -> thư mục con là truyện hoặc thư mục lưu trữ truyện -> dir là gốc!
    let subFiles = [];
    try {
      subFiles = fs.readdirSync(subPath);
    } catch {
      continue;
    }
    const hasCbz = subFiles.some((f) => !f.startsWith('._') && f.toLowerCase().endsWith('.cbz'));
    if (hasCbz) {
      return true;
    }

    // 3. Khảo sát các thư mục cháu bên trong subPath
    const innerSubdirs = readMangaSubdirs(subPath);
    if (innerSubdirs.length === 0) continue;

    let innerWithImages = 0;
    let innerWithChapterPattern = 0;

    for (const inner of innerSubdirs) {
      const innerPath = path.join(subPath, inner);
      const innerListed = listChapterImageFiles(innerPath);
      if (chapterDirHasNonEmptyListedImages(innerPath, innerListed)) {
        innerWithImages++;
        if (extractChapterNumberString(inner) != null) {
          innerWithChapterPattern++;
        }
      }
    }

    // Nếu subPath chứa >= 2 thư mục con có ảnh -> subPath là một bộ truyện chứa nhiều chương!
    // -> dir là thư mục gốc chứa nhiều truyện!
    if (innerWithImages >= 2) {
      return true;
    }

    // Nếu subPath chứa 1 thư mục con có ảnh và thư mục con đó có mẫu số chương (ví dụ 'Ch 1')
    // trong khi bản thân subPath không phải là số chương (ví dụ 'One Piece')
    if (innerWithImages === 1) {
      const subHasNum = extractChapterNumberString(sub) != null;
      if (!subHasNum && innerWithChapterPattern > 0) {
        return true;
      }
      childrenWithNestedChapters++;
    }
  }

  // Nếu có từ 2 thư mục con trở lên chứa các thư mục con có ảnh, và các thư mục con này không mang số chương
  if (childrenWithNestedChapters >= 2) {
    const childrenWithNum = subdirs.filter((s) => extractChapterNumberString(s) != null).length;
    if (childrenWithNum === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Nếu dir chỉ chứa đúng 1 thư mục con (không có ảnh ở gốc) — layout "wrapped root"
 * kiểu SPRITE/ bọc toàn bộ nội dung — trả về đường dẫn thư mục con đó, ngược lại null.
 * @param {string} dir
 * @returns {string|null}
 */
function detectWrappedRootDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const visible = entries.filter((n) => !n.startsWith('._') && !n.startsWith('.'));
  if (visible.length !== 1) return null;
  const candidate = path.join(dir, visible[0]);
  try {
    if (fs.statSync(candidate).isDirectory()) return candidate;
  } catch {
    /* */
  }
  return null;
}

/**
 * Bổ sung các thư mục chương có ảnh trên đĩa nhưng không được gán từ download_db.json.
 * @param {string} mangaDir
 * @param {Array<{ url: string, title: string, folderBasename: string }>} chapters
 * @returns {Array<{ url: string, title: string, folderBasename: string }>}
 */
function mergeScannedFoldersNotInChapters(mangaDir, chapters) {
  const usedFolders = new Set(
    chapters.map((ch) => String(ch.folderBasename || '').trim()).filter(Boolean),
  );
  const scanned = scanChaptersFromImageFoldersOnly(mangaDir);
  const extra = [];
  for (const ch of scanned) {
    const fb = String(ch.folderBasename || '').trim();
    if (!fb || usedFolders.has(fb)) continue;
    usedFolders.add(fb);
    extra.push(ch);
  }
  if (extra.length === 0) return chapters;
  return sortChaptersByFolder([...chapters, ...extra]);
}

/**
 * Quét thư mục truyện không dùng download_db.json: mỗi thư mục con có ít nhất một ảnh không rỗng = một chương.
 * @param {string} mangaDir
 * @returns {Array<{ url: string, title: string, folderBasename: string }>}
 */
function scanChaptersFromImageFoldersOnly(mangaDir) {
  const subdirs = readMangaSubdirs(mangaDir);
  const out = [];
  for (const d of subdirs) {
    const chapterDir = path.join(mangaDir, d);
    if (!chapterDirHasNonEmptyImages(chapterDir)) continue;
    out.push({
      url: `offline:${encodeURIComponent(d)}`,
      title: d,
      folderBasename: d,
    });
  }
  return sortChaptersByFolder(out);
}

function countImageChapterFoldersOnDisk(mangaDir) {
  if (!mangaDir || !fs.existsSync(mangaDir)) return 0;
  if (isMultiMangaRootDir(mangaDir)) return 0;
  const n = scanChaptersFromImageFoldersOnly(mangaDir).length;
  if (n > 0) return n;
  const direct = listChapterImageFiles(mangaDir);
  return direct.ok && direct.files.length > 0 ? 1 : 0;
}


function sortChaptersByFolder(chapters) {
  return [...chapters].sort((a, b) => {
    const na = extractChapterNumberString(a.title || a.folderBasename);
    const nb = extractChapterNumberString(b.title || b.folderBasename);
    if (na != null && nb != null) {
      const fa = parseFloat(na);
      const fb = parseFloat(nb);
      if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fa - fb;
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (na != null) return -1;
    if (nb != null) return 1;
    return String(a.title || a.folderBasename || '').localeCompare(
      String(b.title || b.folderBasename || ''),
      undefined,
      {
        numeric: true,
        sensitivity: 'base',
      }
    );
  });
}

function attachOfflineMangaDirAbsolute(manga, mangaDir) {
  const abs = path.resolve(mangaDir);
  return { ...manga, offlineMangaDirAbsolute: abs };
}

/**
 * @param {string} mangaDir — thư mục truyện (đã resolve)
 * @param {string} titleHint — tên gợi ý khi không có DB (thường là basename)
 */
function loadOfflineMangaAtResolvedDirCore(mangaDir, titleHint) {
  const mt = String(titleHint || path.basename(mangaDir) || '').trim();
  const resolved = resolveExistingMangaDirPath(mangaDir);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: 'Không tìm thấy thư mục truyện.' };
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: 'Không đọc được thư mục truyện.' };
  }
  if (!st.isDirectory()) {
    return { ok: false, error: 'Không phải thư mục truyện.' };
  }
  if (isMultiMangaRootDir(resolved)) {
    return { ok: false, error: 'Thư mục chứa nhiều bộ truyện khác nhau (thư mục gốc).' };
  }

  const tryFromDb = () => {
    const dbFile = path.join(resolved, DB_FILENAME);
    if (!fs.existsSync(dbFile)) return null;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch {
      return null;
    }
    const record = parsed.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {};
    const mangaTitleFromDb = String(parsed.mangaTitle || '').trim() || mt;
    const mangaUrlFromDb = String(parsed.mangaUrl || '').trim();
    const connector = String(parsed.connector || '').trim();

    const completedEntries = Object.entries(record)
      .filter(([, entry]) => entry && entry.status === 'completed')
      .map(([dbKey, entry]) => ({ dbKey, entry }));

    const assigned = assignFoldersToChapters(resolved, completedEntries);

    const out = [];
    for (const { dbKey, entry } of completedEntries) {
      const folderBasename = assigned.get(dbKey);
      if (!folderBasename) continue;
      const url = String(entry.url || '').trim();
      out.push({
        url: url || `offline:${encodeURIComponent(dbKey)}`,
        title: dbKey,
        folderBasename,
      });
    }

    if (out.length === 0) return null;

    const sorted = sortChaptersByFolder(out);
    const seen = new Set();
    let chapters = [];
    for (const ch of sorted) {
      const k = String(ch.url || ch.title || '').trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      chapters.push(ch);
    }
    chapters = mergeScannedFoldersNotInChapters(resolved, chapters);

    const coverOnDisk = findLocalCoverInMangaDir(resolved);
    return {
      ok: true,
      manga: attachOfflineMangaDirAbsolute(
        {
          title: mangaTitleFromDb,
          mangaUrl: mangaUrlFromDb,
          siteId: connector,
          coverUrl: '',
          offlineOnly: true,
        },
        resolved
      ),
      chapters,
      ...(coverOnDisk ? { localCoverPath: coverOnDisk } : {}),
    };
  };

  const fromDb = tryFromDb();
  if (fromDb) return fromDb;

  const scanned = scanChaptersFromImageFoldersOnly(resolved);
  if (scanned.length === 0) {
    const direct = listChapterImageFiles(resolved);
    if (direct.ok && direct.files.length > 0) {
      const coverOnDisk = findLocalCoverInMangaDir(resolved);
      return {
        ok: true,
        manga: attachOfflineMangaDirAbsolute(
          {
            title: mt,
            mangaUrl: '',
            siteId: '',
            coverUrl: '',
            offlineOnly: true,
          },
          resolved
        ),
        chapters: [
          {
            url: 'offline:.',
            title: mt || 'Chương hoàn chỉnh',
            folderBasename: '.',
          },
        ],
        ...(coverOnDisk ? { localCoverPath: coverOnDisk } : {}),
      };
    }
    return { ok: false, error: 'Không có chương có ảnh trên đĩa (hoặc thiếu download_db.json).' };
  }

  const seen = new Set();
  const chapters = [];
  for (const ch of scanned) {
    const k = String(ch.url || ch.title || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    chapters.push(ch);
  }

  const coverOnDisk = findLocalCoverInMangaDir(resolved);
  return {
    ok: true,
    manga: attachOfflineMangaDirAbsolute(
      {
        title: mt,
        mangaUrl: '',
        siteId: '',
        coverUrl: '',
        offlineOnly: true,
      },
      resolved
    ),
    chapters,
    ...(coverOnDisk ? { localCoverPath: coverOnDisk } : {}),
  };
}

function loadOfflineMangaAtResolvedDir(mangaDir, titleHint) {
  const resolved = resolveExistingMangaDirPath(mangaDir);
  const wrapped = detectWrappedRootDir(resolved);
  if (wrapped) {
    const subChapters = scanChaptersFromImageFoldersOnly(wrapped);
    if (subChapters.length > 0) {
      const wrappedResult = loadOfflineMangaAtResolvedDirCore(wrapped, titleHint);
      if (wrappedResult.ok && wrappedResult.chapters?.length) return wrappedResult;
    }
  }
  if (isMultiMangaRootDir(resolved)) {
    return { ok: false, error: 'Thư mục chứa nhiều bộ truyện khác nhau (thư mục gốc).' };
  }
  return loadOfflineMangaAtResolvedDirCore(resolved, titleHint);
}

/**
 * Dựng manga + danh sách chương từ download_db.json và thư mục đã tải (đọc offline, không cần mạng).
 * @param {string} baseSaveDir
 * @param {string} mangaTitle — tên thư mục truyện (khớp khi tải / Save To)
 * @returns {{ ok: boolean, error?: string, manga?: object, chapters?: Array<{ url: string, title: string, folderBasename: string }> }}
 */
function loadOfflineMangaFromDisk(baseSaveDir, mangaTitle) {
  const base = String(baseSaveDir || '').trim();
  const mt = String(mangaTitle || '').trim();
  if (!base || !mt) {
    return { ok: false, error: 'Thiếu thư mục lưu hoặc tên truyện.' };
  }
  const mangaDir = resolveMangaDir(base, mt);
  const primaryResult = loadOfflineMangaAtResolvedDir(mangaDir, mt);
  if (primaryResult?.ok) return primaryResult;

  // Fallback: Nếu truyện nằm trong thư mục con cấp 1 (danh mục / multi-manga root)
  try {
    const resolvedBase = path.resolve(base);
    if (fs.existsSync(resolvedBase)) {
      const entries = fs.readdirSync(resolvedBase, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const subDir = path.join(resolvedBase, entry.name);
        const candidateDir = resolveMangaDir(subDir, mt);
        const candidateResult = loadOfflineMangaAtResolvedDir(candidateDir, mt);
        if (candidateResult?.ok) {
          return candidateResult;
        }
      }
    }
  } catch {
    /* ignore fallback search errors */
  }

  return primaryResult;
}

/**
 * Mở truyện offline theo đường dẫn tuyệt đối tới thư mục truyện (không cần nằm trong Save To).
 */
function loadOfflineMangaFromAbsolutePath(absoluteMangaDir) {
  const raw_input = String(absoluteMangaDir || '').trim();
  const raw = raw_input.replace(/^['"]|['"]$/g, '');
  if (!raw) {
    return { ok: false, error: 'Thiếu đường dẫn thư mục truyện.' };
  }
  const resolved = path.resolve(raw);
  return loadOfflineMangaAtResolvedDir(resolved, path.basename(resolved));
}

module.exports = {
  loadOfflineMangaFromDisk,
  loadOfflineMangaFromAbsolutePath,
  loadOfflineMangaAtResolvedDir,
  findCandidateChapterFolders,
  assignFoldersToChapters,
  completedPagesMatchDisk,
  scanChaptersFromImageFoldersOnly,
  countImageChapterFoldersOnDisk,
  folderTieBreakScore,
  pickBestFolderBasename,
  chapterDirHasNonEmptyImages,
  detectWrappedRootDir,
  mergeScannedFoldersNotInChapters,
  readMangaSubdirs,
  isMultiMangaRootDir,
};
