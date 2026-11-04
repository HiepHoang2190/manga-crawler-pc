const fs = require('fs');
const path = require('path');
const { ipcMain, dialog } = require('electron');

let sendToKindleService = null;
function getSendToKindleService() {
  if (!sendToKindleService) {
    const { createSendToKindleService } = require('../lib/export/kindle/SendToKindleService');
    sendToKindleService = createSendToKindleService();
  }
  return sendToKindleService;
}

function registerKindleIpc(ipc_context) {
  // ─── Send to Kindle (Amazon web-upload, up to 200MB, no SMTP) ───────────────
  ipcMain.handle('kindle:getChapterSizes', async (_event, payload) => {
    try {
      const {
        getChapterSourceSizes,
      } = require('../lib/library/getChapterSourceSizes');
      const absoluteMangaDir = String(payload?.absoluteMangaDir || '').trim();
      const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
      if (!absoluteMangaDir) {
        return { ok: false, error: 'Thiếu đường dẫn truyện.', chapters: [] };
      }
      const sized = await getChapterSourceSizes(absoluteMangaDir, chapters);
      return { ok: true, chapters: sized };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), chapters: [] };
    }
  });

  ipcMain.handle('kindle:isLoggedIn', async () => {
    try {
      const svc = getSendToKindleService();
      const loggedIn = await svc.isLoggedIn();
      const account = loggedIn ? await svc.getAccountLabel() : null;
      return { ok: true, loggedIn, account };
    } catch (e) {
      return { ok: false, loggedIn: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('kindle:login', async () => {
    try {
      const svc = getSendToKindleService();
      const loggedIn = await svc.login();
      const account = loggedIn ? await svc.getAccountLabel() : null;
      return { ok: true, loggedIn, account };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('kindle:logout', async () => {
    try {
      await getSendToKindleService().logout();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('kindle:send', async (event, payload) => {
    const svc = getSendToKindleService();
    const sendProgress = (p) => {
      try {
        event.sender.send('kindle:progress', p);
      } catch {
        /* ignore */
      }
    };
    try {
      return await svc.send({
        absoluteMangaDir: String(payload?.absoluteMangaDir || '').trim(),
        mangaTitle: String(payload?.mangaTitle || '').trim(),
        chapters: Array.isArray(payload?.chapters) ? payload.chapters : [],
        title: payload?.title ? String(payload.title).trim() : undefined,
        author: payload?.author ? String(payload.author).trim() : undefined,
        format: payload?.format ? String(payload.format).trim().toLowerCase() : 'epub',
        deleteLocalAfterUpload: payload?.deleteLocalAfterUpload !== false,
        chapterFolderFormat: ipc_context.getChapterFolderSettings(),
        onProgress: sendProgress,
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('kindle:pickFiles', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
        title: 'Send to Kindle',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Kindle documents', extensions: ['epub', 'pdf'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (canceled) return { ok: true, canceled: true, files: [] };
      return { ok: true, files: Array.isArray(filePaths) ? filePaths : [] };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), files: [] };
    }
  });

  ipcMain.handle('kindle:sendFile', async (event, payload) => {
    const svc = getSendToKindleService();
    const sendProgress = (p) => {
      try {
        event.sender.send('kindle:progress', p);
      } catch {
        /* ignore */
      }
    };
    try {
      return await svc.sendFile({
        filePath: String(payload?.filePath || '').trim(),
        title: payload?.title ? String(payload.title).trim() : undefined,
        author: payload?.author ? String(payload.author).trim() : undefined,
        onProgress: sendProgress,
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('kindle:statFiles', async (_event, payload) => {
    try {
      const paths = Array.isArray(payload?.paths) ? payload.paths : [];
      const files = [];
      for (const p of paths) {
        const filePath = String(p || '').trim();
        if (!filePath) continue;
        try {
          const st = fs.statSync(filePath);
          files.push({
            filePath,
            name: path.basename(filePath),
            sizeBytes: st.size,
          });
        } catch {
          files.push({
            filePath,
            name: path.basename(filePath),
            sizeBytes: 0,
            missing: true,
          });
        }
      }
      return { ok: true, files };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), files: [] };
    }
  });
}

module.exports = { registerKindleIpc };
