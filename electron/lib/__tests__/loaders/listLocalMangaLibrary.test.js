'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { listLocalMangaUnderSaveDir } = require('../../library/listLocalMangaLibrary');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'library-scan-test-'));
}

function writeFile(relPath, content = 'x') {
  const dir = path.dirname(relPath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(relPath, content);
}

describe('listLocalMangaUnderSaveDir — metadata extraction', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = mkTempDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test('extracts mangaUrl and siteId when download_db.json is present', () => {
    const mangaDir = path.join(tmpRoot, 'Manga With DB');
    writeFile(path.join(mangaDir, 'Ch1', '001.jpg'));
    fs.writeFileSync(
      path.join(mangaDir, 'download_db.json'),
      JSON.stringify({
        mangaTitle: 'Manga With DB',
        mangaUrl: 'https://example.com/manga/123',
        connector: 'cuutruyen',
        chapters: {
          'Ch1': { status: 'completed' },
        },
      })
    );

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(1);
    expect(items[0].mangaTitle).toBe('Manga With DB');
    expect(items[0].hasDb).toBe(true);
    expect(items[0].mangaUrl).toBe('https://example.com/manga/123');
    expect(items[0].siteId).toBe('cuutruyen');
  });

  test('returns empty mangaUrl and siteId when download_db.json is missing', () => {
    const mangaDir = path.join(tmpRoot, 'Manga Without DB');
    writeFile(path.join(mangaDir, 'Ch1', '001.jpg'));

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(1);
    expect(items[0].mangaTitle).toBe('Manga Without DB');
    expect(items[0].hasDb).toBe(false);
    expect(items[0].mangaUrl).toBe('');
    expect(items[0].siteId).toBe('');
  });

  test('detects oneshot folder with direct images', () => {
    const mangaDir = path.join(tmpRoot, 'Oneshot Direct');
    writeFile(path.join(mangaDir, '001.jpg'));
    writeFile(path.join(mangaDir, '002.png'));

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(1);
    expect(items[0].mangaTitle).toBe('Oneshot Direct');
    expect(items[0].chapterCount).toBe(1);
  });

  test('scans multi-manga root folder and lists all child manga correctly', () => {
    const mangaA = path.join(tmpRoot, 'MangaA');
    writeFile(path.join(mangaA, 'Ch1', '001.jpg'));
    writeFile(path.join(mangaA, 'Ch2', '001.jpg'));

    const mangaB = path.join(tmpRoot, 'MangaB');
    writeFile(path.join(mangaB, 'Ch1', '001.jpg'));
    writeFile(path.join(mangaB, 'Ch2', '001.jpg'));
    writeFile(path.join(mangaB, 'Ch3', '001.jpg'));

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(2);
    expect(items[0].mangaTitle).toBe('MangaA');
    expect(items[0].chapterCount).toBe(2);
    expect(items[1].mangaTitle).toBe('MangaB');
    expect(items[1].chapterCount).toBe(3);
  });

  test('scans nested category folders (e.g. savePath/Shounen/MangaA)', async () => {
    const mangaA = path.join(tmpRoot, 'Shounen', 'MangaA');
    writeFile(path.join(mangaA, 'Ch1', '001.jpg'));
    writeFile(path.join(mangaA, 'Ch2', '001.jpg'));

    const mangaB = path.join(tmpRoot, 'Shounen', 'MangaB');
    writeFile(path.join(mangaB, 'Ch1', '001.jpg'));

    const mangaC = path.join(tmpRoot, 'DirectManga');
    writeFile(path.join(mangaC, 'Ch1', '001.jpg'));

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(3);
    const titles = items.map((x) => x.mangaTitle);
    expect(titles).toContain('DirectManga');
    expect(titles).toContain('MangaA');
    expect(titles).toContain('MangaB');
  });

  test('listLocalMangaUnderSaveDirAsync matches synchronous results', async () => {
    const { listLocalMangaUnderSaveDirAsync } = require('../../library/listLocalMangaLibrary');
    const mangaA = path.join(tmpRoot, 'MangaA');
    writeFile(path.join(mangaA, 'Ch1', '001.jpg'));

    const syncItems = listLocalMangaUnderSaveDir(tmpRoot);
    const asyncItems = await listLocalMangaUnderSaveDirAsync(tmpRoot);
    expect(asyncItems).toEqual(syncItems);
  });

  test('counts completed chapters from download_db plus unindexed on-disk chapter folders', () => {
    const mangaDir = path.join(tmpRoot, 'Hybrid Manga');
    writeFile(path.join(mangaDir, 'Ch1', '001.jpg'));
    writeFile(path.join(mangaDir, 'Ch2 Manual Copy', '001.jpg'));
    fs.writeFileSync(
      path.join(mangaDir, 'download_db.json'),
      JSON.stringify({
        mangaTitle: 'Hybrid Manga',
        chapters: {
          'Ch1': { status: 'completed' },
        },
      })
    );

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(1);
    expect(items[0].mangaTitle).toBe('Hybrid Manga');
    expect(items[0].chapterCount).toBe(2);
  });

  test('scans category folder with only a single manga (1 child)', () => {
    const mangaSingle = path.join(tmpRoot, 'SoloCategory', 'LoneManga');
    writeFile(path.join(mangaSingle, 'Ch1', '001.jpg'));

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(1);
    expect(items[0].mangaTitle).toBe('LoneManga');
    expect(items[0].category).toBe('SoloCategory');
    expect(items[0].chapterCount).toBe(1);
  });

  test('scans comic archives inside manga folders (.cbz)', () => {
    const cbzManga = path.join(tmpRoot, 'Archive Comics');
    writeFile(path.join(cbzManga, 'Vol01.cbz'), 'fake-zip-data');
    writeFile(path.join(cbzManga, 'Vol02.cbz'), 'fake-zip-data');

    const items = listLocalMangaUnderSaveDir(tmpRoot);
    expect(items.length).toBe(1);
    expect(items[0].mangaTitle).toBe('Archive Comics');
    expect(items[0].archiveKind).toBe('cbz');
    expect(items[0].chapterCount).toBe(2);
  });

  test('utilizes mtime cache for subsequent scans and invalidates on change', async () => {
    const { LibraryScanCache } = require('../../library/libraryScanCache');
    const cacheFile = path.join(tmpRoot, 'test-cache.json');
    const customCache = new LibraryScanCache({ filePath: cacheFile });

    const mangaA = path.join(tmpRoot, 'CachedManga');
    writeFile(path.join(mangaA, 'Ch1', '001.jpg'));

    const firstScan = listLocalMangaUnderSaveDir(tmpRoot, true, 2, 0, { cache: customCache });
    expect(firstScan.length).toBe(1);
    expect(firstScan[0].chapterCount).toBe(1);

    // Second scan with cache
    const secondScan = listLocalMangaUnderSaveDir(tmpRoot, true, 2, 0, { cache: customCache });
    expect(secondScan).toEqual(firstScan);

    // Add a chapter and update mtime
    writeFile(path.join(mangaA, 'Ch2', '001.jpg'));
    const now = Date.now() / 1000 + 10;
    fs.utimesSync(mangaA, now, now);

    const thirdScan = listLocalMangaUnderSaveDir(tmpRoot, true, 2, 0, { cache: customCache });
    expect(thirdScan[0].chapterCount).toBe(2);
  });
});
