const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readAll,
  saveSession,
  storePath,
} = require('../../download/bulkScanSessionStore');

describe('bulkScanSessionStore', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-scan-store-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('saveSession then readAll round-trips items and selection', () => {
    const r = saveSession(dir, 'comicvn', {
      scannedAt: '2026-07-26T00:00:00.000Z',
      items: [{ mangaUrl: 'https://x/a.html', title: 'A' }],
      selectedUrls: ['https://x/a.html'],
    });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(storePath(dir))).toBe(true);
    const all = readAll(dir);
    expect(all.comicvn.items).toHaveLength(1);
    expect(all.comicvn.selectedUrls).toEqual(['https://x/a.html']);
  });

  test('refuses empty overwrite of non-empty session', () => {
    saveSession(dir, 'comicvn', {
      items: [{ mangaUrl: 'u1', title: 'T' }],
      selectedUrls: ['u1'],
    });
    const r = saveSession(dir, 'comicvn', { items: [], selectedUrls: [] });
    expect(r.ok).toBe(false);
    expect(readAll(dir).comicvn.items).toHaveLength(1);
  });
});
