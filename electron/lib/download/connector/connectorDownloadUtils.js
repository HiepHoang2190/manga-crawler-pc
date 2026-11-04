/**
 * Download utilities for connector services.
 * 
 * Provides functions for downloading files (cover images and chapter images)
 * with automatic retry logic, error handling, and file validation.
 * 
 * ## Features
 * 
 * - Automatic directory creation
 * - File existence checking (skip if already downloaded)
 * - File size validation (ensure > 0 bytes)
 * - Retry logic with configurable attempts and delays
 * - Error handling and logging
 * 
 * @module connectorDownloadUtils
 */

const fs = require('fs');
const path = require('path');
const { resolveCoverPath } = require('./connectorPathUtils');

/**
 * Download cover image if it doesn't already exist.
 * 
 * Downloads the manga cover image to the manga directory.
 * Skips download if:
 * - Cover URL is empty or invalid
 * - Cover file already exists with size > 0
 * 
 * ## Preconditions
 * - `mangaDir` is a valid directory path (will be created if doesn't exist)
 * - `referer` is a non-empty string
 * - `userAgent` is a non-empty string
 * - `log` is a function accepting (message, level)
 * 
 * ## Postconditions
 * - If successful: cover file exists at `resolveCoverPath(mangaDir, coverUrl)` with size > 0
 * - If failed: logs warning but does not throw error
 * - Creates manga directory if it doesn't exist
 * 
 * @param {string} coverUrl - URL of the cover image
 * @param {string} mangaDir - Manga directory path
 * @param {string} referer - Referer header value
 * @param {string} userAgent - User-Agent header value
 * @param {Function} log - Logging function (message, level)
 * 
 * @returns {Promise<void>}
 * 
 * @example
 * await downloadCoverIfNeeded(
 *   'https://example.com/cover.jpg',
 *   '/downloads/One Piece',
 *   'https://example.com/',
 *   'Mozilla/5.0...',
 *   (msg, level) => console.log(`[${level}] ${msg}`)
 * );
 * // Logs: "Đã lưu cover: cover.jpg"
 * 
 * @example
 * // Skip if already exists
 * await downloadCoverIfNeeded(
 *   'https://example.com/cover.jpg',
 *   '/downloads/One Piece', // cover.jpg already exists here
 *   'https://example.com/',
 *   'Mozilla/5.0...',
 *   console.log
 * );
 * // No download, no log (file already exists)
 * 
 * @example
 * // Handle invalid URL
 * await downloadCoverIfNeeded(
 *   'invalid-url',
 *   '/downloads/One Piece',
 *   'https://example.com/',
 *   'Mozilla/5.0...',
 *   (msg, level) => console.log(`[${level}] ${msg}`)
 * );
 * // Logs: "[warn] Cover URL không hợp lệ."
 */
async function downloadCoverIfNeeded(coverUrl, mangaDir, referer, userAgent, log) {
  if (!coverUrl || !String(coverUrl).trim()) return;

  let url = String(coverUrl).trim();
  if (!/^https?:\/\//i.test(url)) {
    try {
      url = new URL(url, referer).href;
    } catch {
      log('Cover URL không hợp lệ.', 'warn');
      return;
    }
  }

  fs.mkdirSync(mangaDir, { recursive: true });
  const coverPath = resolveCoverPath(mangaDir, url);

  if (fs.existsSync(coverPath) && fs.statSync(coverPath).size > 0) return;

  try {
    const res = await fetch(url, {
      headers: { Referer: referer, 'User-Agent': userAgent },
    });
    if (!res.ok) return;

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return;

    fs.writeFileSync(coverPath, buf);
    log(`Đã lưu cover: ${path.basename(coverPath)}`, 'success');
  } catch (err) {
    log(`Lỗi tải cover: ${err.message}`, 'warn');
  }
}

