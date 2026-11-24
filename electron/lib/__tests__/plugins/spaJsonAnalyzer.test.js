'use strict';

const cheerio = require('cheerio');
const {
  getByPath,
  extractEmbeddedStateJson,
  findChapterArrayInJson,
  findImageArrayInJson,
  detectHtmlChapterPagination,
  inferApiUrlTemplate,
  inferChapterApiUrlTemplate,
} = require('../../plugins/spaJsonAnalyzer');

describe('spaJsonAnalyzer — SSR JSON, SPA API inference & HTML pagination', () => {
  test('extractEmbeddedStateJson parses __NEXT_DATA__ and generic JSON scripts without eval', () => {
    const html = `
      <html>
        <head></head>
        <body>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"pageProps":{"comic":{"slug":"solo-leveling","chapters":[{"id":1,"slug":"chap-1","title":"Chapter 1"}]}}}}
          </script>
          <script type="application/json">
            {"ads":{"slot":"top"}}
          </script>
        </body>
      </html>
    `;
    const candidates = extractEmbeddedStateJson(html);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].sourceType).toBe('__NEXT_DATA__');
    expect(candidates[0].data.props.pageProps.comic.slug).toBe('solo-leveling');
  });

  test('findChapterArrayInJson ignores genres/tags arrays, extracts chapter mapping, and infers URL template from renderedLinks', () => {
    const json = {
      props: {
        pageProps: {
          comic: {
            id: 42,
            slug: 'solo-leveling',
            genres: [
              { id: 1, name: 'Action', slug: 'action' },
              { id: 2, name: 'Fantasy', slug: 'fantasy' },
              { id: 3, name: 'Drama', slug: 'drama' },
            ],
            chapters: [
              { id: 101, chapter_number: 1, name: 'Chapter 1', slug: 'chap-1' },
              { id: 102, chapter_number: 2, name: 'Chapter 2', slug: 'chap-2' },
              { id: 103, chapter_number: 3, name: 'Chapter 3', slug: 'chap-3' },
            ],
          },
        },
      },
    };
    const renderedLinks = [
      'https://spa.example/truyen/solo-leveling/chap-1',
      'https://spa.example/truyen/solo-leveling/chap-2',
    ];
    const match = findChapterArrayInJson(json, 'https://spa.example/truyen/solo-leveling', renderedLinks);
    expect(match).not.toBeNull();
    expect(match.arrayPath).toBe('props.pageProps.comic.chapters');
    expect(match.slugField).toBe('slug');
    expect(match.titleField).toBe('name');
    expect(match.chapters.length).toBe(3);
    expect(match.chapters[0].url).toBe('https://spa.example/truyen/solo-leveling/chap-1');
    expect(match.chapterUrlTemplate).toContain('{chapterSlug}');
  });

  test('findImageArrayInJson finds nested image arrays (strings or objects + prefix) and excludes avatars/logos', () => {
    const json = {
      data: {
        cdnHost: 'https://cdn.spa.example',
        banners: ['https://spa.example/logo.png', 'https://spa.example/avatar/u1.png'],
        pages: [
          { page: 1, image_path: '/chapters/9/001.webp' },
          { page: 2, image_path: '/chapters/9/002.webp' },
          { page: 3, image_path: '/chapters/9/003.webp' },
        ],
      },
    };
    const res = findImageArrayInJson(json, 'https://spa.example/read/9');
    expect(res).not.toBeNull();
    expect(res.arrayPath).toBe('data.pages');
    expect(res.imageField).toBe('image_path');
    expect(res.prefixPath).toBe('data.cdnHost');
    expect(res.images).toEqual([
      'https://cdn.spa.example/chapters/9/001.webp',
      'https://cdn.spa.example/chapters/9/002.webp',
      'https://cdn.spa.example/chapters/9/003.webp',
    ]);
  });

  test('detectHtmlChapterPagination detects same-manga ?page=N pagination while ignoring unrelated links', () => {
    const html = `
      <html><body>
        <div class="top-nav">
          <a href="/the-loai/action?page=5">Action p5</a>
        </div>
        <div id="chapter_list">
          <a href="/truyen/solo/chap-5">Chap 5</a>
          <a href="/truyen/solo/chap-4">Chap 4</a>
        </div>
        <ul class="pagination">
          <li class="active"><a href="/truyen/solo?page=1">1</a></li>
          <li><a href="/truyen/solo?page=2">2</a></li>
          <li><a href="/truyen/solo?page=3">3</a></li>
          <li><a rel="next" href="/truyen/solo?page=2">&raquo;</a></li>
        </ul>
      </body></html>
    `;
    const $ = cheerio.load(html);
    const pag = detectHtmlChapterPagination($, 'https://ex.example/truyen/solo');
    expect(pag.detected).toBe(true);
    expect(pag.maxPagesDetected).toBe(3);
    expect(pag.pageUrlTemplate).toBe('https://ex.example/truyen/solo?page={page}');
  });

  test('inferApiUrlTemplate & inferChapterApiUrlTemplate parameterize manga/chapter IDs and pagination params', () => {
    const tpl1 = inferApiUrlTemplate(
      'https://api.spa.example/v1/manga/solo-leveling/chapters?page=1&limit=20',
      'https://spa.example/truyen/solo-leveling',
      'https://api.spa.example/v1/manga/solo-leveling/chapters?page=2&limit=20',
    );
    expect(tpl1.paginated).toBe(true);
    expect(tpl1.paginationType).toBe('page');
    expect(tpl1.urlTemplate).toBe('https://api.spa.example/v1/manga/{mangaSlug}/chapters?page={page}&limit=20');

    const tplOffset = inferApiUrlTemplate(
      'https://api.spa.example/comics/5512/chapters?offset=0&limit=50',
      'https://spa.example/comics/5512',
      'https://api.spa.example/comics/5512/chapters?offset=50&limit=50',
    );
    expect(tplOffset.paginated).toBe(true);
    expect(tplOffset.paginationType).toBe('offset');
    expect(tplOffset.offsetStep).toBe(50);
    expect(tplOffset.urlTemplate).toBe('https://api.spa.example/comics/{mangaId}/chapters?offset={offset}&limit=50');

    const chTpl = inferChapterApiUrlTemplate(
      'https://api.spa.example/v1/chapter/98765/pages',
      'https://spa.example/read/98765',
    );
    expect(chTpl.urlTemplate).toBe('https://api.spa.example/v1/chapter/{chapterId}/pages');

    const chSlugTpl = inferChapterApiUrlTemplate(
      'https://api.spa.example/v1/chapter/chap-12/pages',
      'https://spa.example/read/chap-12',
    );
    expect(chSlugTpl.urlTemplate).toBe('https://api.spa.example/v1/chapter/{chapterSlug}/pages');
  });

  test('getByPath blocks prototype-pollution keys', () => {
    const obj = { nested: { value: 'safe' } };
    expect(getByPath(obj, 'nested.value')).toBe('safe');
    expect(getByPath(obj, '__proto__.polluted')).toBeUndefined();
    expect(getByPath(obj, 'nested.constructor.prototype')).toBeUndefined();
    expect(getByPath(obj, 'prototype')).toBeUndefined();
    expect(getByPath(obj, 'toString')).toBeUndefined();
  });

  test('inferApiUrlTemplate separates mangaSlug from numeric mangaId on /manga/slug/id URLs', () => {
    const tplBySlug = inferApiUrlTemplate(
      'https://api.spa.example/v1/manga/solo-leveling/chapters?page=1',
      'https://spa.example/manga/solo-leveling/12345',
    );
    expect(tplBySlug.urlTemplate).toBe('https://api.spa.example/v1/manga/{mangaSlug}/chapters?page={page}');

    const tplById = inferApiUrlTemplate(
      'https://api.spa.example/v1/comics/12345/chapters?page=1',
      'https://spa.example/manga/solo-leveling/12345',
    );
    expect(tplById.urlTemplate).toBe('https://api.spa.example/v1/comics/{mangaId}/chapters?page={page}');
  });

  test('detectHtmlChapterPagination detects path-based pagination (/page/2) and builds runtimeSuffixTemplate', () => {
    const html = `
      <div class="pagination">
        <a href="/manga/naruto/page/2">2</a>
        <a href="/manga/naruto/page/3">3</a>
      </div>
    `;
    const $ = cheerio.load(html);
    const pag = detectHtmlChapterPagination($, 'https://pag.example/manga/naruto');
    expect(pag).toEqual({
      detected: true,
      pageUrlTemplate: 'https://pag.example/manga/naruto/page/{page}',
      runtimeSuffixTemplate: '/page/{page}',
      paginationType: 'path',
      maxPagesDetected: 3,
    });
  });

  test('extractEmbeddedStateJson parses window.__NUXT__ strict JSON assignment without eval', () => {
    const html = `
      <html><body>
        <script>window.__NUXT__ = {"data":{"chapters":[{"slug":"c1","title":"Chap 1"}]}};</script>
      </body></html>
    `;
    const candidates = extractEmbeddedStateJson(html);
    expect(candidates.some((c) => c.sourceType === '__NUXT__' && c.data?.data?.chapters?.[0]?.slug === 'c1')).toBe(true);
  });
});
