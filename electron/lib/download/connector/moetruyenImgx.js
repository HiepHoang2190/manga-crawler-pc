/**
 * MoeTruyen IMGX v2 image protection.
 *
 * Chapters uploaded after the site enabled "IMGX" no longer expose direct image
 * URLs. Instead each `<img class="page-media">` carries a placeholder SVG and the
 * real page is an obfuscated binary served as a `.js` file from the image CDN.
 * The reader fetches per-page "grants" from a `page-access` endpoint and decodes
 * the binary client-side (WASM, with a JS fallback). This module reimplements the
 * JS fallback decode pipeline so the desktop downloader can produce the original
 * WebP bytes without a browser.
 *
 * Two codec versions exist (the grant advertises `codecVersions`/`defaultCodecVersion`):
 *
 *   v2 (legacy, header byte 4 === 2):
 *     1. validate 13-byte header: magic "IMGX" + version
 *     2. payload = bytes.slice(13)
 *     3. derive 32-byte key by unwrapping `wrappedDecodeKey` with grant + storageKey
 *     4. undo byte permutation (seeded Fisher-Yates) using the key
 *     5. XOR payload with the repeating key
 *
 *   v3 (header byte 4 === 3, contentAlgorithm "IMGX-AES-256-GCM-HKDF-v3"):
 *     1. 13-byte header: magic + version + width(uint32 BE) + height(uint32 BE)
 *     2. derive 32-byte content key by unwrapping `wrappedContentKey`
 *     3. iv = bytes[13:25], ciphertext+tag = bytes[25:]
 *     4. AES-256-GCM decrypt with AAD = "IMGX-v3.<imageId>.<storageKey>.<width>.<height>"
 *
 * Access control (added by the site mid-2026): the `page-access` endpoint now
 * requires a per-request "Reader JS proof". Without it the server returns 500
 * ("Đã xảy ra lỗi hệ thống") or 403 ("Reader JS proof required."), so no grants
 * are issued and decoding fails. The proof is a SHA-256 over a newline-joined
 * tuple (version, token, access path, user agent, page indexes, issuedAt, nonce)
 * and must be sent both in the body (`pageAccessProof`) and as headers, alongside
 * the session cookie set by the chapter page and browser `Sec-Fetch-*` headers.
 */

const crypto = require('crypto');

const IMGX_MAGIC = [73, 77, 71, 88]; // "IMGX"
const IMGX_VERSION_V2 = 2;
const IMGX_VERSION_V3 = 3;
const IMGX_GCM_IV_LENGTH = 12; // AES-GCM nonce
const IMGX_GCM_TAG_LENGTH = 16; // 128-bit auth tag (appended after the ciphertext)
const GOLDEN = 2654435769; // 0x9E3779B9
const MAX_PAGES_PER_REQUEST = 5; // server rejects larger batches ("Too many pages requested.")
const MAX_PAGES_PER_REQUEST_V3 = 10;
const PROOF_VERSION = 'imgx-page-access-proof-v1';
const PROOF_VERSION_V3 = 'imgx-page-access-proof-v3';
const CHANNEL_VERSION = 'imgx-reader-channel-v1';
const PAGE_KEY_VERSION = 'IMGX-READER-PAGE-KEY-v1';
const RENEWAL_VERSION = 'imgx-reader-renewal-v1';
// Key fields that the server seals per page inside `grant.channelKeys`.
const GRANT_KEY_FIELDS = ['decodeKey', 'wrappedDecodeKey', 'wrappedContentKey', 'wrappedV4Key'];
const INLINE_MEDIA_PARSE_TIMEOUT_MS = 100;
// Visible copy the site renders when a chapter is gated behind interaction/purchase.
const LOCKED_CHAPTER_PATTERNS = [
  /chế độ tăng tương tác[^<.]*/i,
  /bình luận ở chương trước[^<.]*/i,
  /mua chương[^<.]*/i,
  /mở khóa chương[^<.]*/i,
];

function getSubtleCrypto() {
  return crypto.subtle || crypto.webcrypto?.subtle || globalThis.crypto?.subtle;
}

/**
 * Decode a base64url string to a Uint8Array.
 *
 * @param {string} value
 * @returns {Uint8Array}
 */
function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * xorshift32 PRNG step.
 *
 * @param {number} state
 * @returns {number}
 */
function xorshift32(state) {
  let value = state >>> 0;
  value ^= (value << 13) >>> 0;
  value ^= value >>> 17;
  value ^= (value << 5) >>> 0;
  return value >>> 0;
}

/**
 * Seed for the permutation PRNG: first 4 key bytes as big-endian uint32.
 *
 * @param {Uint8Array} key
 * @returns {number}
 */
function permutationSeed(key) {
  if (!key || key.byteLength < 4) throw new Error('IMGX key invalid');
  const view = new DataView(key.buffer, key.byteOffset, key.byteLength);
  return view.getUint32(0, false) || GOLDEN;
}

/**
 * FNV-1a 32-bit hash.
 *
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function fnv1a32(bytes) {
  let hash = 2166136261;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || GOLDEN;
}

/**
 * UTF-8 encode a string.
 *
 * @param {string} value
 * @returns {Uint8Array}
 */
function utf8Bytes(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'utf-8'));
}

/**
 * Strip leading slashes (matches the site's storageKey normalization).
 *
 * @param {string} value
 * @returns {string}
 */
function stripLeadingSlashes(value) {
  return String(value || '').trim().replace(/^\/+/, '');
}

/**
 * Build the deterministic wrap string used to derive the key-unwrapping keystream.
 *
 * @param {object} grant
 * @param {string} storageKey
 * @returns {string}
 */
