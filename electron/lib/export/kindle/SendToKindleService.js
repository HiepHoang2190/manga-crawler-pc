'use strict';

/**
 * SendToKindleService — orchestrates: ensure login → prepare files →
 * upload each part to Amazon → report progress. One prepared part = one Kindle
 * document (all of the user's devices sync it from the library).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { KindleAuthSession, SessionExpiredError } = require('./KindleAuthSession');
const { createUploadClient } = require('./KindleUploadClient');
const { prepareKindleFiles: defaultPrepare } = require('./prepareKindleFiles');
const { MAX_UPLOAD_BYTES, extensionOf } = require('./kindleContentTypes');

/** Ready files allowed on the hub tab (no convert). */
const READY_FILE_EXTS = new Set(['pdf', 'epub']);

/** Amazon Personal Documents console (newest first). */
const AMAZON_PDOCS_URL =
  'https://www.amazon.com/hz/mycd/digital-console/contentlist/pdocs/dateDsc/';

function makeTempDir(root) {
  const base = root || path.join(os.tmpdir(), 'send-to-kindle');
  const dir = path.join(base, `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function cleanupDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} [deps]
 * @param {import('./KindleAuthSession').KindleAuthSession} [deps.auth]
 * @param {{ uploadFile: Function }} [deps.uploadClient]
 * @param {Function} [deps.prepareKindleFiles]
 * @param {object} [deps.electron]
 */
function createSendToKindleService(deps = {}) {
  const auth = deps.auth || new KindleAuthSession(deps.electron);
  const uploadClient = deps.uploadClient || createUploadClient({ auth, electron: deps.electron });
  const prepare = deps.prepareKindleFiles || defaultPrepare;

  function isLoggedIn() {
    return auth.isLoggedIn();
  }
  function login() {
    return auth.login();
  }
  function logout() {
    return auth.logout();
  }
  function getAccountLabel() {
    return auth.getAccountLabel();
  }

  /**
   * @param {object} params
   * @param {string} params.absoluteMangaDir
   * @param {string} params.mangaTitle
   * @param {Array} params.chapters
   * @param {string} [params.title]
   * @param {string} [params.author]
   * @param {'epub'|'pdf'} [params.format]
   * @param {object} params.chapterFolderFormat
   * @param {boolean} [params.rotateDoublePage]
   * @param {boolean} [params.pdfSeamless]
   * @param {boolean} [params.deleteLocalAfterUpload=true]
   * @param {(p: object) => void} [params.onProgress]
   * @returns {Promise<object>}
   */
  async function send(params) {
    const onProgress = typeof params.onProgress === 'function' ? params.onProgress : () => {};
    const deleteLocalAfterUpload = params.deleteLocalAfterUpload !== false;

    if (!(await auth.isLoggedIn())) {
      return { ok: false, needLogin: true };
    }

    const tempDir = makeTempDir(deps.tempRoot);
    /** When true, leave prepared files on disk for the user. */
    let keepLocal = false;

    try {
      const prep = await prepare(
        {
          absoluteMangaDir: params.absoluteMangaDir,
          mangaTitle: params.mangaTitle,
          chapters: params.chapters,
          chapterFolderFormat: params.chapterFolderFormat,
          rotateDoublePage: params.rotateDoublePage,
          pdfSeamless: params.pdfSeamless,
          format: params.format,
          author: params.author,
          outputDir: tempDir,
          onProgress: (p) => {
            const total = p && p.total ? p.total : 0;
            const done = p && p.done ? p.done : 0;
            onProgress({
              phase: 'prepare',
              pct: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
              label: (p && p.label) || '',
            });
          },
        },
        {
          exportChaptersToPdf: deps.exportChaptersToPdf,
          exportChaptersToEpub: deps.exportChaptersToEpub,
        }
      );

      if (!prep.ok) {
        return { ok: false, error: prep.error, amazonLibraryUrl: AMAZON_PDOCS_URL };
      }

      const files = prep.files;
      const totalParts = files.length;
      const results = [];

      for (let i = 0; i < files.length; i += 1) {
        const filePath = files[i];
        const name = path.basename(filePath);
        const sizeBytes = fileSizeBytes(filePath);
        const partIndex = i + 1;
        const emitUpload = (pct) =>
          onProgress({
            phase: 'upload',
            partIndex,
            totalParts,
            pct,
            label: name,
            sizeBytes,
          });
        emitUpload(0);

        const runUpload = () =>
          uploadClient.uploadFile({
            filePath,
            title:
              totalParts > 1
                ? `${params.title || params.mangaTitle} (${partIndex}/${totalParts})`
                : params.title || params.mangaTitle,
            author: params.author,
            onProgress: emitUpload,
          });

        try {
          let res;
          try {
            res = await runUpload();
          } catch (e) {
            if (e instanceof SessionExpiredError || e?.code === 'SESSION_EXPIRED') {
              const relogged = await auth.login();
              if (!relogged) {
                keepLocal = !deleteLocalAfterUpload;
                return {
                  ok: false,
                  needLogin: true,
                  results,
                  amazonLibraryUrl: AMAZON_PDOCS_URL,
                  outputDir: keepLocal ? tempDir : undefined,
                  deletedLocal: !keepLocal,
                };
              }
              res = await runUpload();
            } else {
              throw e;
            }
          }
          results.push({
            name,
            localPath: filePath,
            sizeBytes,
            ok: Boolean(res?.ok),
            error: res?.ok ? undefined : res?.error,
          });
        } catch (e) {
          results.push({
            name,
            localPath: filePath,
            sizeBytes,
            ok: false,
            error: String(e?.message || e),
          });
        }
      }

      keepLocal = !deleteLocalAfterUpload;
      const allOk = results.every((r) => r.ok);
      return {
        ok: allOk,
        results,
        amazonLibraryUrl: AMAZON_PDOCS_URL,
        outputDir: keepLocal ? tempDir : undefined,
        deletedLocal: !keepLocal,
      };
    } catch (e) {
      return {
        ok: false,
        error: String(e?.message || e),
        amazonLibraryUrl: AMAZON_PDOCS_URL,
      };
    } finally {
      if (!keepLocal) cleanupDir(tempDir);
    }
  }

  /**
   * Upload one already-prepared EPUB/PDF (hub tab / ready files).
   * @param {object} params
   * @param {string} params.filePath
   * @param {string} [params.title]
   * @param {string} [params.author]
   * @param {(p: object) => void} [params.onProgress]
   */
  async function sendFile(params) {
    const onProgress = typeof params.onProgress === 'function' ? params.onProgress : () => {};
    const filePath = String(params.filePath || '').trim();

    if (!(await auth.isLoggedIn())) {
      return { ok: false, needLogin: true };
    }
    if (!filePath) {
      return { ok: false, error: 'Thiếu đường dẫn file.', amazonLibraryUrl: AMAZON_PDOCS_URL };
    }
    if (!fs.existsSync(filePath)) {
      return {
        ok: false,
        error: `Không tìm thấy file: ${path.basename(filePath)}`,
        amazonLibraryUrl: AMAZON_PDOCS_URL,
      };
    }

    const ext = extensionOf(filePath);
    if (!READY_FILE_EXTS.has(ext)) {
      return {
        ok: false,
        error: 'Chỉ hỗ trợ file EPUB hoặc PDF.',
        amazonLibraryUrl: AMAZON_PDOCS_URL,
      };
    }

    const sizeBytes = fileSizeBytes(filePath);
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `File vượt quá giới hạn 200MB của Kindle: ${path.basename(filePath)}`,
        amazonLibraryUrl: AMAZON_PDOCS_URL,
      };
    }

    const name = path.basename(filePath);
    const title =
      String(params.title || '').trim() || name.replace(/\.[^.]+$/, '') || name;
    const author = String(params.author || '').trim() || undefined;

    const emitUpload = (pct) =>
      onProgress({
        phase: 'upload',
        partIndex: 1,
        totalParts: 1,
        pct,
        label: name,
        sizeBytes,
      });
    emitUpload(0);

    const runUpload = () =>
      uploadClient.uploadFile({
        filePath,
        title,
        author,
        onProgress: emitUpload,
      });

    try {
      let res;
      try {
        res = await runUpload();
      } catch (e) {
        if (e instanceof SessionExpiredError || e?.code === 'SESSION_EXPIRED') {
          const relogged = await auth.login();
          if (!relogged) {
            return {
              ok: false,
              needLogin: true,
              results: [],
              amazonLibraryUrl: AMAZON_PDOCS_URL,
            };
          }
          res = await runUpload();
        } else {
          throw e;
        }
      }
      const ok = Boolean(res?.ok);
      return {
        ok,
        results: [
          {
            name,
            localPath: filePath,
            sizeBytes,
            ok,
            error: ok ? undefined : res?.error,
          },
        ],
        amazonLibraryUrl: AMAZON_PDOCS_URL,
        deletedLocal: false,
      };
    } catch (e) {
      return {
        ok: false,
        results: [
          {
            name,
            localPath: filePath,
            sizeBytes,
            ok: false,
            error: String(e?.message || e),
          },
        ],
        error: String(e?.message || e),
        amazonLibraryUrl: AMAZON_PDOCS_URL,
      };
    }
  }

  return { isLoggedIn, login, logout, getAccountLabel, send, sendFile, _auth: auth };
}

module.exports = {
  createSendToKindleService,
  makeTempDir,
  cleanupDir,
  AMAZON_PDOCS_URL,
};
