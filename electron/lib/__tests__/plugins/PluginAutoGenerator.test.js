'use strict';

const PluginAutoGenerator = require('../../plugins/PluginAutoGenerator');
const PluginCodeGenerator = require('../../plugins/PluginCodeGenerator');

describe('PluginAutoGenerator — Connector-Derived Templates & Resilience', () => {
  test('detects NetTruyen template, strips nav shortcuts, detects desc order, chapter images & latestUpdates', async () => {
    const mangaHtml = `
      <html>
        <head><meta property="og:image" content="https://st.nettruyen.example/covers/solo.jpg" /></head>
        <body>
          <h1 class="title-detail">Solo Leveling</h1>
          <li class="author row"><p class="col-xs-8">Chugong</p></li>
          <div class="detail-content"><p>Shadow Monarch story</p></div>
          <div class="read-action">
            <a class="btn" href="/truyen/solo/chap-1">Đọc từ đầu</a>
            <a class="btn" href="/truyen/solo/chap-10">Đọc mới nhất</a>
          </div>
          <div id="nt_listchapter">
            <a href="/truyen/solo/chap-1">Đọc từ đầu</a>
            <a href="/truyen/solo/chap-10">Chapter 10</a>
            <a href="/truyen/solo/chap-9">Chapter 9</a>
            <a href="/truyen/solo/chap-1">Chapter 1</a>
          </div>
        </body>
      </html>
    `;
    const homeHtml = `
      <html><body>
        <div class="items">
          <div class="item">
            <div class="image"><a href="/truyen/solo"><img data-original="https://st.nettruyen.example/covers/solo.jpg" /></a></div>
            <figcaption><h3><a href="/truyen/solo">Solo Leveling</a></h3><ul class="comic-item"><li class="chapter"><a href="/truyen/solo/chap-10">Chapter 10</a></li></ul></figcaption>
          </div>
          <div class="item">
            <div class="image"><a href="/truyen/nano"><img data-original="https://st.nettruyen.example/covers/nano.jpg" /></a></div>
            <figcaption><h3><a href="/truyen/nano">Nano Machine</a></h3><ul class="comic-item"><li class="chapter"><a href="/truyen/nano/chap-5">Chapter 5</a></li></ul></figcaption>
          </div>
        </div>
      </body></html>
    `;
    const chapterHtml = `
      <html><body>
        <div class="reading-detail box_doc">
          <div class="page-chapter"><img src="data:image/gif;base64,R0lGODlhAQAB" data-original="//cdn.nettruyen.example/001.jpg" /></div>
          <div class="page-chapter"><img data-cdn="//cdn.nettruyen.example/002.avif" /></div>
          <div class="page-chapter"><img data-src="https://cdn.nettruyen.example/003.png" /></div>
          <div class="page-chapter"><img src="https://st.nettruyen.example/template/banner.jpg" /></div>
        </div>
      </body></html>
    `;

    const fetchHtmlImpl = async (url) => {
      if (url === 'https://nettruyen.example/truyen/solo') return { ok: true, html: mangaHtml, finalUrl: url };
      if (url === 'https://nettruyen.example/') return { ok: true, html: homeHtml, finalUrl: url };
      if (url.includes('/chap-')) return { ok: true, html: chapterHtml, finalUrl: url };
      return { ok: false, error: 'HTTP 404' };
    };

    const analysis = await PluginAutoGenerator.analyzeMangaPage('https://nettruyen.example/truyen/solo', {
      fetchHtmlImpl,
    });

    expect(analysis.ok).toBe(true);
    expect(analysis.template.id).toBe('nettruyen');
    expect(analysis.detected.title).toBe('Solo Leveling');
    expect(analysis.detected.author).toBe('Chugong');
    expect(analysis.detected.chapterCount).toBe(3);
    expect(analysis.detected.chapterOrder).toBe('desc');
    expect(analysis.detected.chapterSample.some((c) => c.title.includes('Đọc từ đầu'))).toBe(false);
    expect(analysis.detected.latestUpdates?.detected).toBe(true);
    expect(analysis.detected.latestUpdates?.sampleCount).toBe(2);

    const chAnalysis = await PluginAutoGenerator.analyzeChapterPage(
      analysis.detected.chapterFirstUrl,
      analysis.siteInfo.baseUrl,
      { fetchHtmlImpl },
    );
    expect(chAnalysis.ok).toBe(true);
    expect(chAnalysis.imageCount).toBe(3);
    expect(chAnalysis.imageSample).toEqual([
      'https://cdn.nettruyen.example/001.jpg',
      'https://cdn.nettruyen.example/002.avif',
      'https://cdn.nettruyen.example/003.png',
    ]);
  });

  test('detects Madara WP-Manga template and fetches chapters via /ajax/chapters/ POST when DOM list is empty', async () => {
    const mangaHtml = `
      <html>
        <body class="wp-manga-page">
          <div class="post-title"><h1>Tower of God</h1></div>
          <div class="author-content"><a href="#">SIU</a></div>
          <div class="summary_image"><img data-lazy-src="https://madara.example/cover.webp" /></div>
          <div id="manga-chapters-holder" data-id="999"></div>
        </body>
      </html>
    `;
    const ajaxHtml = `
      <ul class="main version-chap">
        <li class="wp-manga-chapter"><a href="https://madara.example/manga/tog/chapter-2/">Chapter 2</a></li>
        <li class="wp-manga-chapter"><a href="https://madara.example/manga/tog/chapter-1/">Chapter 1</a></li>
      </ul>
    `;
    const chapterHtml = `
      <div class="reading-content">
        <div class="page-break"><img class="wp-manga-chapter-img" data-lazy-src="https://cdn.madara.example/p1.webp" /></div>
        <div class="page-break"><img class="wp-manga-chapter-img" data-lazy-src="https://cdn.madara.example/p2.webp" /></div>
        <div class="page-break"><img class="wp-manga-chapter-img" data-lazy-src="https://cdn.madara.example/p3.webp" /></div>
      </div>
    `;

    const calls = [];
    const fetchHtmlImpl = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET' });
      if (url === 'https://madara.example/manga/tog/' && (opts.method || 'GET') === 'GET') {
        return { ok: true, html: mangaHtml, finalUrl: url };
      }
      if (url.endsWith('/ajax/chapters/') && opts.method === 'POST') {
        return { ok: true, html: ajaxHtml, finalUrl: url };
      }
      if (url.includes('/chapter-')) {
        return { ok: true, html: chapterHtml, finalUrl: url };
      }
      return { ok: false, error: 'HTTP 404' };
    };

    const analysis = await PluginAutoGenerator.analyzeMangaPage('https://madara.example/manga/tog/', {
      fetchHtmlImpl,
      skipLatestProbe: true,
    });

    expect(analysis.ok).toBe(true);
    expect(analysis.template.id).toBe('madara');
    expect(analysis.detected.madaraAjaxChapters).toBe(true);
    expect(analysis.detected.chapterCount).toBe(2);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/ajax/chapters/'))).toBe(true);

    const chAnalysis = await PluginAutoGenerator.analyzeChapterPage(
      analysis.detected.chapterFirstUrl,
      analysis.siteInfo.baseUrl,
      { fetchHtmlImpl },
    );
    expect(chAnalysis.ok).toBe(true);
    expect(chAnalysis.imageCount).toBe(3);
  });

  test('detects MangaStream template and extracts embedded ts_reader.run JSON images', async () => {
    const mangaHtml = `
      <html><body>
        <h1 class="entry-title">Omniscient Reader</h1>
        <div id="chapterlist">
          <ul>
            <li><div class="eph-num"><a href="https://ms.example/orv-chapter-1/"><span class="chapternum">Chapter 1</span></a></div></li>
            <li><div class="eph-num"><a href="https://ms.example/orv-chapter-2/"><span class="chapternum">Chapter 2</span></a></div></li>
          </ul>
        </div>
      </body></html>
    `;
    const chapterHtml = `
      <html><body>
        <div id="readerarea"></div>
        <script>ts_reader.run({"post_id":123,"sources":[{"source":"CDN1","images":["https://img.ms.example/01.jpg","https://img.ms.example/02.jpg","https://img.ms.example/03.jpg"]}]});</script>
      </body></html>
    `;

    const fetchHtmlImpl = async (url) => {
      if (url === 'https://ms.example/manga/orv/') return { ok: true, html: mangaHtml, finalUrl: url };
      if (url.includes('orv-chapter-')) return { ok: true, html: chapterHtml, finalUrl: url };
      return { ok: false, error: 'HTTP 404' };
    };

    const analysis = await PluginAutoGenerator.analyzeMangaPage('https://ms.example/manga/orv/', {
      fetchHtmlImpl,
      skipLatestProbe: true,
    });
    expect(analysis.ok).toBe(true);
    expect(analysis.template.id).toBe('mangastream');
    expect(analysis.detected.chapterOrder).toBe('asc');

    const chAnalysis = await PluginAutoGenerator.analyzeChapterPage(
      analysis.detected.chapterFirstUrl,
      analysis.siteInfo.baseUrl,
      { fetchHtmlImpl },
    );
    expect(chAnalysis.ok).toBe(true);
    expect(chAnalysis.usesTsReader).toBe(true);
    expect(chAnalysis.imageCount).toBe(3);
  });

  test('detects TruyenQQ template and filters noisy comment/avatar images', async () => {
    const mangaHtml = `
      <html><body>
        <div class="book_other"><h1>Dao Hai Tac</h1></div>
        <div class="list_chapter">
          <div class="works-chapter-list">
            <div class="works-chapter-item"><a href="https://qq.example/truyen/op-chap-1.html">Chương 1</a></div>
            <div class="works-chapter-item"><a href="https://qq.example/truyen/op-chap-2.html">Chương 2</a></div>
          </div>
        </div>
      </body></html>
    `;
    const chapterHtml = `
      <html><body>
        <div class="chapter_content">
          <div class="page-chapter"><img src="https://img.qq.example/1.jpg" /></div>
          <div class="page-chapter"><img src="https://img.qq.example/2.jpg" /></div>
          <div class="page-chapter"><img src="https://img.qq.example/3.jpg" /></div>
        </div>
        <div class="comments">
          <img src="https://1.bp.blogspot.com/emoji.gif" />
          <img src="https://avatar.truyenvua.com/160x160/u1.jpg" />
        </div>
      </body></html>
    `;

    const fetchHtmlImpl = async (url) => {
      if (url.endsWith('/truyen/op')) return { ok: true, html: mangaHtml, finalUrl: url };
      if (url.includes('op-chap-')) return { ok: true, html: chapterHtml, finalUrl: url };
      return { ok: false, error: 'HTTP 404' };
    };

    const analysis = await PluginAutoGenerator.analyzeMangaPage('https://qq.example/truyen/op', {
      fetchHtmlImpl,
      skipLatestProbe: true,
    });
    expect(analysis.ok).toBe(true);
    expect(analysis.template.id).toBe('truyenqq');

    const chAnalysis = await PluginAutoGenerator.analyzeChapterPage(
      analysis.detected.chapterFirstUrl,
      analysis.siteInfo.baseUrl,
      { fetchHtmlImpl },
    );
    expect(chAnalysis.ok).toBe(true);
    expect(chAnalysis.imageCount).toBe(3);
    expect(chAnalysis.imageSample.every((u) => !u.includes('blogspot') && !u.includes('avatar'))).toBe(true);
  });

  test('retries with preferChromiumNet on 403/Cloudflare block and dry-runs generated plugin', async () => {
    const mangaHtml = `
      <html><body>
        <h1>Protected Title</h1>
        <div class="chapter-list">
          <a href="/read/c1">Chap 1</a>
          <a href="/read/c2">Chap 2</a>
        </div>
      </body></html>
    `;
    const chapterHtml = `
      <html><body>
        <div class="reading-content">
          <img src="/uploads/p1.webp" />
          <img src="https://lh3.googleusercontent.com/page2-no-ext" />
          <img src="/uploads/p3.avif" />
        </div>
      </body></html>
    `;

    const fetchCalls = [];
    const fetchHtmlImpl = async (url, opts = {}) => {
      fetchCalls.push({ url, preferChromiumNet: Boolean(opts.preferChromiumNet) });
      if (!opts.preferChromiumNet) {
        return { ok: false, error: 'HTTP 403' };
      }
      if (url === 'https://cf.example/manga/test') return { ok: true, html: mangaHtml, finalUrl: url };
      if (url.includes('/read/c')) return { ok: true, html: chapterHtml, finalUrl: url };
      return { ok: false, error: 'HTTP 404' };
    };

    const analysis = await PluginAutoGenerator.analyzeMangaPage('https://cf.example/manga/test', {
      fetchHtmlImpl,
      skipLatestProbe: true,
    });
    expect(analysis.ok).toBe(true);
    expect(analysis.usedChromiumFallback).toBe(true);
    expect(fetchCalls.some((c) => c.preferChromiumNet === true)).toBe(true);

    const chAnalysis = await PluginAutoGenerator.analyzeChapterPage(
      analysis.detected.chapterFirstUrl,
      analysis.siteInfo.baseUrl,
      { fetchHtmlImpl },
    );
    expect(chAnalysis.ok).toBe(true);
    expect(chAnalysis.imageCount).toBe(3);
    expect(chAnalysis.imageSample).toEqual([
      'https://cf.example/uploads/p1.webp',
      'https://lh3.googleusercontent.com/page2-no-ext',
      'https://cf.example/uploads/p3.avif',
    ]);

    const source = PluginCodeGenerator.generate({
      siteInfo: analysis.siteInfo,
      detected: {
        ...analysis.detected,
        imageSelector: chAnalysis.imageSelector,
        imageContainerSelector: chAnalysis.imageContainerSelector,
        usesTsReader: chAnalysis.usesTsReader,
      },
    });
    expect(typeof PluginAutoGenerator.testGeneratedPlugin).toBe('function');

    const dryRun = await PluginAutoGenerator.testGeneratedPlugin({
      source,
      mangaUrl: 'https://cf.example/manga/test',
      chapterUrl: 'https://cf.example/read/c1',
      fetchHtmlImpl,
    });
    expect(dryRun.ok).toBe(true);
    expect(dryRun.manga.ok).toBe(true);
    expect(dryRun.manga.chapterCount).toBe(2);
    expect(dryRun.chapter.ok).toBe(true);
    expect(dryRun.chapter.imageCount).toBe(3);
  });

  test('blocks SSRF targets, rejects Cloudflare HTML on Chromium retry, and fails dry-run when 0 chapters found', async () => {
    const ssrfManga = await PluginAutoGenerator.analyzeMangaPage('http://127.0.0.1:9000/manga');
    expect(ssrfManga.ok).toBe(false);

    const ssrfChapter = await PluginAutoGenerator.analyzeChapterPage('http://169.254.169.254/latest', 'https://example.com');
    expect(ssrfChapter.ok).toBe(false);

    const cfRes = await PluginAutoGenerator.analyzeMangaPage('https://blocked.example/manga/1', {
      skipLatestProbe: true,
      fetchHtmlImpl: async () => ({
        ok: true,
        html: '<html><title>Just a moment...</title><div id="cf-browser-verification">Cloudflare</div></html>',
      }),
    });
    expect(cfRes.ok).toBe(false);

    const zeroChapSource = PluginCodeGenerator.generate({
      siteInfo: { id: 'zero', name: 'Zero', baseUrl: 'https://zero.example', hostname: 'zero.example', domains: ['zero.example'] },
      detected: { titleSelector: 'h1', chapterSelector: '.missing a', imageSelector: 'img' },
    });
    const zeroDryRun = await PluginAutoGenerator.testGeneratedPlugin({
      source: zeroChapSource,
      mangaUrl: 'https://zero.example/manga/1',
      fetchHtmlImpl: async () => ({ ok: true, html: '<h1>Empty Manga</h1>' }),
    });
    expect(zeroDryRun.ok).toBe(false);
    expect(zeroDryRun.manga.ok).toBe(false);
    expect(zeroDryRun.manga.chapterCount).toBe(0);
  });

  test('detects HTML chapter pagination (html-paginated) and embedded Next.js __NEXT_DATA__ (embedded-json)', async () => {
    const pagHtml = `
      <html><body>
        <h1>Paginated Comic</h1>
        <div id="chapter_list">
          <a href="/truyen/pag/chap-4">Chap 4</a>
          <a href="/truyen/pag/chap-3">Chap 3</a>
        </div>
        <ul class="pagination">
          <li><a href="/truyen/pag?page=1">1</a></li>
          <li><a href="/truyen/pag?page=2">2</a></li>
        </ul>
      </body></html>
    `;
    const pagRes = await PluginAutoGenerator.analyzeMangaPage('https://pag.example/truyen/pag', {
      skipLatestProbe: true,
      fetchHtmlImpl: async () => ({ ok: true, html: pagHtml }),
    });
    expect(pagRes.ok).toBe(true);
    expect(pagRes.detected.chapterStrategy).toBe('html-paginated');
    expect(pagRes.detected.chapterPagination?.detected).toBe(true);
    expect(pagRes.detected.chapterPagination?.pageUrlTemplate).toBe('https://pag.example/truyen/pag?page={page}');

    const nextMangaHtml = `
      <html>
        <head><title>Next Comic</title></head>
        <body>
          <h1>Next Comic</h1>
          <div id="__next"></div>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"pageProps":{"comic":{"slug":"next-comic","chapters":[{"id":1,"name":"Chapter 1","slug":"chap-1"},{"id":2,"name":"Chapter 2","slug":"chap-2"}]}}}}
          </script>
        </body>
      </html>
    `;
    const nextChapterHtml = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"images":["https://cdn.next.example/01.jpg","https://cdn.next.example/02.jpg","https://cdn.next.example/03.jpg"]}}}
        </script>
      </body></html>
    `;
    const nextFetch = async (u) => {
      if (u.includes('next-comic/chap-')) return { ok: true, html: nextChapterHtml };
      return { ok: true, html: nextMangaHtml };
    };
    const nextRes = await PluginAutoGenerator.analyzeMangaPage('https://next.example/truyen/next-comic', {
      skipLatestProbe: true,
      fetchHtmlImpl: nextFetch,
    });
    expect(nextRes.ok).toBe(true);
    expect(nextRes.detected.chapterStrategy).toBe('embedded-json');
    expect(nextRes.detected.chapterCount).toBe(2);

    const nextChRes = await PluginAutoGenerator.analyzeChapterPage(nextRes.detected.chapterFirstUrl, nextRes.siteInfo.baseUrl, {
      fetchHtmlImpl: nextFetch,
    });
    expect(nextChRes.ok).toBe(true);
    expect(nextChRes.imageStrategy).toBe('embedded-json');
    expect(nextChRes.imageCount).toBe(3);
  });

  test('uses browserSnifferImpl fallback for pure SPA JSON API + pagination and warns on render-only DOM', async () => {
    const emptyShell = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';

    const browserSnifferImpl = async (targetUrl, opts = {}) => {
      if (opts.mode === 'manga') {
        return {
          ok: true,
          renderedHtml: '<html><body><h1>React Manga</h1><a href="/truyen/react-solo/chap-1">Chap 1</a></body></html>',
          renderedLinks: [
            { text: 'Chap 1', href: 'https://spa.example/truyen/react-solo/chap-1' },
            { text: 'Chap 2', href: 'https://spa.example/truyen/react-solo/chap-2' },
          ],
          renderedImages: [],
          apiResponses: [
            {
              url: 'https://api.spa.example/v1/manga/react-solo/chapters?page=1',
              status: 200,
              json: {
                meta: { totalPages: 2 },
                chapters: [
                  { id: 1, title: 'Chap 1', slug: 'chap-1', chapter_number: 1 },
                  { id: 2, title: 'Chap 2', slug: 'chap-2', chapter_number: 2 },
                ],
              },
            },
            {
              url: 'https://api.spa.example/v1/manga/react-solo/chapters?page=2',
              status: 200,
              json: {
                meta: { totalPages: 2 },
                chapters: [{ id: 3, title: 'Chap 3', slug: 'chap-3', chapter_number: 3 }],
              },
            },
          ],
        };
      }
      return {
        ok: true,
        renderedHtml: '<html><body><div id="root"><img src="https://cdn.spa.example/01.webp" /></div></body></html>',
        renderedLinks: [],
        renderedImages: ['https://cdn.spa.example/01.webp'],
        apiResponses: [
          {
            url: 'https://api.spa.example/v1/chapter/chap-1/pages',
            status: 200,
            json: {
              data: {
                pages: [
                  { url: 'https://cdn.spa.example/01.webp' },
                  { url: 'https://cdn.spa.example/02.webp' },
                  { url: 'https://cdn.spa.example/03.webp' },
                ],
              },
            },
          },
        ],
      };
    };

    const mRes = await PluginAutoGenerator.analyzeMangaPage('https://spa.example/truyen/react-solo', {
      skipLatestProbe: true,
      fetchHtmlImpl: async () => ({ ok: true, html: emptyShell }),
      browserSnifferImpl,
    });
    expect(mRes.ok).toBe(true);
    expect(mRes.browserSnifferUsed).toBe(true);
    expect(mRes.detected.chapterStrategy).toBe('api-json');
    expect(mRes.detected.chapterApi?.urlTemplate).toBe('https://api.spa.example/v1/manga/{mangaSlug}/chapters?page={page}');

    const cRes = await PluginAutoGenerator.analyzeChapterPage(mRes.detected.chapterFirstUrl, mRes.siteInfo.baseUrl, {
      fetchHtmlImpl: async () => ({ ok: true, html: emptyShell }),
      browserSnifferImpl,
    });
    expect(cRes.ok).toBe(true);
    expect(cRes.browserSnifferUsed).toBe(true);
    expect(cRes.imageStrategy).toBe('api-json');
    expect(cRes.imageApi?.urlTemplate).toBe('https://api.spa.example/v1/chapter/{chapterSlug}/pages');

    // Render-only SPA (DOM chapters after JS, no JSON API) must set spaRenderWarning: true
    const renderOnlyRes = await PluginAutoGenerator.analyzeMangaPage('https://domspa.example/truyen/dom-only', {
      skipLatestProbe: true,
      fetchHtmlImpl: async () => ({ ok: true, html: emptyShell }),
      browserSnifferImpl: async () => ({
        ok: true,
        renderedHtml: '<html><body><h1>DOM SPA</h1><div class="chapter-list"><a href="/dom-only/c1">Chap 1</a><a href="/dom-only/c2">Chap 2</a></div></body></html>',
        renderedLinks: [],
        renderedImages: [],
        apiResponses: [],
      }),
    });
    expect(renderOnlyRes.ok).toBe(true);
    expect(renderOnlyRes.detected.spaRenderWarning).toBe(true);
    expect(renderOnlyRes.detected.chapterCount).toBe(2);
  });

  test('emits monotonic onProgress telemetry for both manga and chapter analysis and survives throwing listeners', async () => {
    const emptyShell = '<html><head><title>Prog</title></head><body><div id="root"></div></body></html>';
    const events = [];
    const mRes = await PluginAutoGenerator.analyzeMangaPage('https://spa.example/truyen/react-solo', {
      skipLatestProbe: true,
      fetchHtmlImpl: async () => ({ ok: true, html: emptyShell }),
      browserSnifferImpl: async () => ({
        ok: true,
        renderedHtml: '<html><body><h1>React Manga</h1></body></html>',
        renderedLinks: [{ text: 'Chap 1', href: 'https://spa.example/truyen/react-solo/chap-1' }],
        renderedImages: [],
        apiResponses: [
          {
            url: 'https://api.spa.example/v1/manga/react-solo/chapters?page=1',
            status: 200,
            json: { data: { chapters: [{ slug: 'chap-1', title: 'Chap 1' }] } },
          },
        ],
      }),
      onProgress: (ev) => events.push(ev),
    });

    expect(mRes.ok).toBe(true);
    expect(events.map((e) => `${e.step}:${e.status}`)).toEqual([
      'fetch_manga:running',
      'fetch_manga:done',
      'cms_metadata:running',
      'cms_metadata:done',
      'tier1_chapters:running',
      'tier1_chapters:warn',
      'tier2_ssr_json:running',
      'tier2_ssr_json:skipped',
      'tier3_spa_sniffer:running',
      'tier3_spa_sniffer:done',
      'latest_updates:skipped',
    ]);
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].progress).toBeGreaterThanOrEqual(events[i - 1].progress);
    }

    const chEvents = [];
    const cRes = await PluginAutoGenerator.analyzeChapterPage(
      'https://spa.example/truyen/react-solo/chap-1',
      'https://spa.example',
      {
        fetchHtmlImpl: async () => ({
          ok: true,
          html: '<div class="reading"><img src="/1.jpg"><img src="/2.jpg"><img src="/3.jpg"></div>',
        }),
        onProgress: (ev) => {
          chEvents.push(ev);
          throw new Error('listener boom');
        },
      },
    );
    expect(cRes.ok).toBe(true);
    expect(cRes.imageCount).toBe(3);
    expect(chEvents[0].step).toBe('chapter_images');
    expect(chEvents[chEvents.length - 1].status).toBe('done');
    expect(chEvents[chEvents.length - 1].meta.count).toBe(3);
  });
});