function grantWrapString(grant, storageKey) {
  return [
    'IMGX-GRANT-WRAP-v1',
    grant && grant.version,
    grant && grant.algorithm,
    grant && grant.imageId,
    grant && grant.issuedAt,
    grant && grant.expiresAt,
    grant && grant.nonce,
    grant && grant.keyNonce,
    grant && grant.signature,
    stripLeadingSlashes(storageKey),
  ]
    .map((part) => (part == null ? '' : String(part)))
    .join('.');
}

/**
 * Derive a keystream of `length` bytes from a seed string.
 *
 * @param {string} seedString
 * @param {number} [length=32]
 * @returns {Uint8Array}
 */
function deriveKeystream(seedString, length = 32) {
  const size = Math.max(0, Math.floor(Number(length) || 0));
  const out = new Uint8Array(size);
  let state = fnv1a32(utf8Bytes(seedString));
  for (let i = 0; i < size; i += 1) {
    if (i % 4 === 0) state = xorshift32((state + i + GOLDEN) >>> 0);
    out[i] = (state >>> ((i % 4) * 8)) & 255;
  }
  return out;
}

/**
 * Unwrap a 32-byte key from a wrapped grant field (matches the reader's `xn`).
 *
 * @param {object} grant
 * @param {string} storageKey
 * @param {string} field - 'wrappedDecodeKey' (v2) or 'wrappedContentKey' (v3).
 * @param {string} label - Error prefix.
 * @returns {Uint8Array}
 */
function unwrapGrantKey(grant, storageKey, field, label) {
  const wrapped = base64UrlToBytes(grant && grant[field]);
  if (wrapped.byteLength !== 32) throw new Error(`${label} invalid`);
  const keystream = deriveKeystream(grantWrapString(grant, storageKey), wrapped.byteLength);
  for (let i = 0; i < wrapped.byteLength; i += 1) wrapped[i] ^= keystream[i];
  return wrapped;
}

/**
 * Derive the 32-byte v2 decode key from a grant and the page storage key.
 *
 * @param {object} grant
 * @param {string} storageKey
 * @returns {Uint8Array}
 */
function deriveDecodeKey(grant, storageKey) {
  if (grant && grant.wrappedDecodeKey) {
    return unwrapGrantKey(grant, storageKey, 'wrappedDecodeKey', 'IMGX wrapped grant');
  }
  return base64UrlToBytes(grant && grant.decodeKey);
}

/**
 * Derive the 32-byte v3 content key (AES-256-GCM) from a grant and storage key.
 *
 * @param {object} grant
 * @param {string} storageKey
 * @returns {Uint8Array}
 */
function deriveContentKey(grant, storageKey) {
  if (grant && grant.wrappedContentKey) {
    return unwrapGrantKey(grant, storageKey, 'wrappedContentKey', 'IMGX wrapped content grant');
  }
  return base64UrlToBytes(grant && grant.contentKey);
}

/**
 * Undo the seeded Fisher-Yates byte permutation in place.
 *
 * @param {Uint8Array} bytes
 * @param {Uint8Array} key
 */
function undoPermutation(bytes, key) {
  const swaps = new Uint32Array(bytes.byteLength);
  let state = permutationSeed(key);
  for (let i = bytes.byteLength - 1; i > 0; i -= 1) {
    state = xorshift32(state);
    swaps[i] = state % (i + 1);
  }
  for (let i = 1; i < bytes.byteLength; i += 1) {
    const target = swaps[i];
    if (target === i) continue;
    const tmp = bytes[i];
    bytes[i] = bytes[target];
    bytes[target] = tmp;
  }
}

/**
 * XOR payload with the repeating key in place.
 *
 * @param {Uint8Array} bytes
 * @param {Uint8Array} key
 */
function applyXorKey(bytes, key) {
  if (!key || !key.byteLength) throw new Error('IMGX key missing');
  for (let i = 0; i < bytes.byteLength; i += 1) bytes[i] ^= key[i % key.byteLength];
}

/**
 * Parse and validate the 13-byte IMGX header (matches the reader's `wn`).
 *
 * @param {Uint8Array} bytes
 * @returns {{version: number, width: number, height: number}}
 */
