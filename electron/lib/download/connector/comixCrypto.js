'use strict';

/**
 * Comix.to API request signing + response decryption.
 * Ported from the site's secure.js Io helpers (po.D / po.O).
 */

function b64urlEncodeBinary(binaryString) {
  let encoded = Buffer.from(binaryString, 'binary').toString('base64');
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToBinary(input) {
  let padded = String(input || '');
  const padLen = 4 - (padded.length % 4);
  if (padLen < 4) padded += '='.repeat(padLen);
  padded = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('binary');
}

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

/**
 * Sign an API path for the `_` query token (GET /api/v1/...).
 * @param {string} apiPath e.g. "/chapters/10805545"
 * @returns {string}
 */
function signComixApiPath(apiPath) {
  const pathOnly = String(apiPath || '');
  let bytes = Array.from(new TextEncoder().encode(pathOnly));
  const tables = [
    {
      s: 'gbicCvAMzfcXEtGAyjvvhmb2yCWzWhjqcxXZ7ZhpzANOzoQLo3nuPZ2vK9dkb9hJExC0Vni/hdQBceI+mw611gkhQFjBuf4bJg1TxYqM+SL4YDqtwjxiGSdeH7so7Fn1HiRo37Z+RNvl44twXWVhomtMjw+8bemfmv9XEXr7mS82MxaCOJZRR0oHd9PLI5O+gyBGT6hcLoduNa7yCObVVCk3bFWsoD+xcqTrBcP6dNJN/NB1Br2QGhSN2snHAqeRNKVFQiyeAFLPSKGwY8aq9EPgsi17qd4ywPMxiH8w6N1qX1tLKtzhOeemHWeJQfFQ5H23q7qSlJUcjgTEl3x2/Q==',
      k: 'rafYl4oSAKQX+GYoic9oW4iGwiYpZzs0',
      seed: 189,
    },
    {
      s: '2lQehmgyYFAoWUi0haazZqHy5zZ34NN+VzlfsoB2Y1yY0IuMLjgVcV2xt8t4moH+AP0NMJ5qekW7DFIHEWKkOgIBIMhDdA8lbM6iHKjDlq6IChpb3CnA9NmsvQW/afdt1SfJjTdwcvpKqunCJLxBFmXX9hecm6tGb+HRxD7BC3njoxPxgnX5pdKP1IMSkd4/O3NRfZSE6DVLG2s9uexaipA05cpJzE8Qkv/z5jzHAwlEWOLd3yxA+0cvVbpOoJPFGc8f1lb4vu2HUxjuuEwEQk0GsPCVnyKvfOoh9TG2YYmZLV4I67UU2NsrrakqZ47k/O+ne25/DjPGZCMdnZcmzQ==',
      k: '2USAq+VTo5ht4bQn+K9DUcpUQRTtrB56',
      seed: 133,
    },
    {
      s: '+mhJSFwzaV+PQPDyKp2scO/S9SdFsy/7e56UWT8XHbK3E2+19nEPwfwOgE9uVCaDtOAWTobCZX+cBCXlIbBqyDyQB1beKLspW6kGPhBCV9x0jf0KUeFhHjmlMf7qMFIB41PfDFprZ3bJiK4YxrZDv+K6dcwJmggVO8f5ktrXTM0cZL4fer0SpnkbvNajPbHxfuTz5lVEBarOI4rdc+2V6zTsjpfQYjgN1MMr6EvA6eehN6dQ1bgUogt9rZOBbQBeNnLYY00uZqSoJBnFi5gthCJsWF33ykosn9v/9KB8udMCz0YRYImrA4VHr5mMgpH4xDXLeEHRd5vZOiAalofuMg==',
      k: 'yNHlokVEnuecesDrB/lDhVuUNiheWc3a47VtkwZ2ENg=',
      seed: 32,
    },
  ];
  for (const { s, k, seed } of tables) {
    const sbox = b64ToBytes(s);
    const keyBytes = b64ToBytes(k);
    const keyLen = keyBytes.length;
    const out = new Array(bytes.length);
    let prev = seed;
    for (let i = 0; i < bytes.length; i++) {
      const next = sbox[255 & (bytes[i] ^ keyBytes[i % keyLen] ^ prev)];
      out[i] = next;
      prev = next;
    }
    bytes = out;
  }
  return b64urlEncodeBinary(Buffer.from(bytes).toString('binary'));
}

/**
 * Decrypt an x-enc:1 response payload (`{ e: "..." }`).
 * @param {string} encPayload
 * @returns {string} plaintext JSON string
 */
function decryptComixEncPayload(encPayload) {
  let bytes = Array.from(b64urlDecodeToBinary(encPayload), (ch) => ch.charCodeAt(0));
  const tables = [
    {
      s: '+mhJSFwzaV+PQPDyKp2scO/S9SdFsy/7e56UWT8XHbK3E2+19nEPwfwOgE9uVCaDtOAWTobCZX+cBCXlIbBqyDyQB1beKLspW6kGPhBCV9x0jf0KUeFhHjmlMf7qMFIB41PfDFprZ3bJiK4YxrZDv+K6dcwJmggVO8f5ktrXTM0cZL4fer0SpnkbvNajPbHxfuTz5lVEBarOI4rdc+2V6zTsjpfQYjgN1MMr6EvA6eehN6dQ1bgUogt9rZOBbQBeNnLYY00uZqSoJBnFi5gthCJsWF33ykosn9v/9KB8udMCz0YRYImrA4VHr5mMgpH4xDXLeEHRd5vZOiAalofuMg==',
      k: 'yNHlokVEnuecesDrB/lDhVuUNiheWc3a47VtkwZ2ENg=',
      seed: 32,
    },
    {
      s: '2lQehmgyYFAoWUi0haazZqHy5zZ34NN+VzlfsoB2Y1yY0IuMLjgVcV2xt8t4moH+AP0NMJ5qekW7DFIHEWKkOgIBIMhDdA8lbM6iHKjDlq6IChpb3CnA9NmsvQW/afdt1SfJjTdwcvpKqunCJLxBFmXX9hecm6tGb+HRxD7BC3njoxPxgnX5pdKP1IMSkd4/O3NRfZSE6DVLG2s9uexaipA05cpJzE8Qkv/z5jzHAwlEWOLd3yxA+0cvVbpOoJPFGc8f1lb4vu2HUxjuuEwEQk0GsPCVnyKvfOoh9TG2YYmZLV4I67UU2NsrrakqZ47k/O+ne25/DjPGZCMdnZcmzQ==',
      k: '2USAq+VTo5ht4bQn+K9DUcpUQRTtrB56',
      seed: 133,
    },
    {
      s: 'gbicCvAMzfcXEtGAyjvvhmb2yCWzWhjqcxXZ7ZhpzANOzoQLo3nuPZ2vK9dkb9hJExC0Vni/hdQBceI+mw611gkhQFjBuf4bJg1TxYqM+SL4YDqtwjxiGSdeH7so7Fn1HiRo37Z+RNvl44twXWVhomtMjw+8bemfmv9XEXr7mS82MxaCOJZRR0oHd9PLI5O+gyBGT6hcLoduNa7yCObVVCk3bFWsoD+xcqTrBcP6dNJN/NB1Br2QGhSN2snHAqeRNKVFQiyeAFLPSKGwY8aq9EPgsi17qd4ywPMxiH8w6N1qX1tLKtzhOeemHWeJQfFQ5H23q7qSlJUcjgTEl3x2/Q==',
      k: 'rafYl4oSAKQX+GYoic9oW4iGwiYpZzs0',
      seed: 189,
    },
  ];
  for (const { s, k, seed } of tables) {
    const sbox = b64ToBytes(s);
    const inv = new Uint8Array(256);
    for (let i = 0; i < 256; i++) inv[sbox[i]] = i;
    const keyBytes = b64ToBytes(k);
    const keyLen = keyBytes.length;
    const out = new Array(bytes.length);
    let prev = seed;
    for (let i = 0; i < bytes.length; i++) {
      const cur = bytes[i];
      out[i] = 255 & (inv[cur] ^ keyBytes[i % keyLen] ^ prev);
      prev = cur;
    }
    bytes = out;
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

const TITLE_SLUG_RE = /\/title\/([^/]+)/;
const COMIX_API_ORIGIN = 'https://comix.to';

function extractComixTitleSlug(url) {
  const match = String(url || '').match(TITLE_SLUG_RE);
  if (!match) return null;
  return match[1].split('/')[0];
}

function extractComixMangaIdFromSlug(titleSlug) {
  if (!titleSlug) return null;
  const dash = String(titleSlug).indexOf('-');
  return dash > 0 ? String(titleSlug).substring(0, dash) : String(titleSlug);
}

/**
 * Extract chapter numeric id from a comix chapter URL.
 * Title URLs are `/title/{slug}`; chapter URLs are `/title/{slug}/{id}-chapter-{n}`.
 * Numeric title slugs (e.g. 9058-frozen-wolf-fire-dragon) are not chapter ids.
 * @param {string} chapterUrl
 * @returns {string}
 */
function extractComixChapterId(chapterUrl) {
  const text = String(chapterUrl || '').trim().replace(/\/+$/, '');
  const parts = text.split('/').filter(Boolean);
  const title_idx = parts.findIndex((part) => part === 'title');
  if (title_idx < 0) return '';
  const chapter_seg = parts[title_idx + 2];
  if (!chapter_seg) return '';
  const match = String(chapter_seg).match(/^(\d+)(?:-|$)/);
  return match ? match[1] : '';
}

function sortedComixQueryEntries(query) {
  return Object.entries(query || {})
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => [String(key), String(value)])
    .sort(([left_key], [right_key]) => {
      if (left_key < right_key) return -1;
      if (left_key > right_key) return 1;
      return 0;
    });
}

/**
 * Build GET /api/v1/... URL with `_` token. Query is signed unencoded and
 * sorted alphabetically (matches comix.to secure.js).
 * @param {string} apiPath e.g. "/manga/9058/chapters"
 * @param {Record<string, string|number>} [query]
 * @param {string} [origin]
 * @returns {string}
 */
function buildComixSignedApiUrl(apiPath, query = {}, origin = COMIX_API_ORIGIN) {
  const path_only = String(apiPath || '').startsWith('/')
    ? String(apiPath)
    : `/${apiPath}`;
  const entries = sortedComixQueryEntries(query);
  const sign_qs = entries.map(([key, value]) => `${key}=${value}`).join('&');
  const sign_path = sign_qs ? `${path_only}?${sign_qs}` : path_only;
  const token = signComixApiPath(sign_path);
  const request_qs = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .concat([`_=${encodeURIComponent(token)}`])
    .join('&');
  const base_origin = String(origin || COMIX_API_ORIGIN).replace(/\/+$/, '');
  return `${base_origin}/api/v1${path_only}?${request_qs}`;
}

/**
 * Map decrypted GET /manga/{id}/chapters JSON into DOM-scrape compatible rows.
 * @param {object|null} root
 * @returns {{items: Array<{href: string, num: string, group: string}>, total: number, page: number, lastPage: number}}
 */
function parseComixChapterApiItems(root) {
  const empty = { items: [], total: 0, page: 1, lastPage: 1 };
  const result = root && root.result && typeof root.result === 'object' ? root.result : root;
  if (!result || typeof result !== 'object') return empty;
  const raw_items = Array.isArray(result.items)
    ? result.items
    : Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.chapters)
        ? result.chapters
        : [];
  const items = [];
  for (const item of raw_items) {
    if (!item || typeof item !== 'object') continue;
    const href = String(item.url || item.href || '').trim();
    if (!href) continue;
    const num = item.number != null ? String(item.number) : '';
    const group =
      item.group && item.group.name ? String(item.group.name).trim() : '';
    items.push({ href, num, group });
  }
  return {
    items,
    total: Number(result.total) || items.length,
    page: Number(result.page) || 1,
    lastPage: Number(result.lastPage || result.last_page) || 1,
  };
}

function getFileExtFromUrl(src) {
  const noQuery = String(src || '').split('?')[0];
  const seg = noQuery.split('/').pop() || '';
  const dot = seg.lastIndexOf('.');
  if (dot > 0) return seg.slice(dot + 1).toLowerCase();
  return 'webp';
}

/**
 * Build ordered image list from decrypted chapter API result.
 * @param {object|null} chapterResult
 * @returns {Array<{imageUrl: string, ext: string, scramble: boolean}>}
 */
function httpUrlFromPageRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const http_values = Object.values(item).filter(
    (field) => typeof field === 'string' && /^https?:\/\//i.test(field.trim()),
  );
  if (!http_values.length) return '';
  http_values.sort((left_url, right_url) => right_url.length - left_url.length);
  return http_values[0].trim();
}

