jest.mock('../../../download/connector/htmlConnectorUtils', () => {
  const actual = jest.requireActual('../../../download/connector/htmlConnectorUtils');
  return {
    ...actual,
    fetchHtml: jest.fn(),
  };
});

const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const {
  parseYurinekoChapterImages,
  parseYurinekoMangaPage,
  fetchChapterImages,
} = require('../../../platform/connectors/services/yurinekoService');

const CHAPTER_URL = 'https://yurinekoz.com/manga/holoschool/chapter-7';
const CHAPTER_IMG_KEY = '88903ff7e996643f1b99b3e55940f99d';
const UUID_MANGA_ID = '99572729-a155-42a0-a328-e48b0450ffeb';
const UUID_CHAPTER_URL = `https://yurinekoz.com/manga/${UUID_MANGA_ID}/chapter-11`;
const UUID_MANGA_HTML = `<link rel="canonical" href="https://yurinekoz.com/manga/asobi-asobase"/>`;

function buildRscChapterBody() {
  return [
    `["$","$L27",null,{"imgKey":"${CHAPTER_IMG_KEY}"}]`,
    '{"images":[{"url":"483dcf0e9dcc3e2ceae523d1a3a8ed1a:encrypted","order":0}]}',
    '{"images":[{"url":"/api/img?d=page1","order":0},{"url":"/api/img?d=page2","order":1},{"url":"/api/img?d=page3","order":2}]}',
  ].join('\n');
}

describe('Yurineko chapter images', () => {
  beforeEach(() => {
    fetchHtml.mockReset();
  });

  describe('parseYurinekoChapterImages', () => {
    it('extracts imgKey and /api/img URLs from Next.js RSC payload', () => {
      const image_list = parseYurinekoChapterImages(buildRscChapterBody(), CHAPTER_URL);

      expect(image_list).toHaveLength(3);
      expect(image_list[0].imgKey).toBe(CHAPTER_IMG_KEY);
      expect(image_list[0].imageUrl).toBe('https://yurinekoz.com/api/img?d=page1');
      expect(image_list[2].imageUrl).toBe('https://yurinekoz.com/api/img?d=page3');
    });
  });

  describe('parseYurinekoMangaPage', () => {
    it('uses canonical slug when the manga URL path is a UUID', () => {
      const parsed_page = parseYurinekoMangaPage(
        UUID_MANGA_HTML,
        `https://yurinekoz.com/manga/${UUID_MANGA_ID}`,
      );

      expect(parsed_page.mangaSlug).toBe('asobi-asobase');
    });

    it('uses a later chapter-link slug when earlier links are UUIDs', () => {
      const parsed_page = parseYurinekoMangaPage(
        `<a href="/manga/${UUID_MANGA_ID}/chapter-1"></a>` +
          '<a href="/manga/asobi-asobase/chapter-11"></a>',
        `https://yurinekoz.com/manga/${UUID_MANGA_ID}`,
      );

      expect(parsed_page.mangaSlug).toBe('asobi-asobase');
    });
  });

  describe('fetchChapterImages', () => {
    it('falls back to RSC payload when the HTML document returns HTTP 500', async () => {
      fetchHtml
        .mockResolvedValueOnce({ ok: false, error: 'HTTP 500' })
        .mockResolvedValueOnce({ ok: true, html: buildRscChapterBody() });

      const image_list = await fetchChapterImages(CHAPTER_URL, 'https://yurinekoz.com/');

      expect(image_list).toHaveLength(3);
      expect(image_list[0].imgKey).toBe(CHAPTER_IMG_KEY);
      expect(fetchHtml).toHaveBeenCalledTimes(2);
      expect(fetchHtml.mock.calls[1][1].headers.RSC).toBe('1');
      expect(fetchHtml.mock.calls[1][1].accept).toBe('text/x-component');
    });

    it('surfaces the HTML fetch error instead of a generic HTTP error', async () => {
      fetchHtml
        .mockResolvedValueOnce({ ok: false, error: 'HTTP 500' })
        .mockResolvedValueOnce({ ok: false, error: 'HTTP 500' });

      await expect(fetchChapterImages(CHAPTER_URL)).rejects.toThrow(
        'Không tải được trang chương: HTTP 500',
      );
    });

    it('resolves UUID manga paths to the canonical slug before fetching images', async () => {
      fetchHtml.mockImplementation(async (request_url) => {
        if (String(request_url).includes('/manga/asobi-asobase/chapter-11')) {
          return { ok: true, html: buildRscChapterBody() };
        }
        if (
          String(request_url).includes(`/manga/${UUID_MANGA_ID}`) &&
          !String(request_url).includes('/chapter-')
        ) {
          return { ok: true, html: UUID_MANGA_HTML };
        }
        return { ok: false, error: 'HTTP 404' };
      });

      const image_list = await fetchChapterImages(UUID_CHAPTER_URL, 'https://yurinekoz.com/');

      expect(image_list).toHaveLength(3);
      expect(image_list[0].imageUrl).toContain('/api/img?d=page1');
      const fetched_urls = fetchHtml.mock.calls.map((call_args) => call_args[0]);
      expect(fetched_urls).toContain(`https://yurinekoz.com/manga/${UUID_MANGA_ID}`);
      expect(fetched_urls).toContain('https://yurinekoz.com/manga/asobi-asobase/chapter-11');
    });

    it('throws when a UUID chapter URL cannot be resolved to a slug', async () => {
      fetchHtml.mockResolvedValue({
        ok: true,
        html: `<a href="/manga/${UUID_MANGA_ID}/chapter-11"></a>`,
      });

      await expect(fetchChapterImages(UUID_CHAPTER_URL)).rejects.toThrow(
        `Không tìm thấy slug truyện cho UUID ${UUID_MANGA_ID}`,
      );
    });
  });
});
