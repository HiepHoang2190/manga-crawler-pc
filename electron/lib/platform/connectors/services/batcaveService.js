/**
 * Batcave Service - Comic reader site with Cloudflare protection
 * Site: batcave.biz
 * 
 * Features:
 * - Electron BrowserWindow for Cloudflare PoW bypass (a Cloudflare PoW challenge)
 * - HTML-based comic site (English comics)
 * - Direct image links embedded in chapter pages
 * - Multiple fallback selectors for chapter/image extraction
 * 
 * Architecture:
 *  - BrowserWindow: Load page in hidden Electron Chromium → auto-solve Cloudflare challenge
 *  - Comic page: Extract title, cover, chapter list from rendered DOM via executeJavaScript()
 *  - Chapter page: Images extracted from rendered DOM after scroll-triggered lazy loading
 */
const cheerio = require('cheerio');
const { HtmlConnectorService } = require('../base/HtmlConnectorService');
const { mergeCookieHeaders } = require('../api-clients/flareCookieSession');
const { USER_AGENT, resolveUrl } = require('../../../download/connector/htmlConnectorUtils');
const { formatChapterTitle } = require('../../../shared/mangaUtils');
const logger = require('../../../shared/logger').createLogger('Batcave');
const cookieManager = require('../../cookies/cookieManager');

const DOMAIN = 'https://batcave.biz/';
const LABEL = 'Batcave';

function resolveCookie(options = {}) {
  const fromOptions = options && options.cookie && String(options.cookie).trim();
  if (fromOptions) return fromOptions;
  return cookieManager.getEffectiveCookie('batcave') || '';
}

