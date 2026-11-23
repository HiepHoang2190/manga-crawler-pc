const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSettingsStore } = require('../../shared/atomicSettings');

describe('atomicSettings store', () => {
  let tmpDir;
  let settingsFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-settings-'));
    settingsFile = path.join(tmpDir, 'nested', 'settings.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('returns empty object when settings file does not exist', () => {
    const store = createSettingsStore(() => settingsFile);
    expect(store.readSettings()).toEqual({});
  });

  test('writes merged settings atomically and leaves no .tmp files behind', () => {
    const store = createSettingsStore(() => settingsFile);
    store.writeSettings({ lastSaveDir: '/tmp/manga', threads: 4 });
    store.writeSettings({ threads: 8 });

    expect(store.readSettings()).toEqual({ lastSaveDir: '/tmp/manga', threads: 8 });
    const rawOnDisk = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    expect(rawOnDisk).toEqual({ lastSaveDir: '/tmp/manga', threads: 8 });

    const dirFiles = fs.readdirSync(path.dirname(settingsFile));
    expect(dirFiles).toEqual(['settings.json']);
  });

  test('gracefully recovers from corrupt JSON on disk', () => {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, '{corrupt json', 'utf8');
    const store = createSettingsStore(() => settingsFile);
    expect(store.readSettings()).toEqual({});
    store.writeSettings({ recovered: true });
    expect(store.readSettings()).toEqual({ recovered: true });
  });

  test('reads updated disk state after invalidateCache', () => {
    const store = createSettingsStore(() => settingsFile);
    store.writeSettings({ a: 1 });
    fs.writeFileSync(settingsFile, JSON.stringify({ a: 2, b: 3 }), 'utf8');
    expect(store.readSettings()).toEqual({ a: 1 });
    store.invalidateCache();
    expect(store.readSettings()).toEqual({ a: 2, b: 3 });
  });
});
