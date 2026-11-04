const { BrowserWindow, session } = require('electron');

const hooked_cookie_sessions = new WeakSet();
const POISONED_GOOGLE_COOKIE_NAMES = new Set(['__Host-GAPS', 'OTZ', 'NID']);

function genuineElectronUserAgent(baseUa) {
  const electron_version = (process.versions && process.versions.electron) || '0.0.0';
  const electron_token = `Electron/${electron_version}`;
  let user_agent = String(baseUa || '').replace(/manga-crawler\/\S+\s?/g, '');
  if (!/Electron\/\S+/.test(user_agent)) {
    if (user_agent.includes('Safari/')) {
      user_agent = user_agent.replace('Safari/', `${electron_token} Safari/`);
    } else if (user_agent) {
      user_agent = `${user_agent} ${electron_token}`;
    } else {
      user_agent = electron_token;
    }
  }
  return user_agent.replace(/\s{2,}/g, ' ').trim();
}

function isGoogleSignInUrl(pageUrl) {
  let hostname = '';
  try {
    hostname = new URL(String(pageUrl || '')).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!hostname) return false;
  if (hostname === 'google.com' || hostname.endsWith('.google.com')) return true;
  if (hostname.startsWith('accounts.google.')) return true;
  if (hostname === 'gstatic.com' || hostname.endsWith('.gstatic.com')) return true;
  if (hostname === 'googleapis.com' || hostname.endsWith('.googleapis.com')) return true;
  if (hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com')) return true;
  return false;
}

function applyCookiePopupRequestHeaders(headers, pageUrl, { chromeUa, electronUa } = {}) {
  const next_headers = { ...(headers || {}) };
  if (isGoogleSignInUrl(pageUrl)) {
    if (electronUa) next_headers['User-Agent'] = electronUa;
    return next_headers;
  }
  if (chromeUa) next_headers['User-Agent'] = chromeUa;
  return next_headers;
}

function isGoogleSignInRejectionUrl(pageUrl) {
  const url_text = String(pageUrl || '');
  return url_text.includes('signin/rejected') || url_text.includes('rrk=46');
}

async function clearRejectedGoogleAuthCookies(popupSession) {
  if (!popupSession || !popupSession.cookies || typeof popupSession.cookies.get !== 'function') return;
  const domains = ['google.com', 'accounts.google.com'];
  for (const domain of domains) {
    let cookie_rows = [];
    try {
      cookie_rows = await popupSession.cookies.get({ domain });
    } catch {
      continue;
    }
    for (const cookie_row of cookie_rows || []) {
      const cookie_name = cookie_row && cookie_row.name;
      if (!POISONED_GOOGLE_COOKIE_NAMES.has(String(cookie_name || ''))) continue;
      if (typeof popupSession.cookies.remove !== 'function') continue;
      const host = String((cookie_row && cookie_row.domain) || domain).replace(/^\./, '');
      const scheme = cookie_row && cookie_row.secure ? 'https://' : 'http://';
      const cookie_path = (cookie_row && cookie_row.path) || '/';
      try {
        await popupSession.cookies.remove(`${scheme}${host}${cookie_path}`, cookie_name);
      } catch {
        /* ignore */
      }
    }
  }
}

function cookiePopupSession() {
  if (session && typeof session.fromPartition === 'function') {
    return session.fromPartition('persist:site-login');
  }
  return session.defaultSession;
}

function cookiePopupWebPreferences(popupSession) {
  const web_preferences = {
    nodeIntegration: false,
    contextIsolation: true,
  };
  if (popupSession) web_preferences.session = popupSession;
  return web_preferences;
}

function ensureCookiePopupHeaderHook(popupSession) {
  if (!popupSession || !popupSession.webRequest || typeof popupSession.webRequest.onBeforeSendHeaders !== 'function') {
    return;
  }
  if (hooked_cookie_sessions.has(popupSession)) return;
  hooked_cookie_sessions.add(popupSession);
  popupSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const next_headers = applyCookiePopupRequestHeaders(details.requestHeaders, details.url, {
      chromeUa: popupSession.cookiePopupChromeUa,
      electronUa: genuineElectronUserAgent(popupSession.cookiePopupChromeUa),
    });
    callback({ cancel: false, requestHeaders: next_headers });
  });
}