function isLoginRequiredHtml(html) {
  const text = String(html || '');
  if (!text) return false;
  return (
    /login to read|sign in to read|registered users only|members only|please login|you must be logged in|you need to login|require.*login/i.test(text) ||
    /đăng nhập để đọc|yêu cầu đăng nhập/i.test(text) ||
    text.includes('login-required') ||
    text.includes('auth-required')
  );
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Cookie / UA captured from BrowserWindow session — used for image downloads */
let _browserSession = { userAgent: BROWSER_USER_AGENT, cookieHeader: '' };

// ─── Cloudflare challenge detection ─────────────────────────────────────────

function isChallengeTitle(title) {
  if (!title || typeof title !== 'string') return true; // Empty title = likely challenge page
  return /just a moment|attention required|checking your browser|please wait/i.test(title);
}

/**
 * Content-based Cloudflare challenge check.
 * Do NOT treat cloudflareinsights.com/beacon as a challenge — Batcave ships
 * that analytics script on normal comic/reader pages (false positive → timeout).
 */
function isChallengePageContent(html, pageTitle) {
  const safeHtml = typeof html === 'string' ? html : '';
  const safeTitle = typeof pageTitle === 'string' ? pageTitle : '';
  if (isChallengeTitle(safeTitle)) return true;
  if (safeHtml.includes('cf-browser-verification')) return true;
  if (/cf_chl_/i.test(safeHtml) && isChallengeTitle(safeTitle)) return true;
  return false;
}

/**
 * Parse window.__DATA__ JSON embedded in Batcave HTML.
 * Comic pages: { news_id, title, chapters: [{ id, title, ... }] }
 * Reader pages: { news_id, chapter_id, chapters, images: string[] }
 */
function parseWindowDataFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const marker = 'window.__DATA__ = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;

  let index = start + marker.length;
  while (index < html.length && /\s/.test(html[index])) index += 1;
  if (html[index] !== '{') return null;

  let depth = 0;
  let in_string = false;
  let is_escaped = false;
  const json_start = index;

  for (; index < html.length; index += 1) {
    const char = html[index];
    if (in_string) {
      if (is_escaped) {
        is_escaped = false;
      } else if (char === '\\') {
        is_escaped = true;
      } else if (char === '"') {
        in_string = false;
      }
      continue;
    }
    if (char === '"') {
      in_string = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(json_start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Build chapter list from Batcave __DATA__ payload.
 * @returns {Array<{url: string, title: string}>}
 */
function buildChaptersFromWindowData(windowData, origin = 'https://batcave.biz') {
  if (!windowData || !Array.isArray(windowData.chapters) || !windowData.news_id) {
    return [];
  }
  const base_origin = String(origin || 'https://batcave.biz').replace(/\/$/, '');
  const news_id = windowData.news_id;
  return windowData.chapters
    .map((chapter) => {
      if (!chapter || chapter.id == null) return null;
      const title = String(chapter.title || chapter.title_en || '').trim() || `Issue ${chapter.id}`;
      return {
        url: `${base_origin}/reader/${news_id}/${chapter.id}`,
        title,
      };
    })
    .filter(Boolean);
}

/**
 * @returns {string[]}
 */
function extractImagesFromWindowData(windowData) {
  if (!windowData || !Array.isArray(windowData.images)) return [];
  return windowData.images.filter(
    (url) => typeof url === 'string' && /^https?:\/\//i.test(url),
  );
}

// ─── BrowserWindow page fetcher ─────────────────────────────────────────────

/**
 * JavaScript code executed inside the BrowserWindow to extract comic info.
 * Returns { title, coverUrl, chapters: [{ url, title }], debug }
 */
const EXTRACT_COMIC_INFO_SCRIPT = `
(() => {
  const origin = location.origin || 'https://batcave.biz';
  let title = '';
  let coverUrl = '';
  let chapters = [];

  // Prefer window.__DATA__ — full chapter list (DOM list is paginated ~30/page)
  const windowData = window.__DATA__;
  if (windowData && Array.isArray(windowData.chapters) && windowData.news_id) {
    title = String(windowData.title || '').trim();
    const newsId = windowData.news_id;
    chapters = windowData.chapters
      .filter((ch) => ch && ch.id != null)
      .map((ch) => ({
        url: origin + '/reader/' + newsId + '/' + ch.id,
        title: String(ch.title || ch.title_en || '').trim() || ('Issue ' + ch.id),
      }));
  }

  // ── Title fallbacks ──
  if (!title) {
    const titleSelectors = [
      'h1',
      '.page__title',
      '.post-title h1',
      'h1.entry-title',
      '.entry-header h1',
      'h1.post-title',
      'h1.title',
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }
  }
  if (!title) {
    const t = document.title || '';
    title = t.replace(/\\s*[-–|]\\s*(Batcave|Comics Online).*$/i, '').trim();
  }

  // ── Cover ──
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && ogImage.content) {
    coverUrl = ogImage.content;
  }
  if (!coverUrl) {
    const posterImg = document.querySelector('.page__poster img, .poster img, .summary_image img');
    if (posterImg) coverUrl = posterImg.src || posterImg.dataset.src || '';
  }
  if (!coverUrl) {
    const contentImg = document.querySelector('.post-content img, .entry-content img, article img');
    if (contentImg) coverUrl = contentImg.src || contentImg.dataset.src || '';
  }

  // ── Chapter DOM fallbacks (paginated — incomplete vs __DATA__) ──
  if (chapters.length === 0) {
    const chapterSelectors = [
      '.cl__item-title a',
      '.page__chapters-list a[href*="/reader/"]',
      '.comix__fullstory-chapters a[href*="/reader/"]',
      'a[href*="/reader/"]',
      '.wp-manga-chapter a',
      '.listing-chapters_wrap a',
      '.chapter-list a',
      '.list-chapters a',
      'a[href*="chapter"]',
      'a[href*="chap-"]',
      'a[href*="issue"]',
    ];

    const seenUrls = new Set();
    for (const sel of chapterSelectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          const href = el.href;
          if (!href || seenUrls.has(href)) return;
          if (href.startsWith('javascript:') || href.endsWith('#')) return;
          if (!href.includes('/reader/')) return;
          if (!href.includes('batcave')) return;
          seenUrls.add(href);
          const text = el.textContent.trim() || el.title || href;
          chapters.push({ url: href, title: text });
        });
      } catch (_) { /* ignore selector errors */ }
      if (chapters.length > 0) break;
    }
  }

  let debug = null;
  if (chapters.length === 0) {
    const allLinks = [];
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.href;
      if (h && !h.startsWith('javascript:') && h !== '#') {
        allLinks.push({ href: h, text: (a.textContent || '').trim().slice(0, 80) });
      }
    });
    debug = {
      pageTitle: document.title,
      bodyLength: document.body ? document.body.innerHTML.length : 0,
      allLinksCount: allLinks.length,
      sampleLinks: allLinks.slice(0, 30),
      h1Text: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '',
      hasWpManga: !!document.querySelector('.wp-manga-chapter'),
      hasChapterList: !!document.querySelector('.chapter-list, .list-chapters, .page__chapters-list'),
      hasWindowData: !!window.__DATA__,
      hasTable: !!document.querySelector('table'),
    };
  }

  const pageText = (document.body && document.body.innerText) || '';
  const isLoginRequired =
    /login to read|sign in to read|registered users only|members only|please login|you must be logged in|you need to login|require.*login/i.test(pageText) ||
    /đăng nhập để đọc|yêu cầu đăng nhập/i.test(pageText) ||
    !!document.querySelector('.login-required, .member-only, .auth-required, form#login-form, .login__box');

  return { title, coverUrl, chapters, isLoginRequired, debug };
})()`;

/**
 * JavaScript code executed inside the BrowserWindow to extract chapter images.
 * Returns { urls: string[], debug }
 */
const EXTRACT_CHAPTER_IMAGES_SCRIPT = `
(async () => {
  // Prefer window.__DATA__.images — complete list without waiting for lazy load
  const windowData = window.__DATA__;
  if (windowData && Array.isArray(windowData.images) && windowData.images.length > 0) {
    const urls = windowData.images.filter((u) => typeof u === 'string' && /^https?:\\/\\//i.test(u));
    if (urls.length > 0) return { urls, debug: null };
  }

  // Scroll to load lazy images (DOM fallback)
  const scrollStep = 400;
  const scrollDelay = 250;
  let maxHeight = Math.max(document.body.scrollHeight, 10000);

  for (let y = 0; y < maxHeight; y += scrollStep) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, scrollDelay));
    maxHeight = Math.max(maxHeight, document.body.scrollHeight);
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 500));

  const imageSelectors = [
    '.reader__item',
    '.reader-view img',
    '.reader-root img',
    '.reading-content img',
    '.page-break img',
    '.entry-content img',
    '#readerarea img',
    '.reader-area img',
    '.chapter-content img',
    '.wp-manga-chapter-img',
    'div.reading img',
    '.content-area img',
    'article img',
    'main img',
    '#content img',
    '.container img',
  ];

  const urls = [];
  const seen = new Set();

  const push = (url) => {
    if (!url || seen.has(url)) return;
    if (!/^https?:\\/\\//i.test(url)) return;
    if (/logo|icon|favicon|avatar|banner|ads|pixel|tracking|analytics/i.test(url)) return;
    if (/1x1|spacer|blank/i.test(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const sel of imageSelectors) {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        const src = el.src || el.dataset.src || el.dataset.lazySrc || el.getAttribute('data-original');
        if (src) push(src);
      });
    } catch (_) { /* ignore */ }
    if (urls.length > 0) break;
  }

  let debug = null;
  if (urls.length === 0) {
    const allImgs = [];
    document.querySelectorAll('img').forEach((img) => {
      allImgs.push({
        src: (img.src || '').slice(0, 100),
        dataSrc: (img.dataset.src || '').slice(0, 100),
        className: (img.className || '').slice(0, 50),
        parentClass: (img.parentElement ? img.parentElement.className || '' : '').slice(0, 50),
      });
    });
    debug = {
      pageTitle: document.title,
      bodyLength: document.body ? document.body.innerHTML.length : 0,
      totalImgs: allImgs.length,
      sampleImgs: allImgs.slice(0, 20),
      hasWindowData: !!window.__DATA__,
      windowImagesCount: windowData && Array.isArray(windowData.images) ? windowData.images.length : 0,
    };
  }

  const pageText = (document.body && document.body.innerText) || '';
  const isLoginRequired =
    /login to read|sign in to read|registered users only|members only|please login|you must be logged in|you need to login|require.*login/i.test(pageText) ||
    /đăng nhập để đọc|yêu cầu đăng nhập/i.test(pageText) ||
    !!document.querySelector('.login-required, .member-only, .auth-required, form#login-form, .login__box');

  return { urls, isLoginRequired, debug };
})()`;

/**
 * Load a URL in a hidden Electron BrowserWindow, wait for Cloudflare challenge
 * to solve, then execute a JavaScript extraction script.
 *
 * @param {string} url - URL to load
 * @param {string} extractScript - JavaScript to execute after page loads
 * @param {object} [options]
 * @param {number} [options.timeout=90000] - Total timeout in ms
 * @param {number} [options.waitAfterLoad=5000] - Wait after first non-challenge page load
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function fetchViaBrowser(url, extractScript, options = {}) {
  const timeout = options.timeout || 90000;
  const waitAfterLoad = options.waitAfterLoad || 5000;

  let BrowserWindow;
  try {
    ({ BrowserWindow } = require('electron'));
  } catch {
    return { ok: false, error: 'BrowserWindow không khả dụng (không chạy trong Electron).' };
  }

  return new Promise((resolve) => {
    let win = null;
    let settled = false;
    let mainTimeoutId = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (mainTimeoutId) clearTimeout(mainTimeoutId);
      // Capture cookies from session before destroying window
      if (win && typeof win.isDestroyed === 'function' && !win.isDestroyed()) {
        captureSessionCookies(win).finally(() => {
          try { win.destroy(); } catch { /* ignore */ }
        });
      }
      resolve(result);
    };

    mainTimeoutId = setTimeout(() => {
      logger.error('fetchViaBrowser TIMEOUT url=' + url);
      finish({ ok: false, error: `Timeout sau ${timeout / 1000}s — Cloudflare challenge không giải được hoặc trang load quá lâu.` });
    }, timeout);

    try {
      win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          javascript: true,
        },
      });

      win.webContents.setUserAgent(BROWSER_USER_AGENT);

      win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        logger.error('did-fail-load code=' + errorCode + ' desc=' + errorDescription);
        finish({ ok: false, error: `Không tải được trang: ${errorDescription} (${errorCode})` });
      });

      win.webContents.on('did-finish-load', async () => {
        if (settled) return;

        let pageTitle = '';
        try {
          pageTitle = await win.webContents.executeJavaScript('document.title');
        } catch { /* ignore */ }

        const currentUrl = win.webContents.getURL();

        // Detect Cloudflare challenge pages:
        // 1. Title-based: empty title or known challenge titles
        // 2. Content-based: cf-browser-verification / challenge markers
        // NOTE: Do NOT treat cloudflareinsights.com/beacon as challenge —
        // Batcave includes that analytics script on normal content pages.
        let isChallenge = isChallengeTitle(pageTitle);

        if (!isChallenge) {
          try {
            isChallenge = await win.webContents.executeJavaScript(`
              (() => {
                const html = document.documentElement.innerHTML || '';
                const title = document.title || '';
                if (html.includes('cf-browser-verification')) return true;
                if (/cf_chl_/i.test(html) && /just a moment|checking your browser|please wait/i.test(title)) return true;
                const bodyText = (document.body && document.body.innerText) || '';
                if (bodyText.trim().length < 50 && html.length < 5000) return true;
                return false;
              })()
            `);
          } catch { /* ignore, assume not challenge */ }
        }

        logger.info('did-finish-load url=' + currentUrl + ' title="' + pageTitle + '"' +
          (isChallenge ? ' [CLOUDFLARE CHALLENGE — waiting]' : ' [CONTENT PAGE]'));

        if (isChallenge) {
          // Cloudflare challenge — Electron's Chromium will solve it,
          // then the page will navigate → triggers another did-finish-load
          return;
        }

        // Check if page has meaningful content (visible text, not just scripts)
        let visibleTextLength = 0;
        try {
          visibleTextLength = await win.webContents.executeJavaScript(
            '(document.body && document.body.innerText) ? document.body.innerText.trim().length : 0'
          );
        } catch { /* ignore */ }

        if (visibleTextLength < 100) {
          logger.info('Page has too little visible text (' + visibleTextLength + ' chars), waiting for content...');
          return;
        }

        // Wait for dynamic content to render
        logger.info('Content page loaded, waiting ' + waitAfterLoad + 'ms for JS rendering...');
        await new Promise(r => setTimeout(r, waitAfterLoad));

        if (settled) return;

        // Execute extraction script
        try {
          const data = await win.webContents.executeJavaScript(extractScript);
          logger.info('Extraction complete');
          finish({ ok: true, data });
        } catch (err) {
          logger.error('Extraction script failed: ' + err.message);
          finish({ ok: false, error: 'Lỗi khi trích xuất dữ liệu: ' + err.message });
        }
      });

      // Setup cookies if available before loading URL
      const cookieToInject = options.cookie || resolveCookie(options);
      const setupCookiesAndLoad = async () => {
        if (cookieToInject && win?.webContents?.session?.cookies) {
          try {
            const cookiePairs = String(cookieToInject)
              .split(';')
              .map((s) => s.trim())
              .filter(Boolean);
            const parsedUrl = new URL(url);
            for (const pair of cookiePairs) {
              const eqIdx = pair.indexOf('=');
              if (eqIdx > 0) {
                const name = pair.slice(0, eqIdx).trim();
                const value = pair.slice(eqIdx + 1).trim();
                await win.webContents.session.cookies.set({
                  url: `${parsedUrl.protocol}//${parsedUrl.host}`,
                  name,
                  value,
                });
              }
            }
            logger.info('Injected cookies into BrowserWindow session for: ' + url);
          } catch (err) {
            logger.warn('Failed to inject cookies into session: ' + err.message);
          }
        }
        if (!settled && win && !win.isDestroyed()) {
          logger.info('Loading URL in BrowserWindow: ' + url);
          win.loadURL(url);
        }
      };

      setupCookiesAndLoad().catch((err) => {
        finish({ ok: false, error: 'BrowserWindow error: ' + (err?.message || String(err)) });
      });
    } catch (err) {
      finish({ ok: false, error: 'BrowserWindow error: ' + err.message });
    }
  });
}

