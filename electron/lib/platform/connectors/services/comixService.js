/**
 * Comix Service - Migrated to BaseConnectorService
 * Site: comix.to
 *
 * Cloudflare blocks main-process HTTP for HTML/API. load() and chapter image
 * lists are scraped inside one hidden BrowserWindow (in-page signed API, with
 * DOM fallback). Image bytes still use session.fetch + Cookie for the CDN.
 */
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { BaseConnectorService } = require('../base/BaseConnectorService');
const htmlConnectorUtils = require('../../../download/connector/htmlConnectorUtils');
const { resolveUrl } = htmlConnectorUtils;
const {
  decryptComixEncPayload,
  extractComixChapterId,
  buildComixSignedApiUrl,
  buildComixChapterImageUrls,
} = require('../../../download/connector/comixCrypto');
const { descrambleComixImageBuffer } = require('../../../download/connector/comixDescramble');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const cookieManager = require('../../cookies/cookieManager');
const { attachDeniedWindowOpenHandler } = require('../../cookies/cookieExtractor');
const logger = require('../../../shared/logger').createLogger('ComixChapters');
const { mergeCookieHeaders } = require('../api-clients/flareCookieSession');

const DOMAIN = 'https://comix.to/';
const LABEL = 'Comix';

function getComixUserAgent() {
  return htmlConnectorUtils.USER_AGENT_JSOUP || htmlConnectorUtils.USER_AGENT;
}

/**
 * Cloudflare on comix.to blocks Node/undici fetch (HTTP 403).
 * Replaying cf_clearance as a Cookie header on net.fetch is also rejected
 * (challenge HTML). session.fetch + credentials include lets Chromium attach
 * the defaultSession jar (partitioned/httpOnly cookies) that solved CF.
 */
function getComixFetch() {
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
  return fetch;
}

function getComixCookie(options = {}) {
  const from_options = options && options.cookie && String(options.cookie).trim();
  if (from_options) return from_options;
  return cookieManager.getEffectiveCookie('comix') || '';
}

async function readComixSessionCookieHeader() {
  try {
    const electron = require('electron');
    const cookie_store = electron?.session?.defaultSession?.cookies;
    if (!cookie_store || typeof cookie_store.get !== 'function') return '';
    const batches = await Promise.all([
      cookie_store.get({ url: 'https://comix.to/' }).catch(() => []),
      cookie_store.get({ domain: 'comix.to' }).catch(() => []),
      cookie_store.get({ domain: '.comix.to' }).catch(() => []),
    ]);
    const seen_names = new Set();
    const parts = [];
    for (const batch of batches) {
      for (const cookie_row of batch || []) {
        const cookie_name = String(cookie_row.name || '');
        if (!cookie_name || seen_names.has(cookie_name)) continue;
        seen_names.add(cookie_name);
        parts.push(`${cookie_name}=${cookie_row.value}`);
      }
    }
    return parts.join('; ');
  } catch {
    return '';
  }
}

async function getComixCookieHeader(options = {}) {
  const from_store = getComixCookie(options);
  const from_jar = await readComixSessionCookieHeader();
  return mergeCookieHeaders(from_jar, from_store);
}

function getComixRequestHeaders(options = {}, extra = {}, cookie_str) {
  const headers = {
    'User-Agent': (options && options.userAgent) || getComixUserAgent(),
    Referer: DOMAIN,
    ...extra,
  };
  const resolved_cookie = cookie_str != null ? cookie_str : getComixCookie(options);
  if (resolved_cookie) headers.Cookie = resolved_cookie;
  return headers;
}

function getComixImageFetchHeaders() {
  return getComixRequestHeaders();
}

/**
 * Comix sometimes returns pure JSON, sometimes wrapped in HTML: <html>...<pre>{"status":200,...}</pre>.
 * Response may be raw JSON or JSON wrapped in HTML; extract JSON before parsing.
 */
function parseComixApiJsonFromResponseBody(body) {
  const s = String(body || '').trim();
  if (!s) return null;
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through */
    }
  }
  const pre = s.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (pre) {
    try {
      return JSON.parse(pre[1].trim());
    } catch {
      /* fall through */
    }
  }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {
      /* */
    }
  }
  return null;
}

function unwrapComixEncryptedJson(json, isEncrypted) {
  if (isEncrypted) {
    if (!json || typeof json.e !== 'string') {
      return { ok: false, error: 'Thiếu payload mã hóa (e)' };
    }
    try {
      const parsed = JSON.parse(decryptComixEncPayload(json.e));
      const result =
        parsed && parsed.status === 'ok' && parsed.result && typeof parsed.result === 'object'
          ? parsed.result
          : parsed;
      return { ok: true, json: parsed, result };
    } catch (err) {
      return { ok: false, error: 'Giải mã API thất bại: ' + (err.message || err) };
    }
  }
  const result =
    json && json.status === 'ok' && json.result && typeof json.result === 'object'
      ? json.result
      : json;
  return { ok: true, json, result };
}

function toAbsoluteComixHref(href) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  return `${DOMAIN.replace(/\/$/, '')}/${String(href).replace(/^\//, '')}`;
}

function buildChapterRows(rawItems) {
  const seen = new Set();
  const chapters = [];
  for (const item of rawItems || []) {
    const url = toAbsoluteComixHref(item && item.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const num = item && item.num ? String(item.num).trim() : '';
    const group = item && item.group ? ` [${String(item.group).trim()}]` : '';
    chapters.push({
      url,
      title: formatChapterTitle(`Ch. ${num}${group}`),
    });
  }
  chapters.sort((a, b) => {
    const na = parseFloat(a.title.replace(/^Ch\.\s*/i, '')) || -Infinity;
    const nb = parseFloat(b.title.replace(/^Ch\.\s*/i, '')) || -Infinity;
    return nb - na;
  });
  return chapters;
}

function getFileExt(src) {
  const noQuery = String(src).split('?')[0];
  const seg = noQuery.split('/').pop() || '';
  const dot = seg.lastIndexOf('.');
  return dot > 0 ? seg.slice(dot + 1).toLowerCase() : 'webp';
}

/**
 * Get first URL from srcset (prefer full URL).
 */
function firstUrlFromSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') return '';
  const part = srcset.split(',')[0].trim();
  const url = part.split(/\s+/)[0];
  return url || '';
}

/**
 * Cover on comix.to: og:image, img itemprop, src/srcset, or regex static.comix (no @ — Java Comix.java).
 */
