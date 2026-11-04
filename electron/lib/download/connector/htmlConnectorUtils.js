/**
 * Helpers tương đương ConnectorServicesImp + MangaUtils (ảnh) cho connector HTML.
 */
const cheerio = require('cheerio');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Khớp Jsoup.connect().get() — ConnectorServicesImp dùng UA mặc định của Jsoup, không phải Chrome đầy đủ. */
const { app } = require('electron');


const IMAGE_EXT_ALLOW = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

const VPN_REQUIRED_HINT = ' — Trang web này có thể bị nhà mạng chặn. Vui lòng bật VPN (như 1.1.1.1) trước khi tải.';

function resolveUrl(base, href) {
  if (!href) return '';
  const t = String(href).trim();
  if (!t) return '';
  try {
    return new URL(t, base).href;
  } catch {
    return '';
  }
}

function isValidImgSrc(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  if (u.includes('googleusercontent.com/') || u.includes('ggpht.com/')) return true;
  for (const ext of IMAGE_EXT_ALLOW) {
    if (u.includes(`.${ext}`)) return true;
  }
  return false;
}

function getFileExt(imageSrc) {
  if (!imageSrc) return '';
  const noQuery = String(imageSrc).split('?')[0];
  const seg = noQuery.split('/').pop() || '';
  const dot = seg.lastIndexOf('.');
  if (dot <= 0) {
    // Blogger / googleusercontent URLs often have no extension
    if (imageSrc.includes('googleusercontent.com/') || imageSrc.includes('ggpht.com/')) {
      return 'jpg';
    }
    return '';
  }
  const ext = seg.slice(dot + 1).toLowerCase();
  if (IMAGE_EXT_ALLOW.has(ext)) return ext;
  if (imageSrc.includes('googleusercontent.com/') || imageSrc.includes('ggpht.com/')) {
    return 'jpg';
  }
  return '';
}

function getImageSrcFromEl($el) {
  const src = ($el.attr('src') || '').trim();
  const dataSrc = ($el.attr('data-src') || '').trim();
  // Lazy placeholders (e.g. Mòe Truyện): tiny data: URI in src, real URL in data-src
  if (dataSrc && (!src || /^data:/i.test(src))) {
    return dataSrc;
  }
  return src || dataSrc;
}

function getDefaultUserAgent() {
  const { app } = require('electron');
  return app?.userAgentFallback || 
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
}

/**
 * Prefer session.defaultSession.fetch (Chromium TLS). Fall back to net.fetch, then global fetch.
 */
function getChromiumFetch() {
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
  return typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
}

