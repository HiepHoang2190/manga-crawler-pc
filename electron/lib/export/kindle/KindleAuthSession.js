'use strict';

/**
 * KindleAuthSession — owns the Amazon login state for Send to Kindle.
 *
 * Uses a dedicated Electron session partition so the user's Amazon cookies are
 * isolated and persisted (encrypted at rest by Electron/OS). We never see or
 * store the password — the user signs in through Amazon's real web UI inside a
 * BrowserWindow, and we reuse the resulting session cookies to talk to the
 * Send to Kindle endpoints.
 */

const SESSION_PARTITION = 'persist:sendtokindle';
const SENDTOKINDLE_ORIGIN = 'https://www.amazon.com';
const CSRF_PROBE_URL = `${SENDTOKINDLE_ORIGIN}/sendtokindle/empty`;
const LOGIN_URL = `${SENDTOKINDLE_ORIGIN}/sendtokindle`;

// A desktop Chrome UA avoids Amazon quirks that can trip up the default
// Electron user agent during sign-in.
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

class SessionExpiredError extends Error {
  constructor(message = 'Amazon session expired') {
    super(message);
    this.name = 'SessionExpiredError';
    this.code = 'SESSION_EXPIRED';
  }
}

/**
 * Extract the csrfToken embedded in the Send to Kindle page HTML.
 * Amazon renders it as e.g. `name='csrfToken' value='...'`.
 * @param {string} html
 * @returns {string|null}
 */
