/**
 * Parser tests for ZetTruyen latest listing
 */
const {
  parseZettruyenListingHtml,
  parseZettruyenSearchHtml,
  parseZettruyenListingMaxPage,
  buildZettruyenListingUrl,
  buildZettruyenSearchUrl,
  resolveZettruyenListingTotalPages,
  fetchLatestUpdates,
} = require('../../../platform/connectors/services/zettruyenService');

describe('ZetTruyen latest listing', () => {
  test('buildZettruyenListingUrl uses advanced search for latest updates', () => {
    expect(buildZettruyenListingUrl(1)).toBe('https://www.zettruyen4.com/tim-kiem-nang-cao');
    expect(buildZettruyenListingUrl(3)).toBe('https://www.zettruyen4.com/tim-kiem-nang-cao?page=3');
    expect(buildZettruyenListingUrl(2, 'https://www.zettruyen5.com/')).toBe(
      'https://www.zettruyen5.com/tim-kiem-nang-cao?page=2',
    );
  });

  test('buildZettruyenSearchUrl', () => {
    expect(buildZettruyenSearchUrl('naruto', 1)).toBe(
      'https://www.zettruyen4.com/tim-kiem-nang-cao?name=naruto',
    );
    expect(buildZettruyenSearchUrl('naruto', 2)).toBe(
      'https://www.zettruyen4.com/tim-kiem-nang-cao?name=naruto&page=2',
    );
    expect(buildZettruyenSearchUrl('naruto', 1, 'https://www.zettruyen5.com')).toBe(
      'https://www.zettruyen5.com/tim-kiem-nang-cao?name=naruto',
    );
  });

  test('parseZettruyenListingHtml extracts homepage grid rows', () => {
    const html = `
      <div class="grid grid-rows-1 grid-cols-12 m-2">
        <div class="col-span-3">
          <div class="thumb-cover">
            <a href="/truyen-tranh/test-manga">
              <img src="https://cdn4.zetimage.com/thumb/test-manga.jpg" />
            </a>
          </div>
        </div>
        <div class="col-span-9 space-y-1.5 overflow-hidden pl-[9px]">
          <div class="text-[15px] font-medium">
            <a href="/truyen-tranh/test-manga" title="Test Manga">Test Manga</a>
          </div>
          <a href="/truyen-tranh/test-manga/chuong-5" class="flex w-full chapter-link">
            <p class="truncate" title="Chương 5"> Chương 5 </p>
          </a>
        </div>
      </div>
      <a href="https://www.zettruyen.ink?page=2#LatestUpdate">2</a>
      <a href="https://www.zettruyen.ink?page=12">12</a>
    `;
    const items = parseZettruyenListingHtml(html, 'https://www.zettruyen.ink/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Manga');
    expect(items[0].mangaUrl).toBe('https://www.zettruyen.ink/truyen-tranh/test-manga');
    expect(items[0].coverUrl).toBe('https://cdn4.zetimage.com/thumb/test-manga.jpg');
    expect(items[0].latestChapterLabel).toBe('Chương 5');
    expect(parseZettruyenListingMaxPage(html)).toBe(12);
  });

  test('parseZettruyenSearchHtml extracts advanced search rows', () => {
    const html = `
      <div class="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3 p-2 md:p-4">
        <a href="https://www.zettruyen.ink/truyen-tranh/naruto">
          <div class="w-full block sm:block hover:cursor-pointer group hover:text-theme-color text-white">
            <div class="flex h-[190px] thumb-cover">
              <img alt="Naruto" title="Naruto" src="https://cdn4.zetimage.com/thumb/naruto.jpg" />
            </div>
            <span class="text-[13.3px] font-bold line-clamp-2">Naruto</span>
            <span class="text-[13px] text-txt-secondary truncate">Chương 700.9</span>
          </div>
        </a>
      </div>
    `;
    const items = parseZettruyenSearchHtml(
      html,
      'https://www.zettruyen.ink/tim-kiem-nang-cao?name=naruto',
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Naruto');
    expect(items[0].mangaUrl).toBe('https://www.zettruyen.ink/truyen-tranh/naruto');
    expect(items[0].coverUrl).toBe('https://cdn4.zetimage.com/thumb/naruto.jpg');
    expect(items[0].latestChapterLabel).toBe('Chương 700.9');
  });

  test('resolveZettruyenListingTotalPages uses advanced page size', () => {
    const html = '<a href="https://www.zettruyen.ink/tim-kiem-nang-cao?page=2">2</a>';
    expect(resolveZettruyenListingTotalPages(html, 1, 30, 30)).toBe(2);
    expect(resolveZettruyenListingTotalPages(html, 1, 10, 30)).toBe(1);
  });

  test('exports fetchLatestUpdates', () => {
    expect(typeof fetchLatestUpdates).toBe('function');
  });

  test('extractZettruyenDescription reads p.comic-content.desk', () => {
    const { extractZettruyenDescription } = require('../../../platform/connectors/services/zettruyenService');
    const html = `
      <p class="comic-content desk font-medium text-[#A2A2A2] line-clamp-3">
        <b>Chàng Rể Mạnh Nhất Lịch Sử</b> là bộ truyện thuộc thể loại
        <b>Action, Adventure, Comedy</b>, được sáng tác bởi <b>TruyenQQ</b>.
        Chương mới nhất là <b>Chương 406</b>.
      </p>
    `;
    const description = extractZettruyenDescription(html);
    expect(description).toContain('Chàng Rể Mạnh Nhất Lịch Sử');
    expect(description).toContain('Action, Adventure, Comedy');
    expect(description).toContain('Chương 406');
  });
});
