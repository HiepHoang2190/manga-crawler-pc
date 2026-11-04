const fs = require('fs');
const path = require('path');
const { runStripDescramble } = require('../../../download/drmHeavyWorkerPool');
const pLimit = require('p-limit');
const {
  getImageRefererForUrl,
  CUUTRUYEN_IMAGE_REFERER,
} = require('../../../download/connector/connectorReferer');
/** Domain chính: cuutruyen.net; nettrom/hetcuutruyen là mirror fallback. */
const CUUTRUYEN_SITE_CONFIG = [
  { origin: 'https://cuutruyen.net', apiBase: 'https://cuutruyen.net/api/v2' },
  { origin: 'https://nettrom.com', apiBase: 'https://nettrom.com/api/v2' },
  { origin: 'https://hetcuutruyen.net', apiBase: 'https://hetcuutruyen.net/api/v2' },
];

const NETTROM_ORIGIN = 'https://nettrom.com';
const HETCUUTRUYEN_ORIGIN = 'https://hetcuutruyen.net';

const CUUTRUYEN_SITE_ORIGINS = CUUTRUYEN_SITE_CONFIG.map((c) => c.origin);
const CUUTRUYEN_API_BASES = CUUTRUYEN_SITE_CONFIG.map((c) => c.apiBase);
const API_BASE = CUUTRUYEN_API_BASES[0];
const XOR_KEY = '3141592653589793';

/** CuuTruyen CDN alias → B2 direct (DNS for storage-ct.lrclib.net removed ~Aug 2026). */
const CUUTRUYEN_CDN_REWRITES = [
  { from: 'storage-ct.lrclib.net', to: 'f000.backblazeb2.com' },
];

