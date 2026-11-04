const fs = require('fs');
const { ipcMain, shell, clipboard } = require('electron');
const { resolveMangaDir, resolveChapterDir } = require('../lib/download/connector/connectorPathUtils');

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
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
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