function parseImgxHeader(bytes) {
  if (!bytes || bytes.byteLength <= 13) throw new Error('IMGX payload empty');
  if (
    bytes[0] !== IMGX_MAGIC[0] ||
    bytes[1] !== IMGX_MAGIC[1] ||
    bytes[2] !== IMGX_MAGIC[2] ||
    bytes[3] !== IMGX_MAGIC[3]
  ) {
    throw new Error('IMGX magic invalid');
  }
  const version = Number(bytes[4]) || 0;
  if (version !== IMGX_VERSION_V2 && version !== IMGX_VERSION_V3) {
    throw new Error('IMGX version invalid');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(5, false);
  const height = view.getUint32(9, false);
  if (!width || !height) throw new Error('IMGX dimensions invalid');
  return { version, width, height };
}

/**
 * Decode a v2 payload: undo the seeded permutation, then XOR with the decode key.
 *
 * @param {Uint8Array} bytes - Full payload including the 13-byte header.
 * @param {object} grant
 * @param {string} storageKey
 * @returns {Buffer}
 */
function decodeImgxV2(bytes, grant, storageKey) {
  const payload = bytes.slice(13);
  const key = deriveDecodeKey(grant, storageKey);
  if (key.byteLength !== 32) throw new Error('IMGX grant invalid');
  undoPermutation(payload, key);
  applyXorKey(payload, key);
  return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
}

/**
 * Build the AES-GCM additional authenticated data for v3 (matches the reader's `En`).
 *
 * @param {object} grant
 * @param {string} storageKey
 * @param {{width: number, height: number}} header
 * @returns {Buffer}
 */
function buildV3AdditionalData(grant, storageKey, header) {
  const imageId = (grant && grant.imageId ? String(grant.imageId) : '').trim();
  if (!imageId) throw new Error('IMGX v3 image id missing');
  const aad = [
    'IMGX-v3',
    imageId,
    stripLeadingSlashes(storageKey),
    Math.max(1, Math.floor(Number(header && header.width) || 0)),
    Math.max(1, Math.floor(Number(header && header.height) || 0)),
  ].join('.');
  return Buffer.from(aad, 'utf-8');
}

/**
 * Decode a v3 payload: AES-256-GCM decrypt using the unwrapped content key.
 *
 * @param {Uint8Array} bytes - Full payload including the 13-byte header.
 * @param {object} grant
 * @param {string} storageKey
 * @param {{width: number, height: number}} header
 * @returns {Buffer}
 */
function decodeImgxV3(bytes, grant, storageKey, header) {
  if (bytes.byteLength <= 41) throw new Error('IMGX v3 payload empty');
  const key = deriveContentKey(grant, storageKey);
  if (key.byteLength !== 32) throw new Error('IMGX content grant invalid');

  const iv = Buffer.from(bytes.slice(13, 13 + IMGX_GCM_IV_LENGTH));
  const body = bytes.slice(13 + IMGX_GCM_IV_LENGTH);
  if (body.byteLength <= IMGX_GCM_TAG_LENGTH) throw new Error('IMGX v3 payload empty');
  const ciphertext = Buffer.from(body.slice(0, body.byteLength - IMGX_GCM_TAG_LENGTH));
  const authTag = Buffer.from(body.slice(body.byteLength - IMGX_GCM_TAG_LENGTH));
  const aad = buildV3AdditionalData(grant, storageKey, header);

  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Decode an IMGX-protected payload into the original image bytes (usually WebP).
 *
 * Dispatches on the header version: v2 uses permutation + XOR, v3 uses AES-256-GCM.
 *
 * @param {ArrayBuffer|Buffer|Uint8Array} input - Raw bytes fetched from the CDN.
 * @param {object} grant - The page grant ({ wrappedDecodeKey, wrappedContentKey, ... }).
 * @param {string} storageKey - The page storage key.
 * @returns {Buffer} Decoded image bytes.
 */
function decodeImgxPayload(input, grant, storageKey) {
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(Buffer.from(input));
  const header = parseImgxHeader(bytes);
  if (header.version === IMGX_VERSION_V3) {
    return decodeImgxV3(bytes, grant, storageKey, header);
  }
  return decodeImgxV2(bytes, grant, storageKey);
}

/**
 * Encode bytes as a base64url string without padding (matches the reader's `pn`).
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build the per-request "Reader JS proof" required by the page-access endpoint.
 *
 * Ported 1:1 from reader.js (`gn`/`_n`): proof = base64url(SHA-256(utf8(tuple)))
 * where the tuple is newline-joined [version, token, access pathname, user agent,
 * page indexes, issuedAt, nonce]. The server recomputes this using the request's
 * User-Agent header, so the caller MUST send the same UA used here.
 *
 * @param {object} options
 * @param {string} options.token - data-reader-imgx-proof-token from the chapter page.
 * @param {string} options.accessUrl - Absolute page-access URL (only its pathname is hashed).
 * @param {string} options.userAgent
 * @param {number[]} options.pageIndexes
 * @returns {{version: string, token: string, issuedAt: number, nonce: string, proof: string}}
 */
function buildPageAccessProof(options) {
  const { token, accessUrl, userAgent, pageIndexes } = options || {};
  if (!token) throw new Error('IMGX proof token missing');

  let accessPath = String(accessUrl || '');
  try {
    accessPath = new URL(accessUrl).pathname;
  } catch {
    accessPath = String(accessUrl || '').split('?')[0] || '';
  }

  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const indexes = Array.isArray(pageIndexes)
    ? pageIndexes.map((n) => Math.floor(Number(n))).join(',')
    : '';
  const tuple = [
    PROOF_VERSION,
    String(token),
    accessPath,
    String(userAgent || '').trim(),
    indexes,
    Math.max(0, Math.floor(issuedAt)),
    String(nonce).trim().toLowerCase(),
  ].join('\n');
  const digest = crypto.createHash('sha256').update(Buffer.from(tuple, 'utf-8')).digest();
  return {
    version: PROOF_VERSION,
    token: String(token),
    issuedAt,
    nonce,
    proof: bytesToBase64Url(digest),
  };
}

/**
 * Detect and parse the IMGX reader configuration from a chapter page.
 *
 * @param {string} html
 * @param {string} pageUrl - Used to resolve the relative access URL.
 * @returns {{accessUrl: string, totalPages: number, initialPages: Array, proofToken: string}|null}
 */
function parseImgxReaderConfig(html, pageUrl) {
  const source = String(html || '');
  const accessMatch = /data-reader-imgx-access-url="([^"]*)"/.exec(source);

  let accessUrl = '';
  if (accessMatch && accessMatch[1]) {
    try {
      accessUrl = new URL(decodeURIComponent(accessMatch[1]), pageUrl).href;
    } catch {
      accessUrl = accessMatch[1];
    }
  }

  let initialPages = [];
  const initMatch = /data-reader-imgx-initial-pages="([^"]+)"/.exec(source);
  if (initMatch) {
    try {
      const parsed = JSON.parse(decodeURIComponent(initMatch[1]));
      if (Array.isArray(parsed)) initialPages = parsed;
    } catch {
      initialPages = [];
    }
  }

  let bootstrapUrl = '';
  const bootstrapMatch = /bootstrapUrl:\s*"([^"]*)"/.exec(source);
  if (bootstrapMatch && bootstrapMatch[1]) {
    try {
      bootstrapUrl = new URL(bootstrapMatch[1], pageUrl).href;
    } catch {
      bootstrapUrl = bootstrapMatch[1];
    }
  }

  let chapterId = 0;
  const chapterIdMatch = /(?:chapterId:\s*(\d+)|data-reading-chapter-id="(\d+)")/.exec(source);
  if (chapterIdMatch) {
    const id = parseInt(chapterIdMatch[1] || chapterIdMatch[2], 10);
    if (Number.isFinite(id)) chapterId = id;
  }

  let initialIndexes = [];
  const initialIndexesMatch = /initialIndexes:\s*(\[[^\]]*\])/.exec(source);
  if (initialIndexesMatch) {
    try {
      const parsed = JSON.parse(initialIndexesMatch[1]);
      if (Array.isArray(parsed)) initialIndexes = parsed;
    } catch {
      initialIndexes = [];
    }
  }

  let requestPath = '';
  const requestPathMatch = /requestPath:\s*"([^"]*)"/.exec(source);
  if (requestPathMatch && requestPathMatch[1]) {
    requestPath = requestPathMatch[1];
    if (!accessUrl) {
      try {
        accessUrl = new URL(requestPath, pageUrl).href;
      } catch {
        accessUrl = requestPath;
      }
    }
  }

  const media = parseInlineMediaList(source);

  if (!accessUrl && !bootstrapUrl && (!initialPages || !initialPages.length) && !media.length) {
    const lockedReason = detectLockedChapterReason(source);
    if (!lockedReason) return null;
    return {
      accessUrl: '',
      totalPages: 0,
      initialPages: [],
      proofToken: '',
      bootstrapUrl: '',
      chapterId,
      initialIndexes: [],
      requestPath: '',
      media: [],
      locked: true,
      lockedReason,
    };
  }

  let proofToken = '';
  const proofMatch = /data-reader-imgx-proof-token="([^"]*)"/.exec(source);
  if (proofMatch && proofMatch[1]) {
    try {
      proofToken = decodeURIComponent(proofMatch[1]).trim();
    } catch {
      proofToken = proofMatch[1].trim();
    }
  }

  const totalPages = Math.max(parseDeclaredImgxTotalPages(source, initialPages.length), media.length);
  return {
    accessUrl,
    totalPages,
    initialPages,
    proofToken,
    bootstrapUrl,
    chapterId,
    initialIndexes,
    requestPath,
    media,
    locked: false,
    lockedReason: '',
  };
}

