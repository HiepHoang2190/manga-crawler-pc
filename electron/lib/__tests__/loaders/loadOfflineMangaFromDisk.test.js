'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  loadOfflineMangaFromAbsolutePath,
  loadOfflineMangaFromDisk,
} = require('../../reader/loaders/loadOfflineMangaFromDisk');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'offline-manga-test-'));
}

function writeFile(relPath, content = 'x') {
  const dir = path.dirname(relPath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(relPath, content);
}

describe('loadOfflineMangaFromAbsolutePath — CBZ folder import chapter count', () => {
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

  test('loads all chapters from standard folder layout', () => {
    const mangaDir = path.join(tmpRoot, 'standard');
    writeFile(path.join(mangaDir, 'Ch1', '001.jpg'));
    writeFile(path.join(mangaDir, 'Ch2', '001.jpg'));
    writeFile(path.join(mangaDir, 'Ch3', '001.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(3);
    expect(r.manga.offlineMangaDirAbsolute).toBe(path.resolve(mangaDir));
  });

  test('detects wrapped root folder (one outer directory)', () => {
    const mangaDir = path.join(tmpRoot, 'wrapped');
    writeFile(path.join(mangaDir, 'OuterWrap', 'Ch1', '001.jpg'));
    writeFile(path.join(mangaDir, 'OuterWrap', 'Ch2', '001.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(2);
    expect(r.manga.offlineMangaDirAbsolute).toBe(path.resolve(mangaDir, 'OuterWrap'));
  });

  test('merges extra on-disk chapter folders missing from download_db.json', () => {
    const mangaDir = path.join(tmpRoot, 'db-partial');
    writeFile(path.join(mangaDir, 'Chapter 001', '001.jpg'));
    writeFile(path.join(mangaDir, 'Chapter 002', '001.jpg'));
    writeFile(path.join(mangaDir, 'Chapter 003', '001.jpg'));
    fs.writeFileSync(
      path.join(mangaDir, 'download_db.json'),
      JSON.stringify({
        mangaTitle: 'Test',
        chapters: {
          'Chương 1': {
            status: 'completed',
            url: 'u1',
            pages: [{ status: 'completed', fileName: '001.jpg', index: 0 }],
            expectedFileCount: 1,
          },
          'Chương 2': {
            status: 'completed',
            url: 'u2',
            pages: [{ status: 'completed', fileName: '001.jpg', index: 0 }],
            expectedFileCount: 1,
          },
        },
      })
    );

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(3);
    const titles = r.chapters.map((c) => c.title);
    expect(titles).toContain('Chương 1');
    expect(titles).toContain('Chương 2');
    expect(titles).toContain('Chapter 003');
  });

  test('loads single chapter when only one wrapper folder contains page images', () => {
    const mangaDir = path.join(tmpRoot, 'single-wrap');
    writeFile(path.join(mangaDir, 'OnlyChapter', '001.jpg'));
    writeFile(path.join(mangaDir, 'OnlyChapter', '002.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(1);
    expect(r.chapters[0].folderBasename).toBe('OnlyChapter');
  });

  test('detects chapters when images are only inside subfolders', () => {
    const mangaDir = path.join(tmpRoot, 'subfolder-images');
    writeFile(path.join(mangaDir, 'Ch1', 'sub', 'page1.jpg'));
    writeFile(path.join(mangaDir, 'Ch2', 'sub', 'page1.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(2);
  });

  test('loads direct images in folder root as a single chapter (oneshot)', () => {
    const mangaDir = path.join(tmpRoot, 'direct-images');
    writeFile(path.join(mangaDir, '001.jpg'));
    writeFile(path.join(mangaDir, '002.png'));

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(1);
    expect(r.chapters[0].folderBasename).toBe('.');
    expect(r.chapters[0].url).toBe('offline:.');
  });

  test('does not treat multi-manga root folder as a single manga', () => {
    const rootDir = path.join(tmpRoot, 'multi-manga-root');
    writeFile(path.join(rootDir, 'MangaA', 'Ch1', '001.jpg'));
    writeFile(path.join(rootDir, 'MangaA', 'Ch2', '001.jpg'));
    writeFile(path.join(rootDir, 'MangaB', 'Ch1', '001.jpg'));
    writeFile(path.join(rootDir, 'MangaB', 'Ch2', '001.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(rootDir);
    expect(r.ok).toBe(false);
  });

  test('rejects multi-manga root where children only have single chapter folders', () => {
    const rootDir = path.join(tmpRoot, 'multi-manga-single-chapter');
    writeFile(path.join(rootDir, 'MangaA', 'Ch1', '001.jpg'));
    writeFile(path.join(rootDir, 'MangaB', 'Ch1', '001.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(rootDir);
    expect(r.ok).toBe(false);
  });

  test('rejects multi-manga root where a child contains download_db.json', () => {
    const rootDir = path.join(tmpRoot, 'multi-manga-with-db');
    writeFile(path.join(rootDir, 'MangaA', 'Ch1', '001.jpg'));
    fs.writeFileSync(
      path.join(rootDir, 'MangaA', 'download_db.json'),
      JSON.stringify({ mangaTitle: 'MangaA', chapters: { 'Ch1': { status: 'completed' } } })
    );
    writeFile(path.join(rootDir, 'MangaB', 'Ch1', '001.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(rootDir);
    expect(r.ok).toBe(false);
  });

  test('loadOfflineMangaFromDisk resolves manga located in a subcategory directory', () => {
    const baseDir = path.join(tmpRoot, 'base-save');
    const subDir = path.join(baseDir, 'category1', 'MangaNested');
    writeFile(path.join(subDir, 'Ch1', '001.jpg'));
    writeFile(path.join(subDir, 'Ch2', '001.jpg'));

    const r = loadOfflineMangaFromDisk(baseDir, 'MangaNested');
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(2);
    expect(r.manga.offlineMangaDirAbsolute).toBe(path.resolve(subDir));
  });

  test('scans nested volume folders (Vol. 1/Ch1) alongside root chapters', () => {
    const mangaDir = path.join(tmpRoot, 'vol-grouped');
    writeFile(path.join(mangaDir, 'Vol. 1', 'Ch1', '001.jpg'));
    writeFile(path.join(mangaDir, 'Vol. 1', 'Ch2', '001.jpg'));
    writeFile(path.join(mangaDir, 'Vol. 2', 'Ch3', '001.jpg'));
    writeFile(path.join(mangaDir, 'Ch105', '001.jpg'));

    const r = loadOfflineMangaFromAbsolutePath(mangaDir);
    expect(r.ok).toBe(true);
    expect(r.chapters.length).toBe(4);
    const basenames = r.chapters.map((c) => c.folderBasename);
    expect(basenames).toContain('Vol. 1/Ch1');
    expect(basenames).toContain('Vol. 1/Ch2');
    expect(basenames).toContain('Vol. 2/Ch3');
    expect(basenames).toContain('Ch105');
  });
});


