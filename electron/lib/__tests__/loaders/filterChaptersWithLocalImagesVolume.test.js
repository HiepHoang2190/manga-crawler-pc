'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { filterChaptersWithLocalImagesNoDb } = require('../../library/filterChaptersWithLocalImages');

describe('filterChaptersWithLocalImagesNoDb — Volume aware matching', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-vol-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch { }
  });

  test('matches nested volume folder when chapter has volume metadata', () => {
    const mangaDir = path.join(tmpRoot, 'Test Manga');
    const ch1Dir = path.join(mangaDir, 'Vol. 1', 'Ch 0001');
    fs.mkdirSync(ch1Dir, { recursive: true });
    fs.writeFileSync(path.join(ch1Dir, '001.jpg'), 'img-data');

    const chapters = [
      { url: 'https://example.com/ch1', title: 'Chapter 1', volume: '1' },
      { url: 'https://example.com/ch2', title: 'Chapter 2', volume: '1' },
    ];

    const result = filterChaptersWithLocalImagesNoDb(tmpRoot, 'Test Manga', chapters);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/ch1');
    expect(result[0].folderBasename).toBe('Vol. 1/Ch 0001');
  });

  test('matches flat non-volume folder when chapter has volume but was downloaded previously without volume', () => {
    const mangaDir = path.join(tmpRoot, 'Legacy Manga');
    const ch1Dir = path.join(mangaDir, 'Ch 0001');
    fs.mkdirSync(ch1Dir, { recursive: true });
    fs.writeFileSync(path.join(ch1Dir, '001.jpg'), 'img-data');

    const chapters = [
      { url: 'https://example.com/ch1', title: 'Chapter 1', volume: '1' },
      { url: 'https://example.com/ch2', title: 'Chapter 2', volume: '1' },
    ];

    const result = filterChaptersWithLocalImagesNoDb(tmpRoot, 'Legacy Manga', chapters);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/ch1');
    expect(result[0].folderBasename).toBe('Ch 0001');
  });
});