/**
 * Return the visible gating message when a chapter is locked (interaction mode,
 * purchase, ...) and therefore has no reader runtime, or '' when not detected.
 *
 * @param {string} source
 * @returns {string}
 */
function detectLockedChapterReason(source) {
  for (const pattern of LOCKED_CHAPTER_PATTERNS) {
    const match = pattern.exec(source);
    if (match) return match[0].replace(/\s+/g, ' ').trim();
  }
  return '';
}

/**
 * Locate the `media: [ ... ]` array literal inside the inline worker INIT config
 * and return its source text (bracket-matched, string-aware), or '' if absent.
 *
 * @param {string} source
 * @returns {string}
 */
function sliceInlineMediaLiteral(source) {
  const start = /media:\s*\[/.exec(source);
  if (!start) return '';
  const open = start.index + start[0].length - 1;
  let depth = 0;
  let quote = '';
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '[' || ch === '{') depth += 1;
    else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

/**
 * Parse the worker INIT `media` list from the chapter page. The literal is plain
 * data (quoted strings, numbers, unquoted keys), so it is first normalised to
 * JSON; a sandboxed `vm` evaluation with no globals is the fallback. Entries
 * without `storageKey`/`downloadUrl` are dropped.
 *
 * @param {string} source
 * @returns {Array<{pageIndex:number,pageNumber:number,storageKey:string,downloadUrl:string,primaryUrl?:string}>}
 */
function parseInlineMediaList(source) {
  const literal = sliceInlineMediaLiteral(source);
  if (!literal) return [];

  let parsed = null;
  try {
    const jsonish = literal
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/,(\s*[}\]])/g, '$1');
    parsed = JSON.parse(jsonish);
  } catch {
    try {
      // eslint-disable-next-line global-require
      const vm = require('vm');
      parsed = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: INLINE_MEDIA_PARSE_TIMEOUT_MS });
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed)) return [];

  const media = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const pageIndex = Math.floor(Number(entry.pageIndex));
    const storageKey = typeof entry.storageKey === 'string' ? entry.storageKey.trim() : '';
    const downloadUrl = typeof entry.downloadUrl === 'string' ? entry.downloadUrl.trim() : '';
    if (!Number.isFinite(pageIndex) || pageIndex < 0 || !storageKey || !downloadUrl) continue;
    const item = { pageIndex, pageNumber: Number(entry.pageNumber), storageKey, downloadUrl };
    if (typeof entry.primaryUrl === 'string' && entry.primaryUrl.trim()) item.primaryUrl = entry.primaryUrl.trim();
    if (typeof entry.fallbackUrl === 'string' && entry.fallbackUrl.trim()) item.fallbackUrl = entry.fallbackUrl.trim();
    media.push(item);
  }
  return media;
}

/**
 * Site-declared IMGX page count: prefer data-reader-total-pages, then unique
 * data-imgx-page-index values (the DOM may repeat the initial page).
 *
 * @param {string} source
 * @param {number} initialPagesLength
 * @returns {number}
 */
