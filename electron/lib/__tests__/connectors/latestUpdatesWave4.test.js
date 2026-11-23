const connectors = require('../../platform/connectors');
const netTruyenVietService = require('../../platform/connectors/services/netTruyenVietService');
const pokemonSpecialService = require('../../platform/connectors/services/pokemonSpecialService');
const sakamotodaysService = require('../../platform/connectors/services/sakamotodaysService');
const kingdomhoiquanService = require('../../platform/connectors/services/kingdomhoiquanService');
const hoaphunglieunguyenService = require('../../platform/connectors/services/hoaphunglieunguyenService');

describe('Latest Updates Connectors — Wave 4 Registry Flags', () => {
  test('all 5 Wave 4 connectors expose supportsLatestUpdates=true in listConnectors()', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    for (const id of [
      'nettruyenviet',
      'pokemonspecial',
      'sakamotodays',
      'kingdomhoiquan',
      'hoaphunglieunguyen',
    ]) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id).supportsLatestUpdates).toBe(true);
    }
    for (const id of ['nettruyenviet', 'pokemonspecial']) {
      expect(map.get(id).supportsLatestUpdatesSearch).toBe(true);
    }
  });
});

describe('NetTruyenViet fetchLatestUpdates', () => {
  test('parses /truyen-tranh-moi and /tim-truyen?keyword= cards using data-original over thumb-default.jpg', async () => {
    const html = `
      <div class="items">
        <div class="item">
          <figure class="clearfix">
            <div class="image">
              <a href="https://nettruyenviet10.com/truyen-tranh/cam-kiem-tuyet-doi">
                <img src="/assets/images/thumb-default.jpg" data-original="https://image1.kcgsbok.com/nettruyen/thumb/cam-kiem.jpg" alt="Cảm Kiếm">
              </a>
            </div>
            <figcaption>
              <h3><a href="https://nettruyenviet10.com/truyen-tranh/cam-kiem-tuyet-doi"> Cảm Kiếm Tuyệt Đối </a></h3>
              <ul class="comic-item"><li class="chapter"><a href="#">Chapter 8</a></li></ul>
            </figcaption>
          </figure>
        </div>
      </div>
      <ul class="pagination"><li><a href="https://nettruyenviet10.com/truyen-tranh-moi?page=15">15</a></li></ul>
    `;
    let seenUrl = '';
    const res = await netTruyenVietService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://nettruyenviet10.com/truyen-tranh-moi?page=2');
    expect(res).toMatchObject({ ok: true, siteId: 'nettruyenviet', page: 2, totalPages: 15 });
    expect(res.items[0]).toEqual({
      title: 'Cảm Kiếm Tuyệt Đối',
      mangaUrl: 'https://nettruyenviet10.com/truyen-tranh/cam-kiem-tuyet-doi',
      coverUrl: 'https://image1.kcgsbok.com/nettruyen/thumb/cam-kiem.jpg',
      latestChapterLabel: 'Chapter 8',
    });

    let searchUrl = '';
    await netTruyenVietService.fetchLatestUpdates({
      page: 1,
      latestUpdatesSearch: 'solo',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://nettruyenviet10.com/tim-truyen?keyword=solo&page=1');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await netTruyenVietService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('PokemonSpecial fetchLatestUpdates', () => {
  test('fetches Blogger JSON feed listing and search with upgraded s640 thumbnail', async () => {
    const calls = [];
    const res = await pokemonSpecialService.fetchLatestUpdates({
      page: 2,
      latestUpdatesSearch: 'scarlet',
      fetchImpl: async (url) => {
        calls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            feed: {
              'openSearch$totalResults': { $t: '60' },
              entry: [
                {
                  title: { $t: '[CORO²] Scarlet Violet: Chapter 034' },
                  link: [{ rel: 'alternate', href: 'https://www.pokemonspecial.com/2026/07/sv-034.html' }],
                  media$thumbnail: { url: 'https://blogger.googleusercontent.com/img/b/xyz/s72-c/sv.png' },
                },
              ],
            },
          }),
        };
      },
    });
    expect(calls[0]).toBe(
      'https://www.pokemonspecial.com/feeds/posts/default?alt=json&start-index=25&max-results=24&q=scarlet',
    );
    expect(res).toMatchObject({ ok: true, siteId: 'pokemonspecial', page: 2, totalPages: 3 });
    expect(res.items).toEqual([
      {
        title: '[CORO²] Scarlet Violet: Chapter 034',
        mangaUrl: 'https://www.pokemonspecial.com/2026/07/sv-034.html',
        coverUrl: 'https://blogger.googleusercontent.com/img/b/xyz/s640/sv.png',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await pokemonSpecialService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('SakamotoDaysTruyen fetchLatestUpdates', () => {
  test('parses series card and picks highest chapter from .chapter-grid', async () => {
    const html = `
      <header><img src="/wp-content/uploads/2026/01/logo-removebg-preview-1.png"></header>
      <h1>Sakamoto Days</h1>
      <div class="saka-cover"><img src="data:image/gif;base64,R0l" data-src="/wp-content/uploads/cover.jpg"></div>
      <div class="chapter-grid">
        <a href="/doc-truyen-tranh-sakamoto-days-chapter-283/">Chap 283</a>
        <a href="/doc-truyen-tranh-sakamoto-days-chapter-284/">Chap 284</a>
      </div>
    `;
    const res = await sakamotodaysService.fetchLatestUpdates({
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://sakamotodaystruyen.com/');
        return { ok: true, html };
      },
    });
    expect(res).toMatchObject({ ok: true, siteId: 'sakamotodays', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'Sakamoto Days',
        mangaUrl: 'https://sakamotodaystruyen.com/',
        coverUrl: 'https://sakamotodaystruyen.com/wp-content/uploads/cover.jpg',
        latestChapterLabel: 'Chap 284',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await sakamotodaysService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('KingdomHoiQuan fetchLatestUpdates', () => {
  test('parses homepage card + list.json latest chapter label', async () => {
    const html = `
      <h1 class="t">Kingdom</h1>
      <div class="cover"><img data-src="/wp-content/uploads/kingdom-cover.webp"></div>
      <div id="grid" data-src="/wp-content/uploads/khq/list.json"></div>
    `;
    const res = await kingdomhoiquanService.fetchLatestUpdates({
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://kingdomhoiquan.com/');
        return { ok: true, html };
      },
      fetchImpl: async (url) => {
        expect(url).toBe('https://kingdomhoiquan.com/wp-content/uploads/khq/list.json');
        return { ok: true, status: 200, json: async () => ({ c: [[8920], [8930]] }) };
      },
    });
    expect(res).toMatchObject({ ok: true, siteId: 'kingdomhoiquan', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'Kingdom',
        mangaUrl: 'https://kingdomhoiquan.com/',
        coverUrl: 'https://kingdomhoiquan.com/wp-content/uploads/kingdom-cover.webp',
        latestChapterLabel: 'Chap 893',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await kingdomhoiquanService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('Hoaphunglieunguyen fetchLatestUpdates', () => {
  test('parses series card and extracts latest chapter label from #moi-cap-nhat / .hp-latest', async () => {
    const html = `
      <h1 class="hero-title">Hỏa Phụng Liêu Nguyên</h1>
      <div class="hp-hero-art"><img src="/wp-content/uploads/cover.webp"></div>
      <div class="hp-latest">
        <a href="/tap/tap-82/hoi-637/">Hồi 637: Tri kỷ đồng hành</a>
      </div>
    `;
    const res = await hoaphunglieunguyenService.fetchLatestUpdates({
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://hoaphunglieunguyen.com/');
        return { ok: true, html };
      },
    });
    expect(res).toMatchObject({ ok: true, siteId: 'hoaphunglieunguyen', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'Hỏa Phụng Liêu Nguyên',
        mangaUrl: 'https://hoaphunglieunguyen.com/',
        coverUrl: 'https://hoaphunglieunguyen.com/wp-content/uploads/cover.webp',
        latestChapterLabel: 'Hồi 637: Tri kỷ đồng hành',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await hoaphunglieunguyenService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});
