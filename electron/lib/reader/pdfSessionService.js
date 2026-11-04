/**
 * In-memory session over an open PDF file.
 *
 * Architecture: all pdfjs parsing and canvas rendering run inside a
 * worker_threads Worker (pdfRenderWorker.js) so the Electron main-process
 * event loop is never blocked — no more "treo app" when opening large PDFs.
 *
 * The main thread keeps only lightweight session metadata (title, numPages,
 * fileNames, LRU cache) and a LIFO render queue for page prioritisation.
 * Heavy pdfDoc work lives entirely in the worker.
 *
 * Session lifecycle:
 *   openSession(pdfPath, opts)  → { ok, sessionId, manga, chapters }
 *   listChapterFiles(sessionId, folderBasename)   — synchronous
 *   readEntryBytes(sessionId, folderBasename, fileName)
 *     → asks worker to render that page (with LRU caching) → PNG buffer
 *   materializeChapter(sessionId, folderBasename, destDir)
 *     → renders every page to disk, for export pipelines
 *   closeSession(sessionId)
 *
 * Path scheme exposed to the renderer:
 *   manga.offlineMangaDirAbsolute = `pdf-session://<sessionId>`
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const SESSION_URI_PREFIX = 'pdf-session://';
const PDF_PAGES_FOLDER = '_pdf_pages';

const DEFAULT_SCALE = 1.5;
const DEFAULT_PAGE_CACHE_LIMIT = 16;

/** sessionId → SessionMetadata (main-thread side, no pdfDoc) */
const SESSIONS = new Map();

// ---------------------------------------------------------------------------
// Worker management
// ---------------------------------------------------------------------------

const WORKER_SCRIPT = path.join(__dirname, 'workers', 'pdfRenderWorker.js');

/** Lazily-spawned singleton worker. */
let pdfWorker = null;
let workerTaskSeq = 1;
/** id → { resolve, reject } for in-flight worker requests */
const workerPending = new Map();

function getWorker() {
  if (pdfWorker) return pdfWorker;
  pdfWorker = new Worker(WORKER_SCRIPT);
  // unref so the worker does not prevent Jest / Electron from exiting naturally.
  pdfWorker.unref();
  pdfWorker.on('message', (msg) => {
    const entry = workerPending.get(msg.id);
    if (!entry) return;
    workerPending.delete(msg.id);
    if (msg.ok) {
      entry.resolve(msg);
    } else {
      entry.reject(new Error(msg.error || 'PDF worker failure'));
    }
  });
  pdfWorker.on('error', (err) => {
    // Reject all pending tasks then clear the worker so it respawns next time.
    for (const [, entry] of workerPending) {
      entry.reject(err);
    }
    workerPending.clear();
    pdfWorker = null;
  });
  pdfWorker.on('exit', () => {
    for (const [, entry] of workerPending) {
      entry.reject(new Error('PDF worker exited unexpectedly.'));
    }
    workerPending.clear();
    pdfWorker = null;
  });
  return pdfWorker;
}

function workerCall(payload) {
  return new Promise((resolve, reject) => {
    const id = workerTaskSeq++;
    workerPending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...payload });
  });
}

// ---------------------------------------------------------------------------
// Session URI helpers
// ---------------------------------------------------------------------------

function isSessionUri(value) {
  return typeof value === 'string' && value.trim().startsWith(SESSION_URI_PREFIX);
}

function sessionIdFromUri(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith(SESSION_URI_PREFIX)) return '';
  return trimmed.slice(SESSION_URI_PREFIX.length);
}

function sessionUri(sessionId) {
  return `${SESSION_URI_PREFIX}${sessionId}`;
}

// ---------------------------------------------------------------------------
// Page file naming
// ---------------------------------------------------------------------------

function pageFileName(pageIndex1Based) {
  return `${String(pageIndex1Based).padStart(3, '0')}.png`;
}

function parsePageIndex(fileName) {
  const m = String(fileName || '').match(/^(\d+)\.png$/i);
  if (!m) return 0;
  return parseInt(m[1], 10) || 0;
}

// ---------------------------------------------------------------------------
// LRU cache helpers (main-thread, PNG buffers returned by worker)
// ---------------------------------------------------------------------------

function lruTouch(session, pageIndex, buffer) {
  if (session.cache.has(pageIndex)) session.cache.delete(pageIndex);
  session.cache.set(pageIndex, buffer);
  while (session.cache.size > session.cacheLimit) {
    const firstKey = session.cache.keys().next().value;
    session.cache.delete(firstKey);
  }
}

// ---------------------------------------------------------------------------
// LIFO render queue (main-thread coordination, rendering runs in worker)
// ---------------------------------------------------------------------------

function enqueuePageRender(session, pageIndex) {
  const cached = session.cache.get(pageIndex);
  if (cached) {
    lruTouch(session, pageIndex, cached);
    return Promise.resolve(cached);
  }
  for (const job of session.renderQueue) {
    if (job.pageIndex === pageIndex) {
      return new Promise((resolve, reject) => {
        const original = job.resolve;
        const originalReject = job.reject;
        job.resolve = (buf) => { original(buf); resolve(buf); };
        job.reject = (err) => { originalReject(err); reject(err); };
      });
    }
  }
  return new Promise((resolve, reject) => {
    session.renderQueue.push({ pageIndex, resolve, reject });
    drainRenderQueue(session);
  });
}

async function drainRenderQueue(session) {
  if (session.draining) return;
  session.draining = true;
  try {
    while (session.renderQueue.length > 0) {
      const job = session.renderQueue.pop();
      try {
        const buffer = await workerRenderPage(session.sessionId, job.pageIndex);
        lruTouch(session, job.pageIndex, buffer);
        job.resolve(buffer);
      } catch (e) {
        job.reject(e);
      }
    }
  } finally {
    session.draining = false;
  }
}