function parseDeclaredImgxTotalPages(source, initialPagesLength) {
  let fromAttr = 0;
  const attrMatch = /data-reader-total-pages="(\d+)"/.exec(source);
  if (attrMatch) {
    const n = parseInt(attrMatch[1], 10);
    if (Number.isFinite(n) && n > 0) fromAttr = n;
  }
  const uniqueIndexes = new Set();
  const indexRe = /data-imgx-page-index="(\d+)"/g;
  let indexMatch;
  while ((indexMatch = indexRe.exec(source))) {
    const n = parseInt(indexMatch[1], 10);
    if (Number.isFinite(n)) uniqueIndexes.add(n);
  }
  if (fromAttr > 0) return fromAttr;
  return Math.max(uniqueIndexes.size, Math.max(0, Math.floor(Number(initialPagesLength) || 0)));
}

/**
 * Request one batch of page grants from the page-access endpoint.
 *
 * Each request carries a freshly computed Reader JS proof (body + headers). The
 * proof token and the session cookie must both originate from the chapter page
 * fetch, otherwise the server rejects the request.
 *
 * @param {object} options
 * @param {string} options.accessUrl
 * @param {number[]} options.pageIndexes
 * @param {object} options.baseHeaders - Shared headers (cookie, UA, Sec-Fetch, ...).
 * @param {string} options.proofToken
 * @param {string} options.userAgent
 * @returns {Promise<Array>} Array of grant page objects (may be empty on failure).
 */
async function requestGrantBatch(options) {
  const { accessUrl, pageIndexes, baseHeaders, proofToken, userAgent } = options || {};
  const proof = buildPageAccessProof({ token: proofToken, accessUrl, userAgent, pageIndexes });
  const headers = {
    ...baseHeaders,
    'X-IMGX-Reader-Proof': proof.proof,
    'X-IMGX-Reader-Proof-Version': proof.version,
  };
  const res = await fetch(accessUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ pageIndexes, pageAccessProof: proof }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true || !Array.isArray(body.pages)) {
    const error = (body && body.error) || `HTTP ${res.status}`;
    throw new Error(`IMGX access failed: ${error}`);
  }
  return body.pages;
}

/**
 * Create an ECDH P-256 reader channel matching the browser's imgx-reader.js.
 */
async function createImgxReaderChannel() {
  const subtle = getSubtleCrypto();
  if (!subtle) throw new Error('WebCrypto subtle not available');

  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const rawPub = await subtle.exportKey('raw', keyPair.publicKey);
  const publicKey = bytesToBase64Url(new Uint8Array(rawPub));
  const encoder = new TextEncoder();
  // Pages whose grant carries `channelKeys` -> { key: AES-GCM page key, binding }.
  const pageKeyContexts = new WeakMap();

  async function open(sealed, proof) {
    if (!sealed || sealed.version !== CHANNEL_VERSION) {
      throw new Error('Protected reader channel required');
    }
    const serverPubBytes = base64UrlToBytes(sealed.publicKey);
    if (serverPubBytes.length !== 65 || serverPubBytes[0] !== 4) {
      throw new Error('Invalid reader channel key');
    }
    const serverPubKey = await subtle.importKey(
      'raw',
      serverPubBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const sharedBits = await subtle.deriveBits(
      { name: 'ECDH', public: serverPubKey },
      keyPair.privateKey,
      256
    );
    const hkdfKey = await subtle.importKey(
      'raw',
      sharedBits,
      'HKDF',
      false,
      ['deriveKey']
    );
    const aesKey = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode(proof),
        info: encoder.encode(CHANNEL_VERSION),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const iv = base64UrlToBytes(sealed.iv);
    if (iv.length !== 12) throw new Error('Invalid reader channel nonce');
    const ciphertext = base64UrlToBytes(sealed.ciphertext);
    const additionalData = encoder.encode(
      JSON.stringify([CHANNEL_VERSION, publicKey, sealed.publicKey, proof])
    );
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
      aesKey,
      ciphertext
    );
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(decrypted));
      if (!Array.isArray(parsed)) throw new Error('Invalid reader channel pages');
    } catch (e) {
      throw new Error(`Failed to parse reader channel decrypted payload: ${e.message}`);
    }

    // Pages may carry per-page sealed key material; derive the page key from the
    // same ECDH material so `openPageGrant` can unseal it later.
    if (parsed.some((page) => page && page.grant && page.grant.channelKeys)) {
      const pageKey = await subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: encoder.encode(proof),
          info: encoder.encode(PAGE_KEY_VERSION),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const binding = [publicKey, sealed.publicKey, proof];
      for (const page of parsed) {
        if (page && page.grant && page.grant.channelKeys) pageKeyContexts.set(page, { key: pageKey, binding });
      }
    }
    return parsed;
  }

  /**
   * Unseal `grant.channelKeys` for a page returned by `open()` and return a grant
   * object with the key fields merged in (and `channelKeys` removed).
   */
  async function openPageGrant(page) {
    const context = page ? pageKeyContexts.get(page) : null;
    const channelKeys = page && page.grant ? page.grant.channelKeys : null;
    if (!context || !channelKeys || channelKeys.version !== PAGE_KEY_VERSION) {
      throw new Error('Reader page key channel required');
    }
    const iv = base64UrlToBytes(channelKeys.iv);
    if (iv.length !== 12) throw new Error('Invalid reader page key nonce');
    const additionalData = encoder.encode(
      JSON.stringify([
        PAGE_KEY_VERSION,
        context.binding,
        page.pageIndex,
        page.storageKey,
        page.grant.imageId,
        page.grant.issuedAt,
        page.grant.expiresAt,
        page.grant.nonce,
        page.grant.signature,
      ])
    );
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
      context.key,
      base64UrlToBytes(channelKeys.ciphertext)
    );
    let keys;
    try {
      keys = JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      throw new Error(`Failed to parse reader page key payload: ${e.message}`);
    }
    const { channelKeys: _sealed, ...grant } = page.grant;
    for (const field of GRANT_KEY_FIELDS) {
      if (keys && Object.prototype.hasOwnProperty.call(keys, field)) grant[field] = keys[field];
    }
    return grant;
  }

  return { publicKey, open, openPageGrant };
}

