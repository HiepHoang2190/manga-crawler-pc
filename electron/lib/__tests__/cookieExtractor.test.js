const { BrowserWindow, session } = require('electron');

function createPopupMock({ getURL, executeJavaScript, autoClose = false } = {}) {
  let closeHandler = null;
  const webContents = {
    getURL: getURL || jest.fn().mockReturnValue('https://example.com/'),
    setUserAgent: jest.fn(),
    executeJavaScript: executeJavaScript || jest.fn().mockResolvedValue(false),
    loadURL: jest.fn(),
    on: jest.fn(),
  };
  const popup = {
    webContents,
    on: jest.fn((event, cb) => {
      if (event === 'close') {
        closeHandler = cb;
        if (autoClose) {
          queueMicrotask(() => cb({ preventDefault: jest.fn() }));
        }
      }
    }),
    destroy: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    loadURL: jest.fn(),
    setTitle: jest.fn(),
    /** test helper */
    __triggerClose() {
      if (closeHandler) closeHandler({ preventDefault: jest.fn() });
    },
  };
  return popup;
}

jest.mock('electron', () => {
  return {
    app: {
      userAgentFallback:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    },
    BrowserWindow: jest.fn(),
    session: {
      defaultSession: {
        webRequest: {
          onBeforeSendHeaders: jest.fn(),
        },
        cookies: {
          get: jest.fn(async (filter) => {
            if (filter && filter.url && String(filter.url).includes('comicvn19.net')) {
              return [
                { name: 'thienhatruyen_session', value: 'auth-session', domain: 'comicvn19.net' },
                { name: 'XSRF-TOKEN', value: 'xsrf', domain: 'comicvn19.net' },
              ];
            }
            if (filter && filter.domain === 'facebook.com') {
              return [{ name: 'c_user', value: 'fb', domain: '.facebook.com' }];
            }
            if (filter && filter.url && String(filter.url).includes('facebook.com')) {
              return [{ name: 'c_user', value: 'fb', domain: '.facebook.com' }];
            }
            return [{ name: 'cf_clearance', value: '123', domain: 'example.com' }];
          }),
        },
      },
    },
  };
});

const {
  openLoginPopupAndGetCookies,
  detectLoginFromDocument,
  cookiesIndicateLogin,
  filterCookiesForTargetHost,
  buildUrlBarInjectJs,
  shouldKeepWindowOpenInPopup,
  decideWindowOpenInPopup,
  shouldShowOauthChildWindow,
  applyCookiePopupRequestHeaders,
  genuineElectronUserAgent,
  clearRejectedGoogleAuthCookies,
  attachDeniedWindowOpenHandler,
  resolveCookiePopupBackAction,
  webContentsCanGoBack,
  webContentsGoBack,
} = require('../platform/cookies/cookieExtractor');

function documentFromHtml(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  return {
    querySelector(selector) {
      const node = $(selector).get(0);
      if (!node) return null;
      const $el = $(node);
      return {
        value: $el.attr('value') || '',
        textContent: $el.text() || '',
      };
    },
    querySelectorAll(selector) {
      return $(selector)
        .toArray()
        .map((node) => ({ textContent: $(node).text() || '' }));
    },
  };
}

