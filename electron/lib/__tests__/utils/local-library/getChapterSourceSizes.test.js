'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  folderSizeBytes,
  getChapterSourceSizes,
  formatSourceSizeMb,
} = require('../../../library/getChapterSourceSizes');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ch-sizes-'));
}

describe('folderSizeBytes', () => {
  test('sums nested file sizes', async () => {
    const root = tmpDir();
    const ch = path.join(root, 'ch1');
    fs.mkdirSync(path.join(ch, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(ch, 'a.jpg'), Buffer.alloc(100));
    fs.writeFileSync(path.join(ch, 'sub', 'b.jpg'), Buffer.alloc(50));
    expect(await folderSizeBytes(ch)).toBe(150);
  });

  test('returns 0 for missing path', async () => {
    expect(await folderSizeBytes(path.join(os.tmpdir(), 'no-such-dir-xyz'))).toBe(0);
  });
});

describe('getChapterSourceSizes', () => {
  test('attaches sizeBytes per chapter folder', async () => {
    const mangaDir = tmpDir();
    fs.mkdirSync(path.join(mangaDir, 'ch1'), { recursive: true });
    fs.mkdirSync(path.join(mangaDir, 'ch2'), { recursive: true });
    fs.writeFileSync(path.join(mangaDir, 'ch1', '1.jpg'), Buffer.alloc(1024));
    fs.writeFileSync(path.join(mangaDir, 'ch2', '1.jpg'), Buffer.alloc(2048));

    const out = await getChapterSourceSizes(mangaDir, [
      { title: 'Chapter 1', folderBasename: 'ch1' },
      { title: 'Chapter 2', folderBasename: 'ch2' },
    ]);

    expect(out).toEqual([
      { title: 'Chapter 1', folderBasename: 'ch1', sizeBytes: 1024 },
      { title: 'Chapter 2', folderBasename: 'ch2', sizeBytes: 2048 },
    ]);
  });

  test('missing folder → sizeBytes 0', async () => {
    const mangaDir = tmpDir();
    const out = await getChapterSourceSizes(mangaDir, [
      { title: 'Gone', folderBasename: 'missing' },
    ]);
    expect(out[0].sizeBytes).toBe(0);
  });
});

describe('formatSourceSizeMb', () => {
  test('formats megabytes for UI', () => {
    expect(formatSourceSizeMb(0)).toBe('0');
    expect(formatSourceSizeMb(50 * 1024)).toBe('<0.1');
    expect(formatSourceSizeMb(1.5 * 1024 * 1024)).toBe('1.5');
    expect(formatSourceSizeMb(12.4 * 1024 * 1024)).toBe('12');
  });
});