/**
 * Build v3 page access client proof tuple payload matching imgx-reader.js.
 */
function buildImgxPageAccessClientProofPayload({
  readerInstanceId,
  chapterId,
  requestPath,
  pageIndexes,
  issuedAt,
  sequence,
  publicKeyHash,
}) {
  return JSON.stringify([
    PROOF_VERSION_V3,
    readerInstanceId,
    chapterId,
    requestPath,
    '',
    pageIndexes,
    issuedAt,
    sequence,
    publicKeyHash,
  ]);
}

/**
 * Fetch page grants using the modern IMGX reader channel v1 and proof v3.
 */
async function fetchImgxChannelGrants(options) {
  const {
    accessUrl,
    bootstrapUrl,
    chapterId = 0,
    initialIndexes = [],
    totalPages = 0,
    initialPages = [],
    media = [],
    referer,
    userAgent,
    cookie,
    fetchImpl,
  } = options || {};

  const mediaByIndex = new Map();
  for (const item of Array.isArray(media) ? media : []) {
    if (item && Number.isFinite(Number(item.pageIndex))) mediaByIndex.set(Number(item.pageIndex), item);
  }

  const fetchFn =
    typeof fetchImpl === 'function'
      ? fetchImpl
      : globalThis.fetch || fetch;

  let origin = '';
  try {
    origin = new URL(accessUrl || bootstrapUrl).origin;
  } catch {
    origin = 'https://moetruyen.net';
  }

  const baseHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    Referer: referer || `${origin}/`,
    Origin: origin,
  };
  if (userAgent) baseHeaders['User-Agent'] = userAgent;
  if (cookie) baseHeaders.Cookie = cookie;

  const channel = await createImgxReaderChannel();
  const bootstrapProof = bytesToBase64Url(crypto.randomBytes(32));

  let bootstrapRes;
  try {
    bootstrapRes = await fetchFn(bootstrapUrl, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        readerPublicKey: channel.publicKey,
        bootstrapProof,
        initialPageIndexes: Array.isArray(initialIndexes) ? initialIndexes : [],
      }),
    });
  } catch (err) {
    throw new Error(`IMGX bootstrap network error: ${err.message}`);
  }

  if (!bootstrapRes.ok) {
    throw new Error(`IMGX bootstrap failed with HTTP ${bootstrapRes.status}`);
  }

  const bootstrapPayload = await bootstrapRes.json().catch(() => null);
  if (!bootstrapPayload || bootstrapPayload.ok !== true || !bootstrapPayload.sealedCapability) {
    throw new Error(`IMGX bootstrap failed: ${bootstrapPayload?.error || bootstrapPayload?.code || 'invalid response'}`);
  }

  const [material] = await channel.open(bootstrapPayload.sealedCapability, bootstrapProof);
  const openedInitialPages = bootstrapPayload.sealedInitialPages
    ? await channel.open(bootstrapPayload.sealedInitialPages, bootstrapProof)
    : [];

  const byIndex = new Map();
  for (const page of initialPages) {
    if (page && Number.isFinite(Number(page.pageIndex))) byIndex.set(Number(page.pageIndex), page);
  }
  for (const page of openedInitialPages) {
    if (page && Number.isFinite(Number(page.pageIndex))) byIndex.set(Number(page.pageIndex), page);
  }

  const subtle = getSubtleCrypto();
  const secretBytes = base64UrlToBytes(material.secret);
  const hmacKey = await subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const publicBytes = base64UrlToBytes(channel.publicKey);
  const publicKeyHashBytes = await subtle.digest('SHA-256', publicBytes);
  const publicKeyHash = Buffer.from(publicKeyHashBytes).toString('hex');

  let serverTime = Number(bootstrapPayload.serverTime) || Date.now();
  let started = Date.now();
  let sequence = 0;
  const encoder = new TextEncoder();

  let requestPath = '';
  try {
    requestPath = new URL(accessUrl).pathname;
  } catch {
    requestPath = String(accessUrl || '').split('?')[0];
  }

  /**
   * Sign a page-access (or renewal) proof. Renewal proofs use the renewal version
   * and prefix the signed tuple with it, matching the reader's `k(..., renew=true)`.
   */
  async function signRequest(indexes, { path = requestPath, renewal = false } = {}) {
    sequence += 1;
    const issuedAt = Math.floor(serverTime + Math.max(0, Date.now() - started));
    let payloadString = buildImgxPageAccessClientProofPayload({
      readerInstanceId: material.readerInstanceId,
      chapterId,
      requestPath: path,
      pageIndexes: indexes,
      issuedAt,
      sequence,
      publicKeyHash,
    });
    if (renewal) payloadString = `${RENEWAL_VERSION}\n${payloadString}`;
    const sig = await subtle.sign('HMAC', hmacKey, encoder.encode(payloadString));
    return {
      version: renewal ? RENEWAL_VERSION : PROOF_VERSION_V3,
      readerInstanceId: material.readerInstanceId,
      issuedAt,
      sequence,
      proof: bytesToBase64Url(new Uint8Array(sig)),
    };
  }

  async function postAccess(indexes) {
    const pageProof = await signRequest(indexes);
    const res = await fetchFn(accessUrl, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        pageIndexes: indexes,
        pageAccessProof: pageProof,
        readerPublicKey: channel.publicKey,
      }),
    });
    const payload = await res.json().catch(() => null);
    return { res, payload, pageProof };
  }

  /** Renew an expired reader instance (`POST <bootstrapUrl>/renew`). */
  async function renewInstance() {
    const renewUrl = `${bootstrapUrl}/renew`;
    let renewPath = renewUrl;
    try {
      renewPath = new URL(renewUrl).pathname;
    } catch {
      /* keep full url */
    }
    const renewProof = await signRequest([], { path: renewPath, renewal: true });
    const res = await fetchFn(renewUrl, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ readerPublicKey: channel.publicKey, pageAccessProof: renewProof }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.ok !== true) {
      throw new Error(`IMGX reader renewal failed: ${payload?.error || payload?.code || `HTTP ${res.status}`}`);
    }
    if (Number.isFinite(payload.serverTime)) serverTime = payload.serverTime;
    started = Date.now();
  }

  const total = Math.max(0, Math.floor(Number(totalPages) || 0), mediaByIndex.size);
  const wantedIndexes = mediaByIndex.size
    ? Array.from(mediaByIndex.keys()).sort((a, b) => a - b)
    : Array.from({ length: total }, (_, i) => i);
  let lastGrantError = '';

  for (let start = 0; start < wantedIndexes.length; start += MAX_PAGES_PER_REQUEST_V3) {
    const batchIndexes = wantedIndexes
      .slice(start, start + MAX_PAGES_PER_REQUEST_V3)
      .filter((i) => !byIndex.has(i));
    if (!batchIndexes.length) continue;

    try {
      let attempt = await postAccess(batchIndexes);
      if (!attempt.res.ok || !attempt.payload || attempt.payload.ok !== true) {
        const code = attempt.payload?.code;
        if (code === 'reader_proof_clock_skew' && Number.isFinite(attempt.payload.serverTime)) {
          serverTime = attempt.payload.serverTime;
          started = Date.now();
          attempt = await postAccess(batchIndexes);
        } else if (code === 'reader_instance_expired') {
          await renewInstance();
          attempt = await postAccess(batchIndexes);
        }
      }

      const { res, payload, pageProof } = attempt;
      if (!res.ok || !payload || payload.ok !== true || !payload.sealedPages) {
        throw new Error(payload?.error || payload?.code || `HTTP ${res.status}`);
      }

      const pages = await channel.open(payload.sealedPages, pageProof.proof);
      for (const p of pages) {
        if (p && Number.isFinite(Number(p.pageIndex))) byIndex.set(Number(p.pageIndex), p);
      }
    } catch (err) {
      lastGrantError = String(err && err.message ? err.message : err);
      break;
    }
  }

  // Unseal per-page key material so callers receive grants that carry the
  // wrapped keys directly (like the reader does right before decoding).
  const resolved = [];
  for (const page of byIndex.values()) {
    if (!page || !page.downloadUrl || !page.grant) continue;
    let grant = page.grant;
    if (grant.channelKeys) {
      try {
        grant = await channel.openPageGrant(page);
      } catch (err) {
        lastGrantError = String(err && err.message ? err.message : err);
        continue;
      }
    }
    const mediaItem = mediaByIndex.get(Number(page.pageIndex));
    const resolvedPage = { ...page, grant };
    if (mediaItem && mediaItem.primaryUrl && !resolvedPage.primaryUrl) resolvedPage.primaryUrl = mediaItem.primaryUrl;
    if (mediaItem && mediaItem.pageNumber != null && resolvedPage.pageNumber == null) resolvedPage.pageNumber = mediaItem.pageNumber;
    resolved.push(resolvedPage);
  }
  resolved.sort((a, b) => Number(a.pageIndex) - Number(b.pageIndex));

  const expected = wantedIndexes.length || total;
  if (expected > 0 && resolved.length < expected) {
    const detail = lastGrantError ? ` (${lastGrantError})` : '';
    throw new Error(`IMGX access incomplete: ${resolved.length}/${expected} pages${detail}`);
  }
  return resolved;
}