async function fetchHtml(url, options = {}) {
  const ua = options.userAgent || getDefaultUserAgent();
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'User-Agent': ua,
    Accept:
      options.accept ||
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
  };
  if (options.preferChromiumNet) {
    const platformStr = process.platform === 'win32' ? '"Windows"' : '"macOS"';
    headers['upgrade-insecure-requests'] = '1';
    headers['sec-ch-ua'] = '"Chromium";v="133", "Not?A_Brand";v="24", "Google Chrome";v="133"';
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = platformStr;
    headers['sec-fetch-dest'] = 'document';
    headers['sec-fetch-mode'] = 'navigate';
    headers['sec-fetch-site'] = 'none';
    headers['sec-fetch-user'] = '?1';
  }
  const ref = options.referer && String(options.referer).trim();
  if (ref) {
    headers.Referer = ref;
  }
  const cookie = options.cookie && String(options.cookie).trim();
  if (cookie) {
    headers.Cookie = cookie;
    if (options.preferChromiumNet) {
      try {
        const electron = require('electron');
        const cookieStore = electron?.session?.defaultSession?.cookies;
        if (cookieStore && typeof cookieStore.set === 'function') {
          const cookiePairs = String(cookie).split(';').map((s) => s.trim()).filter(Boolean);
          const parsedUrl = new URL(url);
          const cookieUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
          for (const pair of cookiePairs) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx <= 0) continue;
            const cookieName = pair.slice(0, eqIdx).trim();
            const cookieValue = pair.slice(eqIdx + 1).trim();
            if (!cookieName) continue;
            // Chromium refuses to overwrite an HttpOnly jar cookie and then
            // session.fetch sends that stale value instead of the Cookie header.
            if (typeof cookieStore.remove === 'function') {
              try {
                await cookieStore.remove(cookieUrl, cookieName);
              } catch {
                /* still try to set the saved value */
              }
            }
            try {
              await cookieStore.set({
                url: cookieUrl,
                name: cookieName,
                value: cookieValue,
              });
            } catch {
              /* one rejected cookie must not drop the rest of the header */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  const has_body =
    options.body != null &&
    String(options.body) !== '' &&
    !['GET', 'HEAD'].includes(method);
  if (has_body) {
    headers['Content-Type'] =
      String(options.contentType || '').trim() || 'application/x-www-form-urlencoded';
  }
  if (options.headers && typeof options.headers === 'object') {
    for (const [header_key, header_val] of Object.entries(options.headers)) {
      if (header_val == null || header_val === '') continue;
      headers[header_key] = String(header_val);
    }
  }
  const fetch_opts = {
    method,
    headers,
    redirect: 'follow',
  };
  if (has_body) {
    fetch_opts.body = String(options.body);
  }
  const fetchFn =
    typeof options.fetchImpl === 'function'
      ? options.fetchImpl
      : (options.preferChromiumNet ? getChromiumFetch() : null) || globalThis.fetch || fetch;
  let res;
  try {
    res = await fetchFn(url, fetch_opts);
  } catch (err) {
    return { ok: false, error: err.message || 'Lỗi mạng khi tải trang.' };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  let html;
  try {
    html = await res.text();
  } catch (err) {
    return { ok: false, error: 'Không thể đọc nội dung phản hồi.' };
  }
  const result = { ok: true, html, finalUrl: res.url || url };
  if (options.includeSetCookie) {
    let setCookies = [];
    if (typeof res.headers.getSetCookie === 'function') {
      setCookies = res.headers.getSetCookie() || [];
    } else {
      const raw = res.headers.get('set-cookie');
      if (raw) setCookies = [raw];
    }
    result.cookie = setCookies
      .filter(Boolean)
      .map((entry) => String(entry).split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }
  return result;
}

function parseMangaPage(html, pageUrl, selectors) {
  const $ = cheerio.load(html);
  const title =
    $(selectors.title).first().text().trim() || $('title').first().text().trim() || '';
  let coverUrl = '';
  if (selectors.cover) {
    const $img = $(selectors.cover).first();
    if ($img.length) {
      const raw = getImageSrcFromEl($img);
      coverUrl = resolveUrl(pageUrl, raw);
    }
  }
  const chapters = [];
  $(selectors.chapterLinks).each((_, el) => {
    const $a = $(el);
    let href = ($a.attr('href') || '').trim();
    const text = $a.text().trim();
    if (!href) return;
    href = resolveUrl(pageUrl, href);
    chapters.push({ url: href, title: text || href });
  });
  return { title, coverUrl, chapters };
}

function collectChapterImages(html, refererBase) {
  const $ = cheerio.load(html);
  const out = [];
  $('img').each((_, el) => {
    const $el = $(el);
    let src = getImageSrcFromEl($el);
    if (!src || !isValidImgSrc(src)) return;
    src = resolveUrl(refererBase, src);
    const ext = getFileExt(src);
    if (!ext) return;
    out.push({ imageUrl: src, ext });
  });
  return out;
}

/** URL ảnh nhiễu (comment, emoji, logo) — dùng khi fallback lọc sau collectChapterImages. */
function isTruyenQQExcludedImageUrl(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return true;
  if (u.includes('blogspot.com') || u.includes('bp.blogspot')) return true;
  if (u.includes('avatar.truyenvua.com') && u.includes('/160x160/')) return true;
  if (/st\.truyenqq(no|ko)\.com\/template\//.test(u)) return true;
  if (u.includes('noavatar.png') || u.includes('logo-icon.png')) return true;
  return false;
}

/**
 * TruyenQQ: ảnh trang nằm trong {@code div.chapter_content div.page-chapter} (img.lazy).
 * Không dùng toàn bộ {@code img} — tránh avatar/emoji comment ({@code lazy-image}, blogspot GIF).
 */
function collectTruyenQQChapterImages(html, refererBase) {
  const $ = cheerio.load(html);
  const $imgs = $('div.chapter_content div.page-chapter img');
  if (!$imgs.length) {
    const raw = collectChapterImages(html, refererBase);
    return raw.filter((item) => !isTruyenQQExcludedImageUrl(item.imageUrl));
  }
  const rows = [];
  $imgs.each((i, el) => {
    const $el = $(el);
    const $page = $el.closest('div.page-chapter');
    const id = ($page.attr('id') || '').trim();
    let sort = i;
    const m = /^page_(\d+)$/i.exec(id);
    if (m) sort = parseInt(m[1], 10);
    let src = getImageSrcFromEl($el);
    if (!src || /^data:/i.test(src)) {
      src =
        ($el.attr('data-original') || $el.attr('data-cdn') || $el.attr('data-src') || '').trim();
    }
    if (!src || !isValidImgSrc(src)) return;
    src = resolveUrl(refererBase, src);
    if (isTruyenQQExcludedImageUrl(src)) return;
    const ext = getFileExt(src);
    if (!ext) return;
    rows.push({ sort, imageUrl: src, ext });
  });
  rows.sort((a, b) => a.sort - b.sort);
  return rows.map(({ imageUrl, ext }) => ({ imageUrl, ext }));
}

/**
 * Reader pages (Mòe Truyện, v.v.): {@code img.page-media} trong khung đọc (tránh trùng bản trong {@code noscript}).
 * Sắp theo {@code data-page-index}. Không có → fallback {@code img.page-media} rồi collectChapterImages.
 */
function collectReaderPageImages(html, refererBase) {
  const $ = cheerio.load(html);
  let $imgs = $('[data-reader-lazy-pages] img.page-media');
  if (!$imgs.length) {
    $imgs = $('img.page-media');
  }
  if (!$imgs.length) {
    return collectChapterImages(html, refererBase);
  }
  const rows = [];
  $imgs.each((i, el) => {
    const $el = $(el);
    const raw = ($el.attr('data-page-index') || '').trim();
    let sort = Number.MAX_SAFE_INTEGER;
    if (raw !== '') {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) sort = n;
    } else {
      sort = i;
    }
    rows.push({ el, sort });
  });
  rows.sort((a, b) => a.sort - b.sort);
  const out = [];
  for (const { el } of rows) {
    const $el = $(el);
    let src = getImageSrcFromEl($el);
    if (!src || !isValidImgSrc(src)) continue;
    src = resolveUrl(refererBase, src);
    const ext = getFileExt(src);
    if (!ext) continue;
    out.push({ imageUrl: src, ext });
  }
  return out.length ? out : collectChapterImages(html, refererBase);
}

module.exports = {
  USER_AGENT,
  get USER_AGENT_JSOUP() {
    return getDefaultUserAgent();
  },
  resolveUrl,
  isValidImgSrc,
  getFileExt,
  getImageSrcFromEl,
  fetchHtml,
  parseMangaPage,
  collectChapterImages,
  collectTruyenQQChapterImages,
  collectReaderPageImages,
  getChromiumFetch,
  VPN_REQUIRED_HINT,
};
