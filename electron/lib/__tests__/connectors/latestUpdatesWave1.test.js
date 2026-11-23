const connectors = require('../../platform/connectors');
const comicvnService = require('../../platform/connectors/services/comicvnService');
const xbatoService = require('../../platform/connectors/services/xbatoService');
const suicaodexService = require('../../platform/connectors/services/suicaodexService');
const kingOfShojoService = require('../../platform/connectors/services/kingOfShojoService');
const fanfoxService = require('../../platform/connectors/services/fanfoxService');
const mangapillService = require('../../platform/connectors/services/mangapillService');

describe('Latest Updates Connectors — Wave 1 Registry Flags', () => {
  test('all 7 Wave 1 connectors expose supportsLatestUpdates=true in listConnectors()', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    for (const id of ['truyenmoe', 'comicvn', 'xbato', 'suicaodex', 'kingofshojo', 'fanfox', 'mangapill']) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id).supportsLatestUpdates).toBe(true);
    }
    for (const id of ['truyenmoe', 'xbato', 'suicaodex', 'kingofshojo', 'mangapill']) {
      expect(map.get(id).supportsLatestUpdatesSearch).toBe(true);
    }
  });

  test('truyenmoe and moetruyen respect pre-aborted signal in fetchLatestUpdates', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await connectors.get('truyenmoe').fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
    expect(await connectors.get('moetruyen').fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('ComicVN fetchLatestUpdates', () => {
  test('fetches single page using buildMoiNhatListingUrl and parses items + totalPages', async () => {
    const html = `
      <div id="listComic">
        <ul class="list">
          <li>
            <div class="cover">
              <a href="https://comicvn19.net/truyen-a-aaaaaaaaaaaaaaaaaaaaaaa1.html">
                <img data-src="https://cdn.example/a.jpg" alt="Truyện A" />
              </a>
            </div>
            <div class="detail">
              <h3><a href="https://comicvn19.net/truyen-a-aaaaaaaaaaaaaaaaaaaaaaa1.html">Truyện A</a></h3>
              <div class="chapters"><h4><a href="#">Chapter 55</a></h4></div>
            </div>
          </li>
        </ul>
      </div>
      <a href="https://comicvn19.net/danh-muc/moi-nhat?page=9">9</a>
    `;
    let seenUrl = '';
    const res = await comicvnService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://comicvn19.net/danh-muc/moi-nhat?page=2');
    expect(res).toMatchObject({
      ok: true,
      siteId: 'comicvn',
      page: 2,
      totalPages: 9,
    });
    expect(res.items[0]).toMatchObject({
      title: 'Truyện A',
      mangaUrl: 'https://comicvn19.net/truyen-a-aaaaaaaaaaaaaaaaaaaaaaa1.html',
      coverUrl: 'https://cdn.example/a.jpg',
      latestChapterLabel: 'Chapter 55',
    });
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const res = await comicvnService.fetchLatestUpdates({ signal: ac.signal });
    expect(res).toMatchObject({ ok: false, aborted: true });
  });
});

describe('SuicaoDex fetchLatestUpdates', () => {
  test('fetches listing from API with localized title, cover URL, chapter label, and search param', async () => {
    const calls = [];
    const mockFetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 48,
          data: [
            {
              id: 'abc123',
              title: 'Original Title',
              alt_titles: { vi: ['Tên Tiếng Việt'] },
              last_chapter: '42',
              relationships: {
                cover: { id: 'cov99', ext: '.webp' },
              },
            },
          ],
        }),
      };
    };

    const listRes = await suicaodexService.fetchLatestUpdates({
      page: 2,
      fetchImpl: mockFetch,
    });
    expect(decodeURIComponent(calls[0])).toContain('order[latestUploadedChapter]=desc');
    expect(calls[0]).toContain('page=2');
    expect(listRes).toMatchObject({
      ok: true,
      siteId: 'suicaodex',
      page: 2,
      totalPages: 2,
    });
    expect(listRes.items[0]).toEqual({
      title: 'Tên Tiếng Việt',
      mangaUrl: 'https://suicaodex.com/manga/abc123',
      coverUrl: 'https://i.suicaodex.com/covers/abc123/cov99.webp',
      latestChapterLabel: 'Ch. 42',
    });

    await suicaodexService.fetchLatestUpdates({
      page: 1,
      latestUpdatesSearch: 'naruto',
      fetchImpl: mockFetch,
    });
    expect(calls[1]).toContain('title=naruto');
  });
});

