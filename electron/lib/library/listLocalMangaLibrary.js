const fs = require('fs');
const path = require('path');
const { countCompletedChaptersAtPath } = require('./localChapterCount');
const { findLocalCoverInMangaDir } = require('./findLocalCoverFile');
const { IMAGE_EXT } = require('./listChapterImageFiles');
const { defaultLibraryScanCache } = require('./libraryScanCache');

const COVER_RE = /^(cover|poster|folder|thumb|thumbnail|front)\.(jpe?g|png|webp|avif|gif|bmp)$/i;

function findLocalCoverFast(mangaDir, entries) {
  if (Array.isArray(entries)) {
    for (const ent of entries) {
      if (ent.isDirectory && ent.isDirectory()) continue;
      const n = typeof ent === 'string' ? ent : ent.name;
      if (typeof n !== 'string' || n.startsWith('.') || n.startsWith('._')) continue;
      if (COVER_RE.test(n)) {
        const fp = path.join(mangaDir, n);
        try {
          if (fs.statSync(fp).size > 0) return path.resolve(fp);
        } catch {
          /* */
        }
      }
    }
    for (const ent of entries) {
      if (ent.isDirectory && ent.isDirectory()) continue;
      const n = typeof ent === 'string' ? ent : ent.name;
      if (typeof n !== 'string' || n.startsWith('.') || n.startsWith('._')) continue;
      const ext = path.extname(n).toLowerCase();
      if (IMAGE_EXT.has(ext)) {
        const fp = path.join(mangaDir, n);
        try {
          if (fs.statSync(fp).size > 0) return path.resolve(fp);
        } catch {
          /* */
        }
      }
    }
  }
  return findLocalCoverInMangaDir(mangaDir) || undefined;
}

function parseDbFile(mangaDir) {
  const dbFile = path.join(mangaDir, 'download_db.json');
  const hasDb = fs.existsSync(dbFile);
  let mangaUrl = '';
  let siteId = '';
  if (hasDb) {
    try {
      const raw = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        mangaUrl = String(parsed.mangaUrl || '').trim();
        siteId = String(parsed.connector || '').trim();
      }
    } catch {
      /* ignore corrupt db */
    }
  }
  return { hasDb, mangaUrl, siteId };
}

const COMIC_ARCHIVE_EXTS = new Set([
  '.cbz',
  '.zip',
  '.cbr',
  '.rar',
  '.pdf',
  '.epub',
  '.mobi',
  '.azw',
  '.azw3',
]);

function getComicArchivesInDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const archives = [];
    for (const ent of entries) {
      if (ent.isDirectory()) continue;
      const n = ent.name;
      if (n.startsWith('.') || n.startsWith('._')) continue;
      const ext = path.extname(n).toLowerCase();
      if (COMIC_ARCHIVE_EXTS.has(ext)) {
        archives.push(n);
      }
    }
    return archives;
  } catch {
    return [];
  }
}

async function getComicArchivesInDirAsync(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const archives = [];
    for (const ent of entries) {
      if (ent.isDirectory()) continue;
      const n = ent.name;
      if (n.startsWith('.') || n.startsWith('._')) continue;
      const ext = path.extname(n).toLowerCase();
      if (COMIC_ARCHIVE_EXTS.has(ext)) {
        archives.push(n);
      }
    }
    return archives;
  } catch {
    return [];
  }
}

