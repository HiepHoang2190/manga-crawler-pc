const connectors = require('../../platform/connectors');
const bluelakeService = require('../../platform/connectors/services/bluelakeService');
const mutualheightsService = require('../../platform/connectors/services/mutualheightsService');
const luotTruyenService = require('../../platform/connectors/services/luotTruyenService');
const gocTruyenTranhService = require('../../platform/connectors/services/gocTruyenTranhService');
const truyenTuoiThoService = require('../../platform/connectors/services/truyenTuoiThoService');
const netTruyenGgService = require('../../platform/connectors/services/netTruyenGgService');

describe('Latest Updates Connectors — Wave 7 Registry Flags & Routing', () => {
  test('all 6 Wave 7 connectors expose supportsLatestUpdates=true and 5 searchable ones expose search', () => {
    const map = new Map(connectors.listConnectors().map((c) => [c.id, c]));
    for (const id of [
      'bluelake',
      'mutualheights',
      'luottruyen',
      'goctruyentranh',
      'truyentuoitho',
      'nettruyengg',
    ]) {
      expect(map.get(id)).toBeDefined();
      expect(map.get(id).supportsLatestUpdates).toBe(true);
    }
    for (const id of [
      'bluelake',
      'luottruyen',
      'goctruyentranh',
      'truyentuoitho',
      'nettruyengg',
    ]) {
      expect(map.get(id).supportsLatestUpdatesSearch).toBe(true);
    }
    expect(map.get('mutualheights').supportsLatestUpdatesSearch).toBe(false);
  });

  test('detectSiteIdFromUrl detects redirected hinettruyen.com URLs as nettruyengg', () => {
    expect(connectors.detectSiteIdFromUrl('https://hinettruyen.com/truyen-tranh/hoang-de-minami')).toBe('nettruyengg');
  });
});