describe('KingOfShojo fetchLatestUpdates', () => {
  test('parses .bsx cards, maxPage, and search query URL', async () => {
    const html = `
      <div class="listupd">
        <div class="bsx">
          <a href="https://kingofshojo.com/manga/solo-hero/" title="Solo Hero">
            <div class="limit"><img data-src="//cdn.example/solo.jpg" /></div>
            <div class="bigor">
              <div class="tt">Solo Hero</div>
              <div class="adds"><div class="epxs">Chapter 96</div></div>
            </div>
          </a>
        </div>
      </div>
      <div class="pagination"><a href="/manga/?order=update&page=12">12</a></div>
    `;
    const urls = [];
    const res = await kingOfShojoService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (u) => {
        urls.push(u);
        return { ok: true, html };
      },
    });
    expect(urls[0]).toBe('https://kingofshojo.com/manga/?order=update');
    expect(res).toMatchObject({ ok: true, siteId: 'kingofshojo', page: 1, totalPages: 12 });
    expect(res.items[0]).toEqual({
      title: 'Solo Hero',
      mangaUrl: 'https://kingofshojo.com/manga/solo-hero/',
      coverUrl: 'https://cdn.example/solo.jpg',
      latestChapterLabel: 'Chapter 96',
    });

    await kingOfShojoService.fetchLatestUpdates({
      page: 2,
      latestUpdatesSearch: 'solo hero',
      fetchHtmlImpl: async (u) => {
        urls.push(u);
        return { ok: true, html };
      },
    });
    expect(urls[1]).toBe('https://kingofshojo.com/page/2/?s=solo%20hero');
  });
});

describe('FanFox fetchLatestUpdates', () => {
  test('parses .manga-list-4-list items and /releases/{page}.html URL', async () => {
    const html = `
      <ul class="manga-list-4-list">
        <li>
          <a href="/manga/crown_prince/" title="The Crown Prince">
            <img class="manga-list-4-cover" src="//fmcdn.example/c.jpg" />
          </a>
          <p class="manga-list-4-item-title"><a href="/manga/crown_prince/">The Crown Prince</a></p>
          <ul class="manga-list-4-item-part"><li><a href="/manga/crown_prince/c057/1.html">Ch.057</a></li></ul>
        </li>
      </ul>
      <div class="pager-list-left"><a href="/releases/2.html">2</a><a href="/releases/15.html">15</a></div>
    `;
    let seenUrl = '';
    const res = await fanfoxService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (u) => {
        seenUrl = u;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://fanfox.net/releases/2.html');
    expect(res).toMatchObject({ ok: true, siteId: 'fanfox', page: 2, totalPages: 15 });
    expect(res.items[0]).toEqual({
      title: 'The Crown Prince',
      mangaUrl: 'https://fanfox.net/manga/crown_prince/',
      coverUrl: 'https://fmcdn.example/c.jpg',
      latestChapterLabel: 'Ch.057',
    });
  });
});

describe('Mangapill fetchLatestUpdates', () => {
  test('parses /chapters updates and /search?q= results', async () => {
    const latestHtml = `
      <div>
        <a href="/chapters/10373-10007000/slap-shot-girls-chapter-7">
          <figure><img data-src="https://cdn.example/10373.jpeg" /></figure>
        </a>
        <div class="px-1">
          <a href="/chapters/10373-10007000/slap-shot-girls-chapter-7"><div>#7</div></a>
          <a href="/manga/10373/slap-shot-girls"><div>Slap Shot Girls</div></a>
        </div>
      </div>
    `;
    const searchHtml = `
      <div>
        <a href="/manga/3069/naruto">
          <figure><img data-src="https://cdn.example/3069.jpg" /></figure>
        </a>
        <div><a href="/manga/3069/naruto"><div>Naruto</div></a></div>
      </div>
    `;
    const urls = [];
    const latestRes = await mangapillService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (u) => {
        urls.push(u);
        return { ok: true, html: latestHtml };
      },
    });
    expect(urls[0]).toBe('https://mangapill.com/chapters');
    expect(latestRes.items).toEqual([
      {
        title: 'Slap Shot Girls',
        mangaUrl: 'https://mangapill.com/manga/10373/slap-shot-girls',
        coverUrl: 'https://cdn.example/10373.jpeg',
        latestChapterLabel: '#7',
      },
    ]);

    const searchRes = await mangapillService.fetchLatestUpdates({
      latestUpdatesSearch: 'naruto',
      fetchHtmlImpl: async (u) => {
        urls.push(u);
        return { ok: true, html: searchHtml };
      },
    });
    expect(urls[1]).toBe('https://mangapill.com/search?q=naruto');
    expect(searchRes.items).toEqual([
      {
        title: 'Naruto',
        mangaUrl: 'https://mangapill.com/manga/3069/naruto',
        coverUrl: 'https://cdn.example/3069.jpg',
        latestChapterLabel: '',
      },
    ]);
  });
});

describe('xBato fetchLatestUpdates direct HTTP path', () => {
  test('works without Settings cookie when direct fetch succeeds', async () => {
    const html = `
      <div>
        <a href="/manga/123-demo">
          <img data-src="https://cdn.example/demo.webp" />
          <span>Demo Manga</span>
        </a>
      </div>
    `;
    const res = await xbatoService.fetchLatestUpdates({
      page: 1,
      cookie: '',
      fetchHtmlImpl: async () => ({ ok: true, html }),
    });
    expect(res.ok).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0].mangaUrl).toBe('https://xbato.co.uk/manga/123-demo');
  });
});