function rewriteCuuTruyenImageUrl(imageUrl) {
  if (!imageUrl) return imageUrl;
  for (const { from, to } of CUUTRUYEN_CDN_REWRITES) {
    if (imageUrl.includes(from)) {
      return imageUrl.replace(from, to);
    }
  }
  return imageUrl;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** API base that last returned JSON — try first on later calls in this process. */
let cachedWorkingApiBase = null;

function getCuuTruyenOriginFromUrl(urlString) {
  if (!urlString) return CUUTRUYEN_SITE_ORIGINS[0];
  try {
    const host = new URL(String(urlString).trim()).hostname.toLowerCase();
    for (const origin of CUUTRUYEN_SITE_ORIGINS) {
      const ch = new URL(origin).hostname.toLowerCase();
      if (host === ch || host.endsWith(`.${ch}`)) return origin;
    }
  } catch {
    /* */
  }
  return CUUTRUYEN_SITE_ORIGINS[0];
}

function buildCuuTruyenApiRequestHeaders(apiUrl) {
  let origin = CUUTRUYEN_SITE_ORIGINS[0];
  try {
    const parsed_url = new URL(apiUrl);
    origin = `${parsed_url.protocol}//${parsed_url.host}`;
  } catch {
    /* */
  }
  return {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': USER_AGENT,
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: `${origin}/`,
    Origin: origin,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

function isCloudflareLikeHtml(text) {
  const s = String(text || '').slice(0, 12000);
  if (!s.trim()) return false;
  const t = s.trim();
  if (t.startsWith('{') || t.startsWith('[')) return false;
  return /cf-ray|__cf_chl|cloudflare|Just a moment|challenge-platform|cdn-cgi\/challenge/i.test(s);
}

function extractJsonStringFromMixedBody(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') || raw.startsWith('[')) return raw;
  const pre = raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (pre) {
    const inner = pre[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) return inner;
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = raw.slice(first, last + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      /* */
    }
  }
  return null;
}

/** Quick fail when probing mirrors (probe-only, no Flare). */
const API_PROBE_FETCH_TIMEOUT_MS = 10000;

function jsonBodyFromHttpResponse(code, text) {
  if (code < 200 || code >= 300) return null;
  const t = String(text || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return text;
  return extractJsonStringFromMixedBody(text);
}

async function fetchApiUrlText(apiUrl, timeoutMs) {
  const headers = buildCuuTruyenApiRequestHeaders(apiUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl, { headers, signal: controller.signal });
    const text = await res.text();
    return { code: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCuuTruyenApiUrl(apiUrl) {
  const fetch_timeout_ms = API_PROBE_FETCH_TIMEOUT_MS;
  try {
    const fetched = await fetchApiUrlText(apiUrl, fetch_timeout_ms);
    const json_body = jsonBodyFromHttpResponse(fetched.code, fetched.text);
    if (json_body) {
      return { statusCode: fetched.code, body: json_body, failureHint: null };
    }
    if (fetched.code >= 200 && fetched.code < 300) {
      return {
        statusCode: fetched.code,
        body: null,
        failureHint: isCloudflareLikeHtml(fetched.text)
          ? 'Cloudflare trả HTML challenge thay vì JSON.'
          : 'Phản hồi không phải JSON hợp lệ.',
      };
    }
    return {
      statusCode: fetched.code,
      body: null,
      failureHint: isCloudflareLikeHtml(fetched.text)
        ? `Cloudflare chặn API (HTTP ${fetched.code}).`
        : `HTTP ${fetched.code} — không lấy được JSON.`,
    };
  } catch {
    return {
      statusCode: -1,
      body: null,
      failureHint: 'Lỗi mạng (fetch).',
    };
  }
}

function apiBaseForOrigin(origin) {
  const hit = CUUTRUYEN_SITE_CONFIG.find((c) => c.origin === origin);
  return hit ? hit.apiBase : CUUTRUYEN_API_BASES[0];
}

function shouldParallelCuuTruyenLoad(_contextUrl) {
  return true;
}

function orderApiBases(contextUrl) {
  const preferred = getCuuTruyenOriginFromUrl(contextUrl);
  const bases = [...CUUTRUYEN_API_BASES];
  const nettrom_base = apiBaseForOrigin(NETTROM_ORIGIN);
  const preferred_base = apiBaseForOrigin(preferred);

  if (cachedWorkingApiBase && bases.includes(cachedWorkingApiBase)) {
    return [cachedWorkingApiBase, ...bases.filter((b) => b !== cachedWorkingApiBase)];
  }

  if (preferred === HETCUUTRUYEN_ORIGIN) {
    const ordered = [nettrom_base];
    if (preferred_base && !ordered.includes(preferred_base)) ordered.push(preferred_base);
    for (const api_base of bases) {
      if (!ordered.includes(api_base)) ordered.push(api_base);
    }
    return ordered;
  }

  if (preferred !== CUUTRUYEN_SITE_ORIGINS[0]) {
    return [preferred_base, ...bases.filter((b) => b !== preferred_base)];
  }
  return bases;
}

/** Thử lần lượt các base API tương ứng domain cho đến khi có phản hồi 2xx có body JSON. Ưu tiên domain trùng contextUrl (nếu có). */
async function fetchCuuTruyenApi(path, contextUrl) {
  const request_path = String(path).replace(/^\/+/, '');
  let last_result = { statusCode: -1, body: null, failureHint: null };
  for (const api_base of orderApiBases(contextUrl)) {
    const api_url = `${api_base.replace(/\/+$/, '')}/${request_path}`;
    const response = await fetchCuuTruyenApiUrl(api_url);
    last_result = response;
    if (response.body && response.statusCode >= 200 && response.statusCode < 300) {
      cachedWorkingApiBase = api_base;
      return response;
    }
  }
  return last_result;
}

const MAX_CONCURRENT_IMAGE_DOWNLOADS = 12;
const IMAGE_MAX_RETRIES = 4;
const IMAGE_INITIAL_BACKOFF_MS = 1000;
const IMAGE_MAX_BACKOFF_MS = 15000;

const imageSemaphore = pLimit(MAX_CONCURRENT_IMAGE_DOWNLOADS);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractMangaId(url) {
  if (!url) return null;
  const m = String(url).match(/\/mangas\/(\d+)/);
  return m ? m[1] : null;
}

function extractChapterId(url) {
  if (!url) return null;
  const m = String(url).match(/\/chapters\/(\d+)/);
  return m ? m[1] : null;
}

function decryptDrmData(base64DrmData) {
  try {
    const raw = Buffer.from(String(base64DrmData).trim(), 'base64');
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(raw[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return out;
  } catch {
    return null;
  }
}

async function fetchApi(apiUrl) {
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    const code = res.status;
    if (res.ok) {
      const body = await res.text();
      return { statusCode: code, body };
    }
    return { statusCode: code, body: null };
  } catch {
    return { statusCode: -1, body: null };
  }
}

function buildImageRequestHeaders(imageUrl) {
  const referer = getImageRefererForUrl(imageUrl) || CUUTRUYEN_IMAGE_REFERER;
  let origin = referer.replace(/\/+$/, '');
  return {
    Referer: referer,
    Origin: origin,
    'User-Agent': USER_AGENT,
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  };
}

async function downloadImageBytesWithRetry(imageUrl) {
  let backoff = IMAGE_INITIAL_BACKOFF_MS;
  for (let attempt = 1; attempt <= IMAGE_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(imageUrl, { headers: buildImageRequestHeaders(imageUrl) });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {
      /* retry */
    }
    if (attempt < IMAGE_MAX_RETRIES) {
      const jitter = Math.random() * backoff * 0.3;
      await sleep(Math.min(backoff + jitter, IMAGE_MAX_BACKOFF_MS));
      backoff = Math.min(backoff * 2, IMAGE_MAX_BACKOFF_MS);
    }
  }
  return null;
}

async function downloadImageBytes(imageUrl) {
  return imageSemaphore(() => downloadImageBytesWithRetry(imageUrl));
}

async function downloadAndDescramble(pageInfo) {
  const { index, imageUrl: rawImageUrl, drmData, filePath } = pageInfo;
  const imageUrl = rewriteCuuTruyenImageUrl(rawImageUrl);
  try {
    const imageBytes = await downloadImageBytes(imageUrl);
    if (!imageBytes || imageBytes.length === 0) return false;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (drmData == null || String(drmData).trim() === '') {
      fs.writeFileSync(filePath, imageBytes);
      return true;
    }

    const descrambleData = decryptDrmData(drmData);
    if (descrambleData == null || !descrambleData.startsWith('#v4|')) {
      fs.writeFileSync(filePath, imageBytes);
      return true;
    }

    const jpegBuffer = await runStripDescramble(imageBytes, descrambleData);
    fs.writeFileSync(filePath, jpegBuffer);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  API_BASE,
  CUUTRUYEN_SITE_ORIGINS,
  CUUTRUYEN_API_BASES,
  XOR_KEY,
  USER_AGENT,
  extractMangaId,
  extractChapterId,
  fetchApi,
  getCuuTruyenOriginFromUrl,
  fetchCuuTruyenApi,
  fetchCuuTruyenApiUrl,
  orderApiBases,
  shouldParallelCuuTruyenLoad,
  decryptDrmData,
  rewriteCuuTruyenImageUrl,
  downloadImageBytes,
  downloadAndDescramble,
};
