'use strict';

const path = require('path');

/**
 * Resolves 1-based or 0-based page number for an image.
 * Primary: extracts the last group of consecutive digits in the filename (e.g. '001.jpg' -> 1, 'vol1_ch02_024.png' -> 24).
 * Fallback: uses (index + 1) if index is an integer, else 1.
 *
 * @param {string|null|undefined} filePath
 * @param {number|null|undefined} index
 * @returns {number}
 */
function resolvePageNumber(filePath, index) {
  if (filePath && typeof filePath === 'string') {
    const { name } = path.parse(filePath);
    const m = name.match(/(?:^|[^0-9])(\d+)(?=[^0-9]*$)/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isInteger(num)) return num;
    }
  }
  return Number.isInteger(index) ? index + 1 : 1;
}

module.exports = { resolvePageNumber };
