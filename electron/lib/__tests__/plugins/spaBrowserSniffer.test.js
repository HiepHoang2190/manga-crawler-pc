'use strict';

const EventEmitter = require('events');
const { sniffPageWithBrowser } = require('../../plugins/spaBrowserSniffer');

function createMockBrowserWindowClass({
  loadError = null,
  cdpMessages = [],
  responseBodies = {},
  domState = { html: '<html><body></body></html>', links: [], images: [] },
  clickResult = false,
  hangNetworkEnable = false,
  hangClearStorage = false,
} = {}) {
  const instances = [];

  class MockBrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.destroyed = false;
      this.events = new EventEmitter();
      this.debuggerEvents = new EventEmitter();
      this.attached = false;
      this.detached = false;
      this.clearedStorage = false;
      this.beforeRequestHandler = null;
      this.callOrder = [];
      this.loadedUrls = [];

      this.webContents = {
        on: (ev, cb) => this.events.on(ev, cb),
        once: (ev, cb) => this.events.once(ev, cb),
        setUserAgent: () => {},
        session: {
          webRequest: {
            onBeforeRequest: (filterOrHandler, maybeHandler) => {
              this.beforeRequestHandler = typeof filterOrHandler === 'function' ? filterOrHandler : maybeHandler;
            },
          },
          clearStorageData: () => {
            if (hangClearStorage) {
              return new Promise(() => {});
            }
            this.clearedStorage = true;
            return Promise.resolve();
          },
        },
        debugger: {
          attach: () => {
            this.attached = true;
          },
          isAttached: () => this.attached && !this.detached,
          detach: () => {
            this.detached = true;
            this.attached = false;
          },
          on: (ev, cb) => this.debuggerEvents.on(ev, cb),
          sendCommand: (method, params) => {
            this.callOrder.push(`cdp:${method}`);
            if (method === 'Network.enable' && hangNetworkEnable) {
              return new Promise(() => {});
            }
            if (method === 'Network.getResponseBody') {
              return Promise.resolve({ body: responseBodies[params.requestId] || '', base64Encoded: false });
            }
            return Promise.resolve({});
          },
        },
        loadURL: async (targetUrl) => {
          this.loadedUrls.push(targetUrl);
          this.callOrder.push(`load:${targetUrl}`);
          if (targetUrl === 'about:blank') {
            return;
          }
          if (loadError) throw loadError;
          for (const msg of cdpMessages) {
            this.debuggerEvents.emit('message', {}, msg.method, msg.params);
          }
          this.events.emit('did-finish-load');
        },
        executeJavaScript: async (code) => {
          if (String(code).includes('__SNIFF_CLICK_NEXT__')) {
            return clickResult;
          }
          return domState;
        },
      };
      instances.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  MockBrowserWindow.instances = instances;
  return MockBrowserWindow;
}