/**
 * Capture cookies from BrowserWindow session to use for image downloads.
 */
async function captureSessionCookies(win) {
  try {
    const ses = win.webContents.session;
    const cookies = await ses.cookies.get({ domain: '.batcave.biz' });
    if (cookies.length > 0) {
      const header = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      _browserSession.cookieHeader = mergeCookieHeaders(
        _browserSession.cookieHeader,
        header
      );
      logger.debug('Captured ' + cookies.length + ' cookies from BrowserWindow session');
    }
  } catch (err) {
    logger.warn('Failed to capture session cookies: ' + err.message);
  }
}

// ─── Cheerio-based parsers (HTML fallback) ─────

/**
 * Parse comic title from HTML (cheerio fallback)
 */
function parseTitle(html) {
  const windowData = parseWindowDataFromHtml(html);
  if (windowData && windowData.title) {
    return String(windowData.title).trim();
  }

  const $ = cheerio.load(html);

  // Try multiple selectors
  let title = $('h1').first().text().trim();
  if (title) return title;

  title = $('.post-title h1').first().text().trim();
  if (title) return title;

  title = $('h1.entry-title').first().text().trim();
  if (title) return title;

  title = $('.entry-header h1').first().text().trim();
  if (title) return title;

  // Fallback to <title> tag
  const titleTag = $('title').text().trim();
  if (titleTag) {
    return titleTag.replace(/\s*[-–|]\s*(Batcave|Comics Online).*$/i, '').trim();
  }

  return '';
}

