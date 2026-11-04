const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { fetchRemoteImageAsDataUrl } = require('../lib/export/image/fetchRemoteImageForUi');
const {
  formatChapterFolderName,
  isFlatChapterLayout,
  getFlatChapterImageNamePrefix,
} = require('../lib/shared/mangaUtils');
const { resolveChapterDir } = require('../lib/download/connector/connectorPathUtils');

function registerLibraryIpc(ipc_context) {
  try {
    ipcMain.removeHandler('manga:countLocalChapters');
  } catch {
    /* channel chưa có */
  }
  ipcMain.handle('manga:countLocalChapters', (_event, { baseSaveDir, mangaTitle }) => {
    const { countCompletedChaptersOnDisk } = require('../lib/library/localChapterCount');
    const base = String(baseSaveDir || '').trim();
    const title = String(mangaTitle || '').trim();
    if (!base || !title) {
      return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.', count: 0 };
    }
    try {
      const count = countCompletedChaptersOnDisk(base, title);
      return { ok: true, count };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), count: 0 };
    }
  });

  try {
    ipcMain.removeHandler('manga:computeFavoriteChapterSync');
  } catch {
    /* channel chưa có */
  }
  ipcMain.handle('manga:computeFavoriteChapterSync', (_event, { baseSaveDir, mangaTitle, remoteChapters }) => {
    const { computeFavoriteChapterSync } = require('../lib/library/computeFavoriteChapterSync');
    const base = String(baseSaveDir || '').trim();
    const title = String(mangaTitle || '').trim();
    if (!base || !title) {
      return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.' };
    }
    try {
      const result = computeFavoriteChapterSync(base, title, remoteChapters);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  try {
    ipcMain.removeHandler('manga:listLocalMangaLibrary');
  } catch {
    /* channel chưa có */
  }
  try {
    ipcMain.removeHandler('manga:loadOfflineFromAbsolutePath');
  } catch {
    /* */
  }
  ipcMain.handle('manga:listLocalMangaLibrary', async (_event, payload) => {
    const baseSaveDir = payload?.baseSaveDir;
    const force = payload?.force === true;
    const { listLocalMangaUnderSaveDirAsync, listLocalMangaUnderSaveDir } = require('../lib/library/listLocalMangaLibrary');
    const base = String(baseSaveDir || '').trim();
    if (!base) {
      return { ok: false, error: 'Thiếu thư mục lưu.', items: [] };
    }
    try {
      const fn = listLocalMangaUnderSaveDirAsync || listLocalMangaUnderSaveDir;
      const items = await fn(base, true, 2, 0, { force });
      return { ok: true, items };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), items: [] };
    }
  });
  ipcMain.handle('manga:loadOfflineFromAbsolutePath', (_event, { absoluteMangaDir }) => {
    // CBZ session: tái sử dụng session đang sống (nếu user vẫn ở trong cùng phiên app).
    // Khi session đã chết — không có cách dựng lại từ chỉ URI; bắt caller gọi
    // openArchivePath / loadCbzFromAbsolutePath để mở lại file gốc.
    {
      const cbzSession = require('../lib/reader/cbzSessionService');
      if (cbzSession.isSessionUri(absoluteMangaDir)) {
        const sid = cbzSession.sessionIdFromUri(absoluteMangaDir);
        const session = cbzSession.getSession(sid);
        if (!session) {
          return { ok: false, error: 'Phiên CBZ đã đóng. Hãy mở lại file CBZ.' };
        }
        const chapters = [];
        for (const [folderBasename, state] of session.chaptersMap.entries()) {
          chapters.push({
            folderBasename,
            title: state.title,
            url: state.url,
          });
        }
        const manga = {
          title: session.title,
          mangaUrl: '',
          siteId: '',
          coverUrl: '',
          offlineOnly: true,
          offlineMangaDirAbsolute: cbzSession.sessionUri(sid),
          cbzTempExtractDir: cbzSession.sessionUri(sid),
          cbzFilePath: session.zipPath,
        };
        return { ok: true, manga, chapters };
      }
      const pdfSession = require('../lib/reader/pdfSessionService');
      if (pdfSession.isSessionUri(absoluteMangaDir)) {
        const sid = pdfSession.sessionIdFromUri(absoluteMangaDir);
        const session = pdfSession.getSession(sid);
        if (!session) {
          return { ok: false, error: 'Phiên PDF đã đóng. Hãy mở lại file PDF.' };
        }
        const manga = {
          title: session.title,
          mangaUrl: '',
          siteId: '',
          coverUrl: '',
          offlineOnly: true,
          offlineMangaDirAbsolute: pdfSession.sessionUri(sid),
          cbzTempExtractDir: pdfSession.sessionUri(sid),
          pdfFilePath: session.pdfPath,
        };
        const chapters = [
          {
            folderBasename: pdfSession.PDF_PAGES_FOLDER,
            title: session.title,
            url: `offline:${encodeURIComponent(pdfSession.PDF_PAGES_FOLDER)}`,
          },
        ];
        return { ok: true, manga, chapters };
      }
    }
    const { loadOfflineMangaFromAbsolutePath } = require('../lib/reader/loaders/loadOfflineMangaFromDisk');
    try {
      return loadOfflineMangaFromAbsolutePath(absoluteMangaDir);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:loadOfflineFromDisk', (_event, { baseSaveDir, mangaTitle }) => {
    const { loadOfflineMangaFromDisk } = require('../lib/reader/loaders/loadOfflineMangaFromDisk');
    const base = String(baseSaveDir || '').trim();
    const mt = String(mangaTitle || '').trim();
    if (!base || !mt) {
      return { ok: false, error: 'Thiếu thư mục lưu hoặc tên truyện.' };
    }
    try {
      return loadOfflineMangaFromDisk(base, mt);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:fetchRemoteImageAsDataUrl', async (_event, imageUrl) => {
    try {
      return await fetchRemoteImageAsDataUrl(imageUrl);
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'manga:listChapterImageFiles',
    async (_event, { baseSaveDir, mangaTitle, chapterTitle, folderBasename, offlineMangaDirAbsolute }) => {
      // CBZ session: ảnh sống trong yauzl, không có thư mục thật trên đĩa.
      {
        const cbzSession = require('../lib/reader/cbzSessionService');
        if (cbzSession.isSessionUri(offlineMangaDirAbsolute)) {
          const sid = cbzSession.sessionIdFromUri(offlineMangaDirAbsolute);
          const fb = String(folderBasename || '').trim();
          if (!fb) {
            return { ok: false, error: 'Thiếu thư mục chương.', files: [] };
          }
          return cbzSession.listChapterFiles(sid, fb);
        }
        const pdfSession = require('../lib/reader/pdfSessionService');
        if (pdfSession.isSessionUri(offlineMangaDirAbsolute)) {
          const sid = pdfSession.sessionIdFromUri(offlineMangaDirAbsolute);
          const fb = String(folderBasename || '').trim();
          if (!fb) {
            return { ok: false, error: 'Thiếu thư mục chương.', files: [] };
          }
          return pdfSession.listChapterFiles(sid, fb);
        }
      }
      const ct = String(chapterTitle || '').trim();
      const fb = String(folderBasename || '').trim();
      const mangaRoot = ipc_context.resolveMangaRootForRead(baseSaveDir, mangaTitle, offlineMangaDirAbsolute);
      if (!mangaRoot || !ct) {
        return { ok: false, error: 'Thiếu đường dẫn hoặc tên.', files: [] };
      }
      const cf = ipc_context.getChapterFolderSettings();
      let chapterDir;
      let listOptions = {};
      if (fb === '.') {
        chapterDir = mangaRoot;
      } else if (fb) {
        const safe = path.basename(fb);
        if (!safe || safe === '.' || safe === '..') {
          return { ok: false, error: 'Tên thư mục chương không hợp lệ.', files: [] };
        }
        chapterDir = path.join(mangaRoot, safe);
      } else if (isFlatChapterLayout(cf)) {
        chapterDir = mangaRoot;
        listOptions = { namePrefix: getFlatChapterImageNamePrefix(ct, cf) };
      } else {
        const base = String(baseSaveDir || '').trim();
        const mt = String(mangaTitle || '').trim();
        if (String(offlineMangaDirAbsolute || '').trim()) {
          chapterDir = path.join(mangaRoot, formatChapterFolderName(ct, cf));
        } else {
          chapterDir = resolveChapterDir(base, mt, ct, cf);
        }
      }
      const { listChapterImageFiles } = require('../lib/library/listChapterImageFiles');
      let list_result = listChapterImageFiles(chapterDir, listOptions);
      if (list_result.ok && Array.isArray(list_result.files) && list_result.files.length === 0) {
        const { ensureChapterPdfRenderedAsPngPages } = require('../lib/library/ensureChapterPdfRenderedAsPngPages');
        const ensured = await ensureChapterPdfRenderedAsPngPages(chapterDir);
        if (!ensured.ok) {
          return { ok: false, error: ensured.error || 'Không render được PDF chương.', files: [] };
        }
        list_result = listChapterImageFiles(chapterDir, listOptions);
      }
      return list_result;
    }
  );

  ipcMain.handle('manga:filterChaptersWithLocalImages', (_event, { baseSaveDir, mangaTitle, chapters, absoluteMangaDir }) => {
    // CBZ session: mọi chương đã được index sẵn → trả về toàn bộ có
    // folderBasename trùng với session, không cần đụng disk.
    {
      const cbzSession = require('../lib/reader/cbzSessionService');
      if (cbzSession.isSessionUri(absoluteMangaDir)) {
        const sid = cbzSession.sessionIdFromUri(absoluteMangaDir);
        const session = cbzSession.getSession(sid);
        if (!session) return { ok: false, error: 'Phiên CBZ đã đóng.', chapters: [] };
        const items = Array.isArray(chapters) ? chapters : [];
        const keep = items.filter((c) =>
          session.chaptersMap.has(String(c?.folderBasename || '').trim()),
        );
        return { ok: true, chapters: keep };
      }
      // PDF session: chỉ có duy nhất 1 chương ảo `_pdf_pages`.
      const pdfSession = require('../lib/reader/pdfSessionService');
      if (pdfSession.isSessionUri(absoluteMangaDir)) {
        const sid = pdfSession.sessionIdFromUri(absoluteMangaDir);
        const session = pdfSession.getSession(sid);
        if (!session) return { ok: false, error: 'Phiên PDF đã đóng.', chapters: [] };
        const items = Array.isArray(chapters) ? chapters : [];
        const keep = items.filter(
          (c) => String(c?.folderBasename || '').trim() === pdfSession.PDF_PAGES_FOLDER,
        );
        return { ok: true, chapters: keep };
      }
    }
    const { filterChaptersWithLocalImages, filterChaptersWithLocalImagesAbsolute } = require('../lib/library/filterChaptersWithLocalImages');
    // Ưu tiên absoluteMangaDir (khi mở manga từ offline folder)
    const absDir = String(absoluteMangaDir || '').trim();
    if (absDir) {
      try {
        const list = filterChaptersWithLocalImagesAbsolute(absDir, chapters);
        return { ok: true, chapters: list };
      } catch (e) {
        return { ok: false, error: String(e?.message || e), chapters: [] };
      }
    }
    const base = String(baseSaveDir || '').trim();
    const mt = String(mangaTitle || '').trim();
    if (!base || !mt) {
      return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.', chapters: [] };
    }
    try {
      const list = filterChaptersWithLocalImages(base, mt, chapters, ipc_context.getChapterFolderSettings());
      return { ok: true, chapters: list };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), chapters: [] };
    }
  });

  ipcMain.handle('manga:checkChapterSubfolders', async (_event, payload) => {
    const { checkChaptersWithSubfolderImages } = require('../lib/export/exportCbz');
    const base = String(payload?.baseSaveDir || '').trim();
    const mt = String(payload?.mangaTitle || '').trim();
    const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
    if (!base || !mt) return { ok: false, affected: [] };
    try {
      const affected = checkChaptersWithSubfolderImages(base, mt, chapters, ipc_context.getChapterFolderSettings());
      return { ok: true, affected };
    } catch (e) {
      return { ok: false, affected: [], error: String(e?.message || e) };
    }
  });

  ipcMain.handle(
    'manga:readLocalChapterImage',
    async (_event, { baseSaveDir, mangaTitle, chapterTitle, fileName, folderBasename, offlineMangaDirAbsolute }) => {
      // CBZ session: decompress entry on-demand, trả base64 như đọc từ disk.
      // PDF session: rasterize trang đó qua pdfjs + napi-rs/canvas.
      {
        const cbzSession = require('../lib/reader/cbzSessionService');
        const pdfSession = require('../lib/reader/pdfSessionService');
        const sessionMod = cbzSession.isSessionUri(offlineMangaDirAbsolute)
          ? cbzSession
          : pdfSession.isSessionUri(offlineMangaDirAbsolute)
            ? pdfSession
            : null;
        if (sessionMod) {
          const sid = sessionMod.sessionIdFromUri(offlineMangaDirAbsolute);
          const fb = String(folderBasename || '').trim();
          const fn = String(fileName || '').replace(/\\/g, '/').trim();
          if (!fb || !fn || fn.includes('..')) {
            return { ok: false, error: 'Tham số không hợp lệ.' };
          }
          const res = await sessionMod.readEntryBytes(sid, fb, fn);
          if (!res.ok) return { ok: false, error: res.error || 'Không đọc được ảnh.' };
          return { ok: true, dataUrl: `data:${res.mime};base64,${res.buffer.toString('base64')}` };
        }
      }
      const ct = String(chapterTitle || '').trim();
      const normalized = String(fileName || '').replace(/\\/g, '/').trim();
      const fb = String(folderBasename || '').trim();
      const mangaRoot = ipc_context.resolveMangaRootForRead(baseSaveDir, mangaTitle, offlineMangaDirAbsolute);
      if (!mangaRoot || !ct || !normalized) {
        return { ok: false, error: 'Tham số không hợp lệ.' };
      }
      if (normalized.includes('..')) {
        return { ok: false, error: 'Tên file không hợp lệ.' };
      }
      const path_segments = normalized.split('/').filter(Boolean);
      if (path_segments.length === 0 || path_segments.length > 2) {
        return { ok: false, error: 'Tên file không hợp lệ.' };
      }
      const { CHAPTER_PDF_RASTER_SUBDIR } = require('../lib/library/listChapterImageFiles');
      if (path_segments.length === 2 && path_segments[0] !== CHAPTER_PDF_RASTER_SUBDIR) {
        return { ok: false, error: 'Tên file không hợp lệ.' };
      }
      const cf = ipc_context.getChapterFolderSettings();
      let chapterDir;
      if (fb === '.') {
        chapterDir = mangaRoot;
      } else if (fb) {
        const safe = path.basename(fb);
        if (!safe || safe === '.' || safe === '..') {
          return { ok: false, error: 'Tên thư mục chương không hợp lệ.' };
        }
        chapterDir = path.join(mangaRoot, safe);
      } else if (isFlatChapterLayout(cf)) {
        chapterDir = mangaRoot;
      } else {
        const base = String(baseSaveDir || '').trim();
        const mt = String(mangaTitle || '').trim();
        if (String(offlineMangaDirAbsolute || '').trim()) {
          chapterDir = path.join(mangaRoot, formatChapterFolderName(ct, cf));
        } else {
          chapterDir = resolveChapterDir(base, mt, ct, cf);
        }
      }
      const full = path.normalize(path.join(chapterDir, ...path_segments));
      const resolvedDir = path.resolve(chapterDir);
      const resolvedFile = path.resolve(full);
      const rel = path.relative(resolvedDir, resolvedFile);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { ok: false, error: 'Đường dẫn không hợp lệ.' };
      }
      if (!fs.existsSync(resolvedFile)) {
        return { ok: false, error: 'Không tìm thấy file.' };
      }
      try {
        const buf = fs.readFileSync(resolvedFile);
        if (!buf.length) return { ok: false, error: 'File rỗng.' };
        const leaf_name = path.basename(resolvedFile);
        const ext = path.extname(leaf_name).toLowerCase();
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.avif'
                  ? 'image/avif'
                  : 'image/jpeg';
        return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, absPath: resolvedFile };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    });
}

module.exports = { registerLibraryIpc };
