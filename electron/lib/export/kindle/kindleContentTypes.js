'use strict';

/**
 * Send to Kindle — supported file types + size constants.
 *
 * Amazon Send to Kindle (web upload) accepts these formats and caps a single
 * file at 200MB. We split large manga into parts below a safety margin so each
 * part uploads as its own Kindle document.
 */

// Extension (lowercase, no dot) → MIME type accepted by Send to Kindle.
const CONTENT_TYPES = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  rtf: 'application/rtf',
  htm: 'text/html',
  html: 'text/html',
  png: 'image/png',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
};

// Amazon's hard per-file limit for the web upload path.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

// Safety margin used when auto-splitting generated PDFs (< 200MB).
const SPLIT_TARGET_BYTES = 190 * 1024 * 1024;

/**
 * @param {string} filePath
 * @returns {string} lowercase extension without leading dot
 */
function extensionOf(filePath) {
  const m = String(filePath || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/**
 * @param {string} filePath
 * @returns {string|null} MIME type, or null if unsupported
 */
function contentTypeForFile(filePath) {
  const ext = extensionOf(filePath);
  return CONTENT_TYPES[ext] || null;
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isSupportedFile(filePath) {
  return contentTypeForFile(filePath) !== null;
}

module.exports = {
  CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  SPLIT_TARGET_BYTES,
  extensionOf,
  contentTypeForFile,
  isSupportedFile,
};