/**
 * Parse cover image URL (cheerio fallback)
 */
function parseCoverUrl(html, pageUrl) {
  const $ = cheerio.load(html);

  // Try og:image meta tag
  let cover = $('meta[property="og:image"]').attr('content');
  if (cover && /^https?:\/\//i.test(cover)) return cover;

  // Batcave poster
  cover =
    $('.page__poster img').attr('src') ||
    $('.page__poster img').attr('data-src') ||
    $('.poster img').attr('src');
  if (cover) return /^https?:\/\//i.test(cover) ? cover : resolveUrl(pageUrl, cover);

  // Try summary image
  cover = $('.summary_image img').attr('src') || $('.summary_image img').attr('data-src');
  if (cover) return /^https?:\/\//i.test(cover) ? cover : resolveUrl(pageUrl, cover);

  // Try first content image
  cover = $('.post-content img').first().attr('src') || $('.post-content img').first().attr('data-src');
  if (cover) return /^https?:\/\//i.test(cover) ? cover : resolveUrl(pageUrl, cover);

  return '';
}

/**
 * Parse chapter list from HTML (cheerio fallback)
 */
function parseChapters(html, baseUrl) {
  const windowData = parseWindowDataFromHtml(html);
  const fromData = buildChaptersFromWindowData(windowData, 'https://batcave.biz');
  if (fromData.length > 0) {
    return fromData
      .map((ch) => ({ url: ch.url, title: formatChapterTitle(ch.title) }))
      .reverse();
  }

  const $ = cheerio.load(html);
  const chapters = [];

  // Batcave uses /reader/{comicId}/{issueId}; DOM list is paginated
  const selectors = [
    '.cl__item-title a',
    '.page__chapters-list a[href*="/reader/"]',
    'a[href*="/reader/"]',
    '.wp-manga-chapter a',
    '.listing-chapters_wrap a',
    '.chapter-list a',
    '.list-chapters a',
    '.version-chap a',
    'ul.chapters li a',
    '.chapter-item a',
    '.chapters a',
    '.episode-list a',
    'a[href*="chapter"]',
    'a[href*="chap-"]',
    'a[href*="issue"]',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      let url = $el.attr('href');
      if (!url) return;

      // Make absolute URL
      if (!/^https?:\/\//i.test(url)) {
        url = resolveUrl(baseUrl, url);
      }

      // Skip non-batcave / non-reader links
      if (!url.includes('batcave')) return;
      if (selector.includes('reader') || url.includes('/reader/')) {
        if (!url.includes('/reader/')) return;
      }

      // Get chapter title
      let title = $el.text().trim();
      if (!title) title = url;

      chapters.push({
        url,
        title: formatChapterTitle(title),
      });
    });

    if (chapters.length > 0) break;
  }

  // Reverse to get ascending order (usually sites show newest first)
  return chapters.reverse();
}