/**
 * Decode any IMGX CDN response into the original image bytes.
 *
 * Handles every transport/codec combination seen in the wild:
 *   PNG pixel carrier → raw payload; v4 payload → AES-GCM envelope + profile;
 *   v3 payload → decoy WebP, whose `IMX4` chunk (if present) holds the v4 payload;
 *   v2 payload → permutation + XOR.
 *
 * @param {ArrayBuffer|Buffer|Uint8Array} input
 * @param {object} grant - Grant with key fields (after `openPageGrant`).
 * @param {string} storageKey
 * @returns {Promise<Buffer>}
 */
async function decodeImgxImage(input, grant, storageKey) {
  // eslint-disable-next-line global-require
  const { unwrapPngCarrier, extractImx4Chunk } = require('./moetruyenImgxCarrier');
  // eslint-disable-next-line global-require
  const { decodeImgxV4 } = require('./moetruyenImgxV4');

  const raw = input instanceof Uint8Array
    ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    : Buffer.from(input);
  const payload = await unwrapPngCarrier(raw);
  if (payload.length > 4 && payload[4] === 4) {
    return decodeImgxV4(payload, grant, storageKey);
  }
  const decoded = decodeImgxPayload(payload, grant, storageKey);
  const inner = extractImx4Chunk(decoded);
  if (!inner) return decoded;
  return decodeImgxV4(inner, grant, storageKey);
}

