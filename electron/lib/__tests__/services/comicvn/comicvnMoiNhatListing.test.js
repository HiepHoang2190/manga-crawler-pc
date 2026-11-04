const fs = require('fs');
const path = require('path');
const {
  DOMAIN,
  MOI_NHAT_MAX_PAGES_CAP,
  isComicvnMangaListingUrl,
  buildMoiNhatListingUrl,
  parseMoiNhatListingHtml,
  parseMoiNhatMaxPage,
  fetchMoiNhatListing,
} = require('../../../platform/connectors/services/comicvnService');

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, '../../fixtures/comicvn', name), 'utf8');

describe('ComicVN moi-nhat parse helpers', () => {
  test('isComicvnMangaListingUrl accepts manga html, rejects chapter and junk', () => {
    expect(
      isComicvnMangaListingUrl(
        'https://comicvn19.net/manga-one-aaaaaaaaaaaaaaaaaaaaaaa1.html',
      ),
    ).toBe(true);
    expect(
      isComicvnMangaListingUrl(
        'https://comicvn19.net/manga-one/chapter-10-bbbbbbbbbbbbbbbbbbbbbbb1.html',
      ),
    ).toBe(false);
    expect(isComicvnMangaListingUrl('https://comicvn19.net/danh-muc/moi-nhat')).toBe(false);
  });

  test('buildMoiNhatListingUrl page 1 has no query; page N uses ?page=', () => {
    expect(buildMoiNhatListingUrl(1)).toBe(`${DOMAIN}danh-muc/moi-nhat`);
    expect(buildMoiNhatListingUrl(2)).toBe(`${DOMAIN}danh-muc/moi-nhat?page=2`);
    expect(buildMoiNhatListingUrl(0)).toBe(`${DOMAIN}danh-muc/moi-nhat`);
  });

  test('parseMoiNhatMaxPage reads highest ?page= from pager', () => {
    const html =
      '<a href="https://comicvn19.net/danh-muc/moi-nhat?page=2">2</a><a href="https://comicvn19.net/danh-muc/moi-nhat?page=9">9</a>';
    expect(parseMoiNhatMaxPage(html)).toBe(9);
    expect(parseMoiNhatMaxPage(fixture('moi_nhat_page_1.html'))).toBe(2);
    expect(MOI_NHAT_MAX_PAGES_CAP).toBe(15);
  });

  test('parseMoiNhatListingHtml returns manga cards only (not chapter links)', () => {
    const items = parseMoiNhatListingHtml(
      fixture('moi_nhat_page_1.html'),
      `${DOMAIN}danh-muc/moi-nhat`,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Manga One',
      mangaUrl: 'https://comicvn19.net/manga-one-aaaaaaaaaaaaaaaaaaaaaaa1.html',
      coverUrl: 'https://cdn.example/one.jpg',
      latestChapterLabel: 'Chapter 10',
    });
    expect(items[1].title).toBe('Manga Two');
  });
});

describe('fetchMoiNhatListing', () => {
  test('merges pages and dedupes by mangaUrl', async () => {
    const pages = {
      [`${DOMAIN}danh-muc/moi-nhat`]: fixture('moi_nhat_page_1.html'),
      [`${DOMAIN}danh-muc/moi-nhat?page=2`]: fixture('moi_nhat_page_2.html'),
    };
    const progress = [];
    const res = await fetchMoiNhatListing({
      onProgress: (p) => progress.push({ ...p }),
      fetchHtmlImpl: async (url) => {
        const html = pages[url];
        if (!html) return { ok: false, error: `unexpected ${url}` };
        return { ok: true, html };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.siteId).toBe('comicvn');
    expect(res.pagesFetched).toBe(2);
    expect(res.totalPagesDetected).toBe(2);
    expect(res.items.map((i) => i.mangaUrl)).toEqual([
      'https://comicvn19.net/manga-one-aaaaaaaaaaaaaaaaaaaaaaa1.html',
      'https://comicvn19.net/manga-two-aaaaaaaaaaaaaaaaaaaaaaa2.html',
      'https://comicvn19.net/manga-three-aaaaaaaaaaaaaaaaaaaaaaa3.html',
    ]);
    expect(res.items[0].title).toBe('Manga One');
    expect(progress[0]).toEqual({ page: 1, totalPages: 2 });
    expect(progress[1]).toEqual({ page: 2, totalPages: 2 });
  });

  test('page 1 failure returns ok:false', async () => {
    const res = await fetchMoiNhatListing({
      fetchHtmlImpl: async () => ({ ok: false, error: 'HTTP 500' }),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/500/);
    expect(res.items).toEqual([]);
  });

  test('later page failure returns partial ok:true with error', async () => {
    const res = await fetchMoiNhatListing({
      fetchHtmlImpl: async (url) => {
        if (url.includes('page=2')) return { ok: false, error: 'HTTP 503' };
        return { ok: true, html: fixture('moi_nhat_page_1.html') };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.items.length).toBe(2);
    expect(res.error).toMatch(/503/);
  });

  test('respects MOI_NHAT_MAX_PAGES_CAP even if pager claims higher', async () => {
    const hugePager = `
      <div id="listComic"><ul class="list"><li>
        <div class="detail"><h3><a href="https://comicvn19.net/manga-one-aaaaaaaaaaaaaaaaaaaaaaa1.html">One</a></h3></div>
      </li></ul></div>
      <a href="https://comicvn19.net/danh-muc/moi-nhat?page=99">99</a>`;
    let maxRequested = 1;
    await fetchMoiNhatListing({
      fetchHtmlImpl: async (url) => {
        const m = url.match(/[?&]page=(\d+)/);
        const p = m ? parseInt(m[1], 10) : 1;
        maxRequested = Math.max(maxRequested, p);
        if (p === 1) return { ok: true, html: hugePager };
        return {
          ok: true,
          html: '<div id="listComic"><ul class="list"></ul></div>',
        };
      },
    });
    expect(maxRequested).toBe(15);
  });
});