/**
 * Extract chapter image URLs from chapter page HTML (cheerio fallback)
 */
function extractChapterImageUrls(html) {
  const windowData = parseWindowDataFromHtml(html);
  const fromData = extractImagesFromWindowData(windowData);
  if (fromData.length > 0) return fromData;

  const $ = cheerio.load(html);
  const urls = [];
  const seen = new Set();

  const push = (url) => {
    if (!url || seen.has(url)) return;
    if (!/^https?:\/\//i.test(url)) return;
    if (/logo|icon|favicon|avatar|banner|ads/i.test(url)) return;
    seen.add(url);
    urls.push(url);
  };

  // Batcave reader + common comic reader selectors
  const selectors = [
    '.reader__item',
    '.reader-view img',
    '.reader-root img',
    '.reading-content img',
    '.page-break img',
    '.entry-content img',
    '#readerarea img',
    '.reader-area img',
    '.chapter-content img',
    '.wp-manga-chapter-img',
    'div.reading img',
    '.content-area img',
    'article img',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const url = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src');
      if (url) push(url);
    });
    if (urls.length > 0) break;
  }

  return urls;
}

// ─── Direct fetch (for non-CF-blocked IPs) ──────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function isCloudflareChallenge(html) {
  if (!html || typeof html !== 'string') return false;
  return (
    html.includes('Just a moment') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_') ||
    html.includes('jschl-answer') ||
    html.includes('Checking your browser') ||
    html.includes('DDoS protection by Cloudflare') ||
    (html.includes('cloudflare') && html.includes('challenge'))
  );
}

/**
 * Try direct HTTP fetch (works for some IPs not blocked by Cloudflare).
 * Returns { ok, html } or { ok: false }.
 */
async function tryDirectFetch(url, cookie = '') {
  try {
    const headers = { ...FETCH_HEADERS };
    if (cookie) {
      headers.Cookie = cookie;
    }
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
    });

    if (res.ok) {
      const html = await res.text();
      if (html && !isCloudflareChallenge(html) && html.length > 5000) {
        logger.info('Direct fetch succeeded for ' + url + ' (HTML length=' + html.length + ')');
        return { ok: true, html };
      }
    }
  } catch {
    // Fall through
  }
  return { ok: false };
}

// ─── Service class ──────────────────────────────────────────────────────────

/**
 * Batcave connector service extending HtmlConnectorService.
 * 
 * Uses Electron BrowserWindow as primary fetch strategy because batcave.biz
 * uses a Cloudflare PoW (Proof of Work) challenge.
 * Falls back to direct HTTP fetch for non-CF-blocked IPs.
 */
class BatcaveService extends HtmlConnectorService {
  constructor() {
    super({
      domain: DOMAIN,
      label: LABEL,
      siteId: 'batcave',
      selectors: {}, // Custom parsing via BrowserWindow
      requiresCookie: true,
    });
  }

  /**
   * Override load() — uses BrowserWindow to bypass Cloudflare and extract comic info.
   *
   * Strategy:
   * 1. Try direct HTTP fetch (fast, works for non-blocked IPs)
   * 2. Use BrowserWindow to render page (solves Cloudflare PoW challenge)
   * 3. Extract title, cover, chapters from rendered DOM
   */
  async load(url, options = {}) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return { ok: false, error: 'URL trống.' };

    const cookie = resolveCookie(options);

    // Strategy 1: Direct fetch (fast path)
    const direct = await tryDirectFetch(trimmed, cookie);
    if (direct.ok) {
      const title = parseTitle(direct.html);
      if (title) {
        const coverUrl = parseCoverUrl(direct.html, trimmed);
        const chapters = parseChapters(direct.html, trimmed);
        if (chapters.length > 0) {
          logger.info('Direct fetch: found ' + chapters.length + ' chapters for "' + title + '"');
          return {
            ok: true,
            manga: { title, coverUrl, mangaUrl: trimmed, siteId: 'batcave', sourceLabel: LABEL },
            chapters,
          };
        }
        logger.info('Direct fetch: title found but 0 chapters, falling through to BrowserWindow');
      }
    }

