'use strict';

/**
 * KindleUploadClient — performs Amazon's Send to Kindle web-upload flow for a
 * single already-prepared file. Four steps (verified against the public web
 * uploader):
 *   1. GET  /sendtokindle/empty  → csrfToken (via KindleAuthSession)
 *   2. POST /sendtokindle/init   → { uploadUrl, stkToken }
 *   3. PUT  uploadUrl            → the file bytes (S3 presigned URL)
 *   4. POST /sendtokindle/send-v2 → Amazon processes; file lands in the library
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const { SENDTOKINDLE_ORIGIN, SessionExpiredError, DESKTOP_UA } = require('./KindleAuthSession');
const {
  contentTypeForFile,
  extensionOf,
  MAX_UPLOAD_BYTES,
} = require('./kindleContentTypes');

const INIT_URL = `${SENDTOKINDLE_ORIGIN}/sendtokindle/init`;
const SEND_URL = `${SENDTOKINDLE_ORIGIN}/sendtokindle/send-v2`;
const PUT_MAX_ATTEMPTS = 3;
/** Allow large Kindle uploads on slow links (30 minutes). */
const PUT_TIMEOUT_MS = 30 * 60 * 1000;

/** Diagnostic log with a stable prefix (safe to grep in the terminal). */
function klog(...args) {
  console.log('[SendToKindle][upload]', ...args);
}

/** Summarize a URL without leaking the full presigned query string. */
function describeUrl(u) {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname} (len=${u.length}, query=${parsed.search.length}b)`;
  } catch (e) {
    return `<invalid url: ${String(e?.message || e)}> raw="${String(u).slice(0, 80)}"`;
  }
}

class UnsupportedFileError extends Error {
  constructor(filePath) {
    super(`Định dạng không được Kindle hỗ trợ: ${path.basename(filePath)}`);
    this.name = 'UnsupportedFileError';
    this.code = 'UNSUPPORTED_FORMAT';
  }
}

class FileTooLargeError extends Error {
  constructor(filePath, size) {
    super(`File vượt quá giới hạn 200MB của Kindle: ${path.basename(filePath)}`);
    this.name = 'FileTooLargeError';
    this.code = 'FILE_TOO_LARGE';
    this.size = size;
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Stream PUT via Node http(s) — not Electron `net.request`.
 *
 * Why: Electron net buffers the whole body when Content-Length cannot be set
 * (protected header), so ~200MB uploads look "100%" after a local read then
 * stall for minutes while Chromium uploads the buffer. Node https accepts
 * Content-Length and streams with backpressure; progress tracks bytes leaving
 * the process. S3/presigned Kindle URLs do not need the Amazon session cookies.
 *
 * @param {object} [_electron] unused (kept for call-site compatibility)
 * @param {object} [_auth] unused
 * @returns {(uploadUrl: string, opts: object) => Promise<{ status: number }>}
 */
function makeDefaultPutFile(_electron, _auth) {
  return (uploadUrl, { filePath, contentType, size, onProgress }) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };

      let parsed;
      try {
        parsed = new URL(uploadUrl);
      } catch (e) {
        klog('PUT invalid uploadUrl:', String(e?.message || e));
        finish(reject, e);
        return;
      }

      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;

      klog('PUT begin (node stream)', {
        url: describeUrl(uploadUrl),
        contentType,
        size,
        file: path.basename(filePath),
      });

      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(size),
            'User-Agent': DESKTOP_UA,
          },
          timeout: PUT_TIMEOUT_MS,
        },
        (response) => {
          const status = response.statusCode;
          klog('PUT response status', status);
          const chunks = [];
          response.on('data', (d) => {
            if (status < 200 || status >= 300) chunks.push(d);
          });
          response.on('end', () => {
            if (status >= 200 && status < 300) {
              finish(resolve, { status });
            } else {
              const bodySnippet = Buffer.concat(chunks).toString('utf8').slice(0, 300);
              klog('PUT non-2xx body snippet:', bodySnippet);
              finish(reject, new Error(`Upload PUT thất bại: HTTP ${status}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        klog('PUT request timeout');
        req.destroy();
        finish(reject, new Error('Upload PUT hết thời gian chờ'));
      });
      req.on('error', (e) => {
        klog('PUT request error:', e?.code || '', String(e?.message || e));
        finish(reject, e);
      });

      const stream = fs.createReadStream(filePath);
      let sent = 0;
      let lastPct = -1;
      stream.on('data', (chunk) => {
        sent += chunk.length;
        if (onProgress && size > 0) {
          const pct = Math.min(100, Math.round((sent / size) * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            onProgress(pct);
          }
        }
      });
      stream.on('error', (e) => {
        klog('PUT file stream error:', e?.code || '', String(e?.message || e));
        try {
          req.destroy();
        } catch {
          /* ignore */
        }
        finish(reject, e);
      });

      stream.pipe(req);
    });
}

