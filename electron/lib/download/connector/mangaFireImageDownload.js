/**
 * MangaFire CDN hosts (mfcdn2 / mfcdn3) differ by TLS fingerprint.
 * Node/undici is reset on mfcdn2 (curl: Recv failure: Connection reset by peer).
 * Chromium session.fetch uses the same stack as the reader <img> tags.
 */
const fs = require('fs');
const path = require('path');

const MANGAFIRE_ORIGIN_REFERER = 'https://mangafire.to/';

/**
 * Prefer session.defaultSession.fetch (Chromium TLS). Fall back to net.fetch.
 * Do not reconstruct Cookie headers.
 * @returns {typeof fetch | null}
 */
function getMangaFireImageFetch() {
  try {
    const electron = require('electron');
    const session_fetch = electron?.session?.defaultSession?.fetch;
    if (typeof session_fetch === 'function') {
      return session_fetch.bind(electron.session.defaultSession);
    }
    if (electron?.net?.fetch) return electron.net.fetch.bind(electron.net);
  } catch {
    /* not in Electron */
  }
  return null;
}

/**
 * Chromium cancels session.fetch to mfcdn* when Referer has a path
 * ("invalid referrer"). Always send origin-only Referer.
 * @param {object} headers
 * @returns {object}
 */
function buildMangaFireImageHeaders(headers) {
  const request_headers = { ...(headers || {}) };
  request_headers.Referer = MANGAFIRE_ORIGIN_REFERER;
  // Origin switches Electron session.fetch into CORS mode; in-page fetch to
  // mfcdn2 already failed CORS while <img> (no CORS) loaded the same URL.
  delete request_headers.Origin;
  delete request_headers.origin;
  return request_headers;
}

/**
 * Download one MangaFire CDN image via Chromium network stack.
 * Do not reconstruct Cookie headers.
 * @param {string} image_url
 * @param {string} file_path
 * @param {object} headers
 * @param {AbortSignal} [signal]
 * @param {typeof fetch} [fetch_impl]
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>}
 */
async function downloadMangaFireImageToFile(image_url, file_path, headers, signal, fetch_impl) {
  const fetch_fn = fetch_impl || getMangaFireImageFetch();
  if (!fetch_fn) {
    return { ok: false, error: 'Electron session.fetch unavailable' };
  }

  try {
    const response = await fetch_fn(image_url, {
      headers: buildMangaFireImageHeaders(headers),
      redirect: 'follow',
      referrerPolicy: 'origin',
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      return { ok: false, error: 'Empty image body' };
    }

    const head_text = buffer.subarray(0, 32).toString('utf8').toLowerCase();
    if (head_text.includes('<!doctype') || head_text.includes('<html')) {
      return { ok: false, status: response.status || 403, error: 'Cloudflare HTML instead of image' };
    }

    fs.mkdirSync(path.dirname(file_path), { recursive: true });
    fs.writeFileSync(file_path, buffer);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

module.exports = {
  downloadMangaFireImageToFile,
};
