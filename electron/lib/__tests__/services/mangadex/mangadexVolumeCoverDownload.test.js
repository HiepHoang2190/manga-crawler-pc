const { service } = require('../../../platform/connectors/services/mangadexService');
const { fetchMangaCovers } = require('../../../platform/connectors/services/mangadxApiClient');
const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../../platform/connectors/services/mangadxApiClient', () => {
  const actual = jest.requireActual('../../../platform/connectors/services/mangadxApiClient');
  return {
    ...actual,
    fetchMangaCovers: jest.fn(),
  };
});

describe('MangaDex Volume Cover Download', () => {
  let tmpRoot;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'md-vol-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  test('should trigger volume cover download to Vol. X/cover.jpg when chapter has volume', async () => {
    const testMangaId = 'a96676e5-8ae2-425e-b549-7f15dd34a6d8';
    fetchMangaCovers.mockResolvedValue({
      ok: true,
      covers: [
        {
          id: 'cov-1',
          volume: '1',
          fileName: 'vol1.jpg',
          urlOriginal: 'https://uploads.mangadex.org/covers/' + testMangaId + '/vol1.jpg',
          url512: 'https://uploads.mangadex.org/covers/' + testMangaId + '/vol1.jpg.512.jpg',
        },
      ],
    });

    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('uploads.mangadex.org')) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        };
      }
      if (u.includes('/at-home/server/')) {
        return {
          ok: true,
          json: async () => ({
            chapter: {
              hash: 'hash1',
              data: ['001.jpg'],
            },
            baseUrl: 'https://mangadex.network',
          }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      };
    });

    const payload = {
      mangaTitle: 'Test Manga',
      chapterTitle: 'Chapter 1',
      chapterUrl: 'https://mangadex.org/chapter/b3433588-3485-48b4-8255-b040deabf522',
      mangaUrl: `https://mangadex.org/title/${testMangaId}`,
      baseSaveDir: tmpRoot,
      volume: '1',
      coverUrl: null,
    };

    const res = await service.downloadChapter(payload, 'MangaDex');
    expect(res.ok).toBe(true);

    const expectedCoverPath = path.join(tmpRoot, 'Test Manga', 'Vol. 1', 'cover.jpg');
    expect(fs.existsSync(expectedCoverPath)).toBe(true);
  });

  test('should skip volume cover download and folder when mangadexVolumeFolderGrouping is false', async () => {
    const testMangaId = 'a96676e5-8ae2-425e-b549-7f15dd34a6d8';
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/at-home/server/')) {
        return {
          ok: true,
          json: async () => ({
            chapter: { hash: 'hash1', data: ['001.jpg'] },
            baseUrl: 'https://mangadex.network',
          }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      };
    });

    const payload = {
      mangaTitle: 'Test Manga',
      chapterTitle: 'Chapter 1',
      chapterUrl: 'https://mangadex.org/chapter/b3433588-3485-48b4-8255-b040deabf522',
      mangaUrl: `https://mangadex.org/title/${testMangaId}`,
      baseSaveDir: tmpRoot,
      volume: '1',
      mangadexVolumeFolderGrouping: false,
      coverUrl: null,
    };

    const res = await service.downloadChapter(payload, 'MangaDex');
    expect(res.ok).toBe(true);

    // Should NOT create Vol. 1 directory
    const volDirPath = path.join(tmpRoot, 'Test Manga', 'Vol. 1');
    expect(fs.existsSync(volDirPath)).toBe(false);
    expect(fetchMangaCovers).not.toHaveBeenCalled();
  });

  test('should not re-download cover if cover already exists in volume folder', async () => {
    const testMangaId = 'a96676e5-8ae2-425e-b549-7f15dd34a6d8';
    const volDir = path.join(tmpRoot, 'Test Manga', 'Vol. 1');
    fs.mkdirSync(volDir, { recursive: true });
    fs.writeFileSync(path.join(volDir, 'cover.jpg'), Buffer.from([1, 2, 3]));

    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/at-home/server/')) {
        return {
          ok: true,
          json: async () => ({
            chapter: { hash: 'hash1', data: ['001.jpg'] },
            baseUrl: 'https://mangadex.network',
          }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      };
    });

    const payload = {
      mangaTitle: 'Test Manga',
      chapterTitle: 'Chapter 1',
      chapterUrl: 'https://mangadex.org/chapter/b3433588-3485-48b4-8255-b040deabf522',
      mangaUrl: `https://mangadex.org/title/${testMangaId}`,
      baseSaveDir: tmpRoot,
      volume: '1',
      coverUrl: null,
    };

    const res = await service.downloadChapter(payload, 'MangaDex');
    expect(res.ok).toBe(true);
    expect(fetchMangaCovers).not.toHaveBeenCalled();
  });

  test('should match volume cover even if cover volume has leading zero (e.g. 01 vs 1)', async () => {
    const testMangaId = 'b96676e5-8ae2-425e-b549-7f15dd34a6d9';
    fetchMangaCovers.mockResolvedValue({
      ok: true,
      covers: [
        {
          id: 'cov-01',
          volume: '01',
          fileName: 'vol01.jpg',
          urlOriginal: 'https://uploads.mangadex.org/covers/' + testMangaId + '/vol01.jpg',
          url512: 'https://uploads.mangadex.org/covers/' + testMangaId + '/vol01.jpg.512.jpg',
        },
      ],
    });

    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/at-home/server/')) {
        return {
          ok: true,
          json: async () => ({
            chapter: { hash: 'hash1', data: ['001.jpg'] },
            baseUrl: 'https://mangadex.network',
          }),
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      };
    });

    const payload = {
      mangaTitle: 'Test Manga',
      chapterTitle: 'Chapter 1',
      chapterUrl: 'https://mangadex.org/chapter/b3433588-3485-48b4-8255-b040deabf522',
      mangaUrl: `https://mangadex.org/title/${testMangaId}`,
      baseSaveDir: tmpRoot,
      volume: '1',
      coverUrl: null,
    };

    const res = await service.downloadChapter(payload, 'MangaDex');
    expect(res.ok).toBe(true);

    const expectedCoverPath = path.join(tmpRoot, 'Test Manga', 'Vol. 1', 'cover.jpg');
    expect(fs.existsSync(expectedCoverPath)).toBe(true);
  });
});
