/**
 * Unit tests for MangaPlus API client — protobuf API (format=json is blocked with 403).
 */
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const protobuf = require('protobufjs');

const {
  fetchManga,
  fetchChapters,
  MangaPlusApiClient,
} = require('../../../platform/connectors/services/mangaPlusApiClient');

const TEST_URL = 'https://mangaplus.shueisha.co.jp/titles/1000001';
const OVERVIEW =
  'Thế giới bước vào kỷ nguyên Đại Hải Tặc. Bấy giờ nhiều hải tặc tranh nhau giành lấy "Kho báu vĩ đại nhất - One Piece".';

/** Minimal schema matching production decoder for building fixtures. */
function buildResponseType() {
  const root = protobuf.Root.fromJSON({
    nested: {
      MangaPlus: {
        nested: {
          Chapter: {
            fields: {
              titleId: { type: 'uint32', id: 1 },
              chapterId: { type: 'uint32', id: 2 },
              name: { type: 'string', id: 3 },
              subTitle: { type: 'string', id: 4 },
              thumbnailUrl: { type: 'string', id: 5 },
            },
          },
          ChapterListGroup: {
            fields: {
              chapterNumbers: { type: 'string', id: 1 },
              firstChapterList: { rule: 'repeated', type: 'Chapter', id: 2 },
              midChapterList: { rule: 'repeated', type: 'Chapter', id: 3 },
              lastChapterList: { rule: 'repeated', type: 'Chapter', id: 4 },
            },
          },
          Title: {
            fields: {
              titleId: { type: 'uint32', id: 1 },
              name: { type: 'string', id: 2 },
              author: { type: 'string', id: 3 },
              portraitImageUrl: { type: 'string', id: 4 },
            },
          },
          TitleDetailView: {
            fields: {
              title: { type: 'Title', id: 1 },
              overview: { type: 'string', id: 3 },
              chapterListGroup: { rule: 'repeated', type: 'ChapterListGroup', id: 28 },
            },
          },
          MangaPage: {
            fields: {
              imageUrl: { type: 'string', id: 1 },
              encryptionKey: { type: 'string', id: 5 },
            },
          },
          Page: {
            fields: {
              mangaPage: { type: 'MangaPage', id: 1 },
            },
          },
          MangaViewer: {
            fields: {
              pages: { rule: 'repeated', type: 'Page', id: 1 },
            },
          },
          SuccessResult: {
            fields: {
              titleDetailView: { type: 'TitleDetailView', id: 8 },
              mangaViewer: { type: 'MangaViewer', id: 10 },
            },
          },
          Response: {
            fields: {
              success: { type: 'SuccessResult', id: 1 },
            },
          },
        },
      },
    },
  });
  return root.lookupType('MangaPlus.Response');
}

function encodeTitleDetailResponse() {
  const Response = buildResponseType();
  const message = Response.create({
    success: {
      titleDetailView: {
        title: {
          titleId: 1000001,
          name: 'ONE PIECE',
          author: 'Eiichiro Oda',
          portraitImageUrl: 'https://example.com/cover.jpg',
        },
        overview: OVERVIEW,
        chapterListGroup: [
          {
            chapterNumbers: '1-3',
            firstChapterList: [
              {
                titleId: 1000001,
                chapterId: 10000001,
                name: '#001',
                subTitle: 'Romance Dawn',
              },
            ],
            lastChapterList: [
              {
                titleId: 1000001,
                chapterId: 10000299,
                name: '#1188',
                subTitle: 'Bohu',
              },
            ],
          },
        ],
      },
    },
  });
  return Buffer.from(Response.encode(message).finish());
}

function encodeMangaViewerResponse() {
  const Response = buildResponseType();
  const message = Response.create({
    success: {
      mangaViewer: {
        pages: [
          {
            mangaPage: {
              imageUrl: 'https://example.com/page1.jpg',
              encryptionKey: 'aabb',
            },
          },
        ],
      },
    },
  });
  return Buffer.from(Response.encode(message).finish());
}

describe('MangaPlus API protobuf (no format=json)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (url) => {
      const urlString = String(url);
      expect(urlString).not.toMatch(/format=json/i);
      const body = urlString.includes('manga_viewer')
        ? encodeMangaViewerResponse()
        : encodeTitleDetailResponse();
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => body,
      };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('fetchManga requests title_detailV3 without format=json and maps overview', async () => {
    const result = await fetchManga(TEST_URL);
    expect(result.ok).toBe(true);
    expect(result.manga.title).toBe('ONE PIECE');
    expect(result.manga.author).toBe('Eiichiro Oda');
    expect(result.manga.description).toBe(OVERVIEW);

    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toContain('title_detailV3');
    expect(calledUrl).toContain('title_id=1000001');
    expect(calledUrl).not.toContain('format=json');
  });

  test('fetchChapters reads chapterListGroup from protobuf', async () => {
    const result = await fetchChapters(TEST_URL);
    expect(result.ok).toBe(true);
    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0].url).toContain('/viewer/10000001');
    expect(result.chapters[1].url).toContain('/viewer/10000299');
  });

  test('fetchChapterImages requests manga_viewer without format=json', async () => {
    const client = new MangaPlusApiClient();
    const pages = await client.fetchChapterImages(
      'https://mangaplus.shueisha.co.jp/viewer/10000001',
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].imageUrl).toBe('https://example.com/page1.jpg');
    expect(pages[0].encryptionKey).toBe('aabb');

    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toContain('manga_viewer');
    expect(calledUrl).not.toContain('format=json');
  });
});
