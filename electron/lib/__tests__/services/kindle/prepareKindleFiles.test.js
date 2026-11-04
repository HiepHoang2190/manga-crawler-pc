const fs = require('fs');
const os = require('os');
const path = require('path');

const { prepareKindleFiles } = require('../../../export/kindle/prepareKindleFiles');
const { SPLIT_TARGET_BYTES } = require('../../../export/kindle/kindleContentTypes');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stk-prep-'));
}

describe('prepareKindleFiles', () => {
  test('calls exportChaptersToPdf in sizeSplit mode with the 190MB target (format pdf)', async () => {
    const outputDir = tmpDir();
    let captured;
    const fakeExport = jest.fn().mockImplementation(async (opts) => {
      captured = opts;
      const a = path.join(outputDir, 'X - Part 01.pdf');
      const b = path.join(outputDir, 'X - Part 02.pdf');
      fs.writeFileSync(a, 'a');
      fs.writeFileSync(b, 'b');
      return [a, b];
    });

    const res = await prepareKindleFiles(
      {
        absoluteMangaDir: '/manga/X',
        mangaTitle: 'X',
        chapters: [{ title: 'Ch 1', folderBasename: 'ch1' }],
        chapterFolderFormat: {},
        outputDir,
        format: 'pdf',
      },
      { exportChaptersToPdf: fakeExport }
    );

    expect(res.ok).toBe(true);
    expect(res.files).toHaveLength(2);
    expect(captured.mode).toBe('sizeSplit');
    expect(captured.maxBytes).toBe(SPLIT_TARGET_BYTES);
    expect(captured.absoluteMangaDir).toBe('/manga/X');
    expect(fakeExport).toHaveBeenCalled();
  });

  test('defaults to pdf and calls exportChaptersToPdf', async () => {
    const outputDir = tmpDir();
    const fakePdf = jest.fn().mockImplementation(async () => {
      const a = path.join(outputDir, 'Y - Part 01.pdf');
      fs.writeFileSync(a, 'pdf');
      return [a];
    });
    const fakeEpub = jest.fn();

    const res = await prepareKindleFiles(
      {
        absoluteMangaDir: '/manga/Y',
        mangaTitle: 'Y',
        chapters: [{ title: 'Ch 1', folderBasename: 'ch1' }],
        chapterFolderFormat: {},
        outputDir,
      },
      { exportChaptersToPdf: fakePdf, exportChaptersToEpub: fakeEpub }
    );

    expect(res.ok).toBe(true);
    expect(fakePdf).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'sizeSplit', maxBytes: SPLIT_TARGET_BYTES })
    );
    expect(fakeEpub).not.toHaveBeenCalled();
    expect(path.basename(res.files[0])).toBe('Y.pdf');
  });

  test('renames a single resulting part to a clean Title.pdf', async () => {
    const outputDir = tmpDir();
    const fakeExport = jest.fn().mockImplementation(async () => {
      const only = path.join(outputDir, 'My Title - Part 01.pdf');
      fs.writeFileSync(only, 'only');
      return [only];
    });

    const res = await prepareKindleFiles(
      {
        absoluteMangaDir: '/manga/Y',
        mangaTitle: 'My Title',
        chapters: [{ title: 'Ch 1', folderBasename: 'ch1' }],
        chapterFolderFormat: {},
        outputDir,
        format: 'pdf',
      },
      { exportChaptersToPdf: fakeExport }
    );

    expect(res.ok).toBe(true);
    expect(res.files).toHaveLength(1);
    expect(path.basename(res.files[0])).toBe('My Title.pdf');
    expect(fs.existsSync(res.files[0])).toBe(true);
  });

  test('fails clearly when there are no chapters', async () => {
    const res = await prepareKindleFiles(
      {
        absoluteMangaDir: '/manga/Z',
        mangaTitle: 'Z',
        chapters: [],
        chapterFolderFormat: {},
        outputDir: tmpDir(),
        format: 'epub',
      },
      { exportChaptersToPdf: jest.fn(), exportChaptersToEpub: jest.fn() }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
