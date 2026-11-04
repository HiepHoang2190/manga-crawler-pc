'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// We will capture handlers registered by registerExportIpc
const mockHandlers = new Map();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel, fn) => {
      mockHandlers.set(channel, fn);
    }),
    removeHandler: jest.fn((channel) => {
      mockHandlers.delete(channel);
    }),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  },
  shell: {
    openPath: jest.fn(),
    showItemInFolder: jest.fn(),
  },
}));

const { registerExportIpc } = require('../../../ipc/export');

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ebook-scan-test-'));
}

function writeFile(filePath, content = 'x') {
  const dir = path.dirname(filePath);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe('ebook:scanMangaDir IPC handler', () => {
  let tmpRoot;
  let scanMangaDir;

  beforeAll(() => {
    const mockContext = {
      getMainWindow: () => null,
      getChapterFolderSettings: () => ({}),
      materializeIfSession: async () => ({ ok: true, materialized: false }),
    };
    registerExportIpc(mockContext);
    scanMangaDir = mockHandlers.get('ebook:scanMangaDir');
  });

  beforeEach(() => {
    tmpRoot = mkTempDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('handler is registered', () => {
    expect(typeof scanMangaDir).toBe('function');
  });

  test('returns error when directory does not exist', async () => {
    const res = await scanMangaDir(null, { dir: path.join(tmpRoot, 'non-existent') });
    expect(res.ok).toBe(false);
    expect(res.chapters).toEqual([]);
  });

  test('scans manga directory with chapter subfolders containing images', async () => {
    const mangaDir = path.join(tmpRoot, 'MangaA');
    writeFile(path.join(mangaDir, 'Chapter 1', '001.jpg'));
    writeFile(path.join(mangaDir, 'Chapter 1', '002.png'));
    writeFile(path.join(mangaDir, 'Chapter 2', '001.jpg'));

    const res = await scanMangaDir(null, { dir: mangaDir });
    expect(res.ok).toBe(true);
    expect(res.chapters.length).toBe(2);
    expect(res.chapters[0].title).toBe('Chapter 1');
    expect(res.chapters[0].folderBasename).toBe('Chapter 1');
    expect(res.chapters[1].title).toBe('Chapter 2');
  });

  test('scans oneshot directory with direct images', async () => {
    const mangaDir = path.join(tmpRoot, 'OneshotManga');
    writeFile(path.join(mangaDir, '001.jpg'));
    writeFile(path.join(mangaDir, '002.jpg'));

    const res = await scanMangaDir(null, { dir: mangaDir });
    expect(res.ok).toBe(true);
    expect(res.chapters.length).toBe(1);
    expect(res.chapters[0].folderBasename).toBe('.');
  });

  test('scans directory containing loose comic archive files (.cbz, .zip)', async () => {
    const mangaDir = path.join(tmpRoot, 'CbzManga');
    writeFile(path.join(mangaDir, 'Vol 01.cbz'));
    writeFile(path.join(mangaDir, 'Vol 02.cbz'));
    writeFile(path.join(mangaDir, 'Extra.zip'));

    const res = await scanMangaDir(null, { dir: mangaDir });
    expect(res.ok).toBe(true);
    expect(res.chapters.length).toBe(3);
    const titles = res.chapters.map((c) => c.title);
    expect(titles).toContain('Vol 01');
    expect(titles).toContain('Vol 02');
    expect(titles).toContain('Extra');
  });

  test('scans manga directory without metadata having nested chapter subfolders', async () => {
    const mangaDir = path.join(tmpRoot, 'NestedManga');
    writeFile(path.join(mangaDir, 'Hoi 1', 'img', '001.jpg'));
    writeFile(path.join(mangaDir, 'Hoi 1', 'img', '002.png'));
    writeFile(path.join(mangaDir, 'Hoi 2', 'raw', '001.jpg'));

    const res = await scanMangaDir(null, { dir: mangaDir });
    expect(res.ok).toBe(true);
    expect(res.chapters.length).toBe(2);
    const titles = res.chapters.map((c) => c.title);
    expect(titles).toContain('Hoi 1');
    expect(titles).toContain('Hoi 2');
  });

  test('diagnoses empty folder with specific helpful message', async () => {
    const emptyDir = path.join(tmpRoot, 'EmptyManga');
    fs.mkdirSync(emptyDir, { recursive: true });

    const res = await scanMangaDir(null, { dir: emptyDir });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/trống/i);
  });

  test('diagnoses folder containing only unsupported files', async () => {
    const docDir = path.join(tmpRoot, 'DocManga');
    writeFile(path.join(docDir, 'notes.txt'));
    writeFile(path.join(docDir, 'doc.docx'));

    const res = await scanMangaDir(null, { dir: docDir });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/không được hỗ trợ|\.txt|\.docx/i);
  });

  test('diagnoses folder containing subfolders that have no images', async () => {
    const noImgDir = path.join(tmpRoot, 'NoImagesManga');
    writeFile(path.join(noImgDir, 'Chap 1', 'notes.txt'));
    writeFile(path.join(noImgDir, 'Chap 2', 'readme.md'));

    const res = await scanMangaDir(null, { dir: noImgDir });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/không chứa tệp hình ảnh/i);
  });
});
