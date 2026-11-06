'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

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

function tmpDir(prefix = 'pack-mobi-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function createSampleImage(imgPath) {
  const dir = path.dirname(imgPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const imgBuf = await sharp({
    create: {
      width: 800,
      height: 1200,
      channels: 3,
      background: { r: 50, g: 150, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();

  fs.writeFileSync(imgPath, imgBuf);
}

describe('ebook:packManga with MOBI chapters to PDF', () => {
  let tmpRoot;
  let packManga;

  beforeAll(() => {
    const mockContext = {
      getMainWindow: () => null,
      getChapterFolderSettings: () => ({}),
      materializeIfSession: async () => ({ ok: true, materialized: false }),
    };
    registerExportIpc(mockContext);
    packManga = mockHandlers.get('ebook:packManga');
  });

  beforeEach(() => {
    tmpRoot = tmpDir();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('successfully packs MOBI chapter with nested extracted images to PDF', async () => {
    const mobiFile = path.join(tmpRoot, 'Detective Comics.mobi');
    fs.writeFileSync(mobiFile, 'dummy-mobi-content');

    const mobiLoader = require('../../reader/loaders/loadMobiForOfflineRead');
    jest.spyOn(mobiLoader, 'loadMobiFromFilePath').mockImplementation(async (filePath, opts) => {
      // KindleUnpack creates nested directory structure (e.g., mobi-xxx/_epub_pages)
      const nestedDir = path.join(opts.tempRoot, 'mobi-extracted-12345', '_epub_pages');
      fs.mkdirSync(nestedDir, { recursive: true });
      await createSampleImage(path.join(nestedDir, '001.jpeg'));
      await createSampleImage(path.join(nestedDir, '002.jpeg'));
      return {
        ok: true,
        chapters: [{ id: '1', title: 'Chapter 1', folderBasename: '_epub_pages' }],
        cbzTempExtractDir: opts.tempRoot,
      };
    });

    const outDir = path.join(tmpRoot, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const res = await packManga(null, {
      sourceDir: tmpRoot,
      targetFormat: 'pdf',
      outputDir: outDir,
      outputBaseName: 'Detective Comics',
      chapters: [
        {
          title: 'Detective Comics.mobi',
          path: mobiFile,
          isSingleFile: true,
        },
      ],
      options: { packMode: 'singleVolume' },
    });

    expect(res).toBeDefined();
    expect(res.error).toBeUndefined();
    expect(res.ok).toBe(true);
    expect(res.files.length).toBe(1);
    expect(fs.existsSync(res.files[0])).toBe(true);
  });
});
