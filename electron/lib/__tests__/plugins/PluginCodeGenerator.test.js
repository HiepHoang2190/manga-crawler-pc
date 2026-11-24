const generator = require('../../plugins/PluginCodeGenerator');
const PluginValidator = require('../../plugins/PluginValidator');
const JsPluginConnector = require('../../plugins/JsPluginConnector');

describe('PluginCodeGenerator', () => {
  const validator = new PluginValidator();

  test('should generate valid plugin source code with fetchManga and fetchChapterImages', () => {
    const sampleAnalysis = {
      siteInfo: {
        id: 'test-comic',
        name: 'Test Comic',
        baseUrl: 'https://testcomic.com',
        hostname: 'testcomic.com',
        domains: ['testcomic.com', 'cdn.testcomic.com']
      },
      detected: {
        titleSelector: 'h1.title',
        coverSelector: 'meta[property="og:image"]',
        chapterSelector: 'a[href*="chapter"]',
        imageContainerSelector: '.reading-content',
        imageSelector: '.reading-content img'
      }
    };

    const source = generator.generate(sampleAnalysis);

    expect(typeof source).toBe('string');
    expect(source).toContain('fetchManga: async function(url)');
    expect(source).toContain('fetchChapterImages: async function(url)');
    expect(source).toContain('[PLUGIN DEBUG]');

    const validation = validator.validate(source);
    expect(validation.isValid).toBe(true);
    expect(validation.metadata.id).toBe('test-comic');
    expect(validation.metadata.name).toBe('Test Comic');
  });

  test('should generate fallback selectors when detected selectors are null', () => {
    const sampleAnalysis = {
      siteInfo: {
        id: 'fallback-comic',
        name: 'Fallback Comic',
        baseUrl: 'https://fallback.com',
        hostname: 'fallback.com',
        domains: ['fallback.com']
      },
      detected: {
        titleSelector: null,
        coverSelector: null,
        chapterSelector: null,
        imageContainerSelector: null,
        imageSelector: null
      }
    };

    const source = generator.generate(sampleAnalysis);
    const validation = validator.validate(source);
    expect(validation.isValid).toBe(true);
  });

  test('generated fetchChapterImages resolves relative/protocol-relative URLs, data-lazy-src, and excludes noise', async () => {
    const source = generator.generate({
      siteInfo: {
        id: 'reltest',
        name: 'RelTest',
        baseUrl: 'https://reltest.com',
        hostname: 'reltest.com',
        domains: ['reltest.com', 'cdn.reltest.com'],
      },
      detected: {
        titleSelector: 'h1',
        chapterSelector: '.chapters a',
        imageContainerSelector: '.reading-content',
        imageSelector: '.reading-content img',
      },
    });
    const val = validator.validate(source);
    expect(val.isValid).toBe(true);

    const html = `
      <div class="reading-content">
        <img src="data:image/gif;base64,AAA" data-lazy-src="//cdn.reltest.com/01.avif" />
        <img data-original-src="/uploads/02.webp" />
        <img src="https://1.bp.blogspot.com/emoji.gif" />
        <img src="https://reltest.com/avatar/u1.png" />
        <img src="https://lh3.googleusercontent.com/page3" />
      </div>
    `;
    const connector = new JsPluginConnector({
      pluginId: val.metadata.id,
      metadata: val.metadata,
      source,
      fetchHtmlImpl: async (url) => ({ ok: true, html, finalUrl: url }),
    });
    const imgs = await connector.fetchChapterImages('https://reltest.com/c1');
    expect(imgs.map((i) => i.imageUrl)).toEqual([
      'https://cdn.reltest.com/01.avif',
      'https://reltest.com/uploads/02.webp',
      'https://lh3.googleusercontent.com/page3',
    ]);
  });

  test('respects ascending chapterOrder, filters nav shortcuts, and extracts author/description', async () => {
    const source = generator.generate({
      siteInfo: {
        id: 'ordertest',
        name: 'OrderTest',
        baseUrl: 'https://ordertest.com',
        hostname: 'ordertest.com',
        domains: ['ordertest.com'],
      },
      detected: {
        titleSelector: 'h1',
        coverSelector: 'meta[property="og:image"]',
        authorSelector: '.author-name',
        descriptionSelector: '.desc',
        chapterSelector: '.chapters a',
        chapterOrder: 'asc',
        imageSelector: '.reading img',
      },
    });
    const val = validator.validate(source);
    expect(val.isValid).toBe(true);

    const html = `
      <html><head><meta property="og:image" content="/cover.jpg" /></head><body>
        <h1>My Manga</h1>
        <span class="author-name">Oda</span>
        <div class="desc">Great adventure story</div>
        <div class="chapters">
          <a href="/c1">Đọc từ đầu</a>
          <a href="/c2">Đọc mới nhất</a>
          <a href="/c1">Chapter 1</a>
          <a href="/c2">Chapter 2</a>
        </div>
      </body></html>
    `;
    const connector = new JsPluginConnector({
      pluginId: val.metadata.id,
      metadata: val.metadata,
      source,
      fetchHtmlImpl: async (url) => ({ ok: true, html, finalUrl: url }),
    });
    const loaded = await connector.load('https://ordertest.com/manga/1');
    expect(loaded.ok).toBe(true);
    expect(loaded.manga.author).toBe('Oda');
    expect(loaded.manga.description).toBe('Great adventure story');
    expect(loaded.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
  });

  test('supports madaraAjaxChapters POST fallback and ts_reader.run JSON extraction inside sandbox', async () => {
    const source = generator.generate({
      siteInfo: {
        id: 'madarats',
        name: 'MadaraTS',
        baseUrl: 'https://madarats.com',
        hostname: 'madarats.com',
        domains: ['madarats.com'],
      },
      detected: {
        titleSelector: 'h1',
        chapterSelector: '.wp-manga-chapter a',
        chapterOrder: 'desc',
        madaraAjaxChapters: true,
        imageSelector: '#readerarea img',
        usesTsReader: true,
      },
    });
    const val = validator.validate(source);
    expect(val.isValid).toBe(true);

    const fetchHtmlImpl = async (url, opts = {}) => {
      if (url === 'https://madarats.com/manga/solo' && (opts.method || 'GET') === 'GET') {
        return { ok: true, html: '<h1>Solo</h1><div id="manga-chapters-holder"></div>', finalUrl: url };
      }
      if (url.endsWith('/ajax/chapters/') && opts.method === 'POST') {
        return {
          ok: true,
          html: '<ul><li class="wp-manga-chapter"><a href="/c2">Chap 2</a></li><li class="wp-manga-chapter"><a href="/c1">Chap 1</a></li></ul>',
          finalUrl: url,
        };
      }
      if (url.endsWith('/c1')) {
        return {
          ok: true,
          html: '<div id="readerarea"></div><script>ts_reader.run({"sources":[{"images":["https://cdn.madarats.com/1.webp","https://cdn.madarats.com/2.webp"]}]});</script>',
          finalUrl: url,
        };
      }
      return { ok: false, error: 'HTTP 404' };
    };

    const connector = new JsPluginConnector({
      pluginId: val.metadata.id,
      metadata: val.metadata,
      source,
      fetchHtmlImpl,
    });
    const mRes = await connector.load('https://madarats.com/manga/solo');
    expect(mRes.ok).toBe(true);
    expect(mRes.chapters.map((c) => c.title)).toEqual(['Chap 1', 'Chap 2']);

    const imgs = await connector.fetchChapterImages('https://madarats.com/c1');
    expect(imgs.map((i) => i.imageUrl)).toEqual([
      'https://cdn.madarats.com/1.webp',
      'https://cdn.madarats.com/2.webp',
    ]);
  });

  test('generates fetchLatestUpdates when latestUpdates metadata is present and validates cleanly', async () => {
    const source = generator.generate({
      siteInfo: {
        id: 'latestsite',
        name: 'LatestSite',
        baseUrl: 'https://latestsite.com',
        hostname: 'latestsite.com',
        domains: ['latestsite.com'],
      },
      detected: {
        titleSelector: 'h1',
        chapterSelector: '.chapters a',
        imageSelector: '.reading img',
        latestUpdates: {
          detected: true,
          itemSelector: '.items .item',
          linkSelector: 'h3 a',
          titleSelector: 'h3 a',
          coverSelector: 'img',
          chapterSelector: '.chap a',
          pageUrlTemplate: '{baseUrl}/?page={page}',
        },
      },
      includeLatestUpdates: true,
    });
    const val = validator.validate(source);
    expect(val.isValid).toBe(true);
    expect(source).toContain('fetchLatestUpdates: async function(page)');

    const listingHtml = `
      <div class="items">
        <div class="item"><h3><a href="/m/1">Manga One</a></h3><img data-original="/c1.jpg" /><span class="chap"><a href="/m/1/c5">Chap 5</a></span></div>
        <div class="item"><h3><a href="/m/2">Manga Two</a></h3><img src="/c2.jpg" /><span class="chap"><a href="/m/2/c9">Chap 9</a></span></div>
      </div>
    `;
    const connector = new JsPluginConnector({
      pluginId: val.metadata.id,
      metadata: val.metadata,
      source,
      fetchHtmlImpl: async (url) => ({ ok: true, html: listingHtml, finalUrl: url }),
    });
    const res = await connector.fetchLatestUpdates({ page: 1 });
    expect(res.ok).toBe(true);
    expect(res.items.length).toBe(2);
    expect(res.items[0].title).toBe('Manga One');
    expect(res.items[0].mangaUrl).toBe('https://latestsite.com/m/1');
    expect(res.items[0].coverUrl).toBe('https://latestsite.com/c1.jpg');
    expect(res.items[0].latestChapterLabel).toBe('Chap 5');
  });

  test('safely escapes quotes, newlines, and comment closers in site metadata and selectors, and skips non-HTTP links', async () => {
    const source = generator.generate({
      siteInfo: {
        id: 'safe-site',
        name: "Site '*/ console.log(1)\nNextLine",
        baseUrl: "https://safesite.com/'*/",
        hostname: 'safesite.com',
        domains: ['safesite.com'],
      },
      detected: {
        titleSelector: 'h1',
        chapterSelector: "div[data-x='1'] a",
        imageSelector: '.read img',
      },
    });
    const val = validator.validate(source);
    expect(val.isValid).toBe(true);

    const connector = new JsPluginConnector({
      pluginId: val.metadata.id,
      metadata: val.metadata,
      source,
      fetchHtmlImpl: async () => ({
        ok: true,
        html: '<h1>Title</h1><div data-x="1"><a href="#">Empty</a><a href="javascript:void(0)">JS</a><a href="/chap-1">Chap 1</a></div>',
      }),
    });
    const loaded = await connector.load('https://safesite.com/manga/1');
    expect(loaded.ok).toBe(true);
    expect(loaded.chapters).toEqual([{ title: 'Chap 1', url: 'https://safesite.com/chap-1' }]);
  });

  test('generates html-paginated fetchManga that merges multiple pages and stops cleanly', async () => {
    const source = generator.generate({
      siteInfo: { id: 'htmlpag', name: 'HtmlPag', baseUrl: 'https://htmlpag.example', hostname: 'htmlpag.example', domains: ['htmlpag.example'] },
      detected: {
        titleSelector: 'h1',
        chapterSelector: '.chapters a',
        chapterOrder: 'asc',
        chapterStrategy: 'html-paginated',
        chapterPagination: {
          detected: true,
          pageUrlTemplate: 'https://htmlpag.example/truyen/abc?page={page}',
          maxPagesDetected: 3,
        },
        imageSelector: 'img',
      },
    });
    const val = validator.validate(source);
    expect(val.isValid).toBe(true);

    const fetchHtmlImpl = async (url) => {
      if (url.includes('page=2')) {
        return { ok: true, html: '<h1>Pag</h1><div class="chapters"><a href="/c3">Chap 3</a><a href="/c4">Chap 4</a></div>' };
      }
      if (url.includes('page=3')) {
        return { ok: true, html: '<h1>Pag</h1><div class="chapters"><a href="/c5">Chap 5</a></div>' };
      }
      return { ok: true, html: '<h1>Pag</h1><div class="chapters"><a href="/c1">Chap 1</a><a href="/c2">Chap 2</a></div>' };
    };
    const connector = new JsPluginConnector({
      pluginId: val.metadata.id,
      metadata: val.metadata,
      source,
      fetchHtmlImpl,
    });
    const loaded = await connector.load('https://htmlpag.example/truyen/abc');
    expect(loaded.ok).toBe(true);
    expect(loaded.chapters.map((c) => c.title)).toEqual(['Chap 1', 'Chap 2', 'Chap 3', 'Chap 4', 'Chap 5']);
  });

  test('generates embedded-json and paginated api-json plugins that validate and run inside JsPluginConnector', async () => {
    // 1. Embedded JSON (__NEXT_DATA__)
    const nextSource = generator.generate({
      siteInfo: { id: 'nextspa', name: 'NextSPA', baseUrl: 'https://nextspa.example', hostname: 'nextspa.example', domains: ['nextspa.example'] },
      detected: {
        titleSelector: 'h1',
        chapterOrder: 'asc',
        chapterStrategy: 'embedded-json',
        embeddedChapterConfig: {
          sourceType: '__NEXT_DATA__',
          selector: 'script#__NEXT_DATA__',
          arrayPath: 'props.pageProps.chapters',
          titleField: 'title',
          slugField: 'slug',
          chapterUrlTemplate: 'https://nextspa.example/truyen/{mangaSlug}/{chapterSlug}',
        },
        imageStrategy: 'embedded-json',
        embeddedImageConfig: {
          sourceType: '__NEXT_DATA__',
          selector: 'script#__NEXT_DATA__',
          arrayPath: 'props.pageProps.images',
          imageField: null,
          prefixPath: null,
        },
      },
    });
    const nextVal = validator.validate(nextSource);
    expect(nextVal.isValid).toBe(true);

    const nextConnector = new JsPluginConnector({
      pluginId: nextVal.metadata.id,
      metadata: nextVal.metadata,
      source: nextSource,
      fetchHtmlImpl: async (url) => {
        if (url.includes('/chap-')) {
          return {
            ok: true,
            html: '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"images":["https://cdn.nextspa.example/1.jpg","https://cdn.nextspa.example/2.jpg"]}}}</script>',
          };
        }
        return {
          ok: true,
          html: '<h1>Next Story</h1><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"chapters":[{"slug":"chap-1","title":"Chap 1"},{"slug":"chap-2","title":"Chap 2"}]}}}</script>',
        };
      },
    });
    const nextLoaded = await nextConnector.load('https://nextspa.example/truyen/my-story');
    expect(nextLoaded.ok).toBe(true);
    expect(nextLoaded.chapters.map((c) => c.url)).toEqual([
      'https://nextspa.example/truyen/my-story/chap-1',
      'https://nextspa.example/truyen/my-story/chap-2',
    ]);
    const nextImgs = await nextConnector.fetchChapterImages('https://nextspa.example/truyen/my-story/chap-1');
    expect(nextImgs.map((i) => i.imageUrl)).toEqual([
      'https://cdn.nextspa.example/1.jpg',
      'https://cdn.nextspa.example/2.jpg',
    ]);

    // 2. Paginated API JSON
    const apiSource = generator.generate({
      siteInfo: { id: 'apispa', name: 'ApiSPA', baseUrl: 'https://apispa.example', hostname: 'apispa.example', domains: ['apispa.example', 'api.apispa.example'] },
      detected: {
        titleSelector: 'h1',
        chapterOrder: 'asc',
        chapterStrategy: 'api-json',
        chapterApi: {
          urlTemplate: 'https://api.apispa.example/v1/manga/{mangaSlug}/chapters?page={page}',
          paginated: true,
          paginationType: 'page',
          arrayPath: 'data.items',
          titleField: 'name',
          slugField: 'slug',
          chapterUrlTemplate: 'https://apispa.example/read/{mangaSlug}/{chapterSlug}',
          totalPagesPath: 'meta.totalPages',
        },
        imageStrategy: 'api-json',
        imageApi: {
          urlTemplate: 'https://api.apispa.example/v1/chapter/{chapterSlug}/pages',
          arrayPath: 'pages',
          imageField: 'path',
          prefixPath: 'cdnHost',
        },
      },
    });
    const apiVal = validator.validate(apiSource);
    expect(apiVal.isValid).toBe(true);

    const apiConnector = new JsPluginConnector({
      pluginId: apiVal.metadata.id,
      metadata: apiVal.metadata,
      source: apiSource,
      fetchHtmlImpl: async (url) => {
        if (url === 'https://apispa.example/truyen/hero') {
          return { ok: true, html: '<h1>Hero</h1>' };
        }
        if (url.includes('page=1')) {
          return {
            ok: true,
            html: JSON.stringify({
              meta: { totalPages: 2 },
              data: { items: [{ slug: 'c1', name: 'Chap 1' }, { slug: 'c2', name: 'Chap 2' }] },
            }),
          };
        }
        if (url.includes('page=2')) {
          return {
            ok: true,
            html: JSON.stringify({
              meta: { totalPages: 2 },
              data: { items: [{ slug: 'c3', name: 'Chap 3' }] },
            }),
          };
        }
        if (url.includes('/chapter/c1/pages')) {
          return {
            ok: true,
            html: JSON.stringify({
              cdnHost: 'https://img.apispa.example',
              pages: [{ path: '/01.webp' }, { path: '/02.webp' }],
            }),
          };
        }
        return { ok: false, error: 'HTTP 404' };
      },
    });
    const apiLoaded = await apiConnector.load('https://apispa.example/truyen/hero');
    expect(apiLoaded.ok).toBe(true);
    expect(apiLoaded.chapters.map((c) => c.title)).toEqual(['Chap 1', 'Chap 2', 'Chap 3']);
    const apiImgs = await apiConnector.fetchChapterImages('https://apispa.example/read/hero/c1');
    expect(apiImgs.map((i) => i.imageUrl)).toEqual([
      'https://img.apispa.example/01.webp',
      'https://img.apispa.example/02.webp',
    ]);
  });

  test('html-paginated plugin binds pagination URL to runtime manga URL rather than analyzed URL', async () => {
    const pagSource = generator.generate({
      siteInfo: {
        id: 'pag-site',
        name: 'Pag Site',
        baseUrl: 'https://pag.example',
        domains: ['pag.example'],
      },
      detected: {
        titleSelector: 'h1',
        chapterSelector: 'ul.chaps li a',
        chapterOrder: 'asc',
        chapterStrategy: 'html-paginated',
        chapterPagination: {
          detected: true,
          pageUrlTemplate: 'https://pag.example/truyen/analyzed-manga?page={page}',
          runtimeSuffixTemplate: '?page={page}',
          paginationType: 'query',
          maxPagesDetected: 2,
        },
        imageSelector: 'img',
      },
      includeLatestUpdates: false,
    });

    const pagVal = validator.validate(pagSource);
    expect(pagVal.isValid).toBe(true);

    const fetchedUrls = [];
    const pagConnector = new JsPluginConnector({
      pluginId: pagVal.metadata.id,
      metadata: pagVal.metadata,
      source: pagSource,
      fetchHtmlImpl: async (url) => {
        fetchedUrls.push(url);
        if (url === 'https://pag.example/truyen/other-manga') {
          return {
            ok: true,
            html: '<h1>Other Manga</h1><ul class="chaps"><li><a href="/read/other-c1">Chap 1</a></li></ul>',
          };
        }
        if (url === 'https://pag.example/truyen/other-manga?page=2') {
          return {
            ok: true,
            html: '<ul class="chaps"><li><a href="/read/other-c2">Chap 2</a></li></ul>',
          };
        }
        return { ok: false, error: 'HTTP 404' };
      },
    });

    const loaded = await pagConnector.load('https://pag.example/truyen/other-manga');
    expect(loaded.ok).toBe(true);
    expect(fetchedUrls).toEqual([
      'https://pag.example/truyen/other-manga',
      'https://pag.example/truyen/other-manga?page=2',
    ]);
    expect(loaded.chapters.map((c) => c.title)).toEqual(['Chap 1', 'Chap 2']);
  });

  test('generated helpers block prototype pollution and extract dot-containing URL slugs', () => {
    const vm = require('vm');
    const source = generator.generate({
      siteInfo: {
        id: 'helper-test',
        name: 'Helper Test',
        baseUrl: 'http://helper.example',
        domains: ['helper.example'],
      },
      detected: {
        titleSelector: 'h1',
        chapterSelector: 'a',
        imageSelector: 'img',
      },
      includeLatestUpdates: false,
    });

    const val = validator.validate(source);
    expect(val.isValid).toBe(true);
    expect(val.metadata.baseUrl).toBe('https://helper.example');

    const pluginObj = vm.runInNewContext(source, { console });
    const sampleObj = { data: { items: [1, 2] } };
    expect(pluginObj._getByPath(sampleObj, 'data.items')).toEqual([1, 2]);
    expect(pluginObj._getByPath(sampleObj, '__proto__.polluted')).toBeUndefined();
    expect(pluginObj._getByPath(sampleObj, 'data.constructor.prototype')).toBeUndefined();
    expect(pluginObj._getByPath(sampleObj, 'prototype')).toBeUndefined();
    expect(pluginObj._getByPath(sampleObj, 'toString')).toBeUndefined();

    expect(pluginObj._extractUrlTokens('https://apispa.example/truyen/my.comic-12')).toEqual({
      slug: 'my.comic-12',
      id: '12',
    });
    expect(pluginObj._extractUrlTokens('https://apispa.example/manga/solo-leveling/9988')).toEqual({
      slug: 'solo-leveling',
      id: '9988',
    });
  });
});
