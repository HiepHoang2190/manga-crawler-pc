const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('electron', () => ({
  session: {
    defaultSession: {
      getCacheSize: (cb) => cb(512),
      clearCache: (cb) => cb(),
    },
  },
}));

const {
  folderSizeBytes,
  getReadCacheSummary,
  clearReadCache,
} = require('../../../reader/cache/readCacheSummary');

describe('readCacheSummary', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'read-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('folderSizeBytes sums nested files', async () => {
    const dir = path.join(tmpRoot, 'manga');
    fs.mkdirSync(path.join(dir, 'ch1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'ch1', '01.jpg'), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, 'cover.jpg'), Buffer.alloc(50));
    expect(await folderSizeBytes(dir)).toBe(150);
  });

  test('getReadCacheSummary includes hidden folders, http cache, and temp', async () => {
    const hidden = path.join(tmpRoot, 'hidden-manga');
    fs.mkdirSync(hidden, { recursive: true });
    fs.writeFileSync(path.join(hidden, 'page.jpg'), Buffer.alloc(200));

    const tempRoot = path.join(tmpRoot, 'temp');
    fs.mkdirSync(tempRoot, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'extract.bin'), Buffer.alloc(300));

    const summary = await getReadCacheSummary({
      hiddenAbsolutePaths: [hidden],
      tempRoot,
    });

    expect(summary.hiddenBytes).toBe(200);
    expect(summary.httpCacheBytes).toBe(512);
    expect(summary.tempBytes).toBe(300);
    expect(summary.bytes).toBe(1012);
    expect(summary.hiddenCount).toBe(1);
  });

  test('clearReadCache removes hidden folders and temp contents', async () => {
    const hidden = path.join(tmpRoot, 'orphan');
    fs.mkdirSync(hidden, { recursive: true });
    fs.writeFileSync(path.join(hidden, 'a.jpg'), Buffer.alloc(10));

    const tempRoot = path.join(tmpRoot, 'cbz-temp');
    fs.mkdirSync(tempRoot, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'x.bin'), Buffer.alloc(10));

    await clearReadCache({ hiddenAbsolutePaths: [hidden], tempRoot });

    expect(fs.existsSync(hidden)).toBe(false);
    expect(fs.existsSync(tempRoot)).toBe(true);
    expect(fs.readdirSync(tempRoot)).toEqual([]);
  });
});
