'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
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

function tmpDir(prefix = 'pack-cbz-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function createCbzWithLandscapeImage(cbzPath) {
  const dir = path.dirname(cbzPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const landscapeImg = await sharp({
    create: {
      width: 1400,
      height: 1000,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(cbzPath);
    const archive = archiver('zip', { zlib: { level: 1 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append(landscapeImg, { name: '001.jpg' });
    archive.finalize();
  });
}

describe('ebook:packManga with CBZ chapter files and rotateDoublePage', () => {
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
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('successfully packs CBZ chapters to EPUB with rotateDoublePage enabled', async () => {
    const mangaDir = path.join(tmpRoot, 'TestManga');
    const chapter1Cbz = path.join(mangaDir, 'Hắc Báo Liệt Truyện [Chapter 1].cbz');
    await createCbzWithLandscapeImage(chapter1Cbz);

    const outDir = path.join(tmpRoot, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const res = await packManga(null, {
      sourceDir: mangaDir,
      chapters: [
        {
          title: 'Hắc Báo Liệt Truyện [Chapter 1]',
          folderBasename: 'Hắc Báo Liệt Truyện [Chapter 1].cbz',
          path: chapter1Cbz,
          isSingleFile: true,
        },
      ],
      targetFormat: 'epub',
      outputDir: outDir,
      outputBaseName: 'HacBaoLietTruyen',
      options: {
        packMode: 'singleVolume',
        rotateDoublePage: true,
      },
    });

    expect(res.ok).toBe(true);
    expect(res.files).toBeDefined();
    expect(res.files.length).toBeGreaterThan(0);
    expect(fs.existsSync(res.files[0])).toBe(true);
  });
});
