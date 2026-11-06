'use strict';

/**
 * Comix.to API request signing + response decryption.
 * Uses current live ak HMAC-SHA256 token generator and key material decryption.
 */

const ak = require('./comixCryptoCore');

/**
 * Sign an API path for the `_` query token (GET /api/v1/...).
 * @param {string} apiPath e.g. "/chapters/10805545"
 * @returns {string}
 */
function signComixApiPath(apiPath) {
  let cleanPath = String(apiPath || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/api\/v1/i, '');
  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
  const akHelper =
    (typeof __comixAk !== 'undefined' && __comixAk) ||
    (typeof globalThis !== 'undefined' && globalThis.__comixAk) ||
    (typeof window !== 'undefined' && window.__comixAk) ||
    (typeof ak !== 'undefined' ? ak : null);
  if (!akHelper || typeof akHelper.ho !== 'function') {
    throw new Error('Comix crypto signing helper is not available');
  }
  return akHelper.ho(cleanPath);
}

/**
 * Decrypt an x-enc:1 response payload (`{ e: "..." }`).
 * @param {string} encPayload
 * @returns {string} plaintext JSON string
 */
function decryptComixEncPayload(encPayload) {
  if (!encPayload || typeof encPayload !== 'string') return '';
  const akHelper =
    (typeof __comixAk !== 'undefined' && __comixAk) ||
    (typeof globalThis !== 'undefined' && globalThis.__comixAk) ||
    (typeof window !== 'undefined' && window.__comixAk) ||
    (typeof ak !== 'undefined' ? ak : null);
  if (!akHelper || typeof akHelper.vQ !== 'function') {
    throw new Error('Comix crypto decryption helper is not available');
  }
  return akHelper.vQ(encPayload);
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

function serializeComixQuery(params) {
  const parts = [];
  function pushParam(prefix, val) {
    if (val == null) return;
    if (Array.isArray(val)) {
      val.forEach((item, idx) => pushParam(`${prefix}[${idx}]`, item));
    } else if (typeof val === 'object') {
      const keys = Object.keys(val).sort();
      for (const k of keys) {
        pushParam(prefix ? `${prefix}[${k}]` : k, val[k]);
      }
    } else {
      parts.push(`${prefix}=${val}`);
    }
  }
  const topKeys = Object.keys(params || {}).filter((k) => k !== '_').sort();
  for (const k of topKeys) {
    pushParam(k, params[k]);
  }
  return parts.join('&');
}

/**
 * Build GET /api/v1/... URL with `_` token. Query is signed and
 * sorted alphabetically (matches live comix.to client).
 * @param {string} apiPath e.g. "/manga/9058/chapters"
 * @param {Record<string, any>} [query]
 * @param {string} [origin]
 * @returns {string}
 */
function buildComixSignedApiUrl(apiPath, query = {}, origin = 'https://comix.to') {
  let path_only = String(apiPath || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/api\/v1/i, '');
  if (!path_only.startsWith('/')) path_only = '/' + path_only;

  let base_path = path_only;
  let combined_query = { ...query };
  if (path_only.includes('?')) {
    const [p, qs] = path_only.split('?');
    base_path = p;
    const search_params = new URLSearchParams(qs);
    for (const [k, v] of search_params.entries()) {
      if (combined_query[k] === undefined) {
        combined_query[k] = v;
      }
    }
  }

  const sign_qs = serializeComixQuery(combined_query);
  const sign_path = sign_qs ? `${base_path}?${sign_qs}` : base_path;
  const token = signComixApiPath(sign_path);

  const request_parts = [];
  function pushRequest(prefix, val) {
    if (val == null) return;
    if (Array.isArray(val)) {
      val.forEach((item, idx) => pushRequest(`${prefix}[${idx}]`, item));
    } else if (typeof val === 'object') {
      const keys = Object.keys(val).sort();
      for (const k of keys) {
        pushRequest(prefix ? `${prefix}[${k}]` : k, val[k]);
      }
    } else {
      request_parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(val)}`);
    }
  }
  const topKeys = Object.keys(combined_query).filter((k) => k !== '_').sort();
  for (const k of topKeys) {
    pushRequest(k, combined_query[k]);
  }
  request_parts.push(`_=${encodeURIComponent(token)}`);

  const base_origin = String(origin || COMIX_API_ORIGIN).replace(/\/+$/, '');
  return `${base_origin}/api/v1${base_path}?${request_parts.join('&')}`;
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

function httpUrlFromPageRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const http_values = Object.values(item).filter(
    (field) => typeof field === 'string' && /^https?:\/\//i.test(field.trim()),
  );
  if (!http_values.length) return '';
  http_values.sort((left_url, right_url) => right_url.length - left_url.length);
  return http_values[0].trim();
}

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
  serializeComixQuery,
  buildComixSignedApiUrl,
  parseComixChapterApiItems,
  buildComixChapterImageUrls,
};
