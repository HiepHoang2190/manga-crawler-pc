/**
 * Parser tests for TopTruyenZone2 latest listing
 */
const {
  parseTopTruyenZone2ListingHtml,
  parseTopTruyenZone2ListingMaxPage,
  buildTopTruyenZone2ListingUrl,
  buildTopTruyenZone2SearchUrl,
  fetchLatestUpdates,
} = require('../../../platform/connectors/services/topTruyenZone2Service');

describe('TopTruyenZone2 latest listing', () => {
  test('buildTopTruyenZone2ListingUrl returns correct URL', () => {
    expect(buildTopTruyenZone2ListingUrl(1)).toBe('https://www.toptruyenzone13.com/');
    expect(buildTopTruyenZone2ListingUrl(3)).toBe('https://www.toptruyenzone13.com/?page=3');
  });

  test('buildTopTruyenZone2SearchUrl', () => {
    expect(buildTopTruyenZone2SearchUrl('naruto', 1)).toBe(
      'https://www.toptruyenzone13.com/tim-truyen?keyword=naruto',
    );
    expect(buildTopTruyenZone2SearchUrl('naruto', 2)).toBe(
      'https://www.toptruyenzone13.com/tim-truyen?keyword=naruto&page=2',
    );
  });

  test('parseTopTruyenZone2ListingHtml extracts item-manga rows', () => {
    const html = `
      <div class="item-manga">
        <img class="image-item" data-original="https://cdn.example/cover.webp" />
        <a class="title-manga" href="/truyen-tranh/test-manga/1">Test Manga</a>
        <a class="chapter" href="/truyen-tranh/test-manga/chapter-5/9">Chapter 5</a>
      <ul class="pagination">
        <li class="page-item active"><a class="page-link" href="#">1</a></li>
        <li class="page-item"><a class="page-link" href="https://www.toptruyenzone13.com?page=2">2</a></li>
        <li class="page-item"><a class="page-link" href="https://www.toptruyenzone13.com?page=10">10</a></li>
      </ul>
    `;
    const items = parseTopTruyenZone2ListingHtml(html, 'https://www.toptruyenzone13.com/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Manga');
    expect(items[0].mangaUrl).toContain('/truyen-tranh/test-manga/1');
    expect(items[0].coverUrl).toBe('https://cdn.example/cover.webp');
    expect(items[0].latestChapterLabel).toBe('Chapter 5');
    expect(parseTopTruyenZone2ListingMaxPage(html)).toBe(10);
  });

  test('exports fetchLatestUpdates', () => {
    expect(typeof fetchLatestUpdates).toBe('function');
  });

  test('extractTopTruyenZone2Description reads p.detail-summary', () => {
    const {
      extractTopTruyenZone2Description,
      parseTopTruyenZone2MangaPage,
    } = require('../../../platform/connectors/services/topTruyenZone2Service');
    const html = `
      <h1 class="title-manga">Đại Quản Gia Là Ma Hoàng</h1>
      <p class="detail-summary">Cảnh giới truyện <br>– Tụ khí cảnh<br>– Đoạn cốt cảnh</p>
    `;
    const description = extractTopTruyenZone2Description(html);
    expect(description).toContain('Cảnh giới truyện');
    expect(description).toContain('Tụ khí cảnh');
    const parsed = parseTopTruyenZone2MangaPage(
      html,
      'https://www.toptruyenzone9.com/truyen-tranh/dai-quan-gia-la-ma-hoang/1',
    );
    expect(parsed.title).toBe('Đại Quản Gia Là Ma Hoàng');
    expect(parsed.description).toContain('Đoạn cốt cảnh');
  });
});
