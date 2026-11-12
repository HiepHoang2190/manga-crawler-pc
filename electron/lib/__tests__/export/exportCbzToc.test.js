'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { exportChaptersToCbz } = require('../../export/exportCbz');

describe('exportChaptersToCbz with ComicInfo.xml TOC', () => {
  let tmpRoot;
  let mangaDir;
  let outputDir;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cbz-toc-test-'));
    mangaDir = path.join(tmpRoot, 'TestManga');
    outputDir = path.join(tmpRoot, 'output');
    fs.mkdirSync(mangaDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Create 2 chapters with 2 images each
    for (let c = 1; c <= 2; c++) {
      const chDir = path.join(mangaDir, `Chapter ${c}`);
      fs.mkdirSync(chDir, { recursive: true });
      fs.writeFileSync(path.join(chDir, '001.jpg'), Buffer.from('fake-image-1'));
      fs.writeFileSync(path.join(chDir, '002.jpg'), Buffer.from('fake-image-2'));
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('singleVolume mode includes ComicInfo.xml with chapter bookmarks by default', async () => {
    const outputFile = path.join(outputDir, 'single.cbz');
    const chapters = [
      { title: 'Chapter 1', folderBasename: 'Chapter 1' },
      { title: 'Chapter 2', folderBasename: 'Chapter 2' },
    ];

    const result = await exportChaptersToCbz({
      mode: 'singleVolume',
      baseSaveDir: tmpRoot,
      mangaTitle: 'TestManga',
      chapters,
      outputFile,
      chapterFolderFormat: {},
      absoluteMangaDir: mangaDir,
      generateToc: true,
    });

    expect(result).toHaveLength(1);
    expect(fs.existsSync(outputFile)).toBe(true);

    const zip = new AdmZip(outputFile);
    const comicInfoEntry = zip.getEntry('ComicInfo.xml');
    expect(comicInfoEntry).not.toBeNull();

    const xmlContent = zip.readAsText(comicInfoEntry);
    expect(xmlContent).toContain('<Title>TestManga</Title>');
    expect(xmlContent).toContain('<PageCount>4</PageCount>');
    expect(xmlContent).toContain('<Page Image="0" Bookmark="Chapter 1" Type="Story" />');
    expect(xmlContent).toContain('<Page Image="1" Type="Story" />');
    expect(xmlContent).toContain('<Page Image="2" Bookmark="Chapter 2" Type="Story" />');
    expect(xmlContent).toContain('<Page Image="3" Type="Story" />');
  });

  test('singleVolume mode omits ComicInfo.xml when generateToc is false', async () => {
    const outputFile = path.join(outputDir, 'notoc.cbz');
    const chapters = [
      { title: 'Chapter 1', folderBasename: 'Chapter 1' },
      { title: 'Chapter 2', folderBasename: 'Chapter 2' },
    ];

    await exportChaptersToCbz({
      mode: 'singleVolume',
      baseSaveDir: tmpRoot,
      mangaTitle: 'TestManga',
      chapters,
      outputFile,
      chapterFolderFormat: {},
      absoluteMangaDir: mangaDir,
      generateToc: false,
    });

    const zip = new AdmZip(outputFile);
    const comicInfoEntry = zip.getEntry('ComicInfo.xml');
    expect(comicInfoEntry).toBeNull();
  });

  test('sizeSplit mode generates dedicated ComicInfo.xml for each part', async () => {
    const chapters = [
      { title: 'Chapter 1', folderBasename: 'Chapter 1' },
      { title: 'Chapter 2', folderBasename: 'Chapter 2' },
    ];

    // Force split into 2 parts using maxBytes: 1MB (our dummy files are small so we can make maxBytes small or 1MB)
    // Note exportSizeSplitCbz enforces min maxBytes of 1MB, so let's write 600KB dummy files
    for (let c = 1; c <= 2; c++) {
      const chDir = path.join(mangaDir, `Chapter ${c}`);
      fs.writeFileSync(path.join(chDir, '001.jpg'), Buffer.alloc(600 * 1024, 1));
      fs.writeFileSync(path.join(chDir, '002.jpg'), Buffer.alloc(600 * 1024, 2));
    }

    const outputFiles = await exportChaptersToCbz({
      mode: 'sizeSplit',
      baseSaveDir: tmpRoot,
      mangaTitle: 'TestManga',
      chapters,
      outputDir,
      maxBytes: 1024 * 1024, // 1MB limit -> will split Ch1 and Ch2
      chapterFolderFormat: {},
      absoluteMangaDir: mangaDir,
      generateToc: true,
    });

    expect(outputFiles.length).toBe(2);

    // Part 1 contains Chapter 1
    const zip1 = new AdmZip(outputFiles[0]);
    const comicInfo1 = zip1.getEntry('ComicInfo.xml');
    expect(comicInfo1).not.toBeNull();
    const xml1 = zip1.readAsText(comicInfo1);
    expect(xml1).toContain('<Number>1</Number>');
    expect(xml1).toContain('<Count>2</Count>');
    expect(xml1).toContain('<Page Image="0" Bookmark="Chapter 1" Type="Story" />');
    expect(xml1).not.toContain('Chapter 2');

    // Part 2 contains Chapter 2
    const zip2 = new AdmZip(outputFiles[1]);
    const comicInfo2 = zip2.getEntry('ComicInfo.xml');
    expect(comicInfo2).not.toBeNull();
    const xml2 = zip2.readAsText(comicInfo2);
    expect(xml2).toContain('<Number>2</Number>');
    expect(xml2).toContain('<Count>2</Count>');
    expect(xml2).toContain('<Page Image="0" Bookmark="Chapter 2" Type="Story" />');
    expect(xml2).not.toContain('Chapter 1');
  });
});

