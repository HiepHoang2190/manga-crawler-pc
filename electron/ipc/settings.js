const { app, ipcMain, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const updater = require('../lib/platform/connectors/api-clients/updater');
const brandingStorage = require('../lib/platform/storage/brandingStorage');
const { normalizeChapterFolderFormat } = require('../lib/shared/mangaUtils');

function autoBackupFilePath() {
  return path.join(app.getPath('userData'), 'manga-clawer-auto-backup.json');
}

function registerSettingsIpc(ipc_context) {
  ipcMain.handle('app:defaultDownloadPath', () => ipc_context.getDefaultMangaSaveDir());

  ipcMain.handle('app:getSavedDownloadPath', () => {
    const dir = ipc_context.readSettings().lastSaveDir;
    return typeof dir === 'string' && dir.trim() ? dir.trim() : null;
  });

  ipcMain.handle('app:setSavedDownloadPath', (_event, dir) => {
    const s = String(dir || '').trim();
    if (s) ipc_context.writeSettings({ lastSaveDir: s });
  });

  ipcMain.handle('app:getChapterFolderSettings', () => ipc_context.getChapterFolderSettings());

  ipcMain.handle('app:setChapterFolderSettings', (_event, partial) => {
    const cur = ipc_context.readSettings();
    const norm = normalizeChapterFolderFormat({
      mode: partial?.mode ?? cur.chapterFolderMode,
      prefix: partial?.prefix ?? cur.chapterFolderPrefix,
      padDigits: partial?.padDigits ?? cur.chapterFolderPadDigits,
      layout: partial?.layout ?? cur.chapterFolderLayout,
    });
    ipc_context.writeSettings({
      chapterFolderMode: norm.mode,
      chapterFolderPrefix: norm.prefix,
      chapterFolderPadDigits: norm.padDigits,
      chapterFolderLayout: norm.layout,
    });
    return norm;
  });

  ipcMain.handle('backup:getAutoBackupPath', () => autoBackupFilePath());

  ipcMain.handle('backup:writeAutoBackup', (_event, jsonText) => {
    try {
      const p = autoBackupFilePath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, String(jsonText ?? ''), 'utf8');
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('dialog:selectDirectory', async (_event, defaultPath) => {
    const opts = {
      properties: ['openDirectory', 'createDirectory'],
    };
    if (typeof defaultPath === 'string' && defaultPath.trim()) {
      opts.defaultPath = defaultPath.trim();
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), opts);
    if (canceled || !filePaths?.length) return null;
    return filePaths[0];
  });

  // ── Auto-update ──────────────────────────────────────────────────────────
  ipcMain.handle('update:check', async (_event, { versionJsonUrl } = {}) => {
    try {
      const result = await updater.checkForUpdate(versionJsonUrl);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('update:download', async (_event, { downloadInfo } = {}) => {
    try {
      const filePath = await updater.downloadUpdate(downloadInfo, (progress) => {
        const main_window = ipc_context.getMainWindow();
        if (main_window && !main_window.isDestroyed()) {
          main_window.webContents.send('update:downloadProgress', progress);
        }
      });
      return { ok: true, filePath };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('update:install', async (_event, { filePath } = {}) => {
    try {
      const result = await updater.installUpdate(filePath);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // ── Branding Customization ────────────────────────────────────────────────
  ipcMain.handle('branding:get', async () => {
    try {
      return { ok: true, config: brandingStorage.getBrandingConfig() };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('branding:set', async (_event, payload = {}) => {
    try {
      const { appName, iconType, iconBase64, customIconDataUrl, showTitleBarIcon } = payload;
      const rawBase64 = iconBase64 || customIconDataUrl;
      let iconBuffer = null;
      if (rawBase64 && typeof rawBase64 === 'string') {
        const cleanBase64 = rawBase64.replace(/^data:image\/[^;]+;base64,/, '');
        iconBuffer = Buffer.from(cleanBase64, 'base64');
      }
      const config = brandingStorage.saveBrandingConfig({
        appName,
        iconType,
        iconBuffer,
        showTitleBarIcon,
      });

      const mainWindow = ipc_context.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        const titleToSet = config.appName.trim() ? config.appName : ' ';
        mainWindow.setTitle(titleToSet);

        const nativeImg = brandingStorage.resolveNativeIcon(config);
        if (process.platform !== 'darwin' && !nativeImg.isEmpty()) {
          mainWindow.setIcon(nativeImg);
        }
        if (process.platform === 'darwin' && app.dock) {
          if (!nativeImg.isEmpty()) {
            app.dock.setIcon(nativeImg);
          }
        }
        mainWindow.webContents.send('branding:changed', config);
      }
      return { ok: true, config };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('branding:reset', async () => {
    try {
      const config = brandingStorage.resetBrandingConfig();
      const mainWindow = ipc_context.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(config.appName);

        const nativeImg = brandingStorage.resolveNativeIcon(config);
        if (process.platform !== 'darwin' && !nativeImg.isEmpty()) {
          mainWindow.setIcon(nativeImg);
        }
        if (process.platform === 'darwin' && app.dock && !nativeImg.isEmpty()) {
          app.dock.setIcon(nativeImg);
        }
        mainWindow.webContents.send('branding:changed', config);
      }
      return { ok: true, config };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('branding:pickIconFile', async () => {
    try {
      const mainWindow = ipc_context.getMainWindow();
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn ảnh làm biểu tượng ứng dụng',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico', 'svg', 'bmp'] },
        ],
      });
      if (canceled || !filePaths?.length) {
        return { canceled: true };
      }
      const filePath = filePaths[0];
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'settings.branding.errorFileNotFound' };
      }
      const fileBuf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.webp' ? 'image/webp'
        : ext === '.svg' ? 'image/svg+xml'
        : ext === '.ico' ? 'image/x-icon'
        : ext === '.bmp' ? 'image/bmp'
        : 'image/png';

      let width = 0;
      let height = 0;
      try {
        const img = nativeImage.createFromBuffer(fileBuf);
        if (!img.isEmpty()) {
          const size = img.getSize();
          width = size.width;
          height = size.height;
        }
      } catch (_) {}

      const dataUrl = `data:${mimeType};base64,${fileBuf.toString('base64')}`;
      return {
        ok: true,
        filePath,
        fileName: path.basename(filePath),
        dataUrl,
        width,
        height,
      };
    } catch (err) {
      console.error('[branding:pickIconFile]', err);
      return { ok: false, error: 'settings.branding.errorReadFailed' };
    }
  });
}

module.exports = { registerSettingsIpc };