describe('BlueLake fetchLatestUpdates', () => {
  test('parses homepage / truyen-moi-nhat / tim-truyen?q= cards and pagination', async () => {
    const html = `
      <figure class="active round-50">
        <a title="Truyện tranh One Piece - TruyenQQ" href="/truyen-tranh/one-piece">
          <img src="/upload/manga/2025/08/one-piece.jpg" alt="Truyện tranh One Piece - TruyenQQ">
          <div class="info"><div><span class="fw-normal">Chương 1199</span></div></div>
        </a>
        <figcaption><a href="/truyen-tranh/one-piece">One Piece</a></figcaption>
      </figure>
      <a href="/truyen-moi-nhat/trang-18">18</a>
    `;
    let seenUrl = '';
    const res = await bluelakeService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://www.bluelakeaccelerator.com/truyen-moi-nhat/trang-2');
    expect(res).toMatchObject({ ok: true, siteId: 'bluelake', page: 2, totalPages: 18 });
    expect(res.items[0]).toEqual({
      title: 'One Piece',
      mangaUrl: 'https://www.bluelakeaccelerator.com/truyen-tranh/one-piece',
      coverUrl: 'https://www.bluelakeaccelerator.com/upload/manga/2025/08/one-piece.jpg',
      latestChapterLabel: 'Chương 1199',
    });

    let searchUrl = '';
    await bluelakeService.fetchLatestUpdates({
      latestUpdatesSearch: 'solo',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://www.bluelakeaccelerator.com/tim-truyen?q=solo');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await bluelakeService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('MutualHeights fetchLatestUpdates', () => {
  test('parses non-swiper listing cards using data-src over SVG placeholder and normalizes chapter badge prefix', async () => {
    const html = `
      <div class="swiper-slide manga-item">
        <a href="https://mutualheights.net/truyen-tranh/hot-slider/"><img src="https://mh/hot.png" alt="Hot"></a>
      </div>
      <div class="truyen-item">
        <a href="https://mutualheights.net/truyen-tranh/thien-tai-nhin-thau-the-gioi/" class="truyen-thumb">
          <img src="data:image/svg+xml,%3Csvg%3E" data-src="https://mutualheights.net/wp-content/uploads/thumb.png" alt="Thiên Tài Nhìn Thấu Thế Giới">
        </a>
        <div class="truyen-info">
          <h3 class="truyen-title"><a href="https://mutualheights.net/truyen-tranh/thien-tai-nhin-thau-the-gioi/">Thiên Tài Nhìn Thấu Thế Giới</a></h3>
          <span class="chapter">Chương mới: Chương 38</span>
        </div>
      </div>
      <a href="https://mutualheights.net/truyen-moi-cap-nhat/page/12/">12</a>
    `;
    let seenUrl = '';
    const res = await mutualheightsService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://mutualheights.net/truyen-moi-cap-nhat/page/2/');
    expect(res).toMatchObject({ ok: true, siteId: 'mutualheights', page: 2, totalPages: 12 });
    expect(res.items).toEqual([
      {
        title: 'Thiên Tài Nhìn Thấu Thế Giới',
        mangaUrl: 'https://mutualheights.net/truyen-tranh/thien-tai-nhin-thau-the-gioi/',
        coverUrl: 'https://mutualheights.net/wp-content/uploads/thumb.png',
        latestChapterLabel: 'Chương 38',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await mutualheightsService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('LuotTruyen fetchLatestUpdates', () => {
  test('parses .items .item listing, search, and redirected finalUrl base', async () => {
    const html = `
      <div class="items">
        <div class="item">
          <figure class="clearfix">
            <div class="image">
              <a href="/truyen-tranh/tuyet-the-hoi-quy-2672">
                <img src="https://img3.dichvucdn.com/avatar.jpg" alt="Tuyệt Thế Hồi Quy">
              </a>
            </div>
            <figcaption>
              <h3><a href="/truyen-tranh/tuyet-the-hoi-quy-2672">Tuyệt Thế Hồi Quy</a></h3>
              <ul><li class="chapter"><a href="#">chapter 128</a></li></ul>
            </figcaption>
          </figure>
        </div>
      </div>
      <a href="https://luottruyen22.com?page=14&typegroup=0">14</a>
    `;
    let seenUrl = '';
    const res = await luotTruyenService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html, finalUrl: 'https://luottruyen22.com/?page=2&typegroup=0' };
      },
    });
    expect(seenUrl).toBe('https://luottruyen21.com/?page=2&typegroup=0');
    expect(res).toMatchObject({ ok: true, siteId: 'luottruyen', page: 2, totalPages: 14 });
    expect(res.items[0]).toEqual({
      title: 'Tuyệt Thế Hồi Quy',
      mangaUrl: 'https://luottruyen22.com/truyen-tranh/tuyet-the-hoi-quy-2672',
      coverUrl: 'https://img3.dichvucdn.com/avatar.jpg',
      latestChapterLabel: 'chapter 128',
    });

    let searchUrl = '';
    await luotTruyenService.fetchLatestUpdates({
      latestUpdatesSearch: 'solo',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://luottruyen21.com/tim-truyen?keyword=solo');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await luotTruyenService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('GocTruyenTranh fetchLatestUpdates', () => {
  test('parses homepage .card skipping /banner/ and bg2.gif placeholder, and searches /api/comic/search', async () => {
    const html = `
      <div class="card">
        <a href="/truyen/banner-only"><img src="/image/banner/123?code=gtt-yes" alt="Banner"></a>
      </div>
      <div class="card">
        <a href="/truyen/anh-hung-manh-nhat-tro-lai" class="card-block">
          <div class="card-image">
            <img src="/contents/images/bg2.gif" data-original="/image/anh-hung/cover?code=gtt-yes" alt="Anh Hùng Mạnh Nhất Trở Lại">
          </div>
          <div class="card-title">Anh Hùng Mạnh Nhất Trở Lại</div>
        </a>
      </div>
    `;
    const listRes = await gocTruyenTranhService.fetchLatestUpdates({
      page: 1,
      fetchHtmlImpl: async (url) => {
        expect(url).toBe('https://goctruyentranhvui31.com/');
        return { ok: true, html };
      },
    });
    expect(listRes).toMatchObject({ ok: true, siteId: 'goctruyentranh', page: 1, totalPages: 1 });
    expect(listRes.items).toEqual([
      {
        title: 'Anh Hùng Mạnh Nhất Trở Lại',
        mangaUrl: 'https://goctruyentranhvui31.com/truyen/anh-hung-manh-nhat-tro-lai',
        coverUrl: 'https://goctruyentranhvui31.com/image/anh-hung/cover?code=gtt-yes',
        latestChapterLabel: '',
      },
    ]);

    let searchUrl = '';
    const searchRes = await gocTruyenTranhService.fetchLatestUpdates({
      latestUpdatesSearch: 'solo',
      fetchImpl: async (url) => {
        searchUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            result: [
              {
                name: 'Độc Chiến Đế Vương',
                nameEn: 'doc-chien-de-vuong',
                photo: '/image/doc-chien/thumb?code=gtt-yes',
                chapterLatest: ['93', '92'],
              },
            ],
          }),
        };
      },
    });
    expect(searchUrl).toBe('https://goctruyentranhvui31.com/api/comic/search?name=solo');
    expect(searchRes.items).toEqual([
      {
        title: 'Độc Chiến Đế Vương',
        mangaUrl: 'https://goctruyentranhvui31.com/truyen/doc-chien-de-vuong',
        coverUrl: 'https://goctruyentranhvui31.com/image/doc-chien/thumb?code=gtt-yes',
        latestChapterLabel: 'Chương 93',
      },
    ]);
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await gocTruyenTranhService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('TruyenTuoiTho fetchLatestUpdates', () => {
  test('parses WP-Manga .page-item-detail listing and .c-tabs-item__content search', async () => {
    const html = `
      <div class="page-item-detail">
        <div class="item-thumb">
          <a href="https://truyentuoitho.com/manga/tieu-hoa-thuong/" title="Tiểu Hòa Thượng">
            <img src="https://truyentuoitho.com/wp-content/uploads/cover.webp" alt="Tiểu Hòa Thượng">
          </a>
        </div>
        <div class="item-summary">
          <div class="post-title"><h3><a href="https://truyentuoitho.com/manga/tieu-hoa-thuong/">Tiểu Hòa Thượng</a></h3></div>
          <div class="list-chapter"><div class="chapter-item"><a href="#">Tập 12</a></div></div>
        </div>
      </div>
      <a href="https://truyentuoitho.com/page/10/">10</a>
    `;
    let seenUrl = '';
    const res = await truyenTuoiThoService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html };
      },
    });
    expect(seenUrl).toBe('https://truyentuoitho.com/page/2/');
    expect(res).toMatchObject({ ok: true, siteId: 'truyentuoitho', page: 2, totalPages: 10 });
    expect(res.items[0]).toEqual({
      title: 'Tiểu Hòa Thượng',
      mangaUrl: 'https://truyentuoitho.com/manga/tieu-hoa-thuong/',
      coverUrl: 'https://truyentuoitho.com/wp-content/uploads/cover.webp',
      latestChapterLabel: 'Tập 12',
    });

    const searchHtml = `
      <div class="c-tabs-item__content">
        <div class="tab-thumb"><a href="https://truyentuoitho.com/manga/ky-uc/"><img src="https://truyentuoitho.com/wp-content/uploads/ky-uc.jpg" alt="Ký Ức"></a></div>
        <div class="post-title"><h3><a href="https://truyentuoitho.com/manga/ky-uc/">Ký ức của thời gian</a></h3></div>
        <div class="latest-chap"><a href="#">Tập 3</a></div>
      </div>
    `;
    let searchUrl = '';
    const sRes = await truyenTuoiThoService.fetchLatestUpdates({
      latestUpdatesSearch: 'doraemon',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html: searchHtml };
      },
    });
    expect(searchUrl).toBe('https://truyentuoitho.com/?s=doraemon&post_type=wp-manga');
    expect(sRes.items[0].title).toBe('Ký ức của thời gian');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await truyenTuoiThoService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});

describe('NetTruyenGG fetchLatestUpdates', () => {
  test('parses redirected hinettruyen.com .items .item listing and /tim-truyen?keyword= search', async () => {
    const html = `
      <div class="items">
        <div class="item">
          <figure class="clearfix">
            <div class="image">
              <a href="https://hinettruyen.com/truyen-tranh/hoang-de-minami">
                <img src="/assets/images/thumb-default.jpg" data-original="https://image4.kcgsbok.com/nettruyen/thumb/hoang-de-minami.jpg" alt="Hoàng Đế Minami">
              </a>
            </div>
            <figcaption>
              <h3><a href="https://hinettruyen.com/truyen-tranh/hoang-de-minami">Hoàng Đế Minami</a></h3>
              <ul class="comic-item"><li class="chapter"><a href="#">Chapter 4</a></li></ul>
            </figcaption>
          </figure>
        </div>
      </div>
      <ul class="pagination"><li><a href="https://hinettruyen.com/truyen-tranh-moi?page=9">9</a></li></ul>
    `;
    let seenUrl = '';
    const res = await netTruyenGgService.fetchLatestUpdates({
      page: 2,
      fetchHtmlImpl: async (url) => {
        seenUrl = url;
        return { ok: true, html, finalUrl: 'https://hinettruyen.com/truyen-tranh-moi?page=2' };
      },
    });
    expect(seenUrl).toBe('https://nettruyen.gg/truyen-tranh-moi?page=2');
    expect(res).toMatchObject({ ok: true, siteId: 'nettruyengg', page: 2, totalPages: 9 });
    expect(res.items[0]).toEqual({
      title: 'Hoàng Đế Minami',
      mangaUrl: 'https://hinettruyen.com/truyen-tranh/hoang-de-minami',
      coverUrl: 'https://image4.kcgsbok.com/nettruyen/thumb/hoang-de-minami.jpg',
      latestChapterLabel: 'Chapter 4',
    });

    let searchUrl = '';
    await netTruyenGgService.fetchLatestUpdates({
      page: 1,
      latestUpdatesSearch: 'solo',
      fetchHtmlImpl: async (url) => {
        searchUrl = url;
        return { ok: true, html };
      },
    });
    expect(searchUrl).toBe('https://hinettruyen.com/tim-truyen?keyword=solo&page=1');
  });

  test('respects pre-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    expect(await netTruyenGgService.fetchLatestUpdates({ signal: ac.signal })).toMatchObject({ ok: false, aborted: true });
  });
});
