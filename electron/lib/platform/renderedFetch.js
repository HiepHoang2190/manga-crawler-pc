/**
 * Rendered Fetch Utility
 *
 * Uses Electron's BrowserWindow to fetch and render JavaScript-heavy pages.
 * Waits out Cloudflare challenges before returning content.
 */

const { BrowserWindow, app } = require('electron');

const DEFAULT_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getBrowserUserAgent() {
  try {
    return app?.userAgentFallback || DEFAULT_USER_AGENT;
  } catch {
    return DEFAULT_USER_AGENT;
  }
}

const BROWSER_USER_AGENT = DEFAULT_USER_AGENT;

function isChallengeTitle(title) {
  if (!title || typeof title !== 'string') return true;
  return /just a moment|attention required|checking your browser|please wait|security verification|performing security verification|正在验证浏览器|浏览器访问验证/i.test(
    title,
  );
}

/**
 * Detect Cloudflare challenge pages in a loaded BrowserWindow.
 * @param {import('electron').WebContents} web_contents
 * @returns {Promise<boolean>}
 */
async function isCloudflareChallengePage(web_contents) {
  let page_title = '';
  try {
    page_title = await web_contents.executeJavaScript('document.title');
  } catch {
    /* ignore */
  }

  if (isChallengeTitle(page_title)) return true;

  try {
    return await web_contents.executeJavaScript(`
      (() => {
        const html = document.documentElement.innerHTML || '';
        const title = document.title || '';
        const body_text = (document.body && document.body.innerText) || '';
        if (html.includes('cf-browser-verification')) return true;
        if (/cf_chl_/i.test(html) && /just a moment|checking your browser|please wait|security verification/i.test(title)) {
          return true;
        }
        if (html.includes('gatekeeper_challenge') || html.includes('gatekeeperChallenge')) return true;
        if (document.body && document.body.getAttribute('data-state') === 'checking') return true;
        if (html.includes('Sorry, you have been blocked')) return true;
        if (/performing security verification/i.test(body_text) && body_text.trim().length < 800) return true;
        return false;
      })()
    `);
  } catch {
    return false;
  }
}

/**
 * Load a URL in a hidden BrowserWindow and run callback when real content is ready.
 * @param {string} page_url
 * @param {(webContents: import('electron').WebContents) => Promise<any>} on_ready
 * @param {object} [options]
 * @param {number} [options.timeout=90000]
 * @param {number} [options.waitAfterLoad=2000]
 * @param {string} [options.cookie]
 * @param {string} [options.userAgent]
 * @returns {Promise<any>}
 */
async function runBrowserWindow(page_url, on_ready, options = {}) {
  const timeout_ms = options.timeout || 90000;
  const wait_after_load_ms = options.waitAfterLoad ?? 2000;

  return new Promise((resolve, reject) => {
    let win = null;
    let settled = false;
    let timeout_id = null;

    const finish = (result, is_error = false) => {
      if (settled) return;
      settled = true;
      if (timeout_id) clearTimeout(timeout_id);
      if (win && !win.isDestroyed()) {
        try {
          win.destroy();
        } catch {
          /* ignore */
        }
      }
      if (is_error) reject(result);
      else resolve(result);
    };

    timeout_id = setTimeout(() => {
      finish(new Error(`Timeout after ${timeout_ms}ms`), true);
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
        },
      });

      const ua = options.userAgent || getBrowserUserAgent();
      win.webContents.setUserAgent(ua);

      win.webContents.on('did-fail-load', (_event, error_code, error_description) => {
        // -3 = aborted navigation during Cloudflare redirects
        if (error_code === -3) return;
        finish(new Error(`Failed to load: ${error_description} (${error_code})`), true);
      });

      win.webContents.on('did-finish-load', async () => {
        if (settled) return;

        try {
          const is_challenge = await isCloudflareChallengePage(win.webContents);
          if (is_challenge) return;

          await new Promise((r) => setTimeout(r, wait_after_load_ms));
          if (settled) return;

          const result = await on_ready(win.webContents);
          finish(result);
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)), true);
        }
      });

      const setupCookiesAndLoad = async () => {
        if (options.cookie && win?.webContents?.session?.cookies) {
          try {
            const cookiePairs = String(options.cookie)
              .split(';')
              .map((s) => s.trim())
              .filter(Boolean);
            const parsedUrl = new URL(page_url);
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
          } catch {
            /* ignore */
          }
        }
        if (!settled && win && !win.isDestroyed()) {
          win.loadURL(page_url);
        }
      };

      setupCookiesAndLoad().catch((err) => {
        finish(err instanceof Error ? err : new Error(String(err)), true);
      });
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)), true);
    }
  });
}

/**
 * Fetch a URL and return the rendered HTML after JavaScript execution.
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeout=90000]
 * @param {number} [options.waitAfterLoad=2000]
 * @returns {Promise<string>}
 */
async function fetchRenderedHtml(url, options = {}) {
  return runBrowserWindow(
    url,
    async (web_contents) => web_contents.executeJavaScript('document.documentElement.outerHTML'),
    options,
  );
}

/**
 * Fetch a URL and execute JavaScript to extract data.
 * @param {string} url
 * @param {string} script
 * @param {object} [options]
 * @returns {Promise<any>}
 */
async function fetchAndExecute(url, script, options = {}) {
  return runBrowserWindow(url, async (web_contents) => web_contents.executeJavaScript(script), options);
}

module.exports = {
  BROWSER_USER_AGENT,
  isChallengeTitle,
  isCloudflareChallengePage,
  runBrowserWindow,
  fetchRenderedHtml,
  fetchAndExecute,
};