/**
 * True when every record carries an absolute image URL.
 * Comix minifies the page-list field name (`pages` → a short key) between deploys.
 */
function isObfuscatedImageRecordList(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => httpUrlFromPageRecord(item) !== '');
}

function buildComixChapterImageUrls(chapterResult) {
  if (!chapterResult || typeof chapterResult !== 'object') return [];
  const pages = chapterResult.pages;

  if (Array.isArray(pages)) {
    return pages
      .map((item) => {
        const imageUrl = String((item && item.url) || '').trim();
        if (!imageUrl) return null;
        return {
          imageUrl,
          ext: getFileExtFromUrl(imageUrl),
          scramble: !!(item && (item.scramble || item.s === 1)),
        };
      })
      .filter(Boolean);
  }

  if (pages && typeof pages === 'object') {
    const baseUrl = String(pages.baseUrl || '');
    const items = Array.isArray(pages.items) ? pages.items : [];
    if (items.length) {
      return items
        .map((item) => {
          const relative = String((item && item.url) || '').trim();
          if (!relative) return null;
          const imageUrl = /^https?:\/\//i.test(relative) ? relative : `${baseUrl}${relative}`;
          return {
            imageUrl,
            ext: getFileExtFromUrl(imageUrl),
            scramble: !!(item && item.s === 1),
          };
        })
        .filter(Boolean);
    }
  }

  for (const value of Object.values(chapterResult)) {
    if (!isObfuscatedImageRecordList(value)) continue;
    return value
      .map((item) => {
        const imageUrl = httpUrlFromPageRecord(item);
        if (!imageUrl) return null;
        return {
          imageUrl,
          ext: getFileExtFromUrl(imageUrl),
          scramble: !!(item && (item.scramble || item.s === 1)),
        };
      })
      .filter(Boolean);
  }

  return [];
}

module.exports = {
  signComixApiPath,
  decryptComixEncPayload,
  extractComixTitleSlug,
  extractComixMangaIdFromSlug,
  extractComixChapterId,
  buildComixSignedApiUrl,
  parseComixChapterApiItems,
  buildComixChapterImageUrls,
};
