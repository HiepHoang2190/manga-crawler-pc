/**
 * Hidden BrowserWindow + Chrome DevTools Protocol (CDP) Network Sniffer
 * for analyzing SPA sites (React/Vue/Next.js) and dynamic chapter pagination.
 */

const { validatePublicHttpUrl } = require('./pluginTemplates');

const DEFAULT_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ANALYTICS_DOMAIN_RE =
  /(?:google-analytics|googletagmanager|doubleclick|googlesyndication|facebook\.net|connect\.facebook|clarity\.ms|hotjar|sentry\.io|cloudflareinsights|histats)/i;

const MAX_API_RESPONSES = 40;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

function withTimeout(promise, ms, fallbackValue) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallbackValue), ms);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function resolveBrowserWindowClass(explicitClass) {
  if (explicitClass) return explicitClass;
  try {
    return require('electron')?.BrowserWindow || null;
  } catch {
    return null;
  }
}

/**
 * Render a page in an ephemeral hidden BrowserWindow and capture JSON XHR/Fetch responses + DOM state.
 * @param {string} url
 * @param {{ mode?: 'manga'|'chapter', cookie?: string, timeoutMs?: number, waitAfterLoadMs?: number, BrowserWindowClass?: Function }} [options]
 */
async function sniffPageWithBrowser(url, options = {}) {
  const urlCheck = validatePublicHttpUrl(url);
  if (!urlCheck.ok) {
    return { ok: false, error: urlCheck.error };
  }

  const BrowserWindow = resolveBrowserWindowClass(options.BrowserWindowClass);
  if (!BrowserWindow) {
    return { ok: false, error: 'BrowserWindow unavailable in current runtime' };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12000;
  const waitAfterLoadMs = Number.isFinite(options.waitAfterLoadMs) ? options.waitAfterLoadMs : 1200;
  const mode = options.mode === 'chapter' ? 'chapter' : 'manga';

  const partition = `plugin-sniff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let win = null;

  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: true,
        backgroundThrottling: false,
      },
    });

    const wc = win.webContents;
    if (typeof wc.setUserAgent === 'function') {
      wc.setUserAgent(options.userAgent || DEFAULT_USER_AGENT);
    }
    if (typeof wc.setWindowOpenHandler === 'function') {
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
    if (typeof wc.on === 'function') {
      wc.on('will-navigate', (event, targetUrl) => {
        if (/^about:blank$/i.test(String(targetUrl || ''))) return;
        const navCheck = validatePublicHttpUrl(targetUrl);
        if (!navCheck.ok && typeof event?.preventDefault === 'function') {
          event.preventDefault();
        }
      });
    }

    // SSRF network guard on all sub-requests / redirects / non-HTTP schemes (e.g. file://)
    if (wc.session?.webRequest?.onBeforeRequest) {
      wc.session.webRequest.onBeforeRequest((details, callback) => {
        const reqUrl = String(details?.url || '');
        if (/^(?:data:|blob:|about:|devtools:|chrome-error:)/i.test(reqUrl)) {
          callback({ cancel: false });
          return;
        }
        const check = validatePublicHttpUrl(reqUrl);
        callback({ cancel: !check.ok });
      });
    }

    // Inject optional cookie (guarded by timeout)
    if (options.cookie && wc.session?.cookies?.set) {
      const cookieUrl = `${urlCheck.parsed.protocol}//${urlCheck.parsed.host}`;
      for (const pair of String(options.cookie).split(';')) {
        const idx = pair.indexOf('=');
        if (idx <= 0) continue;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (!name) continue;
        await withTimeout(
          Promise.resolve(wc.session.cookies.set({ url: cookieUrl, name, value })).catch(() => {}),
          Math.min(2000, timeoutMs),
          null,
        );
      }
    }

    // Pre-warm the hidden BrowserWindow on about:blank so Chromium spawns a renderer target
    // BEFORE attaching/enabling CDP Network (Electron 34 deadlocks Network.enable otherwise).
    if (typeof wc.loadURL === 'function') {
      await withTimeout(
        Promise.resolve(wc.loadURL('about:blank')).catch(() => {}),
        Math.min(2000, timeoutMs),
        null,
      );
    }

    const pendingMeta = new Map();
    const apiResponses = [];
    const seenBodies = [];

    if (wc.debugger) {
      try {
        wc.debugger.attach('1.3');
      } catch {
        /* ignore attach failure in mocks */
      }
      wc.debugger.on('message', (_event, method, params) => {
        if (method === 'Network.responseReceived') {
          const res = params?.response;
          const resUrl = String(res?.url || '');
          const mime = String(res?.mimeType || '').toLowerCase();
          const rType = String(params?.type || '');
          if (
            res?.status >= 200 &&
            res?.status < 400 &&
            !ANALYTICS_DOMAIN_RE.test(resUrl) &&
            (mime.includes('json') || ((rType === 'XHR' || rType === 'Fetch') && !mime.includes('html'))) &&
            apiResponses.length < MAX_API_RESPONSES
          ) {
            pendingMeta.set(params.requestId, {
              url: resUrl,
              status: res.status,
              mimeType: mime,
              method: res?.requestHeaders?.[':method'] || 'GET',
            });
          }
        } else if (method === 'Network.loadingFailed') {
          pendingMeta.delete(params?.requestId);
        } else if (method === 'Network.loadingFinished') {
          const meta = pendingMeta.get(params?.requestId);
          if (!meta) return;
          pendingMeta.delete(params.requestId);
          const p = wc.debugger
            .sendCommand('Network.getResponseBody', { requestId: params.requestId })
            .then((bodyRes) => {
              const raw = bodyRes?.base64Encoded
                ? Buffer.from(bodyRes.body || '', 'base64').toString('utf8')
                : String(bodyRes?.body || '');
              if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return;
              const trimmed = raw.trim();
              if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === 'object' && apiResponses.length < MAX_API_RESPONSES) {
                apiResponses.push({
                  url: meta.url,
                  status: meta.status,
                  method: meta.method,
                  json: parsed,
                });
              }
            })
            .catch(() => {});
          seenBodies.push(p);
        }
      });
      await withTimeout(
        Promise.resolve(wc.debugger.sendCommand('Network.enable', {})).catch(() => {}),
        Math.min(2500, timeoutMs),
        null,
      );
    }

    let loadTimer = null;
    try {
      await Promise.race([
        wc.loadURL(url),
        new Promise((_, reject) => {
          loadTimer = setTimeout(
            () => reject(new Error(`Browser sniffer timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
          if (typeof loadTimer.unref === 'function') loadTimer.unref();
        }),
      ]);
    } finally {
      if (loadTimer) clearTimeout(loadTimer);
    }

    if (waitAfterLoadMs > 0) {
      await sleep(waitAfterLoadMs);
    }

    // In manga mode, optionally click a page-2 / load-more pagination button to reveal page-2 API params
    if (mode === 'manga' && typeof wc.executeJavaScript === 'function') {
      try {
        const clicked = await withTimeout(
          wc.executeJavaScript(`(() => {
            /* __SNIFF_CLICK_NEXT__ */
            const candidates = Array.from(document.querySelectorAll('.pagination a, .pagination button, .page-numbers a, [class*="pag"] a, button'));
            const target = candidates.find((el) => {
              const txt = (el.textContent || '').trim();
              return txt === '2' || /^(next|tiếp|sau|load more|xem thêm)$/i.test(txt);
            });
            if (target) { target.click(); return true; }
            return false;
          })()`),
          Math.min(4000, timeoutMs),
          false,
        );
        if (clicked && waitAfterLoadMs > 0) {
          await sleep(Math.min(1000, waitAfterLoadMs));
        }
      } catch {
        /* ignore click probe error */
      }
    }

    await withTimeout(Promise.allSettled(seenBodies), Math.min(4000, timeoutMs), []);

    let domState = { html: '', links: [], images: [] };
    if (typeof wc.executeJavaScript === 'function') {
      try {
        const extracted = await withTimeout(
          wc.executeJavaScript(`(() => {
            const html = document.documentElement ? document.documentElement.outerHTML : '';
            const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map((a) => ({
              text: (a.textContent || '').trim(),
              href: a.href || a.getAttribute('href') || ''
            }));
            const images = Array.from(document.querySelectorAll('img')).slice(0, 300).map((img) =>
              img.currentSrc || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('data-src') || img.src || ''
            ).filter(Boolean);
            return { html, links, images };
          })()`),
          Math.min(4000, timeoutMs),
          null,
        );
        if (extracted && typeof extracted === 'object') {
          domState = extracted;
        }
      } catch {
        /* ignore DOM extraction error */
      }
    }

    return {
      ok: true,
      renderedHtml: String(domState.html || ''),
      renderedLinks: Array.isArray(domState.links) ? domState.links : [],
      renderedImages: Array.isArray(domState.images) ? domState.images : [],
      apiResponses,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err),
      apiResponses: [],
      renderedHtml: '',
      renderedLinks: [],
      renderedImages: [],
    };
  } finally {
    if (win) {
      const wc = win.webContents;
      try {
        if (wc?.debugger?.isAttached?.()) {
          wc.debugger.detach();
        }
      } catch {
        /* ignore detach failure */
      }
      try {
        await withTimeout(
          Promise.resolve(wc?.session?.clearStorageData?.()).catch(() => {}),
          2000,
          null,
        );
      } catch {
        /* ignore cleanup failure */
      }
      try {
        if (!win.isDestroyed()) {
          win.destroy();
        }
      } catch {
        /* ignore destroy failure */
      }
    }
  }
}

module.exports = {
  sniffPageWithBrowser,
};