describe('cookieExtractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve cookies when window is closed', async () => {
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue('https://example.com/'),
    });
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://example.com');
    popup.__triggerClose();
    const result = await pending;
    const cookies = Array.isArray(result) ? result : result.cookies;

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(cookies.map((c) => c.name)).toContain('cf_clearance');
  });

  it('should collect cookies for target site even if final URL redirected away', async () => {
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue('https://www.facebook.com/login.php'),
      executeJavaScript: jest
        .fn()
        .mockResolvedValueOnce(true) // login detect
        .mockResolvedValue(true),
    });
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://comicvn19.net/');
    // Simulate login detect via did-finish-load polling path: call execute before close
    await popup.webContents.executeJavaScript('probe');
    // Manually mark by running the real poll is hard; set login via closing after
    // forcing executeJavaScript used inside poll — trigger did-finish-load handler if registered
    const loadHandlers = popup.webContents.on.mock.calls.filter((c) => c[0] === 'did-finish-load');
    for (const [, cb] of loadHandlers) {
      await cb();
    }
    // allow poll microtasks
    await new Promise((r) => setImmediate(r));

    popup.__triggerClose();
    const result = await pending;
    const cookies = Array.isArray(result) ? result : result.cookies;
    const names = cookies.map((c) => c.name);

    expect(names).toContain('thienhatruyen_session');
    expect(names).not.toContain('c_user');
    expect(result.loginDetected).toBe(true);
  });

  it('treats Comix usermenu as logged in, not guest', () => {
    const guest_doc = documentFromHtml(
      '<nav class="topnav__right"><button type="button" class="login-btn">Log in</button></nav>',
    );
    const logged_in_doc = documentFromHtml(
      '<div class="usermenu"><button type="button" class="usermenu__btn">Ada</button>' +
        '<button type="button" class="usermenu__item usermenu__item--signout">Sign out</button></div>',
    );
    expect(detectLoginFromDocument(guest_doc)).toBe(false);
    expect(detectLoginFromDocument(logged_in_doc)).toBe(true);
  });

  it('still detects ComicVN is_login=1', () => {
    const comicvn_doc = documentFromHtml('<input type="hidden" name="is_login" value="1" />');
    expect(detectLoginFromDocument(comicvn_doc)).toBe(true);
  });

  it('cookiesIndicateLogin recognizes Laravel remember_web, not guest session only', () => {
    expect(
      cookiesIndicateLogin([
        { name: 'cf_clearance', value: 'cf' },
        { name: 'session', value: 'guest-sess' },
      ]),
    ).toBe(false);
    expect(
      cookiesIndicateLogin([
        { name: 'cf_clearance', value: 'cf' },
        { name: 'remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d', value: 'token' },
      ]),
    ).toBe(true);
  });

  it('marks loginDetected when remember_web cookie exists even if DOM poll missed', async () => {
    session.defaultSession.cookies.get.mockImplementation(async (filter) => {
      if (filter && filter.url && String(filter.url).includes('comix.to')) {
        return [
          { name: 'cf_clearance', value: 'cf', domain: '.comix.to' },
          { name: 'session', value: 'auth-sess', domain: 'comix.to' },
          {
            name: 'remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d',
            value: 'token',
            domain: 'comix.to',
          },
        ];
      }
      return [];
    });
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue('https://comix.to/'),
      executeJavaScript: jest.fn().mockResolvedValue(false),
    });
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://comix.to/');
    popup.__triggerClose();
    const result = await pending;

    expect(result.loginDetected).toBe(true);
    expect(result.cookies.map((c) => c.name)).toContain(
      'remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d',
    );
  });

  it('collects cf_clearance from domain jar when url filter omits it', async () => {
    session.defaultSession.cookies.get.mockImplementation(async (filter) => {
      if (filter && filter.url && String(filter.url).includes('comix.to')) {
        return [
          { name: 'session', value: 'auth-sess', domain: 'comix.to' },
          {
            name: 'remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d',
            value: 'token',
            domain: 'comix.to',
          },
        ];
      }
      if (filter && filter.domain && String(filter.domain).includes('comix.to')) {
        return [{ name: 'cf_clearance', value: 'cf-from-domain', domain: '.comix.to' }];
      }
      return [];
    });
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue('https://comix.to/'),
      executeJavaScript: jest.fn().mockResolvedValue(true),
    });
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://comix.to/');
    popup.__triggerClose();
    const result = await pending;
    const cookie_names = result.cookies.map((cookie_row) => cookie_row.name);

    expect(cookie_names).toContain('session');
    expect(cookie_names).toContain('cf_clearance');
  });

  it('keeps host-only cookies with empty domain collected from the target URL', async () => {
    session.defaultSession.cookies.get.mockImplementation(async (filter) => {
      if (filter && filter.url && String(filter.url).includes('comix.to')) {
        return [
          { name: 'session', value: 'host-only', domain: '' },
          {
            name: 'remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d',
            value: 'token',
            domain: 'comix.to',
          },
        ];
      }
      if (filter && filter.url && String(filter.url).includes('facebook.com')) {
        return [{ name: 'c_user', value: 'fb', domain: '' }];
      }
      return [];
    });
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue('https://www.facebook.com/login.php'),
      executeJavaScript: jest.fn().mockResolvedValue(true),
    });
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://comix.to/');
    popup.__triggerClose();
    const result = await pending;
    const cookie_names = result.cookies.map((cookie_row) => cookie_row.name);

    expect(cookie_names).toContain('session');
    expect(cookie_names).not.toContain('c_user');
  });

  it('filterCookiesForTargetHost keeps host-only empty domain for the target host', () => {
    const filtered_cookies = filterCookiesForTargetHost(
      [
        { name: 'session', value: 'host-only', domain: '' },
        { name: 'c_user', value: 'fb', domain: '.facebook.com' },
        { name: 'cf_clearance', value: 'cf', domain: '.comix.to' },
      ],
      'https://comix.to/',
    );
    const cookie_names = filtered_cookies.map((cookie_row) => cookie_row.name);
    expect(cookie_names).toContain('session');
    expect(cookie_names).toContain('cf_clearance');
    expect(cookie_names).not.toContain('c_user');
  });

  it('buildUrlBarInjectJs embeds page url and copy control', () => {
    const manga_url = 'https://example.com/truyen/one-piece';
    const inject_js = buildUrlBarInjectJs(manga_url);
    expect(inject_js).toContain('crawler-url-bar');
    expect(inject_js).toContain('Sao chép URL');
    expect(inject_js).toContain(manga_url);
  });

  it('buildUrlBarInjectJs embeds a back button like mobile browse', () => {
    const inject_js = buildUrlBarInjectJs('https://example.com/truyen/one-piece');
    expect(inject_js).toContain('crawler-url-bar-back');
    expect(inject_js).toContain('Quay lại');
    expect(inject_js).toContain('crawler:popup-back');
  });

  it('resolveCookiePopupBackAction walks history then closes like mobile', () => {
    expect(resolveCookiePopupBackAction({ canGoBack: true })).toBe('goBack');
    expect(resolveCookiePopupBackAction({ canGoBack: false })).toBe('close');
  });

  it('webContentsCanGoBack and webContentsGoBack support navigationHistory and legacy APIs', () => {
    const modern_contents = {
      navigationHistory: {
        canGoBack: jest.fn().mockReturnValue(true),
        goBack: jest.fn(),
      },
    };
    expect(webContentsCanGoBack(modern_contents)).toBe(true);
    expect(webContentsGoBack(modern_contents)).toBe(true);
    expect(modern_contents.navigationHistory.goBack).toHaveBeenCalled();

    const legacy_contents = {
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
    };
    expect(webContentsCanGoBack(legacy_contents)).toBe(false);
    expect(webContentsGoBack(legacy_contents)).toBe(false);
    expect(legacy_contents.goBack).not.toHaveBeenCalled();
  });

  it('buildUrlBarInjectJs escapes dangerous url characters for safe injection', () => {
    const risky_url = 'https://example.com/x?q="</script>\\u0027&n=\n';
    const inject_js = buildUrlBarInjectJs(risky_url);
    expect(inject_js).toContain(JSON.stringify(risky_url));
    expect(inject_js).not.toMatch(/q="<\/script>/);
  });

  it('shouldKeepWindowOpenInPopup keeps same-site manga, allows oauth hosts', () => {
    expect(
      shouldKeepWindowOpenInPopup(
        'https://example.com/truyen/one-piece',
        'https://example.com/',
        'https://example.com/',
      ),
    ).toBe(true);
    expect(
      shouldKeepWindowOpenInPopup(
        'https://www.facebook.com/login.php',
        'https://comicvn19.net/',
        'https://comicvn19.net/',
      ),
    ).toBe(false);
  });

  it('decideWindowOpenInPopup cancels ad popups and keeps oauth child windows', () => {
    const manga_url = 'https://mangaball.net/title-detail/witch-hat-atelier-68515c07702284f834179685/';
    expect(decideWindowOpenInPopup(manga_url, manga_url, manga_url)).toBe('loadInParent');
    expect(
      decideWindowOpenInPopup(
        'https://www.facebook.com/dialog/oauth',
        manga_url,
        manga_url,
      ),
    ).toBe('allowChild');
    expect(
      decideWindowOpenInPopup(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=ball',
        manga_url,
        manga_url,
      ),
    ).toBe('allowChild');
    expect(
      decideWindowOpenInPopup(
        'https://goctruyen-app.firebaseapp.com/__/auth/handler',
        manga_url,
        manga_url,
      ),
    ).toBe('allowChild');
    expect(decideWindowOpenInPopup('about:blank', manga_url, manga_url)).toBe('allowChild');
    expect(
      decideWindowOpenInPopup('https://shopee.vn/product/123', manga_url, manga_url),
    ).toBe('deny');
  });

  it('attachDeniedWindowOpenHandler denies every window.open in hidden scrape windows', () => {
    let open_handler = null;
    const web_contents = {
      setWindowOpenHandler: jest.fn((handler) => {
        open_handler = handler;
      }),
    };
    expect(attachDeniedWindowOpenHandler(web_contents)).toBe(true);
    expect(open_handler({ url: 'https://shopee.vn/product/123' })).toEqual({ action: 'deny' });
    expect(open_handler({ url: 'about:blank' })).toEqual({ action: 'deny' });
  });

  it('shouldShowOauthChildWindow hides blank and ad urls until a real oauth host', () => {
    expect(shouldShowOauthChildWindow('')).toBe(false);
    expect(shouldShowOauthChildWindow('about:blank')).toBe(false);
    expect(shouldShowOauthChildWindow('https://mangaball.net/login')).toBe(false);
    expect(shouldShowOauthChildWindow('https://shopee.vn/')).toBe(false);
    expect(
      shouldShowOauthChildWindow('https://accounts.google.com/o/oauth2/v2/auth?client_id=ball'),
    ).toBe(true);
    expect(shouldShowOauthChildWindow('https://www.facebook.com/dialog/oauth')).toBe(true);
  });

  it('injects url bar when navigating to a manga page inside cookie popup', async () => {
    const manga_url = 'https://example.com/truyen/one-piece';
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue(manga_url),
      executeJavaScript: jest.fn().mockResolvedValue(true),
    });
    popup.webContents.setWindowOpenHandler = jest.fn();
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://example.com/');
    expect(popup.webContents.setWindowOpenHandler).toHaveBeenCalled();

    const finish_load_handlers = popup.webContents.on.mock.calls.filter(
      (call_row) => call_row[0] === 'did-finish-load',
    );
    expect(finish_load_handlers.length).toBeGreaterThan(0);
    await finish_load_handlers[0][1]();

    const injected_scripts = popup.webContents.executeJavaScript.mock.calls.map(
      (call_row) => String(call_row[0]),
    );
    expect(injected_scripts.some((script_text) => script_text.includes('crawler-url-bar'))).toBe(
      true,
    );
    expect(injected_scripts.some((script_text) => script_text.includes(manga_url))).toBe(true);
    expect(popup.setTitle).toHaveBeenCalledWith(manga_url);

    popup.__triggerClose();
    await pending;
  });

  it('url-bar back walks webview history then closes like mobile browse', async () => {
    const manga_url = 'https://example.com/truyen/one-piece';
    const popup = createPopupMock({
      getURL: jest.fn().mockReturnValue(manga_url),
      executeJavaScript: jest.fn().mockResolvedValue(true),
    });
    popup.webContents.canGoBack = jest.fn().mockReturnValue(true);
    popup.webContents.goBack = jest.fn();
    popup.webContents.setWindowOpenHandler = jest.fn();
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies('https://example.com/');
    const console_handlers = popup.webContents.on.mock.calls.filter(
      (call_row) => call_row[0] === 'console-message',
    );
    expect(console_handlers.length).toBeGreaterThan(0);
    console_handlers[0][1]({}, 0, 'crawler:popup-back');
    expect(popup.webContents.goBack).toHaveBeenCalled();

    popup.webContents.canGoBack.mockReturnValue(false);
    console_handlers[0][1]({ message: 'crawler:popup-back' });
    await pending;
    expect(popup.destroy).toHaveBeenCalled();
  });

  it('keeps same-site window.open in popup and reinjects on in-page navigation', async () => {
    const home_url = 'https://example.com/';
    const manga_url = 'https://example.com/truyen/one-piece';
    const popup = createPopupMock({
      getURL: jest
        .fn()
        .mockReturnValueOnce(home_url)
        .mockReturnValue(manga_url),
      executeJavaScript: jest.fn().mockResolvedValue(true),
    });
    let open_handler = null;
    popup.webContents.setWindowOpenHandler = jest.fn((handler) => {
      open_handler = handler;
    });
    popup.webContents.loadURL = jest.fn();
    BrowserWindow.mockImplementation(() => popup);

    const pending = openLoginPopupAndGetCookies(home_url);
    expect(typeof open_handler).toBe('function');

    const open_result = open_handler({ url: manga_url });
    expect(open_result).toEqual({ action: 'deny' });
    expect(popup.webContents.loadURL).toHaveBeenCalledWith(manga_url);

    const oauth_result = open_handler({ url: 'https://www.facebook.com/dialog/oauth' });
    expect(oauth_result).toEqual({ action: 'allow' });

    const ad_result = open_handler({ url: 'https://shopee.vn/product/123' });
    expect(ad_result).toEqual({ action: 'deny' });
    expect(popup.webContents.loadURL).not.toHaveBeenCalledWith('https://shopee.vn/product/123');

    const blank_result = open_handler({ url: 'about:blank' });
    expect(blank_result).toEqual({
      action: 'allow',
      overrideBrowserWindowOptions: { show: false },
    });

    const create_window_handlers = popup.webContents.on.mock.calls.filter(
      (call_row) => call_row[0] === 'did-create-window',
    );
    expect(create_window_handlers.length).toBeGreaterThan(0);
    const child_listeners = {};
    const child_window = {
      isDestroyed: jest.fn().mockReturnValue(false),
      show: jest.fn(),
      close: jest.fn(),
      webContents: {
        getURL: jest.fn().mockReturnValue('about:blank'),
        on: jest.fn((event_name, callback) => {
          child_listeners[event_name] = callback;
        }),
      },
    };
    create_window_handlers[0][1](child_window);
    expect(child_window.close).not.toHaveBeenCalled();
    child_window.webContents.getURL.mockReturnValue('https://shopee.vn/product/123');
    child_listeners['did-navigate']();
    expect(child_window.close).toHaveBeenCalled();

    const in_page_handlers = popup.webContents.on.mock.calls.filter(
      (call_row) => call_row[0] === 'did-navigate-in-page',
    );
    expect(in_page_handlers.length).toBeGreaterThan(0);
    popup.webContents.executeJavaScript.mockClear();
    await in_page_handlers[0][1]();
    const reinjected = popup.webContents.executeJavaScript.mock.calls.map((call_row) =>
      String(call_row[0]),
    );
    expect(reinjected.some((script_text) => script_text.includes(manga_url))).toBe(true);

    popup.__triggerClose();
    await pending;
  });

  it('sends Electron’s own user agent to Google sign-in and keeps client hints', () => {
    const chrome_ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
    const electron_ua = genuineElectronUserAgent(chrome_ua);
    const headers = applyCookiePopupRequestHeaders(
      {
        'User-Agent': chrome_ua,
        'Sec-CH-UA': '"Chromium";v="132"',
        Accept: 'text/html',
      },
      'https://accounts.google.com/v3/signin/challenge/pwd',
      { chromeUa: chrome_ua, electronUa: electron_ua },
    );
    expect(headers['User-Agent']).toBe(electron_ua);
    expect(headers['User-Agent']).toMatch(/Electron\//);
    expect(headers['User-Agent']).not.toMatch(/Firefox/);
    expect(headers['Sec-CH-UA']).toBe('"Chromium";v="132"');
    expect(headers.Accept).toBe('text/html');

    const site_headers = applyCookiePopupRequestHeaders(
      { 'User-Agent': 'old', Accept: 'text/html' },
      'https://example.com/login',
      { chromeUa: chrome_ua, electronUa: electron_ua },
    );
    expect(site_headers['User-Agent']).toBe(chrome_ua);
  });

  it('removes Google rejection cookies that block the next password attempt', async () => {
    const removed_names = [];
    const popup_session = {
      cookies: {
        get: jest.fn(async () => [
          { name: '__Host-GAPS', value: 'x', domain: '.google.com', path: '/', secure: true },
          { name: 'OTZ', value: 'x', domain: '.google.com', path: '/', secure: true },
          { name: 'SID', value: 'keep', domain: '.google.com', path: '/', secure: true },
        ]),
        remove: jest.fn(async (_cookie_url, cookie_name) => {
          removed_names.push(cookie_name);
        }),
      },
    };
    await clearRejectedGoogleAuthCookies(popup_session);
    expect(removed_names).toEqual(expect.arrayContaining(['__Host-GAPS', 'OTZ']));
    expect(removed_names).not.toContain('SID');
  });
});
