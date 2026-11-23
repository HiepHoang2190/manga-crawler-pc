const connectors = require('../../platform/connectors');
const baozimhService = require('../../platform/connectors/services/baozimhService');
const mangaPlusService = require('../../platform/connectors/services/mangaPlusService');
const vietMessengerService = require('../../platform/connectors/services/vietMessengerService');

describe('Latest Updates Connectors — Wave 5 Registry Flags', () => {
  test('all 3 Wave 5 connectors expose supportsLatestUpdates=true in listConnectors()', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    for (const id of ['baozimh', 'mangaplus', 'vietmessenger']) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id).supportsLatestUpdates).toBe(true);
    }
    for (const id of ['baozimh', 'mangaplus']) {
      expect(map.get(id).supportsLatestUpdatesSearch).toBe(true);
    }
  });
});

describe('Baozimh fetchLatestUpdates', () => {
  test('parses twmanga /list/new and /search?q= .comics-card skipping placeholder amp-img', async () => {
    const html = `
      <div class="comics-card">
        <a href="/comic/honeycreep-abc" title="Honey Creep" class="comics-card__poster">
          <amp-img src="https://static-tw.baozimh.com/cover/honey.jpg?w=285">
            <amp-img placeholder src="https://static-tw.baozimh.com/cover/default_cover.png"></amp-img>
            <amp-img fallback src="https://static-tw.baozimh.com/cover/default_cover.png"></amp-img>
          </amp-img>
        </a>
        <a href="/comic/honeycreep-abc" class="comics-card__info">
          <div class="comics-card__title"><h3>Honey Creep</h3></div>
        </a>
      </div>
    `;
    let seenUrl = '';
    const res = await baozimhService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://www.twmanga.com/list/new');
    expect(res).toMatchObject({ ok: true, siteId: 'baozimh', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'Honey Creep',
        mangaUrl: 'https://www.twmanga.com/comic/honeycreep-abc',
        coverUrl: 'https://static-tw.baozimh.com/cover/honey.jpg?w=285',
        latestChapterLabel: '',
      },
    ]);

    let searchUrl = '';
    await baozimhService.fetchLatestUpdates({
      latestUpdatesSearch: 'one piece',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://www.twmanga.com/search?q=one%20piece');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await baozimhService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('MangaPlus fetchLatestUpdates', () => {
  test('reads updated titles preferring English language edition and searches allV2 titles', async () => {
    const calls = [];
    const mockFetchProto = async (apiUrl) => {
      calls.push(apiUrl);
      if (apiUrl.includes('title_list/updated')) {
        return {
          ok: true,
          data: {
            success: {
              updatedTitleV2Group: {
                titles: [
                  { title: { titleId: 200084, name: 'Dandadan', portraitImageUrl: 'https://cdn.mp/es.webp', language: 1 } },
                  { title: { titleId: 100171, name: 'Dandadan', portraitImageUrl: 'https://cdn.mp/en.webp', language: 0 } },
                  { title: { titleId: 100020, name: 'One Piece', portraitImageUrl: 'https://cdn.mp/op.webp' } },
                ],
              },
            },
          },
        };
      }
      return {
        ok: true,
        data: {
          success: {
            allTitlesViewV2: {
              AllTitlesGroup: [
                {
                  theTitle: 'D',
                  titles: [
                    { titleId: 100171, name: 'Dandadan', portraitImageUrl: 'https://cdn.mp/en.webp', language: 0 },
                    { titleId: 100020, name: 'One Piece', portraitImageUrl: 'https://cdn.mp/op.webp', language: 0 },
                  ],
                },
              ],
            },
          },
        },
      };
    };

    const res = await mangaPlusService.fetchLatestUpdates({
      page: 1,
      fetchProtoImpl: mockFetchProto,
    });
    expect(calls[0]).toContain('/title_list/updated');
    expect(res).toMatchObject({ ok: true, siteId: 'mangaplus', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'Dandadan',
        mangaUrl: 'https://mangaplus.shueisha.co.jp/titles/100171',
        coverUrl: 'https://cdn.mp/en.webp',
        latestChapterLabel: '',
      },
      {
        title: 'One Piece',
        mangaUrl: 'https://mangaplus.shueisha.co.jp/titles/100020',
        coverUrl: 'https://cdn.mp/op.webp',
        latestChapterLabel: '',
      },
    ]);

    const searchRes = await mangaPlusService.fetchLatestUpdates({
      latestUpdatesSearch: 'piece',
      fetchProtoImpl: mockFetchProto,
    });
    expect(calls[1]).toContain('/title_list/allV2');
    expect(searchRes.items).toEqual([
      {
        title: 'One Piece',
        mangaUrl: 'https://mangaplus.shueisha.co.jp/titles/100020',
        coverUrl: 'https://cdn.mp/op.webp',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await mangaPlusService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('VietMessenger fetchLatestUpdates', () => {
  test('parses /comics/?page=2 cards pairing cover thumbnails and select pagination', async () => {
    const html = `
      <div class="row">
        <div><a href="/comics/?title=tarzan%2010"><img src="/comics/tarzan10/scover.jpg" alt="Tarzan 10"></a></div>
        <div><h2><a class="title" href="/comics/?title=tarzan%2010">Tarzan 10 : Xóa Bỏ Hận Thù</a></h2></div>
      </div>
      <div class="pagenav">
        <select>
          <option value="/comics/?page=1">1</option>
          <option value="/comics/?page=11">11</option>
        </select>
      </div>
    `;
    let seenUrl = '';
    const res = await vietMessengerService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://vietmessenger.com/comics/?page=2');
    expect(res).toMatchObject({ ok: true, siteId: 'vietmessenger', page: 2, totalPages: 11 });
    expect(res.items).toEqual([
      {
        title: 'Tarzan 10 : Xóa Bỏ Hận Thù',
        mangaUrl: 'https://vietmessenger.com/comics/?title=tarzan%2010',
        coverUrl: 'https://vietmessenger.com/comics/tarzan10/scover.jpg',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await vietMessengerService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});
