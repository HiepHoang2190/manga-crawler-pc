const connectors = require('../../platform/connectors');
const comickService = require('../../platform/connectors/services/comickService');
const manhuaguiService = require('../../platform/connectors/services/manhuaguiService');
const truyenTranhPhapBiService = require('../../platform/connectors/services/truyenTranhPhapBiService');
const comicDaysService = require('../../platform/connectors/services/comicDaysService');
const webtoonService = require('../../platform/connectors/services/webtoonService');
const rawkumaService = require('../../platform/connectors/services/rawkumaService');
const diliberService = require('../../platform/connectors/services/diliberService');

describe('Latest Updates Connectors — Wave 2 Registry Flags', () => {
  test('all 7 Wave 2 connectors expose supportsLatestUpdates=true in listConnectors()', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    for (const id of [
      'comick',
      'manhuagui',
      'truyentranhphapbi',
      'comicdays',
      'webtoons',
      'rawkuma',
      'dilib',
    ]) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id).supportsLatestUpdates).toBe(true);
    }
    for (const id of ['manhuagui', 'truyentranhphapbi', 'webtoons', 'dilib']) {
      expect(map.get(id).supportsLatestUpdatesSearch).toBe(true);
    }
  });
});

describe('Comick fetchLatestUpdates', () => {
  test('fetches latest chapters JSON API and maps items + next_cursor pagination', async () => {
    let seenUrl = '';
    const res = await comickService.fetchLatestUpdates({
      page: 2,
      fetchImpl: async (url) => {
        seenUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                slug: 'star-strike-it-rich',
                title: 'Star: Strike It Rich',
                default_thumbnail: 'https://cdn1.comicknew.pictures/star/cover.webp',
                chapter_latest_by_langs: { en: { chapter_number: '74' } },
              },
              {
                slug: 'other-manga',
                title: 'Other Manga',
                default_thumbnail: 'https://cdn1.comicknew.pictures/other/cover.webp',
                chapter_latest_by_langs: { vi: { chapter_number: '12.5' } },
              },
            ],
            next_cursor: 'cursor-token',
          }),
        };
      },
    });
    expect(seenUrl).toBe('https://comick.live/api/chapters/latest?page=2');
    expect(res).toMatchObject({
      ok: true,
      siteId: 'comick',
      page: 2,
      totalPages: 3,
    });
    expect(res.items).toEqual([
      {
        title: 'Star: Strike It Rich',
        mangaUrl: 'https://comick.live/comic/star-strike-it-rich',
        coverUrl: 'https://cdn1.comicknew.pictures/star/cover.webp',
        latestChapterLabel: 'Chapter 74',
      },
      {
        title: 'Other Manga',
        mangaUrl: 'https://comick.live/comic/other-manga',
        coverUrl: 'https://cdn1.comicknew.pictures/other/cover.webp',
        latestChapterLabel: 'Chapter 12.5',
      },
    ]);
  });

  test('caches next_cursor after page 1 and uses ?cursor=... on page 2', async () => {
    const seenUrls = [];
    const mockFetch = async (url) => {
      seenUrls.push(url);
      if (url.includes('page=1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ slug: 'manga-p1', title: 'Manga P1' }],
            next_cursor: 'cur-p2',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ slug: 'manga-p2', title: 'Manga P2' }],
          next_cursor: null,
        }),
      };
    };
    const p1 = await comickService.fetchLatestUpdates({ page: 1, fetchImpl: mockFetch });
    const p2 = await comickService.fetchLatestUpdates({ page: 2, fetchImpl: mockFetch });
    expect(seenUrls).toEqual([
      'https://comick.live/api/chapters/latest?page=1',
      'https://comick.live/api/chapters/latest?cursor=cur-p2',
    ]);
    expect(p1.totalPages).toBe(2);
    expect(p2.totalPages).toBe(2);
    expect(p2.items[0].title).toBe('Manga P2');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await comickService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('ManhuaGui fetchLatestUpdates', () => {
  test('parses /update/ list, normalizes protocol-relative covers, slices pages, and supports search', async () => {
    const liChunks = Array.from({ length: 65 }, (_, i) => `
      <li>
        <a class="cover" href="/comic/${1000 + i}/" title="Manga ${i + 1}">
          <img src="//cf.mhgui.com/cpic/m/${1000 + i}.jpg" alt="Manga ${i + 1}">
          <span class="tt">更新至${i + 1}話</span>
        </a>
        <p class="ell"><a href="/comic/${1000 + i}/">Manga ${i + 1}</a></p>
      </li>
    `).join('\n');
    const updateHtml = `<ul class="latest-list">${liChunks}</ul>`;
    const res = await manhuaguiService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://tw.manhuagui.com/update/');
        return { ok: true, html: updateHtml };
      },
    });
    expect(res).toMatchObject({
      ok: true,
      siteId: 'manhuagui',
      page: 2,
      totalPages: 2,
    });
    expect(res.items).toHaveLength(5);
    expect(res.items[0]).toMatchObject({
      title: 'Manga 61',
      mangaUrl: 'https://tw.manhuagui.com/comic/1060/',
      coverUrl: 'https://cf.mhgui.com/cpic/m/1060.jpg',
      latestChapterLabel: '更新至61話',
    });

    const searchHtml = `
      <div class="book-result">
        <ul>
          <li>
            <div class="book-cover">
              <a class="bcover" href="/comic/48203/" title="BUGEGO">
                <img src="//cf.mhgui.com/cpic/b/48203_91.jpg" alt="BUGEGO">
                <span class="tt">更新至25話</span>
              </a>
            </div>
            <div class="book-detail"><dl><dt><a href="/comic/48203/" title="BUGEGO">BUGEGO</a></dt></dl></div>
          </li>
        </ul>
      </div>
      <div class="pager"><a href="/s/one_p3.html">3</a></div>
    `;
    let seenSearchUrl = '';
    const searchRes = await manhuaguiService.fetchLatestUpdates({
      page: 2,
      latestUpdatesSearch: 'one',
      fetchHtmlImpl: async (url) => {
        seenSearchUrl = url;
        return { ok: true, html: searchHtml };
      },
    });
    expect(seenSearchUrl).toBe('https://tw.manhuagui.com/s/one_p2.html');
    expect(searchRes).toMatchObject({
      ok: true,
      siteId: 'manhuagui',
      page: 2,
      totalPages: 3,
    });
    expect(searchRes.items[0]).toMatchObject({
      title: 'BUGEGO',
      mangaUrl: 'https://tw.manhuagui.com/comic/48203/',
      coverUrl: 'https://cf.mhgui.com/cpic/b/48203_91.jpg',
      latestChapterLabel: '更新至25話',
    });
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await manhuaguiService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('TruyenTranhPhapBi fetchLatestUpdates', () => {
  test('fetches Blogger JSON feed for listing and search with upgraded s640 thumbnails', async () => {
    const calls = [];
    const mockFetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          feed: {
            'openSearch$totalResults': { $t: '50' },
            entry: [
              {
                title: { $t: 'Tintin - Tập 1' },
                link: [
                  { rel: 'self', href: 'https://www.truyentranhphapbi.com/feeds/1' },
                  { rel: 'alternate', href: 'https://www.truyentranhphapbi.com/2026/05/tintin-1.html' },
                ],
                media$thumbnail: {
                  url: 'https://blogger.googleusercontent.com/img/b/abc/s72-c/cover.jpg',
                },
              },
            ],
          },
        }),
      };
    };

    const res = await truyenTranhPhapBiService.fetchLatestUpdates({
      page: 2,
      latestUpdatesSearch: 'tintin',
      fetchImpl: mockFetch,
    });
    expect(calls[0]).toBe(
      'https://www.truyentranhphapbi.com/feeds/posts/default?alt=json&start-index=25&max-results=24&q=tintin',
    );
    expect(res).toMatchObject({
      ok: true,
      siteId: 'truyentranhphapbi',
      page: 2,
      totalPages: 3,
    });
    expect(res.items).toEqual([
      {
        title: 'Tintin - Tập 1',
        mangaUrl: 'https://www.truyentranhphapbi.com/2026/05/tintin-1.html',
        coverUrl: 'https://blogger.googleusercontent.com/img/b/abc/s640/cover.jpg',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await truyenTranhPhapBiService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('ComicDays fetchLatestUpdates', () => {
  test('parses __NEXT_DATA__ originalSerials sorted newest date first, deduplicates series, fills thumbnail dimensions', async () => {
    const nextData = {
      props: {
        pageProps: {
          data: {
            originalSerials: {
              monday: {
                name: 'monday',
                serialUpdatedDate: '2026-11-20T03:00:00Z',
                latestEpisodes: [
                  {
                    title: '第1話',
                    permalink: 'https://comic-days.com/episode/111',
                    series: {
                      id: 'S1',
                      title: 'Monday Series',
                      thumbnailUriTemplate: 'https://cdn-scissors.gigaviewer.com/img/{width}x{height}/s1.jpg',
                    },
                  },
                ],
              },
              wednesday: {
                name: 'wednesday',
                serialUpdatedDate: '2026-11-23T03:00:00Z',
                latestEpisodes: [
                  {
                    title: '第42話',
                    permalink: 'https://comic-days.com/episode/222',
                    series: {
                      id: 'S2',
                      title: 'Wednesday Series',
                      thumbnailUriTemplate: 'https://cdn-scissors.gigaviewer.com/img/width={width};height={height}/s2.jpg',
                    },
                  },
                  {
                    title: '第41話',
                    permalink: 'https://comic-days.com/episode/221',
                    series: {
                      id: 'S2',
                      title: 'Wednesday Series',
                      thumbnailUriTemplate: 'https://cdn-scissors.gigaviewer.com/img/width={width};height={height}/s2.jpg',
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
    const res = await comicDaysService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://comic-days.com/');
        return { ok: true, html };
      },
    });
    expect(res).toMatchObject({
      ok: true,
      siteId: 'comicdays',
      page: 1,
      totalPages: 1,
    });
    expect(res.items).toEqual([
      {
        title: 'Wednesday Series',
        mangaUrl: 'https://comic-days.com/episode/222',
        coverUrl: 'https://cdn-scissors.gigaviewer.com/img/width=480;height=640/s2.jpg',
        latestChapterLabel: '第42話',
      },
      {
        title: 'Monday Series',
        mangaUrl: 'https://comic-days.com/episode/111',
        coverUrl: 'https://cdn-scissors.gigaviewer.com/img/480x640/s1.jpg',
        latestChapterLabel: '第1話',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await comicDaysService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('Webtoons fetchLatestUpdates', () => {
  test('parses dailySchedule prioritizing UP items and handles search query', async () => {
    const dailyHtml = `
      <ul class="webtoon_list">
        <li>
          <a href="https://www.webtoons.com/en/romance/b/list?title_no=200">
            <img src="https://cdn.wt/b.jpg" alt="Series B">
            <strong class="title">Series B</strong>
          </a>
        </li>
        <li>
          <a href="https://www.webtoons.com/en/action/a/list?title_no=100">
            <img src="https://cdn.wt/a.jpg" alt="Series A">
            <strong class="title">Series A</strong>
            <span class="badge_up2">UP</span>
          </a>
        </li>
        <li>
          <a href="https://www.webtoons.com/en/action/a/list?title_no=100">
            <img src="https://cdn.wt/a.jpg" alt="Series A">
            <strong class="title">Series A</strong>
          </a>
        </li>
      </ul>
    `;
    const listRes = await webtoonService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://www.webtoons.com/en/dailySchedule');
        return { ok: true, html: dailyHtml };
      },
    });
    expect(listRes.ok).toBe(true);
    expect(listRes.items).toEqual([
      {
        title: 'Series A',
        mangaUrl: 'https://www.webtoons.com/en/action/a/list?title_no=100',
        coverUrl: 'https://cdn.wt/a.jpg',
        latestChapterLabel: 'UP',
      },
      {
        title: 'Series B',
        mangaUrl: 'https://www.webtoons.com/en/romance/b/list?title_no=200',
        coverUrl: 'https://cdn.wt/b.jpg',
        latestChapterLabel: '',
      },
    ]);

    const searchHtml = `
      <ul>
        <li>
          <a href="/en/action/emperor-of-solo-play/list?title_no=7830">
            <img src="https://cdn.wt/7830.jpg" alt="Emperor of Solo Play">
            <p class="subj">Emperor of Solo Play</p>
          </a>
        </li>
      </ul>
    `;
    let seenUrl = '';
    const searchRes = await webtoonService.fetchLatestUpdates({
      latestUpdatesSearch: 'solo',
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html: searchHtml };
      },
    });
    expect(seenUrl).toBe('https://www.webtoons.com/en/search?keyword=solo');
    expect(searchRes.items[0]).toMatchObject({
      title: 'Emperor of Solo Play',
      mangaUrl: 'https://www.webtoons.com/en/action/emperor-of-solo-play/list?title_no=7830',
      coverUrl: 'https://cdn.wt/7830.jpg',
    });
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await webtoonService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('RawKuma fetchLatestUpdates', () => {
  test('parses /latest-update/?the_page=2 cards and pagination', async () => {
    const html = `
      <div class="grid">
        <div>
          <div class="relative mb-[5px]">
            <a href="https://rawkuma.net/manga/noisering/">
              <div><img src="https://rawkuma.net/wp-content/uploads/2026/09/Noisering.webp" alt="Noisering" /></div>
            </a>
          </div>
          <div><a href="https://rawkuma.net/manga/noisering/"><h1> Noisering </h1></a></div>
          <a href="https://rawkuma.net/manga/noisering/chapter-12.437470/">
            <div><p> Chapter 12 </p></div>
            <div><time>45 minutes ago</time></div>
          </a>
        </div>
      </div>
      <a href="https://rawkuma.net/latest-update/?the_page=5">5</a>
    `;
    let seenUrl = '';
    const res = await rawkumaService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://rawkuma.net/latest-update/?the_page=2');
    expect(res).toMatchObject({
      ok: true,
      siteId: 'rawkuma',
      page: 2,
      totalPages: 5,
    });
    expect(res.items).toEqual([
      {
        title: 'Noisering',
        mangaUrl: 'https://rawkuma.net/manga/noisering/',
        coverUrl: 'https://rawkuma.net/wp-content/uploads/2026/09/Noisering.webp',
        latestChapterLabel: 'Chapter 12',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await rawkumaService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('Dilib fetchLatestUpdates', () => {
  test('parses homepage book cards skipping nav/donate icons and parses AJAX search results', async () => {
    const homeHtml = `
      <div class="divicon">
        <a href="/thu-vien-sach-dien-tu-1066.html" title="Thư Viện Sách"><img src="/search/images/gioi-thieu.png"></a>
      </div>
      <a href="https://khoahoctamlinh.vn/ung-ho-6972.html" title="Ủng Hộ"><img src="/search/images/donate.png"></a>
      <a href="/ha-do-trong-van-minh-dai-viet-16390.html" title="Sách Hà Đồ Trong Văn Minh Đại Việt">
        <img src="/img/news/2026/11/thumb/16390-ha-do.webp">
      </a>
      <a href="/ha-do-trong-van-minh-dai-viet-16390.html" title="Sách Hà Đồ Trong Văn Minh Đại Việt">
        <img src="/img/news/2026/11/thumb/16390-ha-do.webp">
      </a>
    `;
    const listRes = await diliberService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://dilib.vn/');
        return { ok: true, html: homeHtml };
      },
    });
    expect(listRes).toMatchObject({ ok: true, siteId: 'dilib', page: 1, totalPages: 1 });
    expect(listRes.items).toEqual([
      {
        title: 'Sách Hà Đồ Trong Văn Minh Đại Việt',
        mangaUrl: 'https://dilib.vn/ha-do-trong-van-minh-dai-viet-16390.html',
        coverUrl: 'https://dilib.vn/img/news/2026/11/thumb/16390-ha-do.webp',
        latestChapterLabel: '',
      },
    ]);

    const ajaxHtml = `
      <div id="searchajax">
        <a href="/10-cau-chuyen-kinh-di-6608.html" title="10 Câu Chuyện Kinh Dị">
          <img src="/img/news/2024/12/thumb/6608-kinh-di.webp?v=1">
        </a>
      </div>
    `;
    let seenSearchUrl = '';
    const searchRes = await diliberService.fetchLatestUpdates({
      latestUpdatesSearch: 'kinh',
      fetchHtmlImpl: async (url) => {
        seenSearchUrl = url;
        return { ok: true, html: ajaxHtml };
      },
    });
    expect(seenSearchUrl).toBe('https://dilib.vn/search/ajax-search.php?keyword=kinh');
    expect(searchRes.items).toEqual([
      {
        title: '10 Câu Chuyện Kinh Dị',
        mangaUrl: 'https://dilib.vn/10-cau-chuyen-kinh-di-6608.html',
        coverUrl: 'https://dilib.vn/img/news/2024/12/thumb/6608-kinh-di.webp?v=1',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await diliberService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});