/**
 * Download an image to a file.
 * 
 * Downloads an image from a URL and saves it to the specified file path.
 * Creates parent directories automatically if they don't exist.
 * 
 * ## Preconditions
 * - `imageUrl` is a valid HTTP/HTTPS URL
 * - `filePath` is a valid file path
 * - `headers` is an object with HTTP headers
 * 
 * ## Postconditions
 * - If successful: file exists at `filePath` with size > 0, returns {ok: true}
 * - If failed: returns {ok: false, status?, error?}
 * - Parent directories are created if they don't exist
 * 
 * @param {string} imageUrl - URL of the image
 * @param {string} filePath - Destination file path
 * @param {object} headers - HTTP headers
 * 
 * @returns {Promise<{ok: boolean, status?: number, error?: string}>} Download result
 * 
 * @example
 * const result = await downloadImageToFile(
 *   'https://example.com/image.jpg',
 *   '/downloads/One Piece/Chap 001/001.jpg',
 *   {
 *     'Referer': 'https://example.com/',
 *     'User-Agent': 'Mozilla/5.0...'
 *   }
 * );
 * if (result.ok) {
 *   console.log('Downloaded successfully');
 * } else {
 *   console.log(`Failed: ${result.status || result.error}`);
 * }
 * 
 * @example
 * // Handle 404 error
 * const result = await downloadImageToFile(
 *   'https://example.com/missing.jpg',
 *   '/downloads/image.jpg',
 *   {}
 * );
 * // Returns: {ok: false, status: 404}
 * 
 * @example
 * // Handle network error
 * const result = await downloadImageToFile(
 *   'https://invalid-domain-xyz.com/image.jpg',
 *   '/downloads/image.jpg',
 *   {}
 * );
 * // Returns: {ok: false, error: 'fetch failed'}
 */
async function downloadImageToFile(imageUrl, filePath, headers, signal) {
  try {
    const res = await fetch(imageUrl, {
      headers,
      redirect: 'follow',
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return { ok: false, status: res.status };

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return { ok: false };

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buf);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Download an image with retry logic.
 * 
 * Attempts to download an image multiple times with delays between attempts.
 * Validates that the downloaded file exists and has size > 0.
 * 
 * ## Retry Strategy
 * 
 * - Maximum attempts: `maxAttempts` (default: 3)
 * - Delay between attempts: 1 second
 * - No delay after final attempt
 * - Returns immediately on first successful download
 * 
 * ## Preconditions
 * - `imageUrl` is a valid HTTP/HTTPS URL
 * - `filePath` is a valid file path
 * - `headers` is an object with HTTP headers
 * - `maxAttempts` is a positive integer
 * 
 * ## Postconditions
 * - If successful: file exists at `filePath` with size > 0, returns {ok: true, fileSize}
 * - If failed after all attempts: returns {ok: false}
 * - Maximum `maxAttempts` network requests made
 * - 1 second delay between retry attempts (except after final attempt)
 * 
 * ## Loop Invariants
 * - Attempt counter increases monotonically from 1 to maxAttempts
 * - Function returns immediately on first successful download
 * - No delay after final attempt
 * 
 * @param {string} imageUrl - URL of the image
 * @param {string} filePath - Destination file path
 * @param {object} headers - HTTP headers
 * @param {number} [maxAttempts=3] - Maximum number of retry attempts
 * 
 * @returns {Promise<{ok: boolean, fileSize?: number}>} Download result
 * 
 * @example
 * const result = await downloadImageWithRetry(
 *   'https://example.com/image.jpg',
 *   '/downloads/image.jpg',
 *   { 'Referer': 'https://example.com/' },
 *   3
 * );
 * if (result.ok) {
 *   console.log(`Downloaded ${result.fileSize} bytes`);
 * } else {
 *   console.log('Failed after 3 attempts');
 * }
 * 
 * @example
 * // Custom retry count
 * const result = await downloadImageWithRetry(
 *   'https://example.com/image.jpg',
 *   '/downloads/image.jpg',
 *   {},
 *   5 // Try 5 times
 * );
 * 
 * @example
 * // Transient network error (succeeds on retry)
 * // Attempt 1: Network error (wait 1s)
 * // Attempt 2: Success
 * const result = await downloadImageWithRetry(
 *   'https://flaky-server.com/image.jpg',
 *   '/downloads/image.jpg',
 *   {},
 *   3
 * );
 * // Returns: {ok: true, fileSize: 12345}
 */
async function downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await downloadImageToFile(imageUrl, filePath, headers);

    if (result.ok && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      return { ok: true, fileSize: fs.statSync(filePath).size };
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { ok: false };
}

module.exports = {
  downloadCoverIfNeeded,
  downloadImageToFile,
  downloadImageWithRetry,
};