describe('spaBrowserSniffer — Hidden BrowserWindow + CDP Network Sniffer', () => {
  test('blocks SSRF / loopback / non-HTTP URLs without instantiating BrowserWindow', async () => {
    const MockWin = createMockBrowserWindowClass();
    const res1 = await sniffPageWithBrowser('http://127.0.0.1:8080/secret', {
      BrowserWindowClass: MockWin,
    });
    expect(res1.ok).toBe(false);
    expect(MockWin.instances.length).toBe(0);

    const res2 = await sniffPageWithBrowser('file:///etc/passwd', {
      BrowserWindowClass: MockWin,
    });
    expect(res2.ok).toBe(false);
    expect(MockWin.instances.length).toBe(0);
  });

  test('captures JSON XHR responses, filters analytics/HTML, extracts DOM links/images, and cleans up resources', async () => {
    const MockWin = createMockBrowserWindowClass({
      cdpMessages: [
        {
          method: 'Network.responseReceived',
          params: {
            requestId: 'req-html',
            type: 'Document',
            response: { url: 'https://spa.example/manga/solo', status: 200, mimeType: 'text/html' },
          },
        },
        { method: 'Network.loadingFinished', params: { requestId: 'req-html' } },
        {
          method: 'Network.responseReceived',
          params: {
            requestId: 'req-ga',
            type: 'XHR',
            response: { url: 'https://www.google-analytics.com/collect', status: 200, mimeType: 'application/json' },
          },
        },
        { method: 'Network.loadingFinished', params: { requestId: 'req-ga' } },
        {
          method: 'Network.responseReceived',
          params: {
            requestId: 'req-api',
            type: 'Fetch',
            response: { url: 'https://api.spa.example/v1/manga/solo/chapters?page=1', status: 200, mimeType: 'application/json' },
          },
        },
        { method: 'Network.loadingFinished', params: { requestId: 'req-api' } },
      ],
      responseBodies: {
        'req-html': '<html></html>',
        'req-ga': '{"ok":true}',
        'req-api': JSON.stringify({
          chapters: [
            { id: 1, title: 'Chap 1', slug: 'chap-1' },
            { id: 2, title: 'Chap 2', slug: 'chap-2' },
          ],
        }),
      },
      domState: {
        html: '<html><body><h1>Solo</h1><a href="/truyen/solo/chap-1">Chap 1</a></body></html>',
        links: [{ text: 'Chap 1', href: 'https://spa.example/truyen/solo/chap-1' }],
        images: ['https://cdn.spa.example/1.jpg'],
      },
    });

    const res = await sniffPageWithBrowser('https://spa.example/manga/solo', {
      mode: 'manga',
      BrowserWindowClass: MockWin,
      waitAfterLoadMs: 5,
    });

    expect(res.ok).toBe(true);
    expect(res.apiResponses.length).toBe(1);
    expect(res.apiResponses[0].url).toBe('https://api.spa.example/v1/manga/solo/chapters?page=1');
    expect(res.apiResponses[0].json.chapters.length).toBe(2);
    expect(res.renderedLinks.length).toBe(1);
    expect(res.renderedImages).toEqual(['https://cdn.spa.example/1.jpg']);

    const win = MockWin.instances[0];
    expect(win.opts.show).toBe(false);
    expect(win.opts.webPreferences.partition).toMatch(/^plugin-sniff-/);
    expect(win.opts.webPreferences.partition.startsWith('persist:')).toBe(false);
    expect(win.opts.webPreferences.sandbox).toBe(true);
    expect(win.opts.webPreferences.contextIsolation).toBe(true);
    expect(win.opts.webPreferences.nodeIntegration).toBe(false);
    expect(typeof win.beforeRequestHandler).toBe('function');

    const cbResults = [];
    win.beforeRequestHandler({ url: 'file:///etc/passwd' }, (r) => cbResults.push(r));
    win.beforeRequestHandler({ url: 'http://127.0.0.1:8080/secret' }, (r) => cbResults.push(r));
    win.beforeRequestHandler({ url: 'https://cdn.spa.example/1.jpg' }, (r) => cbResults.push(r));
    expect(cbResults).toEqual([{ cancel: true }, { cancel: true }, { cancel: false }]);

    expect(win.detached).toBe(true);
    expect(win.destroyed).toBe(true);
    expect(win.clearedStorage).toBe(true);
  });

  test('always detaches debugger and destroys window when loadURL rejects', async () => {
    const MockWin = createMockBrowserWindowClass({
      loadError: new Error('ERR_NAME_NOT_RESOLVED'),
    });

    const res = await sniffPageWithBrowser('https://spa.example/broken', {
      BrowserWindowClass: MockWin,
      waitAfterLoadMs: 5,
    });

    expect(res.ok).toBe(false);
    const win = MockWin.instances[0];
    expect(win.detached).toBe(true);
    expect(win.destroyed).toBe(true);
  });

  test('pre-warms window on about:blank before CDP Network.enable and survives hanging Network.enable / clearStorageData', async () => {
    const MockOrderWin = createMockBrowserWindowClass({
      domState: { html: '<html><body><img src="https://cdn.spa.example/p1.jpg"></body></html>', links: [], images: [] },
    });
    const okRes = await sniffPageWithBrowser('https://spa.example/ch/1', {
      mode: 'chapter',
      BrowserWindowClass: MockOrderWin,
      waitAfterLoadMs: 5,
    });
    expect(okRes.ok).toBe(true);
    const order = MockOrderWin.instances[0].callOrder;
    const blankIdx = order.indexOf('load:about:blank');
    const neIdx = order.indexOf('cdp:Network.enable');
    const targetIdx = order.indexOf('load:https://spa.example/ch/1');
    expect(blankIdx).toBeGreaterThanOrEqual(0);
    expect(neIdx).toBeGreaterThan(blankIdx);
    expect(targetIdx).toBeGreaterThan(neIdx);

    const MockHangWin = createMockBrowserWindowClass({
      hangNetworkEnable: true,
      hangClearStorage: true,
      domState: { html: '<html><body><img src="https://cdn.spa.example/p2.jpg"></body></html>', links: [], images: ['https://cdn.spa.example/p2.jpg'] },
    });
    const t0 = Date.now();
    const res = await sniffPageWithBrowser('https://spa.example/ch/2', {
      mode: 'chapter',
      BrowserWindowClass: MockHangWin,
      timeoutMs: 250,
      waitAfterLoadMs: 5,
    });
    const elapsedMs = Date.now() - t0;
    expect(res.ok).toBe(true);
    expect(res.renderedImages).toEqual(['https://cdn.spa.example/p2.jpg']);
    expect(elapsedMs).toBeLessThan(3000);
    expect(MockHangWin.instances[0].destroyed).toBe(true);
  });
});
