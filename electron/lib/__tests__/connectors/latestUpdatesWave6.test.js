const connectors = require('../../platform/connectors');
const mangaVnService = require('../../platform/connectors/services/mangaVnService');

describe('Latest Updates Connectors — Wave 6 Registry Flags', () => {
  test('mangavn exposes supportsLatestUpdates=true in listConnectors()', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    expect(map.get('mangavn')).toBeDefined();
    expect(map.get('mangavn').supportsLatestUpdates).toBe(true);
  });
});

describe('MangaVN fetchLatestUpdates', () => {
  test('parses /f3- .img_truyen showcase cards and normalizes www.mangavn.net URLs to forumotion domain', async () => {
    const html = `
      <div class="postbody">
        <span style="font-size: 24px"><a href="http://www.mangavn.net/t17813-100-is-too-cheap">$100 is Too Cheap</a></span><br>
        <div class="img_truyen"><a href="/t17813-"><img src="https://i.servimg.com/u/f59/19/05/33/23/100-is10.jpg"></a></div>
      </div>
      <div class="postbody">
        <span style="font-size: 24px"><a href="/t55053-woodman-dyeon">Woodman Dyeon</a></span><br>
        <div class="img_truyen"><a href="/t55053-"><img src="https://2img.net/h/cover.jpg"></a></div>
      </div>
      <div class="pagination"><a href="/f3p50-">2</a><a href="/f3p100-">3</a></div>
    `;
    let seenUrl = '';
    const res = await mangaVnService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://mangavn.forumotion.net/f3-');
    expect(res).toMatchObject({ ok: true, siteId: 'mangavn', page: 1, totalPages: 3 });
    expect(res.items).toEqual([
      {
        title: '$100 is Too Cheap',
        mangaUrl: 'https://mangavn.forumotion.net/t17813-100-is-too-cheap',
        coverUrl: 'https://i.servimg.com/u/f59/19/05/33/23/100-is10.jpg',
        latestChapterLabel: '',
      },
      {
        title: 'Woodman Dyeon',
        mangaUrl: 'https://mangavn.forumotion.net/t55053-woodman-dyeon',
        coverUrl: 'https://2img.net/h/cover.jpg',
        latestChapterLabel: '',
      },
    ]);

    let p2Url = '';
    await mangaVnService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        p2Url = url;
        return { ok: true, html };
      },
    });
    expect(p2Url).toBe('https://mangavn.forumotion.net/f3p50-');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await mangaVnService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});
