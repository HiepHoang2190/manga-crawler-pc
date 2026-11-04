'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  segmentProcessedItemsByMaxBytesWithoutSplittingChapters,
  estimateSizeSplitCbzExport,
} = require('../../export/exportCbz');

function makeItems(chapterSizes) {
  const items = [];
  let globalIdx = 0;
  for (let ci = 0; ci < chapterSizes.length; ci += 1) {
    const zipFolder = `Chapter_${ci + 1}`;
    const sizes = chapterSizes[ci];
    for (let pi = 0; pi < sizes.length; pi += 1) {
      items.push({
        full: `/fake/${zipFolder}/${pi}.jpg`,
        title: `Chapter ${ci + 1}`,
        zipFolder,
        baseName: `${pi}.jpg`,
        ext: '.jpg',
        sz: sizes[pi],
        globalIdx: globalIdx++,
      });
    }
  }
  return items;
}

describe('segmentProcessedItemsByMaxBytesWithoutSplittingChapters', () => {
  const MB = 1024 * 1024;

  test('does not split a chapter across parts when adding next image would exceed maxBytes', () => {
    // 9 chapters × 11MB = 99MB, chapter 10 = 11MB → part1: 9 chapters, part2: chapter 10
    const chapterSizes = Array.from({ length: 10 }, () => [11 * MB]);
    const items = makeItems(chapterSizes);
    const segments = segmentProcessedItemsByMaxBytesWithoutSplittingChapters(items, 100 * MB);

    expect(segments.length).toBe(2);
    expect(segments[0].length).toBe(9);
    expect(segments[1].length).toBe(1);
    expect(segments[0].map((it) => it.zipFolder)).toEqual(
      Array.from({ length: 9 }, (_, i) => `Chapter_${i + 1}`),
    );
    expect(segments[1][0].zipFolder).toBe('Chapter_10');
  });

  test('keeps an entire chapter in one part even when chapter alone exceeds maxBytes', () => {
    const items = makeItems([[40 * MB, 40 * MB, 40 * MB]]);
    const segments = segmentProcessedItemsByMaxBytesWithoutSplittingChapters(items, 100 * MB);

    expect(segments.length).toBe(1);
    expect(segments[0].length).toBe(3);
  });

  test('packs multiple small chapters into one part until limit', () => {
    const items = makeItems([[10 * MB], [10 * MB], [10 * MB], [10 * MB]]);
    const segments = segmentProcessedItemsByMaxBytesWithoutSplittingChapters(items, 25 * MB);

    expect(segments.length).toBe(2);
    expect(segments[0].length).toBe(2);
    expect(segments[1].length).toBe(2);
  });

  test('preserves chapter order across segments', () => {
    const items = makeItems([[5 * MB], [5 * MB], [5 * MB]]);
    const segments = segmentProcessedItemsByMaxBytesWithoutSplittingChapters(items, 6 * MB);
    const folders = segments.flat().map((it) => it.zipFolder);
    expect(folders).toEqual(['Chapter_1', 'Chapter_2', 'Chapter_3']);
  });
});

describe('estimateSizeSplitCbzExport', () => {
  const MB = 1024 * 1024;
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cbz-estimate-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  function writeChapter(mangaDir, folder, sizeBytes) {
    const dir = path.join(mangaDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '001.jpg'), Buffer.alloc(sizeBytes, 1));
  }

  test('reports part count and oversized chapters before export', () => {
    const mangaDir = path.join(tmpRoot, 'Manga');
    for (let i = 1; i <= 10; i += 1) {
      writeChapter(mangaDir, `Ch${i}`, 11 * MB);
    }
    const chapters = Array.from({ length: 10 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      folderBasename: `Ch${i + 1}`,
    }));

    const estimate = estimateSizeSplitCbzExport({
      baseSaveDir: tmpRoot,
      mangaTitle: 'Manga',
      chapters,
      maxBytes: 100 * MB,
      chapterFolderFormat: {},
      absoluteMangaDir: mangaDir,
    });

    expect(estimate.ok).toBe(true);
    expect(estimate.selectedChapterCount).toBe(10);
    expect(estimate.partCount).toBe(2);
    expect(estimate.parts[0].chapterCount).toBe(9);
    expect(estimate.parts[1].chapterCount).toBe(1);
    expect(estimate.oversizedChapterTitles).toEqual([]);
  });
});
