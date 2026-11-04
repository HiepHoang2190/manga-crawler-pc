const path = require('path');

/**
 * All supported extensions (lowercase, with dot).
 */
const SUPPORTED_EXTENSIONS = ['.cbz', '.zip', '.cbr', '.rar', '.pdf', '.epub', '.mobi', '.azw', '.azw3'];

/** @type {Record<string, 'cbz'|'zip'|'rar'|'pdf'|'epub'|'mobi'>} */
const EXT_TO_FORMAT = {
  '.cbz': 'cbz',
  '.zip': 'zip',
  '.cbr': 'rar',
  '.rar': 'rar',
  '.pdf': 'pdf',
  '.epub': 'epub',
  '.mobi': 'mobi',
  '.azw':  'mobi',
  '.azw3': 'mobi',
};

/**
 * Detect the loader type from a file path's extension.
 * @param {string} filePath
 * @returns {'cbz'|'zip'|'rar'|'pdf'|'epub'|null}
 */
function detectFormat(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_FORMAT[ext] ?? null;
}

module.exports = { detectFormat, SUPPORTED_EXTENSIONS };
