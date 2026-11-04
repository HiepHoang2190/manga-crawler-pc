const {
  DOMAIN,
  LISTING_PATH,
  MANGA_BULK_SCAN_MAX_PAGES_CAP,
  buildMangaCatalogListingUrl,
  parseMangaCatalogMaxPage,
  parseMangaCatalogListing,
  fetchBulkScanListing,
} = require('../../../platform/connectors/services/moeTruyenService');

function pageHtml({ page, maxPage, items }) {
  const cards = items
    .map(
      (it) => `
      <article class="manga-card">
        <a href="${it.href}">
          <img alt="Bìa ${it.title}" src="${it.cover || 'https://cdn.example/c.jpg'}" />
          <h3 title="${it.title}">${it.title}</h3>
          <span class="manga-chapter-label">${it.chapter || 'Ch. 1'}</span>
        </a>
      </article>`,
    )
    .join('');
  const pager = `
    <div class="admin-pagination__numbers">
      <span class="chip">${page}</span>
      <a href="/manga?page=${maxPage}">${maxPage}</a>
    </div>`;
  return `<html><body>${cards}${pager}</body></html>`;
}

describe('MoeTruyen bulk scan /manga helpers', () => {
  test('buildMangaCatalogListingUrl page 1 has no query; page N uses ?page=', () => {
    expect(buildMangaCatalogListingUrl(1)).toBe(LISTING_PATH);
    expect(buildMangaCatalogListingUrl(2)).toBe(`${LISTING_PATH}?page=2`);
    expect(buildMangaCatalogListingUrl(0)).toBe(LISTING_PATH);
  });

  test('parseMangaCatalogMaxPage reads highest page from pager', () => {
    const html = pageHtml({
      page: 1,
      maxPage: 67,
      items: [{ href: '/manga/1-one', title: 'One' }],
    });
    expect(parseMangaCatalogMaxPage(html)).toBe(67);
    expect(MANGA_BULK_SCAN_MAX_PAGES_CAP).toBeGreaterThanOrEqual(67);
  });

  test('parseMangaCatalogListing returns catalog cards', () => {
    const html = pageHtml({
      page: 1,
      maxPage: 2,
      items: [
        { href: '/manga/1-one', title: 'Manga One', cover: 'https://cdn.example/one.jpg', chapter: 'Ch. 10' },
        { href: '/manga/2-two', title: 'Manga Two', chapter: 'Ch. 3' },
      ],
    });
    const items = parseMangaCatalogListing(html, LISTING_PATH);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Manga One',
      mangaUrl: 'https://moetruyen.net/manga/1-one',
      coverUrl: 'https://cdn.example/one.jpg',
      latestChapterLabel: 'Ch. 10',
    });
  });
});

describe('fetchBulkScanListing', () => {
  test('merges pages and dedupes by mangaUrl', async () => {
    const pages = {
      [LISTING_PATH]: pageHtml({
        page: 1,
        maxPage: 2,
        items: [
          { href: '/manga/1-one', title: 'One' },
          { href: '/manga/2-two', title: 'Two' },
        ],
      }),
      [`${LISTING_PATH}?page=2`]: pageHtml({
        page: 2,
        maxPage: 2,
        items: [
          { href: '/manga/2-two', title: 'Two Dup' },
          { href: '/manga/3-three', title: 'Three' },
        ],
      }),
    };
    const progress = [];
    const res = await fetchBulkScanListing({
      onProgress: (p) => progress.push({ ...p }),
      fetchHtmlImpl: async (url) => {
        const html = pages[url];
        if (!html) return { ok: false, error: `unexpected ${url}` };
        return { ok: true, html };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.siteId).toBe('moetruyen');
    expect(res.pagesFetched).toBe(2);
    expect(res.totalPagesDetected).toBe(2);
    expect(res.items.map((i) => i.mangaUrl)).toEqual([
      'https://moetruyen.net/manga/1-one',
      'https://moetruyen.net/manga/2-two',
      'https://moetruyen.net/manga/3-three',
    ]);
    expect(progress[0]).toEqual({ page: 1, totalPages: 2 });
    expect(progress[1]).toEqual({ page: 2, totalPages: 2 });
  });

  test('page 1 failure returns ok:false', async () => {
    const res = await fetchBulkScanListing({
      fetchHtmlImpl: async () => ({ ok: false, error: 'HTTP 500' }),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/500/);
    expect(res.items).toEqual([]);
  });

  test('later page failure returns partial ok:true with error', async () => {
    const res = await fetchBulkScanListing({
      fetchHtmlImpl: async (url) => {
        if (url.includes('page=2')) return { ok: false, error: 'HTTP 503' };
        return {
          ok: true,
          html: pageHtml({
            page: 1,
            maxPage: 2,
            items: [{ href: '/manga/1-one', title: 'One' }],
          }),
        };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.error).toMatch(/503/);
  });

  test('respects MANGA_BULK_SCAN_MAX_PAGES_CAP', async () => {
    let maxRequested = 1;
    await fetchBulkScanListing({
      fetchHtmlImpl: async (url) => {
        const m = url.match(/[?&]page=(\d+)/);
        const p = m ? parseInt(m[1], 10) : 1;
        maxRequested = Math.max(maxRequested, p);
        return {
          ok: true,
          html: pageHtml({
            page: p,
            maxPage: 999,
            items: [{ href: `/manga/${p}-x`, title: `P${p}` }],
          }),
        };
      },
    });
    expect(maxRequested).toBe(MANGA_BULK_SCAN_MAX_PAGES_CAP);
  });
});

describe('MoeTruyen connector bulk scan flag', () => {
  test('supportsBulkScan and fetchBulkScanListing are wired', () => {
    const connector = require('../../../platform/connectors/moetruyen');
    expect(connector.supportsBulkScan).toBe(true);
    expect(typeof connector.fetchBulkScanListing).toBe('function');
    expect(DOMAIN).toBe('https://moetruyen.net/');
  });
});