function extractComixCoverUrl(html, $) {
  const og =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[property="og:image:url"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    '';
  if (og && String(og).trim() && !String(og).includes('@')) {
    const u = String(og).trim();
    if (/^https?:\/\//i.test(u)) return u;
  }

  const imgSelectors = [
    'img[itemprop=image]',
    'img[itemProp=image]',
    'picture img[src*="comix"]',
    'img[src*="static.comix.to"]',
    'img[data-src*="static.comix.to"]',
    'img[alt][src*="static.comix"]',
    '.cover img',
    '[class*="cover"] img',
  ];
  for (const sel of imgSelectors) {
    const $img = $(sel).first();
    if (!$img.length) continue;
    let src =
      $img.attr('src') ||
      $img.attr('data-src') ||
      $img.attr('data-lazy-src') ||
      firstUrlFromSrcset($img.attr('srcset') || '');
    if (!src) continue;
    if (src.includes('@')) continue;
    if (src.startsWith('//')) src = `https:${src}`;
    else if (!/^https?:\/\//i.test(src)) src = resolveUrl(DOMAIN, src.replace(/^\//, ''));
    if (/\.(webp|jpe?g|png|gif)(\?|$)/i.test(src)) return src;
  }

  const re =
    /https?:\/\/[^"'<>\s]*static\.comix\.to[^"'<>\s]*\.(?:webp|jpe?g|png|gif)(?:\?[^"'<>\s]*)?/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[0];
    if (!u.includes('@')) return u;
  }
  return '';
}

/**
 * Manga page is SPA: static HTML may lack <img itemprop="image"> before hydrate.
 * API manga returns full JSON — scan recursively for static.comix.to URL (except @ thumbnail).
 */
function deepFindComixCoverInJson(node, depth = 0) {
  if (depth > 24) return '';
  if (typeof node === 'string') {
    const s = node.trim();
    if (
      /^https?:\/\//i.test(s) &&
      s.includes('static.comix.to') &&
      /\.(webp|jpe?g|png|gif)(\?|#|$)/i.test(s) &&
      !s.includes('@')
    ) {
      return s;
    }
    return '';
  }
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) {
    for (const x of node) {
      const f = deepFindComixCoverInJson(x, depth + 1);
      if (f) return f;
    }
    return '';
  }
  for (const k of Object.keys(node)) {
    const f = deepFindComixCoverInJson(node[k], depth + 1);
    if (f) return f;
  }
  return '';
}

/**
 * Next.js embeds state in HTML — may have cover URL before SPA renders <img>.
 */
function extractComixCoverFromEmbeddedJson(html) {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return '';
  try {
    const data = JSON.parse(m[1]);
    return deepFindComixCoverInJson(data) || '';
  } catch {
    return '';
  }
}

function isComixChallengeTitle(title) {
  return /just a moment|attention required|checking your browser|please wait/i.test(
    String(title || ''),
  );
}

function parseComixMangaMetaFromHtml(html) {
  const $ = cheerio.load(html || '');
  let title =
    $('h1.title').first().text().trim() ||
    $('.readbar-top h1.title').first().text().trim() ||
    $('h1').first().text().trim() ||
    '';
  if (!title) {
    title = $('title')
      .first()
      .text()
      .replace(/\s*-\s*Comix.*/i, '')
      .trim();
  }
  if (isComixChallengeTitle(title)) {
    return { ok: false, error: 'Cloudflare chặn trang trong BrowserWindow.' };
  }
  const coverUrl =
    extractComixCoverFromEmbeddedJson(html) || extractComixCoverUrl(html, $) || '';
  if (!title) {
    return { ok: false, error: 'Không đọc được tên truyện.' };
  }
  return { ok: true, title, coverUrl };
}

/**
 * Programmatic pager clicks are untrusted. comix.to then sends X-Rt: 1 and the
 * chapters API answers 403 captcha_required, so the list stays on the first page.
 * Force the header back to 0 so the site's own signed request still succeeds.
 */
function rewriteComixRequestHeader(headerName, headerValue) {
  if (String(headerName || '').toLowerCase() === 'x-rt') return '0';
  return headerValue;
}

/**
 * Walk all chapter pages through Comix's own in-page API client (limit=100 max)
 * without dispatching synthetic DOM clicks that trip the untrusted-click counter.
 * Page 1 is fetched first. Later pages are fetched one at a time; a failed page
 * keeps the chapters already collected.
 */
async function collectComixChaptersViaInPageGet(
  in_page_get,
  pathname,
  search,
  report_progress,
  timeout_ms = 25000,
) {
  if (typeof in_page_get !== 'function') {
    return { items: [], pages: 0 };
  }
  const slug_match = String(pathname || '').match(/\/title\/([^/?#]+)/i);
  const slug_key = slug_match ? slug_match[1].split('-')[0] : '';
  if (!slug_key) {
    return { items: [], pages: 0 };
  }
  const search_params = new URLSearchParams(String(search || ''));
  const group_id = search_params.get('group_id');
  const collected_items = [];
  const seen_hrefs = new Set();

  const append_page_items = (response_data) => {
    const raw_list = Array.isArray(response_data && response_data.items)
      ? response_data.items
      : [];
    for (const entry of raw_list) {
      const item_href = entry && entry.url ? String(entry.url) : '';
      if (!item_href || seen_hrefs.has(item_href)) continue;
      seen_hrefs.add(item_href);
      const item_num =
        entry && entry.number != null ? String(entry.number) : '';
      const item_group =
        (entry && entry.group && entry.group.name) ||
        (entry && entry.creator && entry.creator.name) ||
        (entry && entry.isOfficial ? 'Official' : '');
      collected_items.push({
        href: item_href,
        num: item_num,
        group: item_group,
      });
    }
  };

  const fetch_single_page = (page_number) => {
    const query_params = {
      page: page_number,
      limit: 100,
      order: { number: 'desc' },
    };
    if (group_id) query_params.group_id = group_id;
    return in_page_get(`/manga/${slug_key}/chapters`, {
      params: query_params,
    });
  };

  const await_page = (page_number) => {
    if (typeof report_progress === 'function') {
      report_progress({ phase: 'request', page: page_number });
    }
    let timer_id;
    const timeout_promise = new Promise((_, reject) => {
      timer_id = setTimeout(() => reject(new Error('comix-chapter-timeout')), timeout_ms);
    });
    return Promise.race([fetch_single_page(page_number), timeout_promise]).finally(() => {
      clearTimeout(timer_id);
    });
  };

  const await_page_with_retry = async (page_number) => {
    let last_error;
    for (let attempt_index = 1; attempt_index <= 3; attempt_index += 1) {
      try {
        return await await_page(page_number);
      } catch (err) {
        last_error = err;
        const request_timed_out = err && err.message === 'comix-chapter-timeout';
        if (request_timed_out || attempt_index >= 3) throw last_error;
        if (typeof report_progress === 'function') {
          report_progress({ phase: 'retry', page: page_number, attempt: attempt_index });
        }
      }
    }
    throw last_error;
  };

  let first_response;
  try {
    first_response = await await_page_with_retry(1);
  } catch {
    return { items: [], pages: 0 };
  }
  append_page_items(first_response);

  const meta_last_page = Number(
    first_response && first_response.meta && first_response.meta.lastPage,
  );
  const has_next = Boolean(
    first_response && first_response.meta && first_response.meta.hasNext,
  );
  const total_pages =
    has_next && Number.isFinite(meta_last_page) && meta_last_page > 1
      ? Math.min(meta_last_page, 200)
      : 1;

  const notify_progress = (page_number) => {
    if (typeof report_progress !== 'function') return;
    report_progress({
      page: page_number,
      totalPages: total_pages,
      count: collected_items.length,
    });
  };
  notify_progress(1);

  const remaining_pages = [];
  for (let page_idx = 2; page_idx <= total_pages; page_idx += 1) {
    remaining_pages.push(page_idx);
  }

  let pages_fetched = 1;
  for (const page_number of remaining_pages) {
    let response_data = null;
    try {
      response_data = await await_page_with_retry(page_number);
    } catch {
      break;
    }
    const before_count = collected_items.length;
    append_page_items(response_data);
    if (collected_items.length === before_count) break;
    pages_fetched += 1;
    notify_progress(page_number);
  }

  return { items: collected_items, pages: pages_fetched };
}

function formatComixChapterProgress(payload) {
  if (payload && payload.phase === 'start') {
    return 'Comix: đang chờ danh sách chương hiện trên trang…';
  }
  if (payload && payload.phase === 'lookup') {
    return 'Comix: đang tìm API danh sách chương…';
  }
  if (payload && payload.phase === 'request') {
    const page_number = Number(payload.page) || 1;
    return `Comix: đang gọi API trang ${page_number}…`;
  }
  if (payload && payload.phase === 'captcha') {
    return 'Comix: đang xác minh Cloudflare…';
  }
  if (payload && payload.phase === 'retry') {
    const page_number = Number(payload.page) || 1;
    const attempt_number = Number(payload.attempt) || 1;
    return `Comix: trang ${page_number} chưa trả lời, thử lại lần ${attempt_number + 1}…`;
  }
  if (payload && payload.phase === 'fallback') {
    return 'Comix: API không phản hồi, dùng danh sách đang hiện trên trang.';
  }
  const page_number = Number(payload && payload.page) || 0;
  const total_pages = Number(payload && payload.totalPages) || 0;
  const chapter_count = Number(payload && payload.count) || 0;
  if (!page_number) return '';
  if (total_pages > 1) {
    return `Comix: đang lấy chương, trang ${page_number}/${total_pages} (${chapter_count} chương)…`;
  }
  return `Comix: đang lấy chương (${chapter_count} chương)…`;
}

/**
 * In-page script (runs in the comix.to page context) that scrapes the server-rendered
 * chapter list from the DOM and walks the paginator, letting the site's own JS fetch
 * each page (it carries the security token). Returns an array of { href, num, group }.
 *
 * comix.to renders chapters directly into `.mchap-list`.
 */
const COMIX_SCRAPE_CHAPTERS_SCRIPT = `(async () => {
  const rewriteComixRequestHeader = ${rewriteComixRequestHeader.toString()};
  const collectComixChaptersViaInPageGet = ${collectComixChaptersViaInPageGet.toString()};
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (headerName, headerValue) {
    return originalSetRequestHeader.call(
      this,
      headerName,
      rewriteComixRequestHeader(headerName, headerValue),
    );
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reportProgress = (payload) => {
    console.log('COMIX_CHAPTER_PROGRESS ' + JSON.stringify(payload));
  };
  reportProgress({ phase: 'start' });
  const reportCaptcha = () => reportProgress({ phase: 'captcha' });
  window.addEventListener('waf:captcha:open', reportCaptcha);
  window.addEventListener('waf:captcha:solved', () => reportProgress({ phase: 'captcha-solved' }));
  const captchaFramePresent = () => Boolean(
    document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], iframe[src*="/@waf/"]')
  );
  if (captchaFramePresent()) reportCaptcha();
  const findInPageApiGet = async () => {
    const inspectModule = (mod) => {
      for (const val of Object.values(mod || {})) {
        if (!val || typeof val !== 'object') continue;
        for (const fn of Object.values(val)) {
          if (typeof fn === 'function' && String(fn).includes('.get(')) {
            return fn;
          }
        }
      }
      return null;
    };
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      const loadedChunks = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((u) => u.includes('/assets/build/') && u.endsWith('.js') && !u.includes('/secure-') && !u.includes('/main-'));
      for (const chunkUrl of loadedChunks) {
        try {
          const found = inspectModule(await import(chunkUrl));
          if (found) return found;
        } catch {
          // ignore chunk import error
        }
      }
    }
    const mainScript = Array.from(document.querySelectorAll('script[src]'))
      .map((s) => s.src)
      .find((src) => src.includes('/assets/build/') && src.includes('main-'));
    if (!mainScript) return null;
    const base = mainScript.slice(0, mainScript.lastIndexOf('/') + 1);
    const mainText = await (await fetch(mainScript)).text();
    const rels = Array.from(mainText.matchAll(/["']\\.\\/([^"']+\\.js)["']/g)).map((m) => m[1]);
    for (const rel of rels) {
      if (rel.startsWith('secure-')) continue;
      try {
        const found = inspectModule(await import(base + rel));
        if (found) return found;
      } catch {
        // ignore chunk import error
      }
    }
    return null;
  };
  const out = [];
  const seen = new Set();
  const firstHref = () => {
    const a = document.querySelector('.mchap-list .mchap-item a.mchap-row__primary');
    return a ? a.getAttribute('href') : null;
  };
  const scrape = () => {
    document.querySelectorAll('.mchap-list .mchap-item').forEach((li) => {
      const a = li.querySelector('a.mchap-row__primary');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href || seen.has(href)) return;
      const chEl = a.querySelector('.mchap-row__ch');
      const num = chEl ? chEl.textContent.replace(/^Ch\\.?\\s*/i, '').trim() : '';
      const grpEl = li.querySelector('.mchap-row__group span, .mchap-row__uploader span');
      const group = grpEl ? grpEl.textContent.trim() : '';
      seen.add(href);
      out.push({ href, num, group });
    });
  };

  // The hidden window often never mounts .mchap-item. Do not block the API on it.
  scrape();

  // Prefer the site's own signed API client (100 chapters/page, no untrusted DOM clicks).
  const captchaPoll = setInterval(() => {
    if (captchaFramePresent()) reportCaptcha();
  }, 500);
  try {
    reportProgress({ phase: 'lookup' });
    const inPageGet = await Promise.race([
      findInPageApiGet(),
      sleep(8000).then(() => null),
    ]);
    if (inPageGet) {
      const apiCollected = await collectComixChaptersViaInPageGet(
        inPageGet,
        location.pathname,
        location.search,
        reportProgress,
      );
      if (apiCollected && Array.isArray(apiCollected.items) && apiCollected.items.length > 0) {
        return apiCollected;
      }
    }
  } catch {
    // Keep the chapters already rendered on the page.
  } finally {
    clearInterval(captchaPoll);
  }

  for (let i = 0; i < 8 && out.length === 0 && !document.querySelector('.mchap-list .mchap-item'); i++) {
    await sleep(250);
  }
  scrape();
  reportProgress({ phase: 'fallback' });
  return { items: out, pages: out.length ? 1 : 0, reason: out.length ? 'dom' : 'no-chapter-list' };
})()`;

/**
 * In-page script: Extract image URLs from DOM in correct page order.
 *
 * Strategy: Wait for all .rpage-page elements to have their img loaded,
 * then read src in DOM order (which is the correct reading order).
 * This solves scrambling because we get URLs in the order they appear in DOM,
 * not derived from a sequential pattern.
 */
const COMIX_SCRAPE_IMAGES_SCRIPT = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let pages = document.querySelectorAll('.rpage-page');
  let waitCount = 0;
  while (pages.length === 0 && waitCount < 60) {
    await sleep(500);
    pages = document.querySelectorAll('.rpage-page');
    waitCount++;
  }

  if (pages.length === 0) {
    return { urls: [], total: 0, source: 'error', reason: 'no-pages-after-wait' };
  }

  const collected = new Map();
  const collectCurrentImages = () => {
    document.querySelectorAll('.rpage-page').forEach((page) => {
      const pageAttr = page.getAttribute('data-page');
      const pageNum = pageAttr ? parseInt(pageAttr, 10) : NaN;
      const img = page.querySelector('img.rpage-page__img, img');
      if (img) {
        const src = img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (src && /^https?:\\/\\//i.test(src) && !src.includes('data:image')) {
          const key = !isNaN(pageNum) ? pageNum : collected.size + 1;
          if (!collected.has(key)) {
            collected.set(key, src);
          }
        }
      }
    });
  };

  collectCurrentImages();

  const totalExpected = pages.length;
  let lastCount = collected.size;
  let stableRounds = 0;
  let guard = 0;

  while (collected.size < totalExpected && stableRounds < 8 && guard < 200) {
    window.scrollBy(0, Math.max(window.innerHeight * 0.9, 400));
    await sleep(250);
    collectCurrentImages();
    if (collected.size > lastCount) {
      stableRounds = 0;
      lastCount = collected.size;
    } else {
      stableRounds += 1;
    }
    guard += 1;
  }

  if (collected.size < totalExpected) {
    window.scrollTo(0, 0);
    await sleep(200);
    collectCurrentImages();
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(400);
    collectCurrentImages();
  }

  const sortedUrls = Array.from(collected.entries())
    .sort((a, b) => a[0] - b[0])
    .map(entry => entry[1]);

  if (sortedUrls.length > 0) {
    return { urls: sortedUrls, total: sortedUrls.length, source: 'dom-loaded-dynamic' };
  }

  return { urls: [], total: pages.length, source: 'error', reason: 'no-images-loaded' };
})()`;

/**
 * Hidden BrowserWindow on the defaultSession jar. Waits out Cloudflare, then
 * runs on_ready. Do not inject reconstructed cookies — that overwrites
 * partitioned cf_clearance.
 */
async function runComixBrowserWindow(page_url, options, on_ready) {
  const timeout_ms = options.timeout || 180000;
  const wait_after_load_ms =
    options.waitAfterLoad != null ? Number(options.waitAfterLoad) : 2500;

  let BrowserWindow;
  let electron_session;
  try {
    ({ BrowserWindow, session: electron_session } = require('electron'));
  } catch {
    return { ok: false, error: 'BrowserWindow không khả dụng (không chạy trong Electron).' };
  }

  return new Promise((resolve) => {
    let win = null;
    let settled = false;
    let main_timeout_id = null;

    const keep_alive = options.keepAlive === true;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (main_timeout_id) clearTimeout(main_timeout_id);
      const keep_window = keep_alive && result && result.ok === true;
      if (!keep_window && win && typeof win.isDestroyed === 'function' && !win.isDestroyed()) {
        try {
          win.destroy();
        } catch {
          /* ignore */
        }
        if (shared_comix_image_window === win) shared_comix_image_window = null;
      }
      resolve(result);
    };

    main_timeout_id = setTimeout(() => {
      finish({
        ok: false,
        error: 'Timeout — Cloudflare challenge không giải được hoặc trang load quá lâu.',
      });
    }, timeout_ms);

    try {
      win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          javascript: true,
          backgroundThrottling: false,
          session: electron_session && electron_session.defaultSession,
        },
      });

      win.webContents.setUserAgent(getComixUserAgent());
      attachDeniedWindowOpenHandler(win.webContents);

      const send_log = typeof options.sendLog === 'function' ? options.sendLog : null;
      let ready_started = false;
      let showed_challenge = false;
      const continue_when_ready = async () => {
        if (settled || ready_started) return;
        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
        let page_title = '';
        try {
          page_title = await win.webContents.executeJavaScript('document.title');
        } catch {
          return;
        }
        if (settled || ready_started) return;
        if (!String(page_title || '').trim() || isComixChallengeTitle(page_title)) {
          if (isComixChallengeTitle(page_title) && !showed_challenge) {
            showed_challenge = true;
            if (typeof win.show === 'function') win.show();
            if (typeof win.focus === 'function') win.focus();
            if (send_log) send_log('Comix: đang xác minh Cloudflare…', 'info');
          }
          return;
        }
        const current_url = typeof win.webContents.getURL === 'function' ? win.webContents.getURL() : '';
        if (current_url && !String(current_url).includes('/title/')) return;
        ready_started = true;
        if (showed_challenge && typeof win.hide === 'function') win.hide();
        if (wait_after_load_ms > 0) {
          await new Promise((r) => setTimeout(r, wait_after_load_ms));
        }
        if (settled) return;
        try {
          finish(await on_ready(win));
        } catch (err) {
          finish({ ok: false, error: err && err.message ? err.message : 'scrape-failed' });
        }
      };

      win.webContents.on(
        'did-fail-load',
        (_event, error_code, error_description, _validated_url, is_main_frame) => {
          if (error_code === -3) return;
          if (is_main_frame === false) return;
          finish({ ok: false, error: `Không tải được trang: ${error_description} (${error_code})` });
        },
      );

      if (win.webContents && typeof win.webContents.on === 'function') {
        win.webContents.on('did-finish-load', () => {
          void continue_when_ready();
        });
        win.webContents.on('page-title-updated', () => {
          void continue_when_ready();
        });
      }

      win.loadURL(page_url);
    } catch (err) {
      finish({ ok: false, error: err && err.message ? err.message : 'BrowserWindow error' });
    }
  });
}

async function fetchComixTitlePageViaBrowser(page_url, options = {}) {
  const send_log = typeof options.sendLog === 'function' ? options.sendLog : null;
  if (send_log) send_log('Comix: đang mở trang truyện…', 'info');
  return runComixBrowserWindow(
    page_url,
    { timeout: 300000, waitAfterLoad: 250, ...options },
    async (win) => {
      const captcha_reveal = createComixCaptchaReveal(win);
      const on_console = (event, _level, message) => {
        const console_text =
          event && typeof event.message === 'string'
            ? event.message
            : typeof message === 'string'
              ? message
              : '';
        if (!console_text.startsWith('COMIX_CHAPTER_PROGRESS ')) return;
        try {
          const payload = JSON.parse(console_text.slice('COMIX_CHAPTER_PROGRESS '.length));
          if (payload && payload.phase === 'captcha') captcha_reveal.onCaptcha();
          else if (payload && payload.phase === 'captcha-solved') captcha_reveal.markSolved();
          else captcha_reveal.cancel();
          if (!send_log) return;
          const line = formatComixChapterProgress(payload);
          if (line) send_log(line, 'info');
        } catch {
          /* ignore malformed progress line */
        }
      };
      if (win.webContents && typeof win.webContents.on === 'function') {
        win.webContents.on('console-message', on_console);
      }
      try {
        if (send_log) send_log('Comix: trang đã mở, đang đọc danh sách chương…', 'info');
        let parsed = { ok: false, error: 'Không đọc được tên truyện.' };
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const html = await win.webContents.executeJavaScript(
            'document.documentElement.outerHTML',
          );
          parsed = parseComixMangaMetaFromHtml(html);
          if (parsed.ok) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!parsed.ok) return parsed;
        const scrape = await win.webContents.executeJavaScript(COMIX_SCRAPE_CHAPTERS_SCRIPT);
        const chapters = buildChapterRows((scrape && scrape.items) || []);
        if (!chapters.length) {
          return {
            ok: false,
            error: 'Không tìm thấy danh sách chương.',
            title: parsed.title,
            coverUrl: parsed.coverUrl,
          };
        }
        if (send_log) send_log(`Comix: đã lấy ${chapters.length} chương.`, 'success');
        return { ok: true, title: parsed.title, coverUrl: parsed.coverUrl, chapters };
      } finally {
        captcha_reveal.finish();
        if (win.webContents && typeof win.webContents.removeListener === 'function') {
          win.webContents.removeListener('console-message', on_console);
        }
      }
    },
  );
}

function selectComixChapterDetailData(queries, targetChapterId) {
  const list = Array.isArray(queries) ? queries : [];
  const detail_queries = list.filter((query) => {
    const query_key = query && query.queryKey;
    return query_key && query_key[0] === 'chapters' && query_key[1] === 'detail';
  });
  if (targetChapterId) {
    const matched_query = detail_queries.find(
      (query) => String(query.queryKey[2]) === String(targetChapterId),
    );
    if (matched_query && matched_query.state && matched_query.state.data) {
      return { data: matched_query.state.data, mismatched: false };
    }
    const other_chapter_ready = detail_queries.some((query) => query.state && query.state.data);
    return { data: null, mismatched: other_chapter_ready };
  }
  const first_query = detail_queries[0];
  const first_data = first_query && first_query.state && first_query.state.data;
  return { data: first_data || null, mismatched: false };
}

async function fetchComixImagesViaInPageApi(win, chapter_url) {
  const chapter_id = extractComixChapterId(chapter_url);

  // 1. Try extracting full chapter images from React Query / React Fiber cache
  try {
    const reactPayload = await win.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const targetChapterId = ${JSON.stringify(chapter_id || '')};
        const selectComixChapterDetailData = ${selectComixChapterDetailData.toString()};
        const reportCaptcha = () => {
          console.log('COMIX_CHAPTER_PROGRESS ' + JSON.stringify({ phase: 'captcha' }));
        };
        window.addEventListener('waf:captcha:open', reportCaptcha);
        window.addEventListener('waf:captcha:solved', () => {
          console.log('COMIX_CHAPTER_PROGRESS ' + JSON.stringify({ phase: 'captcha-solved' }));
        });
        const captchaFramePresent = () => Boolean(
          document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], iframe[src*="/@waf/"]')
        );
        if (captchaFramePresent()) reportCaptcha();
        const captchaPoll = setInterval(() => {
          if (captchaFramePresent()) reportCaptcha();
        }, 500);
        try {
        const findPagesInReact = () => {
          const root = document.getElementById('app-root');
          if (!root) return null;
          const reactKey = Object.keys(root).find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
          if (!reactKey) return null;
          let fiber = root[reactKey];
          if (fiber && fiber.current) fiber = fiber.current;

          const queue = [fiber];
          const visited = new Set();
          let queryClient = null;

          while (queue.length > 0 && queue.length < 500) {
            const f = queue.shift();
            if (!f || visited.has(f)) continue;
            visited.add(f);

            if (f.memoizedProps?.client?.getQueryCache) {
              queryClient = f.memoizedProps.client;
              break;
            }
            if (f.child) queue.push(f.child);
            if (f.sibling) queue.push(f.sibling);
          }

          if (queryClient) {
            const picked = selectComixChapterDetailData(
              queryClient.getQueryCache().getAll(),
              targetChapterId,
            );
            if (picked && picked.mismatched) return { mismatched: true };
            if (picked && picked.data) return picked.data;
          }
          return null;
        };

        const detailHasImages = (data) => {
          if (!data || typeof data !== 'object') return false;
          const pages = data.pages;
          if (Array.isArray(pages) && pages.length > 0) return true;
          if (pages && Array.isArray(pages.items) && pages.items.length > 0) return true;
          return Object.values(data).some((value) => {
            if (!Array.isArray(value) || value.length === 0) return false;
            return value.every((item) => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
              return Object.values(item).some(
                (field) => typeof field === 'string' && /^https?:\\/\\//i.test(field.trim()),
              );
            });
          });
        };

        for (let i = 0; i < 40; i++) {
          const res = findPagesInReact();
          if (res && res.mismatched) break;
          if (detailHasImages(res)) return res;
          await sleep(250);
        }
        if (targetChapterId) {
          const inspectModule = (mod) => {
            for (const val of Object.values(mod || {})) {
              if (!val || typeof val !== 'object') continue;
              for (const fn of Object.values(val)) {
                if (typeof fn === 'function' && String(fn).includes('.get(')) {
                  return fn;
                }
              }
            }
            return null;
          };
          let inPageGet = null;
          if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
            const loadedChunks = performance
              .getEntriesByType('resource')
              .map((r) => r.name)
              .filter((u) => u.includes('/assets/build/') && u.endsWith('.js') && !u.includes('/secure-') && !u.includes('/main-'));
            for (const chunkUrl of loadedChunks) {
              try {
                inPageGet = inspectModule(await import(chunkUrl));
                if (inPageGet) break;
              } catch {
                // ignore chunk import error
              }
            }
          }
          if (!inPageGet) {
            const mainScript = Array.from(document.querySelectorAll('script[src]'))
              .map((s) => s.src)
              .find((src) => src.includes('/assets/build/') && src.includes('main-'));
            if (mainScript) {
              const base = mainScript.slice(0, mainScript.lastIndexOf('/') + 1);
              const mainText = await (await fetch(mainScript)).text();
              const rels = Array.from(mainText.matchAll(/["']\\.\\/([^"']+\\.js)["']/g)).map((m) => m[1]);
              for (const rel of rels) {
                if (rel.startsWith('secure-')) continue;
                try {
                  inPageGet = inspectModule(await import(base + rel));
                  if (inPageGet) break;
                } catch {
                  // ignore chunk import error
                }
              }
            }
          }
          if (inPageGet) {
            try {
              const detail = await Promise.race([
                inPageGet('/chapters/' + targetChapterId),
                sleep(25000).then(() => { throw new Error('comix-chapter-timeout'); }),
              ]);
              if (detailHasImages(detail)) return detail;
            } catch {
              // Captcha can leave the request pending. Fall through to the DOM list.
            }
          }
        }
        return null;
        } finally {
          clearInterval(captchaPoll);
        }
      })()
    `);

    if (reactPayload) {
      const items = buildComixChapterImageUrls(reactPayload);
      if (items && items.length > 0) {
        return { items, from_react_state: true };
      }
    }
  } catch (err) {
    logger.warn('Failed to extract chapter images from React state: ' + (err && err.message ? err.message : String(err)));
  }

  // 2. Fallback to signed in-page fetch (e.g. in test environments with mock API)
  if (!chapter_id) return { items: [], from_react_state: false };
  const api_url = buildComixSignedApiUrl(`/chapters/${chapter_id}`);
  const payload = await win.webContents.executeJavaScript(
    `(async () => {
      const res = await fetch(${JSON.stringify(api_url)}, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        enc: res.headers.get('x-enc'),
        text: text,
      };
    })()`,
  );
  if (!payload || !payload.text) return { items: [], from_react_state: false };
  let json;
  try {
    json = JSON.parse(payload.text);
  } catch {
    json = parseComixApiJsonFromResponseBody(payload.text);
  }
  if (!json) return { items: [], from_react_state: false };
  const is_encrypted =
    payload.enc === '1' || (json && typeof json.e === 'string');
  const unwrapped = unwrapComixEncryptedJson(json, is_encrypted);
  if (!unwrapped.ok) return { items: [], from_react_state: false };
  return {
    items: buildComixChapterImageUrls(unwrapped.result),
    from_react_state: false,
  };
}

