/**
 * MangaFire API Client
 *
 * Cloudflare blocks main-process HTTP. Hidden BrowserWindow uses
 * session.defaultSession (same jar as the login popup). Catalog chapters
 * come from in-page GET /api/titles/{hid}/chapters?vrf=…; chapter images
 * from GET /api/chapters/{id}?vrf=….
 */

const SITE_BASE = 'https://mangafire.to';
const IMG_REFERER = 'https://mangafire.to/';

// ─── URL helpers ──────────────────────────────────────────────────────────────

function extractMangaHid(url) {
  if (!url) return null;
  const s = String(url).trim();
  const newMatch = s.match(/\/title\/([a-z0-9]+)-/i);
  if (newMatch) return newMatch[1];
  const oldMatch = s.match(/\/(?:manga|read)\/[^/]+\.([a-z0-9]+)/i);
  if (oldMatch) return oldMatch[1];
  return null;
}

function extractNumericChapterId(url) {
  if (!url) return null;
  const m = String(url).trim().match(/\/chapter\/(\d+)/);
  return m ? m[1] : null;
}

function inferImageExt(imageUrl) {
  const m = String(imageUrl || '').match(/\.(jpe?g|png|webp|avif|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function isMangaFireChallengeTitle(title) {
  return /just a moment|attention required|checking your browser|please wait/i.test(
    String(title || ''),
  );
}

function getMangaFireUserAgent() {
  try {
    const { app } = require('electron');
    if (app && app.userAgentFallback) return app.userAgentFallback;
  } catch {
    /* not in Electron */
  }
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
}

function buildMangaFireTitlePath(page_url, hid) {
  const title_match = String(page_url || '').match(/\/title\/([^/?#]+)/i);
  if (title_match) return title_match[1];
  const old_match = String(page_url || '').match(/\/(?:manga|read)\/([^/.]+)\.([a-z0-9]+)/i);
  if (old_match) return `${old_match[2]}-${old_match[1]}`;
  return hid;
}

/**
 * Hidden BrowserWindow on defaultSession (same jar as the login popup).
 * persist:mangafire never sees cf_clearance from cookieExtractor.
 */
async function runMangaFireBrowserWindow(page_url, options, on_ready) {
  const timeout_ms = options.timeout || 180000;
  const wait_after_load_ms =
    options.waitAfterLoad != null ? Number(options.waitAfterLoad) : 1500;

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

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (main_timeout_id) clearTimeout(main_timeout_id);
      if (win && typeof win.isDestroyed === 'function' && !win.isDestroyed()) {
        try {
          win.destroy();
        } catch {
          /* ignore */
        }
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
          backgroundThrottling: false,
          session: electron_session && electron_session.defaultSession,
        },
      });

      win.webContents.setUserAgent(getMangaFireUserAgent());

      win.webContents.on('dom-ready', () => {
        if (settled) return;
        win.webContents.executeJavaScript(MANGAFIRE_API_CAPTURE_SCRIPT).catch(() => {});
      });

      win.webContents.on(
        'did-fail-load',
        (_event, error_code, error_description, _validated_url, is_main_frame) => {
          if (error_code === -3) return;
          if (is_main_frame === false) return;
          finish({ ok: false, error: `Không tải được trang: ${error_description} (${error_code})` });
        },
      );

      win.webContents.on('did-finish-load', async () => {
        if (settled) return;
        let page_title = '';
        try {
          page_title = await win.webContents.executeJavaScript('document.title');
        } catch {
          /* ignore */
        }
        if (!String(page_title || '').trim() || isMangaFireChallengeTitle(page_title)) {
          return;
        }
        if (wait_after_load_ms > 0) {
          await new Promise((r) => setTimeout(r, wait_after_load_ms));
        }
        if (settled) return;
        try {
          finish(await on_ready(win));
        } catch (err) {
          finish({ ok: false, error: err && err.message ? err.message : 'scrape-failed' });
        }
      });

      win.loadURL(page_url);
    } catch (err) {
      finish({ ok: false, error: err && err.message ? err.message : 'BrowserWindow error' });
    }
  });
}

const CATALOG_API_POLL_MAX_ATTEMPTS = 40;
const CATALOG_API_POLL_DELAY_MS = 250;
const CATALOG_PAGINATION_WAIT_ATTEMPTS = 60;
const CATALOG_PAGINATION_MIN_GUARD = 200;

/** Hooks fetch/XHR so signed chapter API URLs are captured during pagination. */
const MANGAFIRE_API_CAPTURE_SCRIPT = `
(function() {
  if (window.__mfCapturedApiUrls) return;
  window.__mfCapturedApiUrls = [];
  const remember_url = (url) => {
    if (typeof url !== 'string') return;
    if (!url.includes('/api/') || !url.includes('vrf=')) return;
    if (!window.__mfCapturedApiUrls.includes(url)) {
      window.__mfCapturedApiUrls.push(url);
    }
  };
  const original_fetch = window.fetch;
  if (typeof original_fetch === 'function') {
    window.fetch = function(input, init) {
      remember_url(typeof input === 'string' ? input : (input && input.url));
      return original_fetch.apply(this, arguments);
    };
  }
  const original_open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    remember_url(url);
    return original_open.apply(this, arguments);
  };
})();
`;

function buildMangaFireChaptersScrapeScript(hid) {
  return `(async () => {
    ${MANGAFIRE_API_CAPTURE_SCRIPT}
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const hid_id = ${JSON.stringify(hid)};
    const chapters_re = new RegExp('/api/titles/' + hid_id + '/chapters\\\\?');
    const seen_api_urls = new Set();
    const seen_ids = new Set();
    const items = [];

    const hook_urls = Array.isArray(window.__mfCapturedApiUrls) ? window.__mfCapturedApiUrls : [];
    const collect_matching_api_urls = (pattern) => {
      const found = [];
      const seen = new Set();
      const consider = (url) => {
        if (!url || typeof url !== 'string') return;
        if (!pattern.test(url) || !url.includes('vrf=') || seen.has(url)) return;
        seen.add(url);
        found.push(url);
      };
      for (const url of hook_urls) consider(url);
      if (Array.isArray(window.__mfCapturedApiUrls)) {
        for (const url of window.__mfCapturedApiUrls) consider(url);
      }
      for (const entry of performance.getEntriesByType('resource')) consider(entry.name);
      return found;
    };

    const merge_meta = (current_meta, next_meta) => {
      if (!next_meta || typeof next_meta !== 'object') {
        return current_meta && typeof current_meta === 'object' ? current_meta : {};
      }
      const base = current_meta && typeof current_meta === 'object' ? current_meta : {};
      const merged = { ...base, ...next_meta };
      const base_total = Number(base.total);
      const next_total = Number(next_meta.total);
      if (Number.isFinite(base_total) && Number.isFinite(next_total)) {
        merged.total = Math.max(base_total, next_total);
      }
      const base_last_page = Number(base.lastPage);
      const next_last_page = Number(next_meta.lastPage);
      if (Number.isFinite(base_last_page) && Number.isFinite(next_last_page)) {
        merged.lastPage = Math.max(base_last_page, next_last_page);
      }
      return merged;
    };

    const simulate_click = (element) => {
      if (!element) return false;
      try {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_) {}
      try {
        element.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
        );
      } catch (_) {
        element.click();
      }
      return true;
    };

    const read_active_chapter_page = () => {
      const active_page_btn = document.querySelector('.npager__num.is-active');
      const current_page = active_page_btn
        ? parseInt(String(active_page_btn.textContent || '').trim(), 10)
        : NaN;
      return Number.isFinite(current_page) ? current_page : 1;
    };

    const go_to_chapter_page_number = (target_page) => {
      if (read_active_chapter_page() === target_page) return true;
      const first_nav = document.querySelector('.npager__nav[aria-label="First page"]');
      if (target_page === 1 && first_nav && !first_nav.disabled) {
        return simulate_click(first_nav);
      }
      const page_btn = Array.from(document.querySelectorAll('.npager__num')).find((btn) => {
        const page_number = parseInt(String(btn.textContent || '').trim(), 10);
        return Number.isFinite(page_number) && page_number === target_page;
      });
      if (!page_btn || page_btn.disabled || page_btn.getAttribute('aria-disabled') === 'true') {
        return false;
      }
      return simulate_click(page_btn);
    };

    const wait_for_new_chapter_api_urls = async () => {
      for (let w = 0; w < ${CATALOG_PAGINATION_WAIT_ATTEMPTS}; w++) {
        const fresh_urls = collect_matching_api_urls(chapters_re).filter(
          (url) => !seen_api_urls.has(url),
        );
        if (fresh_urls.length) return fresh_urls;
        await sleep(${CATALOG_API_POLL_DELAY_MS});
      }
      return [];
    };

    const click_chapter_next_page = () => {
      const next_btn =
        document.querySelector('.npager__nav[aria-label="Next page"]') ||
        document.querySelector('nav.npager [aria-label="Next page"]') ||
        document.querySelector('[aria-label="Next page"]') ||
        document.querySelector('[aria-label="Trang sau"]') ||
        document.querySelector('.pagination .next:not(.disabled) a') ||
        document.querySelector('.pagination li.next:not(.disabled) a') ||
        document.querySelector('button[aria-label="Next page"]');
      if (next_btn && !next_btn.disabled && next_btn.getAttribute('aria-disabled') !== 'true') {
        return simulate_click(next_btn);
      }
      const current_page = read_active_chapter_page();
      return go_to_chapter_page_number(current_page + 1);
    };

    const has_enabled_next_chapter_page = () => {
      const next_btn = document.querySelector('.npager__nav[aria-label="Next page"]');
      return !!(
        next_btn &&
        !next_btn.disabled &&
        next_btn.getAttribute('aria-disabled') !== 'true'
      );
    };

    const read_catalog_total = () => {
      const total_value = meta && meta.total;
      return Number.isFinite(total_value) ? Number(total_value) : 0;
    };

    const catalog_looks_incomplete = () => {
      const expected_total = read_catalog_total();
      return expected_total > 0 && items.length < expected_total;
    };

    const read_catalog_last_page = () => {
      const last_page = meta && Number.isFinite(meta.lastPage) ? Number(meta.lastPage) : 0;
      return last_page > 0 ? last_page : 0;
    };

    const read_pagination_guard_limit = () => {
      const last_page = read_catalog_last_page();
      const total = read_catalog_total();
      const estimated_pages = total > 0 ? Math.ceil(total / 10) : 0;
      return Math.max(
        ${CATALOG_PAGINATION_MIN_GUARD},
        last_page + 20,
        estimated_pages + 20,
      );
    };

    const sweep_chapter_pages_from_start = async () => {
      if (!catalog_looks_incomplete()) return;
      if (go_to_chapter_page_number(1)) {
        await sleep(${CATALOG_API_POLL_DELAY_MS});
        await ingest_after_page_navigation();
      }
      let sweep_guard = 0;
      const sweep_limit = read_pagination_guard_limit();
      while (catalog_looks_incomplete() && sweep_guard++ < sweep_limit) {
        const before_count = items.length;
        if (!click_chapter_next_page()) {
          if (go_to_last_chapter_page()) {
            await sleep(${CATALOG_API_POLL_DELAY_MS});
            await ingest_after_page_navigation();
          }
          break;
        }
        await sleep(${CATALOG_API_POLL_DELAY_MS});
        await ingest_after_page_navigation();
        if (
          items.length <= before_count &&
          !meta.hasNext &&
          !has_enabled_next_chapter_page()
        ) {
          break;
        }
      }
    };

    const ingest_api_urls = async (api_urls) => {
      let page_meta = {};
      for (const api_url of api_urls) {
        if (seen_api_urls.has(api_url)) continue;
        try {
          const res = await fetch(api_url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) continue;
          seen_api_urls.add(api_url);
          const json = await res.json();
          for (const item of json.items || []) {
            if (!item || item.id == null || seen_ids.has(item.id)) continue;
            seen_ids.add(item.id);
            items.push({ id: item.id, number: item.number, name: item.name || '' });
          }
          page_meta = merge_meta(page_meta, json.meta || {});
        } catch (_) {}
      }
      return page_meta;
    };

    const ingest_unseen_chapter_api_urls = async () => {
      const unseen_urls = collect_matching_api_urls(chapters_re).filter(
        (url) => !seen_api_urls.has(url),
      );
      if (!unseen_urls.length) return;
      meta = merge_meta(meta, await ingest_api_urls(unseen_urls));
    };

    const go_to_last_chapter_page = () => {
      const last_nav =
        document.querySelector('.npager__nav[aria-label="Last page"]') ||
        document.querySelector('[aria-label="Last page"]');
      if (
        last_nav &&
        !last_nav.disabled &&
        last_nav.getAttribute('aria-disabled') !== 'true'
      ) {
        return simulate_click(last_nav);
      }
      const last_page_number =
        meta && Number.isFinite(meta.lastPage) ? Number(meta.lastPage) : 0;
      if (last_page_number > 0) {
        return go_to_chapter_page_number(last_page_number);
      }
      return false;
    };

    const ingest_after_page_navigation = async () => {
      const fresh_urls = await wait_for_new_chapter_api_urls();
      if (fresh_urls.length) {
        meta = merge_meta(meta, await ingest_api_urls(fresh_urls));
      }
      await ingest_unseen_chapter_api_urls();
    };

    let meta = {};
    meta = merge_meta(meta, await ingest_api_urls(collect_matching_api_urls(chapters_re)));
    for (let i = 0; i < ${CATALOG_API_POLL_MAX_ATTEMPTS}; i++) {
      if (items.length) break;
      await sleep(${CATALOG_API_POLL_DELAY_MS});
      meta = merge_meta(meta, await ingest_api_urls(collect_matching_api_urls(chapters_re)));
    }

    if (document.querySelector('.npager__num, .npager__nav[aria-label="Next page"]')) {
      const navigated_to_first = go_to_chapter_page_number(1);
      if (navigated_to_first) {
        await sleep(${CATALOG_API_POLL_DELAY_MS});
      }
      const page_one_urls = await wait_for_new_chapter_api_urls();
      meta = merge_meta(meta, await ingest_api_urls(page_one_urls));
      meta = merge_meta(
        meta,
        await ingest_api_urls(
          collect_matching_api_urls(chapters_re).filter((url) => !seen_api_urls.has(url)),
        ),
      );
    }

    let guard = 0;
    while (
      (meta.hasNext || has_enabled_next_chapter_page() || catalog_looks_incomplete()) &&
      guard++ < read_pagination_guard_limit()
    ) {
      const before_items = items.length;
      if (!click_chapter_next_page()) {
        if (catalog_looks_incomplete() && go_to_last_chapter_page()) {
          await sleep(${CATALOG_API_POLL_DELAY_MS});
          await ingest_after_page_navigation();
        }
        break;
      }

      const fresh_urls = await wait_for_new_chapter_api_urls();
      if (!fresh_urls.length) {
        if (catalog_looks_incomplete() && go_to_last_chapter_page()) {
          await sleep(${CATALOG_API_POLL_DELAY_MS});
          await ingest_after_page_navigation();
        }
        break;
      }

      meta = merge_meta(meta, await ingest_api_urls(fresh_urls));
      if (
        items.length <= before_items &&
        !meta.hasNext &&
        !has_enabled_next_chapter_page() &&
        !catalog_looks_incomplete()
      ) {
        break;
      }
    }

    if (catalog_looks_incomplete()) {
      if (go_to_last_chapter_page()) {
        await sleep(${CATALOG_API_POLL_DELAY_MS});
        await ingest_after_page_navigation();
      }
      await sweep_chapter_pages_from_start();
    }

    if (!items.length) {
      document
        .querySelectorAll(
          '.title-detail__list a[href*="/chapter/"], .title-detail__row-link[href*="/chapter/"], a[href*="/chapter/"]',
        )
        .forEach((anchor) => {
          const href = anchor.href || '';
          const id_match = href.match(/\\/chapter\\/(\\d+)/);
          if (!id_match) return;
          const chapter_id = Number(id_match[1]);
          if (seen_ids.has(chapter_id)) return;
          seen_ids.add(chapter_id);
          const text = (anchor.textContent || '').replace(/\\s+/g, ' ').trim();
          items.push({ id: chapter_id, number: text, name: text });
        });
    }

    const title_el = document.querySelector('h1, .title-detail__title, .title');
    const title = title_el ? title_el.textContent.trim().split('\\n')[0] : '';
    let cover = '';
    const cover_el = Array.from(document.querySelectorAll('img')).find(
      (img) =>
        (img.src || '').includes('mfcdn') &&
        !String(img.className).includes('banner') &&
        !(img.src || '').includes('logo'),
    );
    if (cover_el) cover = cover_el.src;

    return { title, cover, items };
  })()`;
}

// ─── High-level functions (browser-based) ─────────────────────────────────────

async function fetchMangaPage(url, options = {}) {
  try {
    const hid = extractMangaHid(url);
    if (!hid) {
      return { ok: false, error: `Cannot extract manga ID from URL: ${url}` };
    }

    const page_url = url.includes('/title/')
      ? url
      : `${SITE_BASE}/manga/${url.split('/manga/').pop() || url.split('/read/').pop() || ''}`;

    return runMangaFireBrowserWindow(
      page_url,
      { timeout: 300000, waitAfterLoad: 1500, ...options },
      async (win) => {
        const payload = await win.webContents.executeJavaScript(
          buildMangaFireChaptersScrapeScript(hid),
        );
        const title = payload && payload.title ? String(payload.title).trim() : '';
        if (!title || isMangaFireChallengeTitle(title)) {
          return { ok: false, error: 'Cloudflare chặn trang trong BrowserWindow.' };
        }
        const items = (payload && payload.items) || [];
        if (!items.length) {
          return { ok: false, error: 'Không tìm thấy danh sách chương.', title };
        }
        const title_path = buildMangaFireTitlePath(win.webContents.getURL() || page_url, hid);
        const chapters = items.map((item) => {
          const chapter_id = String(item.id);
          const chapter_number =
            item.number != null && String(item.number).trim() !== ''
              ? String(item.number)
              : '';
          const chapter_name = item.name ? String(item.name).trim() : '';
          const display_title = chapter_number
            ? `Ch. ${chapter_number}${chapter_name ? ' ' + chapter_name : ''}`
            : chapter_name || `Chapter ${chapter_id}`;
          return {
            url: `${SITE_BASE}/title/${title_path}/chapter/${chapter_id}`,
            title: display_title,
            chapterNumber: chapter_number,
            numericChapterId: chapter_id,
          };
        });
        return {
          ok: true,
          manga: {
            title,
            coverUrl: (payload && payload.cover) || '',
            mangaUrl: url,
            mangaId: hid,
            siteId: 'mangafire',
            sourceLabel: 'MangaFire',
          },
          chapters,
        };
      },
    );
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function fetchChapterPage(chapterUrl, options = {}) {
  const numeric_id = extractNumericChapterId(chapterUrl);
  if (!numeric_id) {
    throw new Error(`Cannot extract chapter ID from URL: ${chapterUrl}`);
  }

  const result = await runMangaFireBrowserWindow(
    chapterUrl,
    { timeout: 120000, waitAfterLoad: 0, ...options },
    async (win) => {
      const payload = await win.webContents.executeJavaScript(
        `(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const chapter_id = ${JSON.stringify(numeric_id)};
          const api_re = new RegExp('/api/chapters/' + chapter_id + '\\\\?vrf=');
          let api_url = '';
          for (let i = 0; i < 80; i++) {
            const page_title = document.title || '';
            if (/just a moment|attention required|checking your browser/i.test(page_title)) {
              await sleep(500);
              continue;
            }
            const resource_entry = performance.getEntriesByType('resource').find((entry) =>
              api_re.test(entry.name),
            );
            if (resource_entry) {
              api_url = resource_entry.name;
              break;
            }
            await sleep(250);
          }
          if (api_url) {
            const res = await fetch(api_url, {
              credentials: 'include',
              headers: { Accept: 'application/json' },
            });
            const json = await res.json();
            const pages = (json && json.data && json.data.pages) || [];
            const urls = pages.map((page) => page && page.url).filter(Boolean);
            if (urls.length) return { urls };
          }
          const urls = [];
          document.querySelectorAll('img.reader-img, img.reader-swiper__img, img').forEach((img) => {
            const src = img.src || img.dataset.src || '';
            if (
              src &&
              !src.includes('logo') &&
              !src.includes('favicon') &&
              !src.startsWith('data:') &&
              !src.includes('/assets/') &&
              (src.includes('mfcdn') || img.naturalWidth > 200)
            ) {
              urls.push(src);
            }
          });
          return { urls };
        })()`,
      );
      const urls = (payload && payload.urls) || [];
      if (!urls.length) {
        return { ok: false, error: 'No images found in chapter' };
      }
      return {
        ok: true,
        images: urls.map((image_url) => ({
          imageUrl: image_url,
          ext: inferImageExt(image_url),
        })),
      };
    },
  );

  if (!result.ok || !result.images || !result.images.length) {
    throw new Error(result.error || 'No images found in chapter');
  }
  return result.images;
}

// ─── API Client class ─────────────────────────────────────────────────────────

class MangaFireApiClient {
  async load(url, options = {}) {
    return fetchMangaPage(url, options);
  }

  async fetchChapterImages(chapterUrl) {
    return fetchChapterPage(chapterUrl);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  MangaFireApiClient,
  IMG_REFERER,
  extractMangaHid,
  extractNumericChapterId,
  inferImageExt,
  fetchMangaPage,
  fetchChapterPage,
  buildMangaFireChaptersScrapeScript,
  MANGAFIRE_API_CAPTURE_SCRIPT,
};