/**
 * Fetch grants for every page of a chapter, batching within the server limit.
 *
 * Automatically branches to modern IMGX Channel v1 / Proof v3 when bootstrapUrl
 * is detected, or falls back to legacy Proof v1 for backwards compatibility.
 *
 * @param {object} options
 * @param {string} options.accessUrl
 * @param {number} options.totalPages
 * @param {Array} [options.initialPages]
 * @param {string} [options.referer]
 * @param {string} [options.userAgent]
 * @param {string} [options.proofToken] - data-reader-imgx-proof-token from the chapter page.
 * @param {string} [options.bootstrapUrl] - inline bootstrap URL for channel creation.
 * @param {number} [options.chapterId]
 * @param {number[]} [options.initialIndexes]
 * @param {string} [options.cookie] - Session cookie set by the chapter page (bfang.sid / imgx_document).
 * @param {Function} [options.fetchImpl] - Custom fetch implementation (e.g. Chromium net.fetch).
 * @returns {Promise<Array<{pageIndex:number,pageNumber:number,storageKey:string,downloadUrl:string,grant:object}>>}
 */
async function fetchImgxPageGrants(options) {
  if (options && options.bootstrapUrl) {
    return fetchImgxChannelGrants(options);
  }

  const { accessUrl, totalPages, initialPages = [], referer, userAgent, proofToken, cookie } = options || {};
  const baseHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    // Required by the server's access check; without these it returns HTTP 500.
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };
  if (referer) baseHeaders.Referer = referer;
  if (userAgent) baseHeaders['User-Agent'] = userAgent;
  if (cookie) baseHeaders.Cookie = cookie;
  try {
    baseHeaders.Origin = new URL(accessUrl).origin;
  } catch {
    /* leave Origin unset if accessUrl is malformed */
  }

  const byIndex = new Map();
  for (const page of initialPages) {
    if (page && Number.isFinite(Number(page.pageIndex))) byIndex.set(Number(page.pageIndex), page);
  }

  const canRequestGrants = Boolean(proofToken);
  const total = Math.max(0, Math.floor(Number(totalPages) || 0));
  let lastGrantError = '';
  for (let start = 0; canRequestGrants && start < total; start += MAX_PAGES_PER_REQUEST) {
    const indexes = [];
    for (let i = start; i < Math.min(total, start + MAX_PAGES_PER_REQUEST); i += 1) {
      // Re-requesting a page already in initial-pages makes the server reject
      // the entire batch (403 "Reader JS proof required."), dropping neighbors.
      if (!byIndex.has(i)) indexes.push(i);
    }
    if (!indexes.length) continue;
    try {
      const pages = await requestGrantBatch({
        accessUrl,
        pageIndexes: indexes,
        baseHeaders,
        proofToken,
        userAgent,
      });
      for (const page of pages) {
        if (page && Number.isFinite(Number(page.pageIndex))) byIndex.set(Number(page.pageIndex), page);
      }
    } catch (err) {
      lastGrantError = String(err && err.message ? err.message : err);
    }
  }

  const resolved = Array.from(byIndex.values())
    .filter((page) => page && page.downloadUrl && page.grant)
    .sort((a, b) => Number(a.pageIndex) - Number(b.pageIndex));
  if (total > 0 && resolved.length < total) {
    const detail = lastGrantError ? ` (${lastGrantError})` : '';
    throw new Error(`IMGX access incomplete: ${resolved.length}/${total} pages${detail}`);
  }
  return resolved;
}

/**
 * Detect whether a chapter page is encrypted with IMGX (requires browser capture).
 *
 * Returns false if the chapter provides direct, valid static image URLs.
 * Returns true if the chapter is protected by IMGX runtime encryption (placeholder SVGs,
 * imgx-reader script, or data-reader-imgx-* markers with no valid direct images).
 *
 * @param {string} html
 * @param {string} [chapterUrl]
 * @returns {boolean}
 */
function isImgxEncrypted(html, chapterUrl) {
  if (!html || typeof html !== 'string') return false;

  const hasImgxMarker =
    html.includes('data-reader-imgx-access-url') ||
    html.includes('data-reader-imgx-media') ||
    html.includes('data-reader-imgx-initial-pages') ||
    html.includes('imgx-reader.js');

  if (!hasImgxMarker) {
    return false;
  }

  // Check if direct static images are present in the HTML
  // (e.g. older/unencrypted MoeTruyen chapters have img.page-media with direct webp/jpg/png src)
  const imgRegex = /<img[^>]+(?:class=["'][^"']*page-media[^"']*["']|data-page-index)[^>]*>/gi;
  const matches = html.match(imgRegex);
  if (matches && matches.length > 0) {
    let directValidCount = 0;
    for (const tag of matches) {
      const srcMatch = /src=["']([^"']+)["']/i.exec(tag);
      const dataSrcMatch = /data-(?:original|cdn|src)=["']([^"']+)["']/i.exec(tag);
      const src = (srcMatch && srcMatch[1]) || (dataSrcMatch && dataSrcMatch[1]) || '';
      if (!src) continue;
      if (/^data:image\/svg\+xml/i.test(src)) continue;
      if (/(?:^|\/)0\.js(?:\?|$)/i.test(src)) continue;
      if (/\.(?:webp|jpg|jpeg|png|avif)(?:\?|$)/i.test(src)) {
        directValidCount++;
      }
    }
    if (directValidCount > 0) {
      return false;
    }
  }

  return true;
}

module.exports = {
  decodeImgxPayload,
  parseImgxReaderConfig,
  fetchImgxPageGrants,
  fetchImgxChannelGrants,
  decodeImgxImage,
  buildPageAccessProof,
  buildImgxPageAccessClientProofPayload,
  createImgxReaderChannel,
  deriveDecodeKey,
  unwrapGrantKey,
  bytesToBase64Url,
  base64UrlToBytes,
  isImgxEncrypted,
  MAX_PAGES_PER_REQUEST,
  MAX_PAGES_PER_REQUEST_V3,
  PROOF_VERSION,
  PROOF_VERSION_V3,
  CHANNEL_VERSION,
  PAGE_KEY_VERSION,
  RENEWAL_VERSION,
};

