import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const panelPath = path.join(root, 'src/features/latest-updates/LatestUpdatesPanel.jsx');
const preloadPath = path.join(root, 'electron/preload.js');
const ipcPath = path.join(root, 'electron/ipc/download.js');
const connectorsPath = path.join(root, 'electron/lib/platform/connectors/index.js');
const viPath = path.join(root, 'src/i18n/locales/vi.js');
const enPath = path.join(root, 'src/i18n/locales/en.js');

describe('LatestUpdates Cancellable Fetch Flow', () => {
  const panel = fs.readFileSync(panelPath, 'utf8');
  const preload = fs.readFileSync(preloadPath, 'utf8');
  const ipc = fs.readFileSync(ipcPath, 'utf8');
  const connectors = fs.readFileSync(connectorsPath, 'utf8');
  const vi = fs.readFileSync(viPath, 'utf8');
  const en = fs.readFileSync(enPath, 'utf8');

  test('preload exposes cancelLatestUpdates invoking manga:cancelLatestUpdates', () => {
    expect(preload).toMatch(/cancelLatestUpdates:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(['"]manga:cancelLatestUpdates['"]\)/);
  });

  test('IPC tracks activeLatestUpdatesController, passes signal, races abort, and handles manga:cancelLatestUpdates', () => {
    expect(ipc).toContain('activeLatestUpdatesController');
    expect(ipc).toMatch(/signal:\s*controller\.signal/);
    expect(ipc).toContain('Promise.race');
    expect(ipc).toMatch(/ipcMain\.handle\(['"]manga:cancelLatestUpdates['"]/);
  });

  test('connectors.fetchLatestUpdates respects options.signal and returns aborted:true', () => {
    expect(connectors).toMatch(/const\s*\{\s*getCookieForSite,\s*signal,\s*\.\.\.restOpts\s*\}\s*=\s*options\s*\|\|\s*\{\}/);
    expect(connectors).toMatch(/signal\?\.aborted[\s\S]{0,80}aborted:\s*true/);
  });

  test('LatestUpdatesPanel renders Stop button matching BulkScan/FollowedManga, handles abort/sequence safely, and follows UI rules', () => {
    expect(panel).toContain('handleStopFetch');
    expect(panel).toContain('fetchSeqRef');
    expect(panel).toContain('cancelLatestUpdates');
    expect(panel).toContain('res?.aborted');
    expect(panel).toContain('isStoppingList');
    expect(panel).toContain('stop_circle');
    expect(panel).toContain('bg-error/15 text-error hover:bg-error/25 border border-error/30');
    expect(panel).toContain("t('latestUpdates.stopFetch')");
    expect(panel).toContain("t('latestUpdates.stopping')");
    expect(panel).toMatch(/\{\(busyList\s*\|\|\s*isSearchLoading\)\s*\?\s*\([\s\S]{0,600}handleStopFetch/);
    expect(panel).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(panel).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('vi.js and en.js define latestUpdates.stopFetch and latestUpdates.stopping keys', () => {
    expect(vi).toContain("'latestUpdates.stopFetch':");
    expect(vi).toContain("'latestUpdates.stopping':");
    expect(en).toContain("'latestUpdates.stopFetch':");
    expect(en).toContain("'latestUpdates.stopping':");
  });
});