function comixImageFileName(image_url) {
  const no_query = String(image_url || '').split('?')[0];
  return (no_query.split('/').pop() || no_query).toLowerCase();
}

/**
 * Prefer the longer list. When DOM wins, copy scramble/ext from matching API items.
 */
function mergeComixApiAndDomImages(api_images, dom_urls) {
  const api_list = Array.isArray(api_images) ? api_images : [];
  const url_list = Array.isArray(dom_urls) ? dom_urls : [];
  if (url_list.length <= api_list.length) {
    return api_list;
  }
  const api_by_name = new Map();
  for (const item of api_list) {
    api_by_name.set(comixImageFileName(item.imageUrl), item);
  }
  return url_list.map((image_url) => {
    const matched_item = api_by_name.get(comixImageFileName(image_url));
    if (matched_item) {
      return {
        imageUrl: image_url,
        ext: matched_item.scramble ? 'webp' : matched_item.ext || getFileExt(image_url),
        scramble: !!matched_item.scramble,
      };
    }
    return {
      imageUrl: image_url,
      ext: getFileExt(image_url),
      scramble: false,
    };
  });
}

async function fetchComixImagesViaBrowser(chapterUrl, options = {}) {
  const read_images = () => enqueueComixImageRead(() => readComixChapterImages(chapterUrl, options));
  return read_images();
}

