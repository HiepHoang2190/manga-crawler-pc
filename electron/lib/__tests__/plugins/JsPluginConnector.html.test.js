'use strict';

const JsPluginConnector = require('../../plugins/JsPluginConnector');

describe('JsPluginConnector html bridge (cheerio)', () => {
  test('querySelector returns null when no match (like DOM)', async () => {
    const source = `
const plugin = {
  id: 'htmlt',
  name: 'HtmlT',
  version: '1',
  author: 't',
  description: 't',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  run() {
    const doc = html.parse(
      '<ul id="tq-root"><li><span>no link</span></li><li><a href="https://ex.com/truyen-tranh/z-1">Z</a></li></ul>',
    );
    const lis = doc.querySelectorAll('#tq-root > li');
    const hrefs = [];
    for (let i = 0; i < lis.length; i++) {
      const link = lis[i].querySelector('a[href*="truyen-tranh"]');
      hrefs.push(link ? link.attr('href') : null);
    }
    return hrefs;
  },
};
`;
    const connector = new JsPluginConnector({
      pluginId: 'htmlt',
      metadata: {
        id: 'htmlt',
        name: 'HtmlT',
        version: '1',
        author: 't',
        description: 't',
        baseUrl: 'https://example.com/',
        allowedDomains: ['example.com'],
      },
      source,
    });
    const hrefs = await connector._callPluginFunction('run', []);
    expect(hrefs).toEqual([null, 'https://ex.com/truyen-tranh/z-1']);
  });

  test('sandbox http.get injects default Referer and retries with preferChromiumNet on block', async () => {
    const calls = [];
    const fetchHtmlImpl = async (url, opts = {}) => {
      calls.push({ url, referer: opts.referer, preferChromiumNet: Boolean(opts.preferChromiumNet) });
      if (!opts.preferChromiumNet) return { ok: false, error: 'HTTP 403' };
      return { ok: true, html: '<h1>CF Passed</h1>', finalUrl: url };
    };
    const source = `
const plugin = {
  id: 'httpt',
  name: 'HttpT',
  version: '1.0.0',
  author: 't',
  description: 't',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  fetchManga: async function(url) {
    const res = await http.get(url);
    const doc = html.parse(res.body);
    return { title: doc.querySelector('h1').text(), chapters: [] };
  },
  fetchChapterImages: async function() { return []; }
};
`;
    const connector = new JsPluginConnector({
      pluginId: 'httpt',
      metadata: {
        id: 'httpt',
        name: 'HttpT',
        version: '1.0.0',
        author: 't',
        description: 't',
        baseUrl: 'https://example.com',
        allowedDomains: ['example.com'],
      },
      source,
      fetchHtmlImpl,
    });
    const res = await connector.load('https://example.com/manga/1');
    expect(res.ok).toBe(true);
    expect(res.manga.title).toBe('CF Passed');
    expect(calls[0].referer).toBe('https://example.com');
    expect(calls.some((c) => c.preferChromiumNet === true)).toBe(true);
  });

  test('PluginValidator rejects prototype/constructor escape patterns and V8 codeGeneration blocks dynamic Function in VM', () => {
    const PluginValidator = require('../../plugins/PluginValidator');
    const validator = new PluginValidator();

    const malicious = `
const plugin = {
  id: 'evil',
  name: 'Evil',
  version: '1.0.0',
  author: 'x',
  description: 'x',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  fetchManga: async function() { return console.log.constructor('return process')(); },
  fetchChapterImages: async function() { return []; }
};`;
    const vRes = validator.validate(malicious);
    expect(vRes.isValid).toBe(false);

    // Even if validator were bypassed directly in JsPluginConnector, V8 codeGeneration.strings=false blocks constructor('...')
    const bypassSource = `
const plugin = {
  id: 'bypass',
  name: 'Bypass',
  version: '1.0.0',
  author: 'x',
  description: 'x',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  fetchManga: async function() { return console['log']['constructor']('return 42')(); },
  fetchChapterImages: async function() { return []; }
};`;
    const connector = new JsPluginConnector({
      pluginId: 'bypass',
      metadata: {
        id: 'bypass',
        name: 'Bypass',
        version: '1.0.0',
        author: 'x',
        description: 'x',
        baseUrl: 'https://example.com',
        allowedDomains: ['example.com'],
      },
      source: bypassSource,
    });
    return expect(connector.load('https://example.com/1')).resolves.toMatchObject({ ok: false });
  });

  test('sandbox http.get blocks loopback, private, and non-HTTP URLs (SSRF guard)', async () => {
    const source = `
const plugin = {
  id: 'ssrf',
  name: 'SSRF',
  version: '1.0.0',
  author: 't',
  description: 't',
  baseUrl: 'https://example.com',
  allowedDomains: ['example.com'],
  fetchManga: async function(url) {
    await http.get(url);
    return { title: 'x', chapters: [] };
  },
  fetchChapterImages: async function() { return []; }
};`;
    const connector = new JsPluginConnector({
      pluginId: 'ssrf',
      metadata: {
        id: 'ssrf',
        name: 'SSRF',
        version: '1.0.0',
        author: 't',
        description: 't',
        baseUrl: 'https://example.com',
        allowedDomains: ['example.com'],
      },
      source,
      fetchHtmlImpl: async () => ({ ok: true, html: '<h1>Should not run</h1>' }),
    });

    for (const target of ['http://127.0.0.1:8080/', 'http://localhost:3000/', 'http://169.254.169.254/latest', 'http://192.168.1.1/', 'file:///etc/passwd']) {
      const res = await connector.load(target);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/blocked|nội bộ|loopback|HTTP\/HTTPS/i);
    }
  });
});