function hasChildManga(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('._')) continue;
      const subPath = path.join(dirPath, ent.name);
      if (fs.existsSync(path.join(subPath, 'download_db.json'))) return true;

      let innerEntries;
      try {
        innerEntries = fs.readdirSync(subPath, { withFileTypes: true });
      } catch {
        continue;
      }
      const hasArchive = innerEntries.some(
        (ie) =>
          !ie.isDirectory() &&
          !ie.name.startsWith('.') &&
          !ie.name.startsWith('._') &&
          COMIC_ARCHIVE_EXTS.has(path.extname(ie.name).toLowerCase())
      );
      if (hasArchive) return true;

      const hasInnerDirs = innerEntries.some(
        (ie) => ie.isDirectory() && !ie.name.startsWith('.') && !ie.name.startsWith('._')
      );
      if (hasInnerDirs) {
        const count = countCompletedChaptersAtPath(subPath);
        if (count > 0) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function hasChildMangaAsync(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('._')) continue;
      const subPath = path.join(dirPath, ent.name);
      if (fs.existsSync(path.join(subPath, 'download_db.json'))) return true;

      let innerEntries;
      try {
        innerEntries = await fs.promises.readdir(subPath, { withFileTypes: true });
      } catch {
        continue;
      }
      const hasArchive = innerEntries.some(
        (ie) =>
          !ie.isDirectory() &&
          !ie.name.startsWith('.') &&
          !ie.name.startsWith('._') &&
          COMIC_ARCHIVE_EXTS.has(path.extname(ie.name).toLowerCase())
      );
      if (hasArchive) return true;

      const hasInnerDirs = innerEntries.some(
        (ie) => ie.isDirectory() && !ie.name.startsWith('.') && !ie.name.startsWith('._')
      );
      if (hasInnerDirs) {
        const count = countCompletedChaptersAtPath(subPath);
        if (count > 0) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Liệt kê thư mục truyện con của thư mục Lưu tại có ít nhất một chương đọc được (DB hoặc ảnh),
 * hoặc chứa tệp nén truyện tranh (CBZ, CBR, ZIP...).
 * Hỗ trợ quét lồng nhau (nested categories/subdirectories) nhiều cấp.
 * @param {string} baseSaveDir
 * @param {boolean} [allowNested=true]
 * @param {number} [maxDepth=2]
 * @param {number} [currentDepth=0]
 * @param {object} [options={}]
 * @returns {Array<{ mangaTitle: string, chapterCount: number, hasDb: boolean, absolutePath: string, category?: string, archiveKind?: 'cbz'|'archive' }>}
 */
function listLocalMangaUnderSaveDir(baseSaveDir, allowNested = true, maxDepth = 2, currentDepth = 0, options = {}) {
  const base = path.resolve(String(baseSaveDir || '').trim());
  if (!base || !fs.existsSync(base)) return [];
  let names;
  try {
    names = fs.readdirSync(base);
  } catch {
    return [];
  }
  const out = [];
  const seen = new Set();
  const force = options?.force === true;
  const cache = options?.cache || defaultLibraryScanCache;

  for (const name of names) {
    if (name.startsWith('.') || name.startsWith('._')) continue;
    const mangaDir = path.join(base, name);
    let st;
    try {
      st = fs.statSync(mangaDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    const absPath = path.resolve(mangaDir);
    const dbFile = path.join(mangaDir, 'download_db.json');
    const hasDb = fs.existsSync(dbFile);
    let dbMtimeMs = null;
    if (hasDb) {
      try {
        dbMtimeMs = fs.statSync(dbFile).mtimeMs;
      } catch {
        /* */
      }
    }

    if (!force && cache) {
      const cached = cache.get(absPath, st.mtimeMs, dbMtimeMs);
      if (cached) {
        if (!seen.has(cached.absolutePath)) {
          seen.add(cached.absolutePath);
          out.push(cached);
        }
        continue;
      }
    }

    // Fast path: Nếu có download_db.json, đây chắc chắn là 1 bộ truyện (không thể là Category)
    if (hasDb) {
      const chapterCount = countCompletedChaptersAtPath(mangaDir);
      if (chapterCount > 0) {
        const { mangaUrl, siteId } = parseDbFile(mangaDir);
        let dirEntries;
        try {
          dirEntries = fs.readdirSync(mangaDir, { withFileTypes: true });
        } catch {
          dirEntries = [];
        }
        const localCoverPath = findLocalCoverFast(mangaDir, dirEntries);
        const item = {
          mangaTitle: name,
          chapterCount,
          hasDb: true,
          mangaUrl,
          siteId,
          absolutePath: absPath,
          ...(localCoverPath ? { localCoverPath } : {}),
        };
        if (cache) cache.set(absPath, st.mtimeMs, dbMtimeMs, item);
        if (!seen.has(absPath)) {
          seen.add(absPath);
          out.push(item);
        }
        continue;
      }
    }

    // Nếu thư mục này chứa các bộ truyện con bên trong -> nó là Category/Container, quét đệ quy tiếp
    if (allowNested && currentDepth < maxDepth && hasChildManga(mangaDir)) {
      const subManga = listLocalMangaUnderSaveDir(mangaDir, allowNested, maxDepth, currentDepth + 1, options);
      for (const sm of subManga) {
        if (!seen.has(sm.absolutePath)) {
          seen.add(sm.absolutePath);
          out.push({
            ...sm,
            category: sm.category || name,
          });
        }
      }
      continue;
    }

    const chapterCount = countCompletedChaptersAtPath(mangaDir);
    if (chapterCount > 0) {
      const { mangaUrl, siteId } = parseDbFile(mangaDir);
      let dirEntries;
      try {
        dirEntries = fs.readdirSync(mangaDir, { withFileTypes: true });
      } catch {
        dirEntries = [];
      }
      const localCoverPath = findLocalCoverFast(mangaDir, dirEntries);
      const item = {
        mangaTitle: name,
        chapterCount,
        hasDb: false,
        mangaUrl,
        siteId,
        absolutePath: absPath,
        ...(localCoverPath ? { localCoverPath } : {}),
      };
      if (cache) cache.set(absPath, st.mtimeMs, null, item);
      if (!seen.has(absPath)) {
        seen.add(absPath);
        out.push(item);
      }
      continue;
    }

    const archiveFiles = getComicArchivesInDir(mangaDir);
    if (archiveFiles.length > 0) {
      const isPureCbz = archiveFiles.every((f) => f.toLowerCase().endsWith('.cbz'));
      let dirEntries;
      try {
        dirEntries = fs.readdirSync(mangaDir, { withFileTypes: true });
      } catch {
        dirEntries = [];
      }
      const localCoverPath = findLocalCoverFast(mangaDir, dirEntries);
      const item = {
        mangaTitle: name,
        chapterCount: archiveFiles.length,
        hasDb: false,
        mangaUrl: '',
        siteId: '',
        archiveKind: isPureCbz ? 'cbz' : 'archive',
        absolutePath: absPath,
        ...(localCoverPath ? { localCoverPath } : {}),
      };
      if (cache) cache.set(absPath, st.mtimeMs, null, item);
      if (!seen.has(absPath)) {
        seen.add(absPath);
        out.push(item);
      }
      continue;
    }
  }

  if (currentDepth === 0 && cache) {
    cache.scheduleFlush();
  }

  return currentDepth === 0
    ? out.sort((a, b) =>
        a.mangaTitle.localeCompare(b.mangaTitle, undefined, { numeric: true, sensitivity: 'base' })
      )
    : out;
}

/**
 * Phiên bản bất đồng bộ của listLocalMangaUnderSaveDir.
 * @param {string} baseSaveDir
 * @param {boolean} [allowNested=true]
 * @param {number} [maxDepth=2]
 * @param {number} [currentDepth=0]
 * @param {object} [options={}]
 * @returns {Promise<Array<{ mangaTitle: string, chapterCount: number, hasDb: boolean, absolutePath: string, category?: string, archiveKind?: 'cbz'|'archive' }>>}
 */
async function listLocalMangaUnderSaveDirAsync(baseSaveDir, allowNested = true, maxDepth = 2, currentDepth = 0, options = {}) {
  const base = path.resolve(String(baseSaveDir || '').trim());
  if (!base || !fs.existsSync(base)) return [];
  let names;
  try {
    names = await fs.promises.readdir(base);
  } catch {
    return [];
  }

  const force = options?.force === true;
  const cache = options?.cache || defaultLibraryScanCache;

  const tasks = names
    .filter((name) => !name.startsWith('.') && !name.startsWith('._'))
    .map(async (name) => {
      const mangaDir = path.join(base, name);
      let st;
      try {
        st = await fs.promises.stat(mangaDir);
        if (!st.isDirectory()) return null;
      } catch {
        return null;
      }

      const absPath = path.resolve(mangaDir);
      const dbFile = path.join(mangaDir, 'download_db.json');
      const hasDb = fs.existsSync(dbFile);
      let dbMtimeMs = null;
      if (hasDb) {
        try {
          const dbSt = await fs.promises.stat(dbFile);
          dbMtimeMs = dbSt.mtimeMs;
        } catch {
          /* */
        }
      }

      if (!force && cache) {
        const cached = cache.get(absPath, st.mtimeMs, dbMtimeMs);
        if (cached) {
          return [cached];
        }
      }

      // Fast path: Nếu có download_db.json, đây chắc chắn là 1 bộ truyện (không thể là Category)
      if (hasDb) {
        const chapterCount = countCompletedChaptersAtPath(mangaDir);
        if (chapterCount > 0) {
          const { mangaUrl, siteId } = parseDbFile(mangaDir);
          let dirEntries;
          try {
            dirEntries = await fs.promises.readdir(mangaDir, { withFileTypes: true });
          } catch {
            dirEntries = [];
          }
          const localCoverPath = findLocalCoverFast(mangaDir, dirEntries);
          const item = {
            mangaTitle: name,
            chapterCount,
            hasDb: true,
            mangaUrl,
            siteId,
            absolutePath: absPath,
            ...(localCoverPath ? { localCoverPath } : {}),
          };
          if (cache) cache.set(absPath, st.mtimeMs, dbMtimeMs, item);
          return [item];
        }
      }

      // Nếu thư mục này chứa các bộ truyện con bên trong -> nó là Category/Container, quét đệ quy tiếp
      if (allowNested && currentDepth < maxDepth && (await hasChildMangaAsync(mangaDir))) {
        const subManga = await listLocalMangaUnderSaveDirAsync(mangaDir, allowNested, maxDepth, currentDepth + 1, options);
        return subManga.map((sm) => ({ ...sm, category: sm.category || name }));
      }

      const chapterCount = countCompletedChaptersAtPath(mangaDir);
      if (chapterCount > 0) {
        const { mangaUrl, siteId } = parseDbFile(mangaDir);
        let dirEntries;
        try {
          dirEntries = await fs.promises.readdir(mangaDir, { withFileTypes: true });
        } catch {
          dirEntries = [];
        }
        const localCoverPath = findLocalCoverFast(mangaDir, dirEntries);
        const item = {
          mangaTitle: name,
          chapterCount,
          hasDb: false,
          mangaUrl,
          siteId,
          absolutePath: absPath,
          ...(localCoverPath ? { localCoverPath } : {}),
        };
        if (cache) cache.set(absPath, st.mtimeMs, null, item);
        return [item];
      }

      const archiveFiles = await getComicArchivesInDirAsync(mangaDir);
      if (archiveFiles.length > 0) {
        const isPureCbz = archiveFiles.every((f) => f.toLowerCase().endsWith('.cbz'));
        let dirEntries;
        try {
          dirEntries = await fs.promises.readdir(mangaDir, { withFileTypes: true });
        } catch {
          dirEntries = [];
        }
        const localCoverPath = findLocalCoverFast(mangaDir, dirEntries);
        const item = {
          mangaTitle: name,
          chapterCount: archiveFiles.length,
          hasDb: false,
          mangaUrl: '',
          siteId: '',
          archiveKind: isPureCbz ? 'cbz' : 'archive',
          absolutePath: absPath,
          ...(localCoverPath ? { localCoverPath } : {}),
        };
        if (cache) cache.set(absPath, st.mtimeMs, null, item);
        return [item];
      }

      return null;
    });

  const results = await Promise.all(tasks);
  const seen = new Set();
  const out = [];
  for (const group of results) {
    if (!group) continue;
    for (const item of group) {
      if (!seen.has(item.absolutePath)) {
        seen.add(item.absolutePath);
        out.push(item);
      }
    }
  }

  if (currentDepth === 0 && cache) {
    cache.scheduleFlush();
  }

  return currentDepth === 0
    ? out.sort((a, b) =>
        a.mangaTitle.localeCompare(b.mangaTitle, undefined, { numeric: true, sensitivity: 'base' })
      )
    : out;
}

module.exports = { listLocalMangaUnderSaveDir, listLocalMangaUnderSaveDirAsync };