function parseCsrfToken(html) {
  if (!html || typeof html !== 'string') return null;
  // Tolerant of attribute order and extra attributes between name/value.
  // 1) <input ... name="csrfToken" ... value="TOKEN" ...>
  let m = html.match(/name=['"]csrfToken['"][^>]*?value=['"]([^'"]+)['"]/i);
  if (m) return m[1];
  // 2) value before name
  m = html.match(/value=['"]([^'"]+)['"][^>]*?name=['"]csrfToken['"]/i);
  if (m) return m[1];
  // 3) JS/JSON form: csrfToken: 'TOKEN' | "csrfToken":"TOKEN"
  m = html.match(/['"]?csrfToken['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
  if (m) return m[1];
  return null;
}

/**
 * Parse the signed-in account's first name from an Amazon page's top-nav
 * greeting ("Hello, <Name>"). Returns null for signed-out pages so the caller
 * can fall back to a generic label.
 * @param {string} html
 * @returns {string|null}
 */
function parseAccountName(html) {
  if (!html || typeof html !== 'string') return null;

  let raw = null;
  const byId = html.match(/id=['"]nav-link-accountList-nav-line-1['"][^>]*>\s*([^<]+?)\s*</i);
  if (byId) raw = byId[1];
  if (!raw) {
    const byGreeting = html.match(/>\s*Hello,\s*([^<]+?)\s*</i);
    if (byGreeting) raw = `Hello, ${byGreeting[1]}`;
  }
  if (!raw) return null;

  const name = raw
    .replace(/^Hello,\s*/i, '')
    .replace(/^Xin ch\u00e0o,\s*/i, '')
    .trim();
  if (!name) return null;
  // Signed-out greeting variants → treat as unknown.
  if (/^sign\s*in$/i.test(name) || /^\u0111\u0103ng nh\u1eadp$/i.test(name)) return null;
  return name;
}

class KindleAuthSession {
  constructor(electron) {
    // Lazily injected Electron module so the class is unit-testable.
    this._electron = electron || require('electron');
    this._ses = null;
    this._loginWindow = null;
  }

  /** @returns {import('electron').Session} */
  getSession() {
    if (!this._ses) {
      const { session } = this._electron;
      this._ses = session.fromPartition(SESSION_PARTITION);
      try {
        this._ses.setUserAgent(DESKTOP_UA);
      } catch {
        /* older Electron may not expose setUserAgent on Session */
      }
    }
    return this._ses;
  }

  /**
   * Session-bound fetch. Forces `credentials: 'include'` so the partition's
   * Amazon cookies are always attached (otherwise the signed-out page comes
   * back and detection silently fails).
   * @param {string} url
   * @param {object} [init]
   * @returns {Promise<Response>}
   */
  fetch(url, init = {}) {
    return this.getSession().fetch(url, { credentials: 'include', ...init });
  }

  /**
   * Deterministic "is this partition authenticated to Amazon" check — reads the
   * auth cookie directly (no network, no HTML parsing). This is the reliable
   * signal used to auto-close the login window.
   * @returns {Promise<boolean>}
   */
  async hasAmazonSessionCookie() {
    try {
      const cookies = await this.getSession().cookies.get({ url: SENDTOKINDLE_ORIGIN });
      return cookies.some((c) => /^(at-main|sess-at-main)$/i.test(c.name) && c.value);
    } catch {
      return false;
    }
  }

  /**
   * Fetch a fresh csrfToken. Throws SessionExpiredError when not signed in.
   * @returns {Promise<string>}
   */
  async getCsrfToken() {
    let html;
    try {
      const res = await this.fetch(CSRF_PROBE_URL, {
        headers: { 'user-agent': DESKTOP_UA },
      });
      html = await res.text();
    } catch (e) {
      throw new SessionExpiredError(String(e?.message || e));
    }
    const token = parseCsrfToken(html);
    if (!token) throw new SessionExpiredError();
    return token;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async isLoggedIn() {
    try {
      await this.getCsrfToken();
      return true;
    } catch {
      // csrf probe can fail transiently (network/HTML changes) even when the
      // user is authenticated — fall back to the deterministic cookie check.
      return this.hasAmazonSessionCookie();
    }
  }

  /**
   * Best-effort signed-in account name (from the Amazon top-nav greeting), so
   * the user can confirm they're on the right account. Returns null when it
   * can't be determined.
   * @returns {Promise<string|null>}
   */
  async getAccountLabel() {
    try {
      const res = await this.fetch(`${SENDTOKINDLE_ORIGIN}/?language=en_US`, {
        headers: { 'user-agent': DESKTOP_UA },
      });
      const html = await res.text();
      return parseAccountName(html);
    } catch {
      return null;
    }
  }

  /**
   * Open Amazon's sign-in inside a BrowserWindow. The window is NOT auto-closed
   * on successful login — the user closes it themselves after verifying the
   * account. Resolves to the authenticated state (via the auth cookie) at the
   * moment the user closes the window.
   * @returns {Promise<boolean>}
   */
  login() {
    if (this._loginWindow && !this._loginWindow.isDestroyed()) {
      this._loginWindow.focus();
      return Promise.resolve(false);
    }

    const { BrowserWindow } = this._electron;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        this._loginWindow = null;
        resolve(value);
      };

      const win = new BrowserWindow({
        width: 520,
        height: 720,
        title: 'Đăng nhập Amazon',
        autoHideMenuBar: true,
        webPreferences: {
          partition: SESSION_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      this._loginWindow = win;

      try {
        win.webContents.setUserAgent(DESKTOP_UA);
      } catch {
        /* ignore */
      }

      // Do NOT auto-close: the user closes the window when done. On close, read
      // the deterministic auth cookie to decide the final login result. The
      // partition session (and its cookies) persist after the window is gone.
      win.on('closed', async () => {
        let ok = false;
        try {
          ok = await this.hasAmazonSessionCookie();
        } catch {
          /* treat as not logged in */
        }
        console.log(`[SendToKindle] login window closed by user, loggedIn=${ok}`);
        finish(ok);
      });

      win.loadURL(LOGIN_URL).catch(() => {
        /* navigation errors handled by the closed handler */
      });
    });
  }

  /**
   * Clear the persisted Amazon cookies/storage for this feature.
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      await this.getSession().clearStorageData();
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  KindleAuthSession,
  SessionExpiredError,
  parseCsrfToken,
  parseAccountName,
  SESSION_PARTITION,
  SENDTOKINDLE_ORIGIN,
  DESKTOP_UA,
};
