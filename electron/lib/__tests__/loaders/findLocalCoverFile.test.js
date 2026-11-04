'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { findLocalCoverInMangaDir } = require('../../library/findLocalCoverFile');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cover-test-'));
}

function writeFile(relPath, content = 'image-data') {
  const dir = path.dirname(relPath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(relPath, content);
}

describe('findLocalCoverInMangaDir', () => {
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

  test('finds standard cover.jpg', () => {
    const mangaDir = path.join(tmpRoot, 'manga1');
    writeFile(path.join(mangaDir, 'cover.jpg'));
    writeFile(path.join(mangaDir, 'Ch1', '001.jpg'));

    const cover = findLocalCoverInMangaDir(mangaDir);
    expect(cover).toBe(path.resolve(mangaDir, 'cover.jpg'));
  });

  test('finds poster.png or folder.jpg when cover.jpg is missing', () => {
    const mangaDir = path.join(tmpRoot, 'manga2');
    writeFile(path.join(mangaDir, 'folder.jpg'));
    writeFile(path.join(mangaDir, 'Ch1', '001.jpg'));

    const cover = findLocalCoverInMangaDir(mangaDir);
    expect(cover).toBe(path.resolve(mangaDir, 'folder.jpg'));
  });

  test('falls back to direct image in manga root if oneshot', () => {
    const mangaDir = path.join(tmpRoot, 'oneshot');
    writeFile(path.join(mangaDir, '001.jpg'));
    writeFile(path.join(mangaDir, '002.jpg'));

    const cover = findLocalCoverInMangaDir(mangaDir);
    expect(cover).toBe(path.resolve(mangaDir, '001.jpg'));
  });

  test('falls back to first image of first chapter when no cover file exists', () => {
    const mangaDir = path.join(tmpRoot, 'manga-no-cover');
    writeFile(path.join(mangaDir, 'Chapter 2', '001.jpg'));
    writeFile(path.join(mangaDir, 'Chapter 1', '001.png'));
    writeFile(path.join(mangaDir, 'Chapter 1', '002.png'));

    const cover = findLocalCoverInMangaDir(mangaDir);
    expect(cover).toBe(path.resolve(mangaDir, 'Chapter 1', '001.png'));
  });
});
