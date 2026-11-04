const fs = require('fs');
const path = require('path');
const { describe, it, expect, beforeEach } = require('@jest/globals');

const handlers = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel, handler) => {
      handlers[channel] = handler;
    },
    on: () => {},
  },
  shell: {
    openPath: () => {},
    showItemInFolder: () => {},
    openExternal: () => {},
  },
  clipboard: {
    readText: () => '',
  },
}));

const { registerWindowIpc } = require('../../../ipc/window');

describe('shell:resolveMangaDir IPC & Preload Bridge', () => {
  beforeEach(() => {
    registerWindowIpc({
      getMainWindow: () => null,
      getChapterFolderSettings: () => ({}),
    });
  });

  it('preload.js exposes resolveMangaDir', () => {
    const preloadPath = path.resolve(__dirname, '../../../../electron/preload.js');
    const preloadSrc = fs.readFileSync(preloadPath, 'utf8');

    expect(preloadSrc).toMatch(/resolveMangaDir:\s*\(baseSaveDir,\s*mangaTitle\)\s*=>/);
    expect(preloadSrc).toMatch(/ipcRenderer\.invoke\('shell:resolveMangaDir',\s*\{\s*baseSaveDir,\s*mangaTitle\s*\}\)/);
  });

  it('registers shell:resolveMangaDir handler and resolves valid path', async () => {
    expect(handlers['shell:resolveMangaDir']).toBeDefined();
    const result = await handlers['shell:resolveMangaDir']({}, {
      baseSaveDir: '/downloads',
      mangaTitle: 'One Piece',
    });

    expect(result).toEqual({
      ok: true,
      path: path.join('/downloads', 'One Piece'),
    });
  });

  it('handles missing or empty arguments safely', async () => {
    const result1 = await handlers['shell:resolveMangaDir']({}, {});
    expect(result1.ok).toBe(false);
    expect(result1.error).toBeDefined();

    const result2 = await handlers['shell:resolveMangaDir']({}, { baseSaveDir: '/downloads', mangaTitle: '   ' });
    expect(result2.ok).toBe(false);

    const result3 = await handlers['shell:resolveMangaDir']({}, undefined);
    expect(result3.ok).toBe(false);
  });
});