/**
 * Detect signed-in DOM. Must stay closure-free so it can be injected via toString().
 * ComicVN uses is_login / logout links; Comix.to uses .usermenu (no href=logout).
 */
function detectLoginFromDocument(doc) {
  try {
    if (!doc || typeof doc.querySelector !== 'function') return false;
    const is_login = doc.querySelector('input[name="is_login"]');
    if (is_login) {
      const parsed = parseInt(String(is_login.value || '').trim(), 10);
      if (parsed === 1) return true;
    }
    if (doc.querySelector('a[href*="logout"], a[href*="dang-xuat"], a[href*="process_logout"], .btn-logout, .button_logout, .user-logged')) {
      return true;
    }
    if (doc.querySelector('.usermenu, .usermenu__btn, .usermenu__item--signout')) {
      return true;
    }
    if (doc.querySelector('img[src*="/chapter/"], img[src*="static?token="]')) {
      return true;
    }
    if (doc.querySelector('h4 .btn-login, .btn-login')) {
      const has_wall = Array.from(doc.querySelectorAll('h4')).some((el) =>
        /đăng nhập|login/i.test(el.textContent || ''),
      );
      if (has_wall) return false;
    }
    return false;
  } catch {
    return false;
  }
}

const LOGIN_DETECT_JS = `(() => (${detectLoginFromDocument.toString()})(document))()`;

function cookiesIndicateLogin(cookies) {
  return (cookies || []).some((cookie_row) => {
    const cookie_name = String(cookie_row && cookie_row.name ? cookie_row.name : '');
    if (/^remember_web_/i.test(cookie_name)) return true;
    if (/^remember_me$/i.test(cookie_name)) return true;
    return false;
  });
}

const READY_BANNER_JS = `(() => {
  try {
    if (document.getElementById('crawler-cookie-ready-banner')) return true;
    const bar = document.createElement('div');
    bar.id = 'crawler-cookie-ready-banner';
    bar.setAttribute('role', 'status');
    bar.textContent = 'Đã đăng nhập — có thể đóng cửa sổ này để lưu cookie vào app.';
    bar.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:2147483647',
      'background:#0f766e',
      'color:#fff',
      'padding:14px 16px',
      'text-align:center',
      'font:600 14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,.25)',
    ].join(';');
    (document.body || document.documentElement).appendChild(bar);
    return true;
  } catch (e) {
    return false;
  }
})()`;

/**
 * Mobile `resolveSiteBrowseBackAction` parity for the cookie popup.
 * @param {{ canGoBack?: boolean }} input
 * @returns {'goBack' | 'close'}
 */
function resolveCookiePopupBackAction(input = {}) {
  return input.canGoBack ? 'goBack' : 'close';
}

function webContentsCanGoBack(webContents) {
  if (!webContents) return false;
  try {
    if (
      webContents.navigationHistory &&
      typeof webContents.navigationHistory.canGoBack === 'function'
    ) {
      return Boolean(webContents.navigationHistory.canGoBack());
    }
    if (typeof webContents.canGoBack === 'function') {
      return Boolean(webContents.canGoBack());
    }
  } catch {
    return false;
  }
  return false;
}

