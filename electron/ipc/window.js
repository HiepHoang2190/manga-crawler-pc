const fs = require('fs');
const { ipcMain, shell, clipboard, Notification } = require('electron');
const { resolveMangaDir, resolveChapterDir } = require('../lib/download/connector/connectorPathUtils');

const ALLOWED_PROGRESS_MODES = new Set(['none', 'normal', 'indeterminate', 'error', 'paused']);

function registerWindowIpc(ipc_context) {
  ipcMain.handle('clipboard:readText', () => {
    try {
      return clipboard.readText();
    } catch {
      return '';
    }
  });

  ipcMain.on('window:minimize', () => ipc_context.getMainWindow()?.minimize());
  ipcMain.on('window:maximize', () => {
    const main_window = ipc_context.getMainWindow();
    if (!main_window) return;
    if (main_window.isMaximized()) {
      main_window.unmaximize();
    } else {
      main_window.maximize();
    }
  });
  ipcMain.on('window:close', () => ipc_context.getMainWindow()?.close());

  ipcMain.on('window:setProgressBar', (_event, payload = {}) => {
    const main_window = ipc_context.getMainWindow();
    if (!main_window || main_window.isDestroyed()) return;
    try {
      const raw = Number(payload?.progress);
      const progress = Number.isFinite(raw) && raw >= 0 ? Math.min(1, raw) : -1;
      const mode = ALLOWED_PROGRESS_MODES.has(payload?.mode) ? payload.mode : undefined;
      if (process.platform === 'win32' && mode) {
        main_window.setProgressBar(progress, { mode });
      } else {
        main_window.setProgressBar(progress);
      }
    } catch {
      /* ignore unsupported progress call */
    }
  });

  ipcMain.handle('app:notify', (_event, payload = {}) => {
    try {
      if (typeof Notification?.isSupported === 'function' && !Notification.isSupported()) {
        return { ok: false, error: 'Notifications unsupported' };
      }
      const title = String(payload?.title || '').trim().slice(0, 200);
      if (!title) return { ok: false, error: 'Empty title' };
      const body = String(payload?.body || '').trim().slice(0, 500);
      const notification = new Notification({
        title,
        body,
        silent: Boolean(payload?.silent),
      });
      notification.on('click', () => {
        const main_window = ipc_context.getMainWindow();
        if (main_window && !main_window.isDestroyed()) {
          if (main_window.isMinimized()) main_window.restore();
          main_window.focus();
        }
      });
      notification.show();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('shell:showItemInFolder', async (_event, fullPath) => {
    try {
      shell.showItemInFolder(fullPath);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('shell:openMangaFolder', async (_event, { baseSaveDir, mangaTitle }) => {
    const base = String(baseSaveDir || '').trim();
    const title = String(mangaTitle || '').trim();
    if (!base || !title) return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.' };
    const dir = resolveMangaDir(base, title);
    if (!fs.existsSync(dir)) {
      return { ok: false, error: 'Thư mục truyện chưa tồn tại (chưa có chương nào được tải).' };
    }
    const err = await shell.openPath(dir);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('shell:resolveMangaDir', async (_event, { baseSaveDir, mangaTitle } = {}) => {
    const base = String(baseSaveDir || '').trim();
    const title = String(mangaTitle || '').trim();
    if (!base || !title) return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.' };
    try {
      return { ok: true, path: resolveMangaDir(base, title) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('shell:openChapterFolder', async (_event, { baseSaveDir, mangaTitle, chapterTitle }) => {
    const base = String(baseSaveDir || '').trim();
    const mt = String(mangaTitle || '').trim();
    const ct = String(chapterTitle || '').trim();
    if (!base || !mt || !ct) {
      return { ok: false, error: 'Thiếu đường dẫn, tên truyện hoặc tên chương.' };
    }
    const dir = resolveChapterDir(base, mt, ct, ipc_context.getChapterFolderSettings());
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
    const err = await shell.openPath(dir);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'Invalid URL' };
    try {
      await shell.openExternal(u);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('shell:openPath', async (_event, targetPath) => {
    const p = String(targetPath || '').trim();
    if (!p) return { ok: false, error: 'Đường dẫn trống.' };
    const err = await shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  });
}

module.exports = { registerWindowIpc };