    // Strategy 2: BrowserWindow (Cloudflare PoW bypass)
    logger.info('Using BrowserWindow to load: ' + trimmed);
    const result = await fetchViaBrowser(trimmed, EXTRACT_COMIC_INFO_SCRIPT, {
      timeout: 90000,
      waitAfterLoad: 5000,
      cookie,
      ...options,
    });

    if (!result.ok) {
      return { ok: false, error: result.error || 'Không tải được trang comic.' };
    }

    const data = result.data;
    if (!data || !data.title) {
      return { ok: false, error: 'Không đọc được tiêu đề comic.' };
    }

    const chapters = (data.chapters || []).map(ch => ({
      url: ch.url,
      title: formatChapterTitle(ch.title),
    }));

    // Reverse to ascending order (sites usually show newest first)
    chapters.reverse();

    if (!chapters.length) {
      // Log debug info to help diagnose selector issues
      if (data.debug) {
        logger.error('Không tìm thấy chapter. Debug info:');
        logger.error('  Page title: ' + data.debug.pageTitle);
        logger.error('  Body length: ' + data.debug.bodyLength);
        logger.error('  Total links: ' + data.debug.allLinksCount);
        logger.error('  H1 text: ' + data.debug.h1Text);
        logger.error('  hasWpManga: ' + data.debug.hasWpManga);
        logger.error('  hasChapterList: ' + data.debug.hasChapterList);
        logger.error('  hasTable: ' + data.debug.hasTable);
        if (data.debug.sampleLinks && data.debug.sampleLinks.length > 0) {
          logger.error('  Sample links:');
          data.debug.sampleLinks.forEach((l, i) => {
            logger.error('    [' + i + '] ' + l.text + ' → ' + l.href);
          });
        }
      }

      if (data.isLoginRequired || !cookie) {
        return {
          ok: false,
          error: 'Truyện này có thể yêu cầu đăng nhập trên Batcave. Vui lòng nhấn biểu tượng Cookie ở thanh bên hoặc vào Cài đặt → Cookie để đăng nhập và lấy cookie cho Batcave.',
        };
      }
      return {
        ok: false,
        error: 'Không tìm thấy chapter nào. Cookie Batcave có thể đã hết hạn hoặc truyện bị khóa. Vui lòng cập nhật Cookie trong Cài đặt.',
      };
    }

    logger.info('BrowserWindow: found ' + chapters.length + ' chapters for "' + data.title + '"');

    return {
      ok: true,
      manga: {
        title: data.title,
        coverUrl: data.coverUrl || '',
        mangaUrl: trimmed,
        siteId: 'batcave',
        sourceLabel: LABEL,
      },
      chapters,
    };
  }

  /**
   * Override fetchChapterImages() — uses BrowserWindow to load chapter page,
   * scroll to trigger lazy loading, then extract image URLs from DOM.
   */
  async fetchChapterImages(chapterUrl, referer, options = {}) {
    const cookie = resolveCookie(options);

    // Strategy 1: Direct fetch
    const direct = await tryDirectFetch(chapterUrl, cookie);
    if (direct.ok) {
      const imageUrls = extractChapterImageUrls(direct.html);
      if (imageUrls.length > 0) {
        logger.info('Direct fetch: found ' + imageUrls.length + ' images');
        return imageUrls.map(urlToImageObj);
      }
    }

    // Strategy 2: BrowserWindow
    logger.info('Using BrowserWindow to load chapter: ' + chapterUrl);
    const result = await fetchViaBrowser(chapterUrl, EXTRACT_CHAPTER_IMAGES_SCRIPT, {
      timeout: 90000,
      waitAfterLoad: 3000,
      cookie,
      ...options,
    });

    if (!result.ok) {
      throw new Error(result.error || 'Không tải được trang chapter');
    }

    const data = result.data;
    const urls = (data && data.urls) || [];

    if (!urls.length) {
      if (data && data.debug) {
        logger.error('Không tìm thấy ảnh. Debug info:');
        logger.error('  Page title: ' + data.debug.pageTitle);
        logger.error('  Body length: ' + data.debug.bodyLength);
        logger.error('  Total imgs: ' + data.debug.totalImgs);
        if (data.debug.sampleImgs && data.debug.sampleImgs.length > 0) {
          logger.error('  Sample images:');
          data.debug.sampleImgs.forEach((img, i) => {
            logger.error('    [' + i + '] src=' + img.src + ' class=' + img.className + ' parent=' + img.parentClass);
          });
        }
      }

      if (data && (data.isLoginRequired || !cookie)) {
        throw new Error(
          'Chapter này có thể yêu cầu đăng nhập trên Batcave. Vui lòng nhấn biểu tượng Cookie ở thanh bên hoặc vào Cài đặt → Cookie để cập nhật cookie cho Batcave.'
        );
      }
      throw new Error('Không tìm thấy ảnh trong trang chapter. Site có thể yêu cầu đăng nhập hoặc cookie đã hết hạn.');
    }

    logger.info('BrowserWindow: found ' + urls.length + ' images');
    return urls.map(urlToImageObj);
  }

  /**
   * Override getImageHeaders() to include session cookies from BrowserWindow.
   */
  getImageHeaders(referer) {
    const headers = {
      'User-Agent': _browserSession.userAgent || USER_AGENT,
      Referer: referer || DOMAIN,
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    };

    const effectiveCookie = resolveCookie();
    const cookieHeader = mergeCookieHeaders(_browserSession.cookieHeader, effectiveCookie);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    return headers;
  }
}

