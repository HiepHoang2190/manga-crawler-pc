/**
 * In-memory session over an open .cbz / .zip file.
 *
 * Replaces the old "extract to a temp folder then read" flow: the archive
 * stays open via yauzl and image bytes are decompressed on demand when the
 * renderer asks for a page. Indexing the central directory takes ~tens of ms
 * even for multi-hundred-MB archives, so the reader can render its first page
 * almost immediately and never blocks waiting for a full extract.
 *
 * Session lifecycle:
 *   openSession(cbzPath, opts)  → { ok, sessionId, manga, chapters }
 *   listChapterFiles(sessionId, folderBasename)
 *   readEntryBytes(sessionId, folderBasename, fileName)  → { ok, buffer, mime }
 *   materializeChapter(sessionId, folderBasename, destDir) → writes one chapter
 *                                                            to disk for tools
 *                                                            that need real files
 *                                                            (PDF/CBZ export).
 *   closeSession(sessionId)
 *
 * Path scheme exposed to the renderer:
 *   manga.offlineMangaDirAbsolute = `cbz-session://<sessionId>`
 * IPC handlers detect this prefix and route reads through this service
 * instead of touching the filesystem.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const { decodeEntryName } = require('./extractCbzWithEncoding');
const { extractChapterNumberString } = require('../shared/mangaUtils');
const { IMAGE_EXT } = require('../library/listChapterImageFiles');

const SESSION_URI_PREFIX = 'cbz-session://';
/** Synthetic chapter folder when every image is at the archive root. Kept in
 * sync with the constant of the same name in loadCbzForOfflineRead.js. */
const FLAT_CHAPTER_FOLDER = '_cbz_pages';

/** sessionId → { zipPath, zipfile, title, chapters: Map<folderBasename, ChapterState> } */
const SESSIONS = new Map();

/**
 * @typedef {Object} EntryRef
 * @property {string} fileName       — leaf basename, e.g. "001.jpg"
 * @property {object} entry          — yauzl entry object
 */

/**
 * @typedef {Object} ChapterState
 * @property {string} folderBasename — chapter directory name as seen by renderer
 * @property {string} title          — display title (currently == folderBasename)
 * @property {string} url            — synthetic offline URL
 * @property {EntryRef[]} files      — image entries, sorted by filename
 */

function isSessionUri(value) {
  return (
    typeof value === 'string' &&
    value.trim().startsWith(SESSION_URI_PREFIX)
  );
}

function sessionIdFromUri(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith(SESSION_URI_PREFIX)) return '';
  return trimmed.slice(SESSION_URI_PREFIX.length);
}

function sessionUri(sessionId) {
  return `${SESSION_URI_PREFIX}${sessionId}`;
}

function mimeForBasename(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return 'image/jpeg';
}

/** Safe-decode + normalize an entry name to forward-slash form, no leading "../". */
function normalizedEntryName(entry) {
  const utf8Flag = Boolean(entry.generalPurposeBitFlag & 0x800);
  const decoded = decodeEntryName(entry.fileName, utf8Flag);
  return decoded.replace(/\\/g, '/').replace(/^(\.\.\/|\/)+/, '');
}

function isImageBasename(basename) {
  if (!basename) return false;
  if (basename.startsWith('._') || basename.startsWith('.')) return false;
  const ext = path.extname(basename).toLowerCase();
  return IMAGE_EXT.has(ext);
}

/** Junk paths macOS / Windows like to sprinkle into ZIPs. */
function pathHasJunkSegment(segments) {
  for (const s of segments) {
    if (s === '__MACOSX') return true;
    if (s.startsWith('._')) return true;
    if (s === '.DS_Store') return true;
    if (s === 'Thumbs.db') return true;
  }
  return false;
}

/**
 * Group image entries into chapters. Mirrors the on-disk layout detection from
 * loadCbzForOfflineRead.js but without writing anything: flat archives become
 * one synthetic `_cbz_pages` chapter, wrapped-root archives have their outer
 * folder stripped, and ordinary chapter folders pass through unchanged.
 */
