const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, shell } = require('electron');
const { defaultExtrasManager } = require('../lib/extras/ExtrasManager');

let _activeAbortController = null;

function registerExtrasIpc(ipc_context) {
  ipcMain.handle('extras:getStatus', async () => {
    return defaultExtrasManager.getStatus();
  });

  ipcMain.handle('extras:openFolder', async () => {
    const dir = defaultExtrasManager.getExtrasDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await shell.openPath(dir);
    return { ok: true, path: dir };
  });

  ipcMain.handle('extras:selectZipFile', async () => {
    const win = ipc_context?.getMainWindow ? ipc_context.getMainWindow() : null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Chọn file Manga Crawler Extras (.zip)',
      filters: [{ name: 'ZIP Files', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    return { ok: true, filePath: filePaths[0] };
  });

  ipcMain.handle('extras:installFromZip', async (event, payload) => {
    const filePath = payload?.filePath;
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'File không tồn tại' };
    }
    try {
      const status = await defaultExtrasManager.installFromZip(filePath, (prog) => {
        event.sender.send('extras:progress', prog);
      });
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('extras:startDownload', async (event, payload) => {
    const overrideUrl = payload?.overrideUrl;
    if (_activeAbortController) {
      _activeAbortController.abort();
    }
    _activeAbortController = new AbortController();

    try {
      const status = await defaultExtrasManager.downloadAndInstall(
        overrideUrl,
        (prog) => {
          event.sender.send('extras:progress', prog);
        },
        _activeAbortController.signal
      );
      _activeAbortController = null;
      return { ok: true, status };
    } catch (err) {
      _activeAbortController = null;
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('extras:cancel', async () => {
    if (_activeAbortController) {
      _activeAbortController.abort();
      _activeAbortController = null;
    }
    return { ok: true };
  });

  ipcMain.handle('extras:delete', async () => {
    try {
      const status = defaultExtrasManager.deleteExtras();
      return { ok: true, status };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

module.exports = { registerExtrasIpc };