/**
 * Convert image URL string to { imageUrl, ext } object.
 */
function urlToImageObj(url) {
  const path = require('path');
  const ext = path.extname(url.split('?')[0]).toLowerCase().replace(/^\./, '') || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext) ? ext : 'jpg';
  return { imageUrl: url, ext: safeExt };
}

function toAbsoluteUrl(pageUrl, maybeRelative) {
  if (!maybeRelative || typeof maybeRelative !== 'string') return '';
  const raw = maybeRelative.trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return resolveUrl(pageUrl, raw);
}

function cleanListingTitle(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isComicDetailUrl(url) {
  return typeof url === 'string' && /\/\d+-[^/]+\.html(?:$|[?#])/i.test(url);
}

/**
 * Homepage "newest comic releases" — li.latest
 */
function parseLatestListingHtml(html, pageUrl) {
  const $ = cheerio.load(html || '');
  const items = [];
  const seen = new Set();

  $('li.latest').each((_, el) => {
    const $el = $(el);
    const $titleA = $el.find('.latest__title a').first();
    let mangaUrl = String($titleA.attr('href') || '').trim();
    if (!mangaUrl) return;
    mangaUrl = toAbsoluteUrl(pageUrl, mangaUrl);
    if (!isComicDetailUrl(mangaUrl) || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const title = cleanListingTitle($titleA.text());
    if (!title) return;

    const $img = $el.find('.latest__img img, img').first();
    const coverUrl = toAbsoluteUrl(
      pageUrl,
      $img.attr('data-src') || $img.attr('src') || '',
    );
    const latestChapterLabel = cleanListingTitle(
      $el.find('.latest__chapter a').first().text(),
    );

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  return items;
}

/**
 * Search / catalogue cards — .readed
 */
function parseReadedListingHtml(html, pageUrl) {
  const $ = cheerio.load(html || '');
  const items = [];
  const seen = new Set();

  $('.readed').each((_, el) => {
    const $el = $(el);
    const $titleA = $el.find('.readed__title a').first();
    let mangaUrl = String($titleA.attr('href') || '').trim();
    if (!mangaUrl) {
      mangaUrl = String($el.find('a.readed__img').attr('href') || '').trim();
    }
    if (!mangaUrl) return;
    mangaUrl = toAbsoluteUrl(pageUrl, mangaUrl);
    if (!isComicDetailUrl(mangaUrl) || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);

    const title = cleanListingTitle($titleA.text() || $el.find('img').attr('alt') || '');
    if (!title) return;

    const $img = $el.find('.readed__img img, img').first();
    const coverUrl = toAbsoluteUrl(
      pageUrl,
      $img.attr('data-src') || $img.attr('src') || '',
    );

    let latestChapterLabel = '';
    $el.find('.readed__meta-item, li, div').each((__, node) => {
      const text = cleanListingTitle($(node).text());
      if (/^last issue:/i.test(text)) {
        latestChapterLabel = text.replace(/^last issue:\s*/i, '').trim();
        return false;
      }
    });

    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  return items;
}

function parseListingTotalPages(html) {
  const $ = cheerio.load(html || '');
  let totalPages = 1;
  $('.pagination a[href*="/page/"], .pagination__pages a[href*="/page/"]').each((_, el) => {
    const href = String($(el).attr('href') || '');
    const match = href.match(/\/page\/(\d+)/);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      if (pageNum > totalPages) totalPages = pageNum;
    }
  });
  return Math.max(1, totalPages);
}

function buildSearchListingUrl(searchQuery, page) {
  const slug = encodeURIComponent(String(searchQuery).trim()).replace(/%20/g, '+');
  if (page <= 1) return `https://batcave.biz/search/${slug}`;
  return `https://batcave.biz/search/${slug}/page/${page}/`;
}

function buildLatestListingUrl(page) {
  if (page <= 1) return 'https://batcave.biz/';
  return `https://batcave.biz/comix/page/${page}/`;
}

const EXTRACT_LATEST_LISTING_SCRIPT = `
(() => {
  const items = [];
  const seen = new Set();
  document.querySelectorAll('li.latest').forEach((li) => {
    const titleA = li.querySelector('.latest__title a');
    if (!titleA || !titleA.href) return;
    const mangaUrl = titleA.href;
    if (!/\\/\\d+-[^/]+\\.html/i.test(mangaUrl) || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);
    const title = (titleA.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!title) return;
    const img = li.querySelector('.latest__img img, img');
    let coverUrl = '';
    if (img) {
      coverUrl = img.getAttribute('data-src') || img.getAttribute('src') || '';
      if (coverUrl.startsWith('data:')) coverUrl = img.getAttribute('data-src') || '';
      if (coverUrl && coverUrl.startsWith('/')) coverUrl = location.origin + coverUrl;
    }
    const chapterA = li.querySelector('.latest__chapter a');
    items.push({
      title,
      mangaUrl,
      coverUrl,
      latestChapterLabel: chapterA ? (chapterA.textContent || '').replace(/\\s+/g, ' ').trim() : '',
    });
  });
  return { items, totalPages: 1 };
})()`;

const EXTRACT_READED_LISTING_SCRIPT = `
(() => {
  const items = [];
  const seen = new Set();
  document.querySelectorAll('.readed').forEach((el) => {
    const titleA = el.querySelector('.readed__title a');
    const imgA = el.querySelector('a.readed__img');
    const mangaUrl = (titleA && titleA.href) || (imgA && imgA.href) || '';
    if (!mangaUrl || !/\\/\\d+-[^/]+\\.html/i.test(mangaUrl) || seen.has(mangaUrl)) return;
    seen.add(mangaUrl);
    const title = ((titleA && titleA.textContent) || (el.querySelector('img') && el.querySelector('img').alt) || '')
      .replace(/\\s+/g, ' ').trim();
    if (!title) return;
    const img = el.querySelector('.readed__img img, img');
    let coverUrl = '';
    if (img) {
      coverUrl = img.getAttribute('data-src') || img.getAttribute('src') || '';
      if (coverUrl.startsWith('data:')) coverUrl = img.getAttribute('data-src') || '';
      if (coverUrl && coverUrl.startsWith('/')) coverUrl = location.origin + coverUrl;
    }
    let latestChapterLabel = '';
    el.querySelectorAll('.readed__meta-item, li, div').forEach((node) => {
      const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
      if (/^last issue:/i.test(text) && !latestChapterLabel) {
        latestChapterLabel = text.replace(/^last issue:\\s*/i, '').trim();
      }
    });
    items.push({ title, mangaUrl, coverUrl, latestChapterLabel });
  });

  let totalPages = 1;
  document.querySelectorAll('.pagination a[href*="/page/"]').forEach((a) => {
    const m = (a.getAttribute('href') || '').match(/\\/page\\/(\\d+)/);
    if (m) totalPages = Math.max(totalPages, parseInt(m[1], 10));
  });
  return { items, totalPages };
})()`;

/**
 * Latest updates + search for Batcave.
 * - Listing page 1: homepage li.latest (true recent chapter updates)
 * - Listing page 2+: /comix/page/{n}/ (.readed catalogue)
 * - Search: /search/{query}[/page/{n}/] (.readed)
 * Note: /p/event is Plausible analytics, not a search API.
 */
async function fetchLatestUpdates(options = {}) {
  const rawSearch = options.latestUpdatesSearch ?? options.searchQuery;
  const search_query = String(rawSearch || '').trim();
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const is_search = Boolean(search_query);
  const listing_url = is_search
    ? buildSearchListingUrl(search_query, page)
    : buildLatestListingUrl(page);
  const use_latest_selectors = !is_search && page <= 1;

  logger.info(
    'fetchLatestUpdates url=' + listing_url +
      (is_search ? ' search=' + search_query : '') +
      ' page=' + page,
  );

  const cookie = resolveCookie(options);
  const direct = await tryDirectFetch(listing_url, cookie);
  if (direct.ok) {
    const items = use_latest_selectors
      ? parseLatestListingHtml(direct.html, listing_url)
      : parseReadedListingHtml(direct.html, listing_url);
    if (items.length > 0) {
      const totalPages = use_latest_selectors
        ? Math.max(1, parseListingTotalPages(direct.html) || 20)
        : parseListingTotalPages(direct.html);
      return {
        ok: true,
        siteId: 'batcave',
        page,
        totalPages: use_latest_selectors ? Math.max(totalPages, 20) : totalPages,
        items,
      };
    }
    logger.info('Direct listing parse returned 0 items, falling through to BrowserWindow');
  }

  const extract_script = use_latest_selectors
    ? EXTRACT_LATEST_LISTING_SCRIPT
    : EXTRACT_READED_LISTING_SCRIPT;

  const result = await fetchViaBrowser(listing_url, extract_script, {
    timeout: 90000,
    waitAfterLoad: 4000,
    cookie,
    ...options,
  });

  if (!result.ok) {
    return { ok: false, error: result.error || 'Không tải được danh sách Batcave.' };
  }

  const data = result.data || {};
  const items = Array.isArray(data.items) ? data.items.filter((it) => it && it.title && it.mangaUrl) : [];
  let totalPages = Math.max(1, Number(data.totalPages) || 1);
  if (use_latest_selectors) {
    totalPages = Math.max(totalPages, 20);
  }

  if (!items.length) {
    return { ok: false, error: 'Không tìm thấy truyện trong danh sách Batcave.' };
  }

  return {
    ok: true,
    siteId: 'batcave',
    page,
    totalPages,
    items,
  };
}

// Create singleton instance
const service = new BatcaveService();

/**
 * Load comic information from URL
 */
function load(url, options) {
  return service.load(url, options);
}

/**
 * Download a chapter
 */
function downloadChapter(payload, connector) {
  return service.downloadChapter(payload, connector || LABEL);
}

module.exports = {
  DOMAIN,
  LABEL,
  load,
  downloadChapter,
  fetchLatestUpdates,
  resolveCookie,
  isLoginRequiredHtml,
  getImageHeaders: (referer) => service.getImageHeaders(referer),
  // Exported for unit tests
  isChallengeTitle,
  isChallengePageContent,
  parseWindowDataFromHtml,
  buildChaptersFromWindowData,
  extractImagesFromWindowData,
  parseTitle,
  parseChapters,
  extractChapterImageUrls,
  parseLatestListingHtml,
  parseReadedListingHtml,
  parseListingTotalPages,
  buildSearchListingUrl,
  buildLatestListingUrl,
};