function webContentsGoBack(webContents) {
  if (!webContentsCanGoBack(webContents)) return false;
  try {
    if (
      webContents.navigationHistory &&
      typeof webContents.navigationHistory.goBack === 'function'
    ) {
      webContents.navigationHistory.goBack();
      return true;
    }
    if (typeof webContents.goBack === 'function') {
      webContents.goBack();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isCookiePopupBackConsoleMessage(message) {
  return String(message || '').trim() === 'crawler:popup-back';
}

/**
 * Inject a fixed bottom URL bar with back + copy so users can walk history
 * and copy manga URLs while browsing inside the cookie popup.
 * @param {string} pageUrl
 * @returns {string}
 */
function buildUrlBarInjectJs(pageUrl) {
  const safe_url = JSON.stringify(String(pageUrl || ''));
  return `(() => {
    try {
      const pageUrl = ${safe_url};
      if (!pageUrl || pageUrl === 'about:blank') return false;
      let root = document.getElementById('crawler-url-bar');
      if (!root) {
        root = document.createElement('div');
        root.id = 'crawler-url-bar';
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'URL trang hiện tại');
        root.style.cssText = [
          'position:fixed',
          'bottom:0',
          'left:0',
          'right:0',
          'z-index:2147483646',
          'display:flex',
          'gap:8px',
          'align-items:center',
          'padding:8px 10px',
          'background:#111827',
          'color:#f9fafb',
          'font:13px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'box-shadow:0 -2px 8px rgba(0,0,0,.25)',
          'box-sizing:border-box',
        ].join(';');
        const backBtn = document.createElement('button');
        backBtn.id = 'crawler-url-bar-back';
        backBtn.type = 'button';
        backBtn.textContent = 'Quay lại';
        backBtn.setAttribute('aria-label', 'Quay lại');
        backBtn.style.cssText = [
          'flex-shrink:0',
          'border:0',
          'border-radius:6px',
          'padding:6px 12px',
          'background:#374151',
          'color:#fff',
          'font:600 12px/1.2 inherit',
          'cursor:pointer',
        ].join(';');
        backBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          console.info('crawler:popup-back');
        });
        const input = document.createElement('input');
        input.id = 'crawler-url-bar-input';
        input.type = 'text';
        input.readOnly = true;
        input.spellcheck = false;
        input.style.cssText = [
          'flex:1',
          'min-width:0',
          'border:1px solid #374151',
          'border-radius:6px',
          'padding:6px 8px',
          'background:#1f2937',
          'color:#f9fafb',
          'font:inherit',
        ].join(';');
        const btn = document.createElement('button');
        btn.id = 'crawler-url-bar-copy';
        btn.type = 'button';
        btn.textContent = 'Sao chép URL';
        btn.style.cssText = [
          'flex-shrink:0',
          'border:0',
          'border-radius:6px',
          'padding:6px 12px',
          'background:#0f766e',
          'color:#fff',
          'font:600 12px/1.2 inherit',
          'cursor:pointer',
        ].join(';');
        btn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const value = input.value || '';
          let ok = false;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(value);
              ok = true;
            }
          } catch (_) {}
          if (!ok) {
            try {
              input.focus();
              input.select();
              ok = document.execCommand('copy');
            } catch (_) {}
          }
          btn.textContent = ok ? 'Đã sao chép' : 'Sao chép lỗi';
          setTimeout(() => { btn.textContent = 'Sao chép URL'; }, 1500);
        });
        root.appendChild(backBtn);
        root.appendChild(input);
        root.appendChild(btn);
        const host = document.body || document.documentElement;
        host.appendChild(root);
        if (!document.getElementById('crawler-url-bar-spacer')) {
          const spacer = document.createElement('div');
          spacer.id = 'crawler-url-bar-spacer';
          spacer.style.cssText = 'height:48px;pointer-events:none;';
          host.appendChild(spacer);
        }
      }
      const inputEl = document.getElementById('crawler-url-bar-input');
      if (inputEl) inputEl.value = pageUrl;
      return true;
    } catch (e) {
      return false;
    }
  })()`;
}

/**
 * Collect cookies that would be sent to each URL (deduped).
 * Prefer url filter over domain-of-final-navigation so OAuth redirects
 * (e.g. Facebook) do not replace the target site session cookies.
 */
async function collectCookiesForUrls(cookieStore, urls) {
  const list = [];
  const seen = new Set();
  const host_names = new Set();

  const add_batch = (batch, source_url) => {
    let source_host = '';
    try {
      if (source_url) {
        source_host = new URL(source_url).hostname.replace(/^www\./, '').toLowerCase();
      }
    } catch {
      /* ignore */
    }
    for (const cookie_row of batch || []) {
      const cookie_copy = { ...cookie_row };
      if (!String(cookie_copy.domain || '').trim() && source_host) {
        cookie_copy.domain = source_host;
      }
      const key = `${cookie_copy.name}\n${cookie_copy.domain || ''}\n${cookie_copy.path || '/'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(cookie_copy);
    }
  };

  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    try {
      host_names.add(new URL(url).hostname.replace(/^www\./, '').toLowerCase());
    } catch {
      /* ignore */
    }
    let batch = [];
    try {
      batch = await cookieStore.get({ url });
    } catch {
      batch = [];
    }
    add_batch(batch, url);
  }

  // Cloudflare cf_clearance is often missing from get({ url }) (partitioned /
  // host-only). Fall back to get({ domain }) for host and parent domain.
  for (const host_name of host_names) {
    for (const domain_filter of [host_name, `.${host_name}`]) {
      try {
        add_batch(await cookieStore.get({ domain: domain_filter }));
      } catch {
        /* ignore */
      }
    }
  }

  return list;
}

function uniqueHttpUrls(...candidates) {
  const out = [];
  const seen = new Set();
  for (const raw of candidates) {
    const s = String(raw || '').trim();
    if (!s || !/^https?:\/\//i.test(s)) continue;
    const add = (url) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push(url);
    };
    add(s);
    try {
      const u = new URL(s);
      add(`${u.protocol}//${u.host}/`);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function filterCookiesForTargetHost(cookies, targetUrl) {
  let targetHost = '';
  try {
    targetHost = new URL(targetUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return cookies;
  }
  if (!targetHost) return cookies;
  const filtered = (cookies || []).filter((c) => {
    const d = String(c.domain || '')
      .replace(/^\./, '')
      .toLowerCase();
    // Host-only cookies may omit domain; collectCookiesForUrls stamps it from the source URL.
    if (!d) return true;
    return d === targetHost || d.endsWith(`.${targetHost}`) || targetHost.endsWith(d);
  });
  return filtered;
}

function hostsMatch(urlA, urlB) {
  try {
    const host_a = new URL(urlA).hostname.replace(/^www\./, '').toLowerCase();
    const host_b = new URL(urlB).hostname.replace(/^www\./, '').toLowerCase();
    if (!host_a || !host_b) return false;
    return host_a === host_b || host_a.endsWith(`.${host_b}`) || host_b.endsWith(`.${host_a}`);
  } catch {
    return false;
  }
}

function isCloudflareHost(requestHost) {
  const request_host = String(requestHost || '').toLowerCase();
  return request_host === 'challenges.cloudflare.com' || request_host.endsWith('.cloudflare.com');
}

function isOauthLoginHost(requestHost) {
  const request_host = String(requestHost || '').toLowerCase();
  const exact_hosts = new Set(['google.com', 'facebook.com', 'fb.com', 'appleid.apple.com']);
  if (exact_hosts.has(request_host)) return true;
  if (request_host.startsWith('accounts.google.')) return true;
  const oauth_suffixes = [
    '.google.com',
    '.googleapis.com',
    '.gstatic.com',
    '.firebaseapp.com',
    '.firebase.com',
    '.facebook.com',
  ];
  return oauth_suffixes.some((suffix) => request_host.endsWith(suffix));
}

/**
 * Keep same-site manga navigations in the cookie popup (so URL bar stays visible).
 * Allow cross-site window.open (e.g. Facebook OAuth) as a real child window.
 * @param {string} openUrl
 * @param {string} targetUrl
 * @param {string} [currentUrl]
 * @returns {boolean}
 */
function shouldKeepWindowOpenInPopup(openUrl, targetUrl, currentUrl = '') {
  const open_url = String(openUrl || '').trim();
  if (!open_url || !/^https?:\/\//i.test(open_url)) return false;
  return hostsMatch(open_url, targetUrl) || hostsMatch(open_url, currentUrl);
}

/**
 * Mobile `decideSiteWebViewWindowOpen` parity: same-site stays in parent,
 * OAuth / blank bootstrap gets a child, ad landings are cancelled.
 * @param {string} openUrl
 * @param {string} targetUrl
 * @param {string} [currentUrl]
 * @returns {'loadInParent' | 'allowChild' | 'deny'}
 */
function decideWindowOpenInPopup(openUrl, targetUrl, currentUrl = '') {
  const open_url = String(openUrl || '').trim();
  if (!open_url) return 'allowChild';
  let parsed_url;
  try {
    parsed_url = new URL(open_url);
  } catch {
    return 'deny';
  }
  const url_scheme = String(parsed_url.protocol || '')
    .replace(/:$/, '')
    .toLowerCase();
  if (url_scheme === 'about' || url_scheme === 'data' || url_scheme === 'blob') {
    return 'allowChild';
  }
  if (shouldKeepWindowOpenInPopup(open_url, targetUrl, currentUrl)) {
    return 'loadInParent';
  }
  const request_host = String(parsed_url.hostname || '').toLowerCase();
  if (isCloudflareHost(request_host)) return 'loadInParent';
  if (isOauthLoginHost(request_host)) return 'allowChild';
  return 'deny';
}

/**
 * Hidden scrape windows do not need OAuth popups — deny every window.open.
 * @param {{ setWindowOpenHandler?: Function }} webContents
 * @returns {boolean}
 */
function attachDeniedWindowOpenHandler(webContents) {
  if (!webContents || typeof webContents.setWindowOpenHandler !== 'function') {
    return false;
  }
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return true;
}

/**
 * Mobile `shouldShowSiteOauthWindowOverlay` parity: hide blank / ad children
 * until the window reaches a real Google / Facebook / Firebase host.
 * @param {string} pageUrl
 * @returns {boolean}
 */
function shouldShowOauthChildWindow(pageUrl) {
  const trimmed_url = String(pageUrl || '').trim();
  if (!trimmed_url) return false;
  let parsed_url;
  try {
    parsed_url = new URL(trimmed_url);
  } catch {
    return false;
  }
  const url_scheme = String(parsed_url.protocol || '')
    .replace(/:$/, '')
    .toLowerCase();
  if (url_scheme !== 'http' && url_scheme !== 'https') return false;
  if (!parsed_url.hostname) return false;
  return isOauthLoginHost(parsed_url.hostname.toLowerCase());
}

/**
 * Opens a popup for captcha / login. Cookies are taken from the *target* site URL
 * (not only the final navigation host). When login is detected, a banner asks the
 * user to close the window.
 *
 * @param {string} targetUrl
 * @returns {Promise<{ cookies: object[], loginDetected: boolean }>}
 */
async function openLoginPopupAndGetCookies(targetUrl) {
  const target = String(targetUrl || '').trim();
  if (!target || !/^https?:\/\//i.test(target)) {
    throw new Error('targetUrl không hợp lệ.');
  }

  return new Promise((resolve, reject) => {
    const popup_session = cookiePopupSession();
    const popup = new BrowserWindow({
      width: 1000,
      height: 800,
      show: true,
      webPreferences: cookiePopupWebPreferences(popup_session),
    });

    const { app } = require('electron');
    const defaultPlatformUa =
      process.platform === 'darwin'
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const ua = app.userAgentFallback || defaultPlatformUa;
    if (popup_session) popup_session.cookiePopupChromeUa = ua;
    ensureCookiePopupHeaderHook(popup_session);
    if (typeof popup.webContents.setUserAgent === 'function') {
      popup.webContents.setUserAgent(ua);
    }

    let settled = false;
    let loginDetected = false;
    let pollTimer = null;
    let urlBarTimer = null;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const stopUrlBarWatch = () => {
      if (urlBarTimer) {
        clearInterval(urlBarTimer);
        urlBarTimer = null;
      }
    };

    const finish = async () => {
      if (settled) return;
      settled = true;
      stopPolling();
      stopUrlBarWatch();
      try {
        let currentUrl = '';
        try {
          currentUrl = popup.webContents.getURL() || '';
        } catch {
          currentUrl = '';
        }
        if (!loginDetected) {
          try {
            loginDetected = Boolean(await popup.webContents.executeJavaScript(LOGIN_DETECT_JS, true));
          } catch {
            /* window may already be tearing down */
          }
        }
        const urls = uniqueHttpUrls(target, currentUrl);
        const cookie_store =
          (popup.webContents && popup.webContents.session && popup.webContents.session.cookies) ||
          session.defaultSession.cookies;
        const cookies = await collectCookiesForUrls(cookie_store, urls);
        const filtered_cookies = filterCookiesForTargetHost(cookies, target);
        resolve({
          cookies: filtered_cookies,
          loginDetected: Boolean(loginDetected) || cookiesIndicateLogin(filtered_cookies),
        });
      } catch (error) {
        reject(error);
      } finally {
        try {
          if (typeof popup.isDestroyed === 'function' ? !popup.isDestroyed() : true) {
            popup.destroy();
          }
        } catch {
          /* ignore */
        }
      }
    };

    const syncPopupUserAgent = (pageUrl) => {
      if (typeof popup.webContents.setUserAgent !== 'function') return;
      popup.webContents.setUserAgent(
        isGoogleSignInUrl(pageUrl) ? genuineElectronUserAgent(ua) : ua,
      );
    };

    popup.on('close', (event) => {
      event.preventDefault();
      finish();
    });

    const handlePopupBack = () => {
      const back_action = resolveCookiePopupBackAction({
        canGoBack: webContentsCanGoBack(popup.webContents),
      });
      if (back_action === 'goBack') {
        webContentsGoBack(popup.webContents);
        return;
      }
      finish();
    };

    const syncUrlBar = async () => {
      if (settled) return;
      try {
        if (typeof popup.isDestroyed === 'function' && popup.isDestroyed()) return;
        let currentUrl = '';
        try {
          currentUrl = popup.webContents.getURL() || '';
        } catch {
          currentUrl = '';
        }
        if (typeof popup.setTitle === 'function' && currentUrl) {
          try {
            popup.setTitle(currentUrl);
          } catch {
            /* ignore */
          }
        }
        if (!currentUrl || currentUrl === 'about:blank') return;
        await popup.webContents.executeJavaScript(buildUrlBarInjectJs(currentUrl), true);
      } catch {
        /* page may be mid-navigation */
      }
    };

    const pollLogin = async () => {
      if (settled || loginDetected) return;
      try {
        if (typeof popup.isDestroyed === 'function' && popup.isDestroyed()) return;
        const ok = await popup.webContents.executeJavaScript(LOGIN_DETECT_JS, true);
        if (ok) {
          loginDetected = true;
          stopPolling();
          try {
            await popup.webContents.executeJavaScript(READY_BANNER_JS, true);
          } catch {
            /* ignore banner failures */
          }
          await syncUrlBar();
        }
      } catch {
        /* page may be mid-navigation */
      }
    };

    const startPolling = () => {
      if (settled || pollTimer) return;
      pollLogin();
      pollTimer = setInterval(pollLogin, 1500);
      if (typeof pollTimer.unref === 'function') pollTimer.unref();
    };

    // Keep URL bar alive after login poll stops (sites may wipe injected DOM).
    const startUrlBarWatch = () => {
      if (settled || urlBarTimer) return;
      syncUrlBar();
      urlBarTimer = setInterval(syncUrlBar, 2000);
      if (typeof urlBarTimer.unref === 'function') urlBarTimer.unref();
    };

    if (typeof popup.webContents.setWindowOpenHandler === 'function') {
      popup.webContents.setWindowOpenHandler(({ url }) => {
        let currentUrl = '';
        try {
          currentUrl = popup.webContents.getURL() || '';
        } catch {
          currentUrl = '';
        }
        const window_decision = decideWindowOpenInPopup(url, target, currentUrl);
        if (window_decision === 'loadInParent') {
          try {
            popup.webContents.loadURL(String(url).trim());
          } catch {
            /* ignore */
          }
          return { action: 'deny' };
        }
        if (window_decision === 'deny') {
          return { action: 'deny' };
        }
        if (!shouldShowOauthChildWindow(url)) {
          return { action: 'allow', overrideBrowserWindowOptions: { show: false } };
        }
        return { action: 'allow' };
      });
    }

    if (typeof popup.webContents.on === 'function') {
      popup.webContents.on('did-create-window', (child_window) => {
        const sync_child_visibility = () => {
          try {
            if (typeof child_window.isDestroyed === 'function' && child_window.isDestroyed()) {
              return;
            }
            const child_url = child_window.webContents.getURL() || '';
            if (
              isGoogleSignInUrl(child_url) &&
              typeof child_window.webContents.setUserAgent === 'function'
            ) {
              child_window.webContents.setUserAgent(genuineElectronUserAgent(ua));
            }
            if (shouldShowOauthChildWindow(child_url)) {
              if (typeof child_window.show === 'function') child_window.show();
              return;
            }
            if (/^https?:\/\//i.test(String(child_url || '').trim())) {
              if (typeof child_window.close === 'function') child_window.close();
            }
          } catch {
            /* ignore */
          }
        };
        if (child_window.webContents && typeof child_window.webContents.on === 'function') {
          child_window.webContents.on('did-navigate', sync_child_visibility);
          child_window.webContents.on('did-navigate-in-page', sync_child_visibility);
          child_window.webContents.on('did-finish-load', sync_child_visibility);
        }
        sync_child_visibility();
      });
      popup.webContents.on('console-message', (event, _level, message) => {
        const console_text =
          typeof message === 'string' ? message : event && event.message;
        if (!isCookiePopupBackConsoleMessage(console_text)) return;
        handlePopupBack();
      });
      popup.webContents.on('before-input-event', (event, input) => {
        if (!input || input.type !== 'keyDown') return;
        const is_browser_back = input.key === 'BrowserBack';
        const is_alt_left =
          Boolean(input.alt) && (input.key === 'Left' || input.key === 'ArrowLeft');
        if (!is_browser_back && !is_alt_left) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        handlePopupBack();
      });
      popup.webContents.on('dom-ready', () => {
        syncUrlBar();
      });
      popup.webContents.on('did-finish-load', () => {
        startPolling();
        startUrlBarWatch();
      });
      let rejection_recovered = false;
      const recoverRejectedGoogleSignIn = (navUrl) => {
        if (rejection_recovered || settled || !isGoogleSignInRejectionUrl(navUrl)) return;
        rejection_recovered = true;
        void clearRejectedGoogleAuthCookies(popup_session).then(() => {
          if (settled) return;
          try {
            popup.webContents.loadURL(target);
          } catch {
            /* ignore */
          }
        });
      };
      popup.webContents.on('will-navigate', (_event, navUrl) => {
        syncPopupUserAgent(navUrl);
      });
      popup.webContents.on('did-navigate', (_event, navUrl) => {
        recoverRejectedGoogleSignIn(navUrl);
      });
      popup.webContents.on('did-navigate-in-page', () => {
        syncUrlBar();
      });
    } else {
      startPolling();
      startUrlBarWatch();
    }

    void clearRejectedGoogleAuthCookies(popup_session);
    popup.loadURL(target);
  });
}

module.exports = {
  openLoginPopupAndGetCookies,
  collectCookiesForUrls,
  uniqueHttpUrls,
  filterCookiesForTargetHost,
  detectLoginFromDocument,
  cookiesIndicateLogin,
  buildUrlBarInjectJs,
  shouldKeepWindowOpenInPopup,
  decideWindowOpenInPopup,
  shouldShowOauthChildWindow,
  applyCookiePopupRequestHeaders,
  genuineElectronUserAgent,
  clearRejectedGoogleAuthCookies,
  isGoogleSignInUrl,
  attachDeniedWindowOpenHandler,
  resolveCookiePopupBackAction,
  webContentsCanGoBack,
  webContentsGoBack,
};