function classifyEntries(imageEntries) {
  const segmented = imageEntries
    .map(({ name, entry }) => {
      const segments = name.split('/').filter(Boolean);
      return { name, entry, segments };
    })
    .filter(({ segments }) => segments.length > 0 && !pathHasJunkSegment(segments));

  if (segmented.length === 0) return new Map();

  // Detect wrapped root: every image starts with the same top-level dir AND
  // there is at least one image at depth >= 3 below that dir.
  let strip = 0;
  const tops = new Set(
    segmented.map(({ segments }) => (segments.length > 1 ? segments[0] : '')),
  );
  if (tops.size === 1) {
    const sole = [...tops][0];
    const allWrapped =
      sole !== '' &&
      segmented.every(({ segments }) => segments.length > 1 && segments[0] === sole);
    const hasDeeperContent =
      allWrapped && segmented.some(({ segments }) => segments.length >= 3);
    if (allWrapped && hasDeeperContent) strip = 1;
  }

  /** @type {Map<string, EntryRef[]>} */
  const byFolder = new Map();

  for (const { entry, segments } of segmented) {
    const trimmed = strip > 0 ? segments.slice(strip) : segments;
    if (trimmed.length === 0) continue;

    let folderBasename;
    let fileName;
    if (trimmed.length === 1) {
      folderBasename = FLAT_CHAPTER_FOLDER;
      fileName = trimmed[0];
    } else {
      folderBasename = trimmed[0];
      fileName = trimmed[trimmed.length - 1];
    }

    if (!isImageBasename(fileName)) continue;

    if (!byFolder.has(folderBasename)) byFolder.set(folderBasename, []);
    byFolder.get(folderBasename).push({ fileName, entry });
  }

  for (const list of byFolder.values()) {
    list.sort((a, b) =>
      a.fileName.localeCompare(b.fileName, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
  }

  return byFolder;
}

function sortChapterFolderNames(names) {
  return [...names].sort((a, b) => {
    const na = extractChapterNumberString(a);
    const nb = extractChapterNumberString(b);
    if (na != null && nb != null) {
      const fa = parseFloat(na);
      const fb = parseFloat(nb);
      if (Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fa - fb;
    }
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function openYauzl(cbzPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      cbzPath,
      { lazyEntries: true, decodeStrings: false, autoClose: false },
      (err, zipfile) => {
        if (err) return reject(err);
        resolve(zipfile);
      },
    );
  });
}

function collectAllEntries(zipfile) {
  return new Promise((resolve, reject) => {
    const entries = [];
    zipfile.on('error', reject);
    zipfile.on('entry', (entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.readEntry();
  });
}

/**
 * Open a new CBZ session. Closes the zipfile and resolves to `{ok:false}` on
 * any error — callers can then fall back to the legacy disk-extract path.
 *
 * @param {string} cbzPath
 * @returns {Promise<{ok:boolean, error?:string, sessionId?:string, manga?:object, chapters?:Array}>}
 */
async function openSession(cbzPath) {
  const resolved = path.resolve(String(cbzPath || '').trim());
  if (!resolved) return { ok: false, error: 'Đường dẫn CBZ trống.' };
  if (!fs.existsSync(resolved)) return { ok: false, error: 'Không tìm thấy file CBZ.' };
  let st;
  try {
    st = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  if (!st.isFile()) return { ok: false, error: 'Không phải file CBZ.' };

  let zipfile;
  try {
    zipfile = await openYauzl(resolved);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) || 'Không mở được CBZ.' };
  }

  let rawEntries;
  try {
    rawEntries = await collectAllEntries(zipfile);
  } catch (e) {
    try { zipfile.close(); } catch { /* */ }
    return { ok: false, error: String(e?.message || e) || 'Không đọc được mục lục CBZ.' };
  }

  const imageEntries = [];
  for (const entry of rawEntries) {
    const name = normalizedEntryName(entry);
    if (!name || name.endsWith('/')) continue;
    const segments = name.split('/').filter(Boolean);
    if (segments.length === 0 || pathHasJunkSegment(segments)) continue;
    const basename = segments[segments.length - 1];
    if (!isImageBasename(basename)) continue;
    imageEntries.push({ name, entry });
  }

  if (imageEntries.length === 0) {
    try { zipfile.close(); } catch { /* */ }
    return { ok: false, error: 'Không có ảnh trong CBZ.' };
  }

  const byFolder = classifyEntries(imageEntries);
  if (byFolder.size === 0) {
    try { zipfile.close(); } catch { /* */ }
    return { ok: false, error: 'Không có chương có ảnh trong CBZ.' };
  }

  const sortedFolders = sortChapterFolderNames([...byFolder.keys()]);
  const title = path.basename(resolved, path.extname(resolved)) || 'CBZ';
  const sessionId = crypto.randomBytes(12).toString('hex');

  /** @type {Map<string, ChapterState>} */
  const chaptersMap = new Map();
  const chapters = [];
  for (const folderBasename of sortedFolders) {
    const files = byFolder.get(folderBasename);
    const chapterTitle =
      folderBasename === FLAT_CHAPTER_FOLDER ? title : folderBasename;
    const state = {
      folderBasename,
      title: chapterTitle,
      url: `offline:${encodeURIComponent(folderBasename)}`,
      files,
    };
    chaptersMap.set(folderBasename, state);
    chapters.push({
      folderBasename,
      title: chapterTitle,
      url: state.url,
    });
  }

  SESSIONS.set(sessionId, {
    zipPath: resolved,
    zipfile,
    title,
    chaptersMap,
  });

  const manga = {
    title,
    mangaUrl: '',
    siteId: '',
    coverUrl: '',
    offlineOnly: true,
    offlineMangaDirAbsolute: sessionUri(sessionId),
    cbzTempExtractDir: sessionUri(sessionId), // backwards-compat for "recent" UI
    cbzFilePath: resolved,
  };

  return { ok: true, sessionId, manga, chapters };
}

function getSession(sessionId) {
  return SESSIONS.get(sessionId) || null;
}

function listChapterFiles(sessionId, folderBasename) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: 'Phiên CBZ không tồn tại.', files: [] };
  const fb = String(folderBasename || '').trim();
  if (!fb) return { ok: false, error: 'Thiếu thư mục chương.', files: [] };
  const state = session.chaptersMap.get(fb);
  if (!state) return { ok: false, error: 'Chương không tồn tại trong CBZ.', files: [] };
  return { ok: true, files: state.files.map((f) => f.fileName) };
}

function findEntryRef(session, folderBasename, fileName) {
  const state = session.chaptersMap.get(String(folderBasename || '').trim());
  if (!state) return null;
  const target = String(fileName || '').trim();
  for (const f of state.files) {
    if (f.fileName === target) return f;
  }
  return null;
}

function readEntryStream(session, entry) {
  return new Promise((resolve, reject) => {
    session.zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

/**
 * Decompress one image entry into a Buffer.
 *
 * @returns {Promise<{ok:boolean, error?:string, buffer?:Buffer, mime?:string, fileName?:string}>}
 */
async function readEntryBytes(sessionId, folderBasename, fileName) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: 'Phiên CBZ không tồn tại.' };
  const ref = findEntryRef(session, folderBasename, fileName);
  if (!ref) return { ok: false, error: 'Không tìm thấy ảnh trong CBZ.' };
  try {
    const buffer = await readEntryStream(session, ref.entry);
    if (!buffer || buffer.length === 0) {
      return { ok: false, error: 'Ảnh rỗng.' };
    }
    return { ok: true, buffer, mime: mimeForBasename(ref.fileName), fileName: ref.fileName };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Write every page of a single chapter to a real directory on disk. Used when
 * a downstream tool (PDF/CBZ exporter, etc.) needs file paths instead of
 * in-memory buffers.
 *
 * @returns {Promise<{ok:boolean, error?:string, dir?:string, files?:string[]}>}
 */
async function materializeChapter(sessionId, folderBasename, destDir) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: 'Phiên CBZ không tồn tại.' };
  const state = session.chaptersMap.get(String(folderBasename || '').trim());
  if (!state) return { ok: false, error: 'Chương không tồn tại trong CBZ.' };
  const dir = String(destDir || '').trim();
  if (!dir) return { ok: false, error: 'Thiếu thư mục đích.' };
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const written = [];
    for (const ref of state.files) {
      const buffer = await readEntryStream(session, ref.entry);
      const outPath = path.join(dir, ref.fileName);
      await fs.promises.writeFile(outPath, buffer);
      written.push(ref.fileName);
    }
    return { ok: true, dir, files: written };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function closeSession(sessionId) {
  const session = SESSIONS.get(sessionId);
  if (!session) return { ok: false, error: 'Phiên không tồn tại.' };
  try {
    session.zipfile.close();
  } catch {
    /* */
  }
  SESSIONS.delete(sessionId);
  return { ok: true };
}

function closeAllSessions() {
  for (const id of [...SESSIONS.keys()]) {
    closeSession(id);
  }
}

module.exports = {
  SESSION_URI_PREFIX,
  isSessionUri,
  sessionIdFromUri,
  sessionUri,
  openSession,
  getSession,
  listChapterFiles,
  readEntryBytes,
  materializeChapter,
  closeSession,
  closeAllSessions,
};
