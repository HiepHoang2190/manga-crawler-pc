'use strict';

const crypto = require('crypto');

function hashParts(parts) {
  return crypto.createHash('sha1').update(parts.join('\u0001')).digest('hex');
}

function sizeOf(value) {
  return (value?.frames || []).reduce((sum, f) => sum + (f?.data?.length || 0), 0);
}

function createStepCache({ maxEntries = 30, maxBytes = 192 * 1024 * 1024 } = {}) {
  const map = new Map();
  let bytes = 0;

  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      if (map.has(key)) {
        bytes -= sizeOf(map.get(key));
        map.delete(key);
      }
      map.set(key, value);
      bytes += sizeOf(value);
      while ((map.size > maxEntries || bytes > maxBytes) && map.size > 1) {
        const oldest = map.keys().next().value;
        bytes -= sizeOf(map.get(oldest));
        map.delete(oldest);
      }
    },
    clear() {
      map.clear();
      bytes = 0;
    },
    get size() {
      return map.size;
    },
    get bytes() {
      return bytes;
    },
  };
}

module.exports = { hashParts, createStepCache };