function canReuseComixImageWindow(win) {
  if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return false;
  const web_contents = win.webContents;
  if (!web_contents || typeof web_contents.executeJavaScript !== 'function') return false;
  const current_url = typeof web_contents.getURL === 'function' ? web_contents.getURL() : '';
  return String(current_url || '').includes('comix.to');
}

function resetComixSharedImageWindow() {
  shared_comix_image_window = null;
  comix_image_read_chain = Promise.resolve();
  comix_prefetched_image_lists.clear();
}

let shared_comix_image_window = null;
let comix_image_read_chain = Promise.resolve();
const comix_prefetched_image_lists = new Map();
const COMIX_PREFETCH_CHAPTER_LIMIT = 8;

function normalizeComixChapterUrl(chapter_url) {
  return String(chapter_url || '').trim();
}

function selectComixPrefetchUrls(chapter_urls, current_url, limit = COMIX_PREFETCH_CHAPTER_LIMIT) {
  const current = normalizeComixChapterUrl(current_url);
  const seen = new Set();
  const normalized = [];
  for (const raw_url of Array.isArray(chapter_urls) ? chapter_urls : []) {
    const url = normalizeComixChapterUrl(raw_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push(url);
  }
  const current_index = current ? normalized.indexOf(current) : -1;
  const rest = current_index >= 0 ? normalized.slice(current_index + 1) : normalized;
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.floor(Number(limit))
    : COMIX_PREFETCH_CHAPTER_LIMIT;
  return rest.filter((url) => url !== current).slice(0, cap);
}

function takeComixPrefetchedImages(chapter_url) {
  const key = normalizeComixChapterUrl(chapter_url);
  if (!comix_prefetched_image_lists.has(key)) return null;
  const images = comix_prefetched_image_lists.get(key);
  comix_prefetched_image_lists.delete(key);
  return Array.isArray(images) && images.length ? images : null;
}

async function warmComixChapterImageCache(options = {}) {
  const cache = options.cache || comix_prefetched_image_lists;
  const load_image_list = options.loadImageList;
  const current = normalizeComixChapterUrl(options.chapterUrl);
  if (!current || typeof load_image_list !== 'function') return { prefetched: 0 };
  if (cache.has(current)) return { prefetched: 0 };
  const current_images = await load_image_list(current);
  if (!Array.isArray(current_images) || !current_images.length) {
    throw new Error('Không tìm thấy ảnh trong trang chương.');
  }
  cache.set(current, current_images);
  let prefetched = 0;
  for (const url of selectComixPrefetchUrls(options.prefetchChapterUrls, current)) {
    if (typeof options.shouldAbort === 'function' && options.shouldAbort()) break;
    if (cache.has(url)) continue;
    try {
      const images = await load_image_list(url);
      if (!Array.isArray(images) || !images.length) break;
      cache.set(url, images);
      prefetched += 1;
    } catch {
      break;
    }
  }
  return { prefetched };
}

function enqueueComixImageRead(task) {
  const run = comix_image_read_chain.then(task, task);
  comix_image_read_chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

async function readComixChapterImages(chapterUrl, options) {
  if (canReuseComixImageWindow(shared_comix_image_window)) {
    const reused = await readComixImagesFromOpenWindow(shared_comix_image_window, chapterUrl, {
      allowDomFallback: false,
    });
    if (reused && reused.ok && reused.images && reused.images.length) return reused;
  }
  return runComixBrowserWindow(
    chapterUrl,
    { timeout: 120000, waitAfterLoad: 0, keepAlive: true, ...options },
    async (win) => {
      shared_comix_image_window = win;
      return readComixImagesFromOpenWindow(win, chapterUrl, { allowDomFallback: true });
    },
  );
}

const COMIX_CAPTCHA_REVEAL_MS = 4000;

function createComixCaptchaReveal(win, reveal_ms = COMIX_CAPTCHA_REVEAL_MS) {
  let revealed = false;
  let ignore_captcha = false;
  let reveal_timer = null;
  const reveal_window = () => {
    reveal_timer = null;
    if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return;
    revealed = true;
    if (typeof win.show === 'function') win.show();
    if (typeof win.focus === 'function') win.focus();
  };
  return {
    onCaptcha() {
      if (revealed || reveal_timer || ignore_captcha) return;
      reveal_timer = setTimeout(reveal_window, reveal_ms);
    },
    cancel() {
      if (reveal_timer) {
        clearTimeout(reveal_timer);
        reveal_timer = null;
      }
    },
    markSolved() {
      ignore_captcha = true;
      if (reveal_timer) {
        clearTimeout(reveal_timer);
        reveal_timer = null;
      }
    },
    finish() {
      if (reveal_timer) {
        clearTimeout(reveal_timer);
        reveal_timer = null;
      }
      if (revealed && win && typeof win.isDestroyed === 'function' && !win.isDestroyed() && typeof win.hide === 'function') {
        win.hide();
      }
    },
  };
}

async function readComixImagesFromOpenWindow(win, chapterUrl, read_options) {
  const captcha_reveal = createComixCaptchaReveal(win);
  const on_console = (event, _level, message) => {
    const console_text =
      event && typeof event.message === 'string'
        ? event.message
        : typeof message === 'string'
          ? message
          : '';
    if (!console_text.startsWith('COMIX_CHAPTER_PROGRESS ')) return;
    try {
      const payload = JSON.parse(console_text.slice('COMIX_CHAPTER_PROGRESS '.length));
      if (payload && payload.phase === 'captcha') captcha_reveal.onCaptcha();
      if (payload && payload.phase === 'captcha-solved') captcha_reveal.markSolved();
    } catch {
      /* ignore malformed progress line */
    }
  };
  if (win.webContents && typeof win.webContents.on === 'function') {
    win.webContents.on('console-message', on_console);
  }
  try {
    const api_outcome = await fetchComixImagesViaInPageApi(win, chapterUrl);
    const api_images = Array.isArray(api_outcome)
      ? api_outcome
      : (api_outcome && api_outcome.items) || [];
    if (api_outcome && api_outcome.from_react_state && api_images.length > 0) {
      return { ok: true, images: api_images };
    }
    if (!read_options.allowDomFallback) {
      return { ok: false, error: 'Không tìm thấy ảnh trong reader.' };
    }
    const result = await win.webContents.executeJavaScript(COMIX_SCRAPE_IMAGES_SCRIPT);
    const urls = (result && result.urls) || [];
    const images = mergeComixApiAndDomImages(api_images, urls);
    if (urls.length > api_images.length && api_images.length) {
      logger.warn(
        'Chapter images: API returned ' +
          api_images.length +
          ', DOM returned ' +
          urls.length +
          '; using DOM',
      );
    }
    if (!images.length) {
      return { ok: false, error: 'Không tìm thấy ảnh trong reader.' };
    }
    return { ok: true, images };
  } finally {
    captcha_reveal.finish();
    if (win.webContents && typeof win.webContents.removeListener === 'function') {
      win.webContents.removeListener('console-message', on_console);
    }
  }
}

/**
 * Comix Service extending BaseConnectorService.
 * Uses API calls for chapter fetching.
 */
class ComixService extends BaseConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'comix',
      requiresCookie: true,
    });
    this._downloadWin = null;
    this._initDownloadWinPromise = null;
  }

  getUserAgent() {
    return getComixUserAgent();
  }

  getImageHeaders(referer) {
    const headers = super.getImageHeaders(referer);
    const cookie_str = getComixCookie();
    if (cookie_str) headers.Cookie = cookie_str;
    headers['User-Agent'] = getComixUserAgent();
    return headers;
  }

  async getOrCreateDownloadWindow() {
    if (this._downloadWin && typeof this._downloadWin.isDestroyed === 'function' && !this._downloadWin.isDestroyed()) {
      return this._downloadWin;
    }
    if (this._initDownloadWinPromise) {
      return this._initDownloadWinPromise;
    }
    this._initDownloadWinPromise = (async () => {
      let BrowserWindow;
      try {
        ({ BrowserWindow } = require('electron'));
      } catch {
        return null;
      }
      if (!BrowserWindow || typeof BrowserWindow !== 'function') return null;
      try {
        const win = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: {
            webSecurity: false,
            contextIsolation: false,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        });
        if (win.webContents && typeof win.webContents.setUserAgent === 'function') {
          win.webContents.setUserAgent(getComixUserAgent());
        }
        attachDeniedWindowOpenHandler(win.webContents);
        if (typeof win.loadURL === 'function') {
          await win.loadURL('about:blank');
        }
        this._downloadWin = win;
        return win;
      } catch (err) {
        logger.warn('Failed to initialize download BrowserWindow: ' + (err && err.message ? err.message : String(err)));
        return null;
      }
    })();
    try {
      return await this._initDownloadWinPromise;
    } finally {
      this._initDownloadWinPromise = null;
    }
  }

  closeDownloadWindow() {
    if (this._downloadWin && typeof this._downloadWin.isDestroyed === 'function' && !this._downloadWin.isDestroyed()) {
      try {
        this._downloadWin.destroy();
      } catch {
        /* ignore */
      }
    }
    this._downloadWin = null;
    this._initDownloadWinPromise = null;
  }

  async downloadImageViaBrowser(imageUrl, referer) {
    const isComixDomain = imageUrl.toLowerCase().includes('comix.to') || imageUrl.toLowerCase().includes('static.comix');
    const effectiveReferer = isComixDomain ? (referer || DOMAIN) : '';
    const win = await this.getOrCreateDownloadWindow();
    if (!win || !win.webContents || typeof win.webContents.executeJavaScript !== 'function') {
      throw new Error('Electron BrowserWindow không khả dụng.');
    }
    const result = await win.webContents.executeJavaScript(`
      (async () => {
        const ac = new AbortController();
        const tm = setTimeout(() => ac.abort(), 25000);
        try {
          const headers = {
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
          };
          const ref = ${JSON.stringify(effectiveReferer)};
          if (ref) headers['Referer'] = ref;
          const res = await fetch(${JSON.stringify(imageUrl)}, {
            signal: ac.signal,
            headers,
          });
          if (!res.ok) {
            throw new Error('HTTP ' + res.status);
          }
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          return {
            base64: btoa(binary),
            headers: {
              hash: res.headers.get('x-scramble-hash'),
              seed: res.headers.get('x-scramble-seed'),
              grid: res.headers.get('x-scramble-grid'),
              algo: res.headers.get('x-scramble-algo'),
            }
          };
        } finally {
          clearTimeout(tm);
        }
      })()
    `);
    if (!result || !result.base64) {
      throw new Error('Empty image payload from browser');
    }
    return {
      rawBuf: Buffer.from(result.base64, 'base64'),
      scrambleHeaders: result.headers || {},
    };
  }

  async downloadChapter(payload, connector) {
    try {
      const warm_result = await warmComixChapterImageCache({
        chapterUrl: payload && payload.chapterUrl,
        prefetchChapterUrls: payload && payload.prefetchChapterUrls,
        shouldAbort: payload && payload.shouldAbort,
        loadImageList: (url) => this.loadComixChapterImageList(url),
      });
      if (
        warm_result.prefetched > 0 &&
        payload &&
        typeof payload.onLog === 'function'
      ) {
        payload.onLog(
          `Comix: đã lấy trước danh sách ảnh ${warm_result.prefetched} chương tiếp theo.`,
          'info',
        );
      }
      return await super.downloadChapter(payload, connector);
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : 'Không tải được trang chương.',
      };
    } finally {
      this.closeDownloadWindow();
    }
  }

  /**
   * Load manga title, cover, and chapters via one hidden BrowserWindow.
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };
    const page = await fetchComixTitlePageViaBrowser(trimmed, options);
    if (!page.ok || !page.title) {
      return { ok: false, error: page.error || 'Không đọc được trang truyện.' };
    }
    return {
      ok: true,
      manga: {
        title: page.title,
        coverUrl: page.coverUrl,
        mangaUrl: trimmed,
        mangaId: '',
        siteId: 'comix',
        sourceLabel: 'Comix',
      },
      chapters: page.chapters || [],
    };
  }

  /**
   * Fetch chapter images from chapter URL.
   *
   * Signed /api/v1/chapters/{id} is fetched inside BrowserWindow (main-process
   * session.fetch is Cloudflare-blocked). DOM scrape is a lazy-load fallback.
   */
  async fetchChapterImages(chapterUrl, _referer) {
    const cached_images = takeComixPrefetchedImages(chapterUrl);
    if (cached_images) return cached_images;
    return this.loadComixChapterImageList(chapterUrl);
  }

  async loadComixChapterImageList(chapterUrl) {
    const browserResult = await fetchComixImagesViaBrowser(chapterUrl);
    if (browserResult.ok && browserResult.images && browserResult.images.length > 0) {
      return browserResult.images.map((item) => ({
        imageUrl: item.imageUrl,
        ext: item.scramble ? 'webp' : item.ext || getFileExt(item.imageUrl),
        scramble: !!item.scramble,
      }));
    }
    if (browserResult.ok && browserResult.urls && browserResult.urls.length > 0) {
      logger.warn('Chapter images API empty, using DOM scrape: ' + browserResult.urls.length);
      return browserResult.urls.map((imageUrl) => ({
        imageUrl,
        ext: getFileExt(imageUrl),
      }));
    }
    throw new Error(
      `Không tải được trang chương: ${browserResult.error || 'không có ảnh'}`,
    );
  }

  /**
   * Download image; descramble tile-shuffled pages using CDN scramble headers.
   */
  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts = 3, imageInfo = {}, shouldAbort) {
    const IMAGE_FETCH_TIMEOUT_MS = 30_000;
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true };
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), IMAGE_FETCH_TIMEOUT_MS);
      try {
        let rawBuf = null;
        let scrambleHeaders = null;
        let directFetchFailed = false;

        // 1. Try direct fetch first
        try {
          const cookie_str = await getComixCookieHeader();
          const request_headers = { ...(headers || this.getImageHeaders(DOMAIN)) };
          const isComixDomain = imageUrl.toLowerCase().includes('comix.to') || imageUrl.toLowerCase().includes('static.comix');
          if (isComixDomain) {
            if (cookie_str) request_headers.Cookie = cookie_str;
            request_headers.Referer = DOMAIN;
          } else {
            // Third-party CDNs (meganwrites, thebrandonblog, etc.) reject requests with comix.to Referer or comix.to cookies (Cloudflare 403)
            delete request_headers.Cookie;
            delete request_headers.cookie;
            delete request_headers.Referer;
            delete request_headers.referer;
          }
          const fetch_fn = getComixFetch();
          const res = await fetch_fn(imageUrl, {
            headers: request_headers,
            redirect: 'follow',
            signal: ac.signal,
          });
          if (res.ok) {
            rawBuf = Buffer.from(await res.arrayBuffer());
            if (rawBuf.length) {
              scrambleHeaders = {
                hash: res.headers.get('x-scramble-hash'),
                seed: res.headers.get('x-scramble-seed'),
                grid: res.headers.get('x-scramble-grid'),
                algo: res.headers.get('x-scramble-algo'),
              };
            } else {
              directFetchFailed = true;
              lastError = 'empty body';
            }
          } else {
            directFetchFailed = true;
            lastError = `HTTP ${res.status}`;
          }
        } catch (fetchErr) {
          directFetchFailed = true;
          lastError = fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr);
        }

        // 2. Fallback to hidden BrowserWindow if direct fetch failed (e.g. Cloudflare 403 on CDN)
        if (directFetchFailed || !rawBuf || !rawBuf.length) {
          try {
            const referer = (headers && headers.Referer) || DOMAIN;
            const browserRes = await this.downloadImageViaBrowser(imageUrl, referer);
            if (browserRes && browserRes.rawBuf && browserRes.rawBuf.length) {
              rawBuf = browserRes.rawBuf;
              scrambleHeaders = browserRes.scrambleHeaders || {};
            }
          } catch (browserErr) {
            lastError = browserErr && browserErr.message ? browserErr.message : String(browserErr);
          }
        }

        if (!rawBuf || !rawBuf.length) {
          continue;
        }

        const isScrambled = !!(
          (imageInfo && imageInfo.scramble) ||
          (scrambleHeaders && (scrambleHeaders.hash || scrambleHeaders.seed))
        );
        if (isScrambled) {
          rawBuf = await descrambleComixImageBuffer(rawBuf, scrambleHeaders || {});
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, rawBuf);
        return { ok: true, fileSize: rawBuf.length };
      } catch (err) {
        lastError = err && err.message ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    logger.warn('Image download failed: ' + lastError);
    return { ok: false, error: lastError || 'download failed' };
  }
}

// Create singleton instance
const service = new ComixService();

/**
 * Load manga information from URL.
 * @param {string} url - Manga URL
 * @returns {Promise<{ok: boolean, manga?: object, chapters?: array, error?: string}>}
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter.
 * @param {object} payload - Download configuration
 * @param {string} [connector] - Connector label override
 * @returns {Promise<{ok: boolean, successCount?: number, totalPages?: number, failedPageIndices?: array, skipped?: boolean, aborted?: boolean, error?: string}>}
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

function fetchChapterImages(url, ref) {
  return service.fetchChapterImages(url, ref);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchChapterImages,
  getComixImageFetchHeaders,
  rewriteComixRequestHeader,
  collectComixChaptersViaInPageGet,
  formatComixChapterProgress,
  COMIX_SCRAPE_CHAPTERS_SCRIPT,
  resetComixSharedImageWindow,
  selectComixChapterDetailData,
  createComixCaptchaReveal,
  selectComixPrefetchUrls,
  warmComixChapterImageCache,
  selectComixPrefetchUrls,
  warmComixChapterImageCache,
  service,
  ComixService,
};