/**
 * Create an upload client.
 * @param {object} opts
 * @param {import('./KindleAuthSession').KindleAuthSession} opts.auth
 * @param {object} [opts.electron]
 * @param {Function} [opts.putFile] — override for tests
 */
function createUploadClient({ auth, electron, putFile } = {}) {
  if (!auth) throw new Error('createUploadClient requires an auth session');
  const putFileImpl = putFile || makeDefaultPutFile(electron, auth);

  async function jsonPost(url, csrf, body) {
    return auth.fetch(url, {
      method: 'POST',
      headers: {
        'anti-csrftoken-a2z': csrf,
        'content-type': 'application/json',
        'user-agent': DESKTOP_UA,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * @param {object} params
   * @param {string} params.filePath
   * @param {string} [params.title]
   * @param {string} [params.author]
   * @param {(pct: number) => void} [params.onProgress]
   * @returns {Promise<{ ok: boolean, sku?: string, error?: string, code?: string }>}
   */
  async function uploadFile({ filePath, title, author, onProgress }) {
    const contentType = contentTypeForFile(filePath);
    if (!contentType) throw new UnsupportedFileError(filePath);

    const ext = extensionOf(filePath);
    const size = fs.statSync(filePath).size;
    if (size > MAX_UPLOAD_BYTES) throw new FileTooLargeError(filePath, size);

    const fileName = path.basename(filePath);
    const docTitle = String(title || fileName.replace(/\.[^.]+$/, '')).trim() || fileName;
    const docAuthor = String(author || 'Manga Crawler').trim();

    klog('uploadFile start', { fileName, ext, contentType, size });

    // Step 1 — csrfToken (throws SessionExpiredError when signed out).
    const csrf = await auth.getCsrfToken();

    // Step 2 — init → uploadUrl + stkToken.
    const initRes = await jsonPost(INIT_URL, csrf, {
      fileSize: size,
      contentType,
      appVersion: '1.0',
      appName: 'drag_drop_web',
      fileExtension: ext,
    });
    if (initRes.status === 401 || initRes.status === 403) {
      throw new SessionExpiredError();
    }
    let initJson;
    try {
      initJson = await initRes.json();
    } catch {
      throw new SessionExpiredError('Không đọc được phản hồi init từ Amazon.');
    }
    klog('init status', initRes.status, 'uploadUrl?', Boolean(initJson && initJson.uploadUrl), 'stkToken?', Boolean(initJson && initJson.stkToken));
    const uploadUrl = initJson && initJson.uploadUrl;
    const stkToken = initJson && initJson.stkToken;
    if (!uploadUrl || !stkToken) {
      throw new SessionExpiredError('Amazon không trả về uploadUrl/stkToken.');
    }

    // Step 3 — PUT the bytes (retry transient network/S3 failures).
    let lastErr;
    let putOk = false;
    for (let attempt = 1; attempt <= PUT_MAX_ATTEMPTS; attempt += 1) {
      try {
        klog(`PUT attempt ${attempt}/${PUT_MAX_ATTEMPTS}`);
        await putFileImpl(uploadUrl, { filePath, contentType, size, onProgress });
        putOk = true;
        break;
      } catch (e) {
        lastErr = e;
        klog(`PUT attempt ${attempt} failed:`, e?.code || '', String(e?.message || e));
        if (attempt < PUT_MAX_ATTEMPTS) await delay(500 * attempt);
      }
    }
    if (!putOk) {
      klog('PUT gave up after all attempts:', lastErr?.code || '', String(lastErr?.message || lastErr));
      return { ok: false, error: String(lastErr?.message || lastErr), code: 'UPLOAD_FAILED' };
    }

    // Step 4 — inform Send to Kindle to process the upload.
    const sendRes = await jsonPost(SEND_URL, csrf, {
      extName: 'drag_drop_web',
      inputFormat: ext,
      extVersion: '1.0',
      stkToken,
      title: docTitle,
      dataType: contentType,
      stkGuid: '',
      author: docAuthor,
      archive: true,
      fileSize: size,
      inputFileName: fileName,
      batchId: crypto.randomUUID(),
    });
    if (sendRes.status === 401 || sendRes.status === 403) {
      throw new SessionExpiredError();
    }
    let sendJson;
    try {
      sendJson = await sendRes.json();
    } catch {
      return { ok: false, error: 'Không đọc được phản hồi send-v2 từ Amazon.', code: 'SEND_FAILED' };
    }
    if (!sendJson || !sendJson.status) {
      return { ok: false, error: 'Amazon từ chối gửi tài liệu.', code: 'SEND_FAILED' };
    }
    return { ok: true, sku: sendJson.sku };
  }

  return { uploadFile };
}

module.exports = {
  createUploadClient,
  makeDefaultPutFile,
  UnsupportedFileError,
  FileTooLargeError,
  INIT_URL,
  SEND_URL,
};
