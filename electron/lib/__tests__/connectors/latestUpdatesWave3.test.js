const connectors = require('../../platform/connectors');
const antbywService = require('../../platform/connectors/services/antbywService');
const viviComicService = require('../../platform/connectors/services/viviComicService');
const truyenqqVnService = require('../../platform/connectors/services/truyenqqVnService');
const manhwaTvService = require('../../platform/connectors/services/manhwaTvService');
const mangaballService = require('../../platform/connectors/services/mangaballService');
const chapVnService = require('../../platform/connectors/services/chapVnService');

describe('Latest Updates Connectors — Wave 3 Registry Flags', () => {
  test('all 6 Wave 3 connectors expose supportsLatestUpdates=true in listConnectors()', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    for (const id of ['antbyw', 'vivicomic', 'truyenqqvn', 'manhwatv', 'mangaball', 'chapvn']) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id).supportsLatestUpdates).toBe(true);
    }
    for (const id of ['antbyw', 'vivicomic', 'truyenqqvn']) {
      expect(map.get(id).supportsLatestUpdatesSearch).toBe(true);
    }
  });
});

describe('Antbyw fetchLatestUpdates', () => {
  test('parses library cards, search query, and pagination from .pg links', async () => {
    const html = `
      <div class="uk-card mbm uk-text-center">
        <div class="uk-card-media-top uk-inline">
          <a href="./plugin.php?id=jameson_manhua&amp;c=index&amp;a=bofang&amp;kuid=201055">
            <img src="https://imgmhc.antbyw.com/mh_cover/62467.jpg" alt="">
          </a>
          <div class="uk-overlay uk-overlay-primary">
            <a class="xs1" href="./plugin.php?id=jameson_manhua&amp;c=index&amp;a=bofang&amp;kuid=201055">第01卷 / 连载中</a>
          </div>
        </div>
        <p class="mt5 mb5 uk-text-truncate">
          <a href="./plugin.php?id=jameson_manhua&amp;c=index&amp;a=bofang&amp;kuid=201055">义呆利World Stars黑手党</a>
        </p>
      </div>
      <div class="pg"><a href="./plugin.php?id=jameson_manhua&c=index&a=ku&page=12">12</a></div>
    `;
    let seenUrl = '';
    const res = await antbywService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=ku&odfie=addtime&order=desc&page=2');
    expect(res).toMatchObject({ ok: true, siteId: 'antbyw', page: 2, totalPages: 12 });
    expect(res.items[0]).toEqual({
      title: '义呆利World Stars黑手党',
      mangaUrl: 'https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=201055',
      coverUrl: 'https://imgmhc.antbyw.com/mh_cover/62467.jpg',
      latestChapterLabel: '第01卷 / 连载中',
    });

    let searchUrl = '';
    await antbywService.fetchLatestUpdates({
      latestUpdatesSearch: 'one',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=search&keyword=one');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await antbywService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('ViviComic fetchLatestUpdates', () => {
  test('parses .comic-card listing, ?page pagination, and /tim-kiem search', async () => {
    const html = `
      <div class="comic-card">
        <a href="/truyen-tranh/demo-slug" class="comic-card-thumb">
          <img src="/assets/uploads/demo.jpg" alt="Demo Title">
        </a>
        <div class="comic-card-info">
          <h3 class="comic-card-title"><a href="/truyen-tranh/demo-slug">Demo Title</a></h3>
        </div>
        <div class="comic-card-stats"><span class="chap-link">Chap 18</span></div>
      </div>
      <div class="pagination"><a href="?page=4">4</a></div>
    `;
    let seenUrl = '';
    const res = await viviComicService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://vivicomic.com/danh-sach-truyen?page=2');
    expect(res).toMatchObject({ ok: true, siteId: 'vivicomic', page: 2, totalPages: 4 });
    expect(res.items[0]).toEqual({
      title: 'Demo Title',
      mangaUrl: 'https://vivicomic.com/truyen-tranh/demo-slug',
      coverUrl: 'https://vivicomic.com/assets/uploads/demo.jpg',
      latestChapterLabel: 'Chap 18',
    });

    let searchUrl = '';
    await viviComicService.fetchLatestUpdates({
      latestUpdatesSearch: 'one piece',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://vivicomic.com/tim-kiem?q=one%20piece');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await viviComicService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('TruyenQQ.vn fetchLatestUpdates', () => {
  test('parses /truyen-moi-cap-nhat and /tim-kiem?s= cards', async () => {
    const html = `
      <a href="/cuong-gia-den-tu-trai-tam-than" title="Cường Giả">
        <img src="/media/book/cuong-gia.jpg" alt="Cường Giả">
        <div class="caption"><h3>Cường Giả Đến Từ Trại Tâm Thần</h3><p>Chapter 334</p></div>
      </a>
    `;
    let seenUrl = '';
    const res = await truyenqqVnService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://truyenqq.com.vn/truyen-moi-cap-nhat');
    expect(res).toMatchObject({ ok: true, siteId: 'truyenqqvn', page: 1, totalPages: 1 });
    expect(res.items[0]).toEqual({
      title: 'Cường Giả Đến Từ Trại Tâm Thần',
      mangaUrl: 'https://truyenqq.com.vn/cuong-gia-den-tu-trai-tam-than',
      coverUrl: 'https://truyenqq.com.vn/media/book/cuong-gia.jpg',
      latestChapterLabel: 'Chapter 334',
    });

    let searchUrl = '';
    const searchHtml = `
      <div class="owl-carousel"><a href="/hot-1" title="Hot"><img src="/media/book/hot.jpg"></a></div>
      <div class="listing">
        <div class="item">
          <div class="cover"><a href="/solo-leveling-ragnarok"><img src="/media/book/solo.jpg" alt="Solo"></a></div>
          <div class="info"><h3><a href="/solo-leveling-ragnarok">Solo Leveling Ragnarok</a></h3></div>
        </div>
      </div>
    `;
    const searchRes = await truyenqqVnService.fetchLatestUpdates({
      latestUpdatesSearch: 'solo',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html: searchHtml };
      },
    });
    expect(searchUrl).toBe('https://truyenqq.com.vn/tim-kiem?s=solo');
    expect(searchRes.items).toEqual([
      {
        title: 'Solo Leveling Ragnarok',
        mangaUrl: 'https://truyenqq.com.vn/solo-leveling-ragnarok',
        coverUrl: 'https://truyenqq.com.vn/media/book/solo.jpg',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await truyenqqVnService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('ManhwaTV fetchLatestUpdates', () => {
  test('parses .li_truyen cards and pagination links', async () => {
    const html = `
      <div class="li_truyen">
        <a href="/truyen-tranh/hac-vu.html">
          <div class="img"><img src="/uploads/minh_hoa/hac-vu.jpeg" alt="Hắc Vụ"></div>
          <div class="name">Hắc Vụ - Black Haze</div>
        </a>
        <a href="/truyen-tranh/hac-vu/chap-99.html"><div class="chap_name">Chap 99</div></a>
      </div>
      <a href="/truyen-moi-cap-nhat.html?page=8">8</a>
    `;
    let seenUrl = '';
    const res = await manhwaTvService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://manhwatv6.com/truyen-moi-cap-nhat.html?page=2');
    expect(res).toMatchObject({ ok: true, siteId: 'manhwatv', page: 2, totalPages: 8 });
    expect(res.items[0]).toEqual({
      title: 'Hắc Vụ - Black Haze',
      mangaUrl: 'https://manhwatv6.com/truyen-tranh/hac-vu.html',
      coverUrl: 'https://manhwatv6.com/uploads/minh_hoa/hac-vu.jpeg',
      latestChapterLabel: 'Chap 99',
    });
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await manhwaTvService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('MangaBall fetchLatestUpdates', () => {
  test('parses /title-detail/ cards, cleans Read... alt fallback, deduplicates, and paginates', async () => {
    const html = `
      <a href="/title-detail/68516a86702284f83417c943-childhood-friend-complex">
        <img src="https://cdn.mb/1.webp" alt="Read Childhood Friend Complex online free - MangaBall">
      </a>
      <a href="/title-detail/6889f57c0ac10014da2b5671-kiss-me-if-you-can">
        <img src="https://cdn.mb/2.jpg" alt="Kiss Me if You Can">
        <p class="font-bold">Kiss Me if You Can</p>
      </a>
      <a href="/title-detail/6889f57c0ac10014da2b5671-kiss-me-if-you-can">
        <img src="https://cdn.mb/2.jpg" alt="Kiss Me if You Can">
      </a>
    `;
    const res = await mangaballService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://mangaball.com/');
        return { ok: true, html };
      },
    });
    expect(res).toMatchObject({ ok: true, siteId: 'mangaball', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'Childhood Friend Complex',
        mangaUrl: 'https://mangaball.com/title-detail/68516a86702284f83417c943-childhood-friend-complex',
        coverUrl: 'https://cdn.mb/1.webp',
        latestChapterLabel: '',
      },
      {
        title: 'Kiss Me if You Can',
        mangaUrl: 'https://mangaball.com/title-detail/6889f57c0ac10014da2b5671-kiss-me-if-you-can',
        coverUrl: 'https://cdn.mb/2.jpg',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await mangaballService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('Chap.vn fetchLatestUpdates', () => {
  test('parses homepage newsTitle threads and pairs thread cover thumbnails', async () => {
    const html = `
      <article>
        <h2><a href="threads/60487/" class="newsTitle">One Piece Chapter 1199 - Passed Down</a></h2>
        <a href="threads/60487/"><img src="https://cdn.onepiecechapters.com/op_1199_01.png" alt="thumb"></a>
      </article>
      <article>
        <h2><a href="threads/60486/" class="newsTitle">[Spoiler] One Piece Chapter 1199</a></h2>
      </article>
    `;
    const res = await chapVnService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://chap.vn/');
        return { ok: true, html };
      },
    });
    expect(res).toMatchObject({ ok: true, siteId: 'chapvn', page: 1, totalPages: 1 });
    expect(res.items).toEqual([
      {
        title: 'One Piece Chapter 1199 - Passed Down',
        mangaUrl: 'https://chap.vn/threads/60487/',
        coverUrl: 'https://cdn.onepiecechapters.com/op_1199_01.png',
        latestChapterLabel: '',
      },
      {
        title: '[Spoiler] One Piece Chapter 1199',
        mangaUrl: 'https://chap.vn/threads/60486/',
        coverUrl: '',
        latestChapterLabel: '',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await chapVnService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});