async function workerRenderPage(sessionId, pageIndex) {
  const msg = await workerCall({ type: 'renderPage', sessionId, pageIndex });
  return Buffer.isBuffer(msg.buffer) ? msg.buffer : Buffer.from(msg.buffer);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a new PDF session. Heavy parsing runs in the worker thread.
 */
async function openSession(pdfPath, opts = {}) {
  const resolved = path.resolve(String(pdfPath || '').trim());
  if (!resolved) return { ok: false, error: 'Đường dẫn PDF trống.' };
  if (!fs.existsSync(resolved)) return { ok: false, error: 'Không tìm thấy file PDF.' };
  let st;
  try {
    st = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  if (!st.isFile()) return { ok: false, error: 'Không phải file PDF.' };

  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : DEFAULT_SCALE;
  const cacheLimit = Number.isFinite(opts.pageCacheLimit) && opts.pageCacheLimit > 0
    ? Math.floor(opts.pageCacheLimit)
    : DEFAULT_PAGE_CACHE_LIMIT;

  const sessionId = crypto.randomBytes(12).toString('hex');

  // Offload the blocking pdfjs work to the worker thread.
  let workerResult;
  try {
    workerResult = await workerCall({ type: 'openSession', sessionId, pdfPath: resolved, scale });
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (
      msg.includes('password') ||
      msg.includes('encrypted') ||
      msg.includes('passwordexception') ||
      msg.includes('no password given') ||
      msg.includes('mật khẩu')
    ) {
      return { ok: false, error: 'PDF có mật khẩu, không đọc được.' };
    }
    return { ok: false, error: String(e?.message || e) || 'Không mở được PDF.' };
  }

  const numPages = Number(workerResult.numPages) || 0;
  const title = path.basename(resolved, path.extname(resolved)) || 'PDF';
  const fileNames = [];
  for (let i = 1; i <= numPages; i++) fileNames.push(pageFileName(i));

  SESSIONS.set(sessionId, {
    sessionId,
    pdfPath: resolved,
    numPages,
    scale,
    title,
    fileNames,
    cache: new Map(),
    cacheLimit,
    renderQueue: [],
    draining: false,
  });

  const manga = {
    title,
    mangaUrl: '',
    siteId: '',
    coverUrl: '',
    offlineOnly: true,
    offlineMangaDirAbsolute: sessionUri(sessionId),
    cbzTempExtractDir: sessionUri(sessionId),
    pdfFilePath: resolved,
  };
  const chapters = [
    {
      folderBasename: PDF_PAGES_FOLDER,
      title,
      url: `offline:${encodeURIComponent(PDF_PAGES_FOLDER)}`,
    },
  ];

  return { ok: true, sessionId, manga, chapters };
}

function getSession(sessionId) {
  return SESSIONS.get(sessionId) || null;
}

function listChapterFiles(sessionId, folderBasename) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: 'Phiên PDF không tồn tại.', files: [] };
  const fb = String(folderBasename || '').trim();
  if (fb !== PDF_PAGES_FOLDER) {
    return { ok: false, error: 'Chương không tồn tại trong PDF.', files: [] };
  }
  return { ok: true, files: [...session.fileNames] };
}

/**
 * Render a single page to PNG bytes (with LRU caching, LIFO priority).
 */
async function readEntryBytes(sessionId, folderBasename, fileName) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: 'Phiên PDF không tồn tại.' };
  const fb = String(folderBasename || '').trim();
  if (fb !== PDF_PAGES_FOLDER) {
    return { ok: false, error: 'Chương không tồn tại trong PDF.' };
  }
  const pageIndex = parsePageIndex(fileName);
  if (pageIndex <= 0 || pageIndex > session.numPages) {
    return { ok: false, error: 'Trang không hợp lệ.' };
  }
  try {
    const buffer = await enqueuePageRender(session, pageIndex);
    return { ok: true, buffer, mime: 'image/png', fileName: pageFileName(pageIndex) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) || 'Lỗi render PDF.' };
  }
}

/**
 * Render every page to disk for export pipelines.
 */
async function materializeChapter(sessionId, folderBasename, destDir) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, error: 'Phiên PDF không tồn tại.' };
  const fb = String(folderBasename || '').trim();
  if (fb !== PDF_PAGES_FOLDER) {
    return { ok: false, error: 'Chương không tồn tại trong PDF.' };
  }
  const dir = String(destDir || '').trim();
  if (!dir) return { ok: false, error: 'Thiếu thư mục đích.' };
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const written = [];
    for (let i = 1; i <= session.numPages; i++) {
      const buffer = await workerRenderPage(sessionId, i);
      const fname = pageFileName(i);
      await fs.promises.writeFile(path.join(dir, fname), buffer);
      written.push(fname);
    }
    return { ok: true, dir, files: written };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function closeSession(sessionId) {
  const session = SESSIONS.get(sessionId);
  if (!session) return { ok: false, error: 'Phiên không tồn tại.' };
  // Reject anything still queued.
  for (const job of session.renderQueue) {
    try { job.reject(new Error('Phiên PDF đã đóng.')); } catch { /* */ }
  }
  session.renderQueue.length = 0;
  session.cache.clear();
  SESSIONS.delete(sessionId);
  // Tell the worker to release the pdfDoc.
  workerCall({ type: 'closeSession', sessionId }).catch(() => { /* worker may have exited */ });
  return { ok: true };
}

function closeAllSessions() {
  for (const id of [...SESSIONS.keys()]) {
    closeSession(id);
  }
}

module.exports = {
  SESSION_URI_PREFIX,
  PDF_PAGES_FOLDER,
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
