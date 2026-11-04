const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, shell } = require('electron');
const { detectFormat } = require('../lib/reader/formatDetector');
const { loadZipFromFilePath } = require('../lib/reader/loaders/loadZipForOfflineRead');
const { loadRarFromFilePath } = require('../lib/reader/loaders/loadRarForOfflineRead');
const { loadPdfFromFilePath } = require('../lib/reader/loaders/loadPdfForOfflineRead');
const { loadEpubFromFilePath } = require('../lib/reader/loaders/loadEpubForOfflineRead');
const { loadMobiFromFilePath } = require('../lib/reader/loaders/loadMobiForOfflineRead');
const { listArchivesInDirectory } = require('../lib/reader/listArchivesInDirectory');
const { detectEbookContentType } = require('../lib/reader/detectEbookContentType');
const { loadTextEpubFromFilePath, readSpineItem } = require('../lib/reader/loaders/loadTextEpub');
const { loadTextPdfFromFilePath, readPdfPage } = require('../lib/reader/loaders/loadTextPdf');

/** Cache extractDir cho EPUB text reader: absolutePath → extractDir */
const ebookSessionCache = new Map();

function registerReaderIpc(ipc_context) {
  async function runLoadCbzFromFile(cbzPath) {
    // Dọn session/extract của lần mở trước.
    ipc_context.closeActiveReaderSessions();
    if (ipc_context.getCbzTempDir()) {
      try {
        fs.rmSync(ipc_context.getCbzTempDir(), { recursive: true, force: true });
      } catch {
        /* */
      }
      ipc_context.setCbzTempDir(null);
    }

    const baseName = path.basename(cbzPath);
    ipc_context.sendLog(`Đang mở: ${baseName}…`, 'info');
    ipc_context.sendCbzLoadProgress({ phase: 'extracting', extracted: 0, total: 0, filePath: cbzPath });

    // Hướng chính: mở CBZ thành session (yauzl giữ handle, decompress mỗi trang
    // theo yêu cầu). Không ghi gì ra đĩa cho tới khi user thực sự cần (export).
    const { loadCbzFromFilePathStreaming, loadCbzFromFilePath } = require('../lib/reader/loaders/loadCbzForOfflineRead');
    let result = await loadCbzFromFilePathStreaming(cbzPath);

    if (result.ok) {
      ipc_context.setCbzSessionId(result.sessionId || null);
    } else {
      // Fallback: nếu mở session thất bại (file ZIP lạ, layout không nhận diện
      // được, v.v.), thử lại với pipeline extract-to-disk cũ.
      ipc_context.sendLog(`Mở nhanh CBZ thất bại (${result.error || ''}), fallback giải nén…`, 'warn');
      let lastReportedPct = -1;
      const onProgress = (extracted, total) => {
        if (total > 0) {
          const pct = Math.floor((extracted / total) * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            ipc_context.sendCbzLoadProgress({ phase: 'extracting', extracted, total, pct, filePath: cbzPath });
          }
        }
      };
      result = await loadCbzFromFilePath(cbzPath, { tempRoot: ipc_context.getCbzTempRoot(), onProgress });
      if (result.ok) {
        ipc_context.setCbzTempDir(path.resolve(result.cbzTempExtractDir));
      }
    }

    if (result.ok) {
      ipc_context.sendLog(`Đã mở: ${baseName} (${result.chapters?.length ?? 0} chương)`, 'success');
      ipc_context.sendCbzLoadProgress({ phase: 'done', pct: 100, filePath: cbzPath });
    } else {
      ipc_context.sendLog(`Mở CBZ thất bại: ${result.error || 'Lỗi không xác định'}`, 'error');
      ipc_context.sendCbzLoadProgress({ phase: 'error', error: result.error, filePath: cbzPath });
    }
    return result;
  }

  async function runLoadArchiveFromFile(filePath) {
    ipc_context.closeActiveReaderSessions();
    if (ipc_context.getCbzTempDir()) {
      try {
        fs.rmSync(ipc_context.getCbzTempDir(), { recursive: true, force: true });
      } catch {
        /* */
      }
      ipc_context.setCbzTempDir(null);
    }
    const format = detectFormat(filePath);
    let result;
    if (format === 'cbz' || format === 'zip') {
      const { loadCbzFromFilePathStreaming, loadCbzFromFilePath } = require('../lib/reader/loaders/loadCbzForOfflineRead');
      result = await loadCbzFromFilePathStreaming(filePath);
      if (result.ok) {
        ipc_context.setCbzSessionId(result.sessionId || null);
      } else if (format === 'zip') {
        result = await loadZipFromFilePath(filePath, { tempRoot: ipc_context.getCbzTempRoot() });
      } else {
        result = await loadCbzFromFilePath(filePath, { tempRoot: ipc_context.getCbzTempRoot() });
      }
    } else if (format === 'rar') {
      result = await loadRarFromFilePath(filePath, { tempRoot: ipc_context.getCbzTempRoot() });
    } else if (format === 'pdf') {
      const { loadPdfFromFilePathStreaming } = require('../lib/reader/loaders/loadPdfForOfflineRead');
      // Thử mở PDF dưới dạng session (pdfjs giữ doc, render mỗi trang theo yêu cầu).
      result = await loadPdfFromFilePathStreaming(filePath);
      if (result.ok) {
        ipc_context.setPdfSessionId(result.sessionId || null);
      } else {
        ipc_context.sendLog(`Mở nhanh PDF thất bại (${result.error || ''}), fallback render…`, 'warn');
        result = await loadPdfFromFilePath(filePath, {
          tempRoot: ipc_context.getCbzTempRoot(),
          onProgress: (extracted, total) => {
            const pct = total > 0 ? Math.round((extracted / total) * 100) : 0;
            ipc_context.sendCbzLoadProgress({ pct, extracted, total, filePath });
          },
        });
      }
    } else if (format === 'epub') {
      result = await loadEpubFromFilePath(filePath, { tempRoot: ipc_context.getCbzTempRoot() });
    } else if (format === 'mobi') {
      result = await loadMobiFromFilePath(filePath, {
        tempRoot: ipc_context.getCbzTempRoot(),
        onProgress: (extracted, total) => {
          const pct = total > 0 ? Math.round((extracted / total) * 100) : 0;
          ipc_context.sendCbzLoadProgress({ pct, extracted, total, filePath });
        },
      });
    } else {
      const ext = path.extname(String(filePath || '')).toLowerCase() || String(filePath || '');
      return { ok: false, error: `Unsupported file format: ${ext}` };
    }
    if (result.ok && result.cbzTempExtractDir) {
      const cbzSession = require('../lib/reader/cbzSessionService');
      const pdfSession = require('../lib/reader/pdfSessionService');
      // Session URI là alias logic, không phải đường dẫn — đừng nhầm vào tracker
      // dùng cho disk-based cleanup.
      if (
        !cbzSession.isSessionUri(result.cbzTempExtractDir) &&
        !pdfSession.isSessionUri(result.cbzTempExtractDir)
      ) {
        ipc_context.setCbzTempDir(path.resolve(result.cbzTempExtractDir));
      }
    }
    return { ...result, sourceFile: filePath };
  }

  try {
    ipcMain.removeHandler('manga:pickAndLoadCbz');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('manga:releaseCbzTempDir');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('manga:listCbzInDirectory');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('manga:findFirstImageInDirectory');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('manga:loadCbzFromAbsolutePath');
  } catch {
    /* */
  }
  ipcMain.handle('manga:listCbzInDirectory', async (_event, { dir }) => {
    const { listCbzInDirectory } = require('../lib/library/listCbzInDirectory');
    try {
      return await listCbzInDirectory(dir);
    } catch (e) {
      return { ok: false, error: String(e?.message || e), files: [] };
    }
  });
  ipcMain.handle('manga:findFirstImageInDirectory', (_event, { dir }) => {
    const d = String(dir || '').trim();
    if (!d || !ipc_context.isAllowedCbzTempPath(d)) {
      return { ok: false, error: 'Đường dẫn không hợp lệ.' };
    }
    const root = path.resolve(d);
    const IMAGE_EXT_SET = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
    const COVER_BASE_SET = new Set(['cover', 'folder', 'front', 'thumbnail', 'thumb']);
    try {
      if (!fs.existsSync(root)) return { ok: false, error: 'Không tìm thấy thư mục.' };
      const stack = [root];
      let fallbackImagePath = '';
      while (stack.length) {
        const cur = stack.pop();
        let entries = [];
        try {
          entries = fs.readdirSync(cur, { withFileTypes: true });
        } catch {
          continue;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        for (const ent of entries) {
          const full = path.join(cur, ent.name);
          if (ent.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!ent.isFile()) continue;
          const ext = path.extname(ent.name).toLowerCase();
          if (IMAGE_EXT_SET.has(ext)) {
            const baseName = path.basename(ent.name, ext).toLowerCase().trim();
            if (COVER_BASE_SET.has(baseName)) {
              return { ok: true, path: full };
            }
            if (!fallbackImagePath) {
              fallbackImagePath = full;
            }
          }
        }
      }
      if (fallbackImagePath) {
        return { ok: true, path: fallbackImagePath };
      }
      return { ok: false, error: 'Không tìm thấy file ảnh.' };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
  ipcMain.handle('manga:loadCbzFromAbsolutePath', async (_event, { absoluteCbzPath }) => {
    const p = String(absoluteCbzPath || '').trim();
    if (!p) {
      return { ok: false, error: 'Thiếu đường dẫn file CBZ.' };
    }
    return runLoadCbzFromFile(p);
  });
  ipcMain.handle('manga:pickAndLoadCbz', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      filters: [{ name: 'Comic CBZ', extensions: ['cbz'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) {
      return { ok: false, cancelled: true };
    }
    return runLoadCbzFromFile(filePaths[0]);
  });
  ipcMain.handle('manga:releaseCbzTempDir', async (_event, { dir }) => {
    const d = String(dir || '').trim();
    // CBZ/PDF session: chỉ cần đóng handle (yauzl / pdfjs), không có file rác.
    {
      const cbzSession = require('../lib/reader/cbzSessionService');
      if (cbzSession.isSessionUri(d)) {
        const sid = cbzSession.sessionIdFromUri(d);
        cbzSession.closeSession(sid);
        if (ipc_context.getCbzSessionId() === sid) ipc_context.setCbzSessionId(null);
        return { ok: true };
      }
      const pdfSession = require('../lib/reader/pdfSessionService');
      if (pdfSession.isSessionUri(d)) {
        const sid = pdfSession.sessionIdFromUri(d);
        pdfSession.closeSession(sid);
        if (ipc_context.getPdfSessionId() === sid) ipc_context.setPdfSessionId(null);
        return { ok: true };
      }
    }
    if (!d || !ipc_context.isAllowedCbzTempPath(d)) {
      return { ok: false, error: 'Đường dẫn không hợp lệ.' };
    }
    const resolved = path.resolve(d);
    try {
      if (fs.existsSync(resolved)) {
        await fs.promises.rm(resolved, { recursive: true, force: true });
      }
      if (ipc_context.getCbzTempDir() === resolved) {
        ipc_context.setCbzTempDir(null);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
  try {
    ipcMain.removeHandler('manga:pickAndLoadArchive');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('manga:loadArchiveFromAbsolutePath');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('manga:listArchivesInDirectory');
  } catch {
    /* */
  }
  ipcMain.handle('manga:pickAndLoadArchive', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      filters: [{ name: 'Comic / eBook', extensions: ['cbz', 'zip', 'cbr', 'rar', 'pdf', 'epub', 'mobi', 'azw', 'azw3'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) {
      return { ok: false, cancelled: true };
    }
    return runLoadArchiveFromFile(filePaths[0]);
  });
  ipcMain.handle('manga:loadArchiveFromAbsolutePath', async (_event, { absolutePath }) => {
    const p = String(absolutePath || '').trim();
    if (!p) {
      return { ok: false, error: 'Thiếu đường dẫn file.' };
    }
    return runLoadArchiveFromFile(p);
  });
  ipcMain.handle('manga:listArchivesInDirectory', async (_event, { dir }) => {
    try {
      return await listArchivesInDirectory(dir);
    } catch (e) {
      return { ok: false, error: String(e?.message || e), files: [] };
    }
  });

  try {
    ipcMain.removeHandler('ebook:detectContentType');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('ebook:loadTextEpub');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('ebook:readSpineItem');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('ebook:loadTextPdf');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('ebook:readPdfPage');
  } catch {
    /* */
  }
  try {
    ipcMain.removeHandler('ebook:releaseEbook');
  } catch {
    /* */
  }

  ipcMain.handle('ebook:detectContentType', async (_event, { absolutePath }) => {
    const p = String(absolutePath || '').trim();
    if (!p) return { ok: false, error: 'Thiếu đường dẫn file.' };
    try {
      return await detectEbookContentType(p);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('ebook:loadTextEpub', async (_event, { absolutePath }) => {
    const p = String(absolutePath || '').trim();
    if (!p) return { ok: false, error: 'Thiếu đường dẫn file.' };
    try {
      const result = await loadTextEpubFromFilePath(p, { tempRoot: ipc_context.getCbzTempRoot() });
      if (result.ok && result.extractDir) {
        ebookSessionCache.set(p, result.extractDir);
      }
      return result;
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('ebook:readSpineItem', async (_event, { absolutePath, spineItemHref }) => {
    const p = String(absolutePath || '').trim();
    const href = String(spineItemHref || '').trim();
    if (!p || !href) return { ok: false, error: 'Thiếu đường dẫn hoặc href.' };
    const extractDir = ebookSessionCache.get(p);
    if (!extractDir) return { ok: false, error: 'Ebook chưa được load. Hãy gọi ebook:loadTextEpub trước.' };
    try {
      return await readSpineItem(extractDir, href);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('ebook:loadTextPdf', async (_event, { absolutePath }) => {
    const p = String(absolutePath || '').trim();
    if (!p) return { ok: false, error: 'Thiếu đường dẫn file.' };
    try {
      return await loadTextPdfFromFilePath(p);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('ebook:readPdfPage', async (_event, { absolutePath, pageIndex }) => {
    const p = String(absolutePath || '').trim();
    if (!p) return { ok: false, error: 'Thiếu đường dẫn file.' };
    try {
      return await readPdfPage(p, pageIndex);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('ebook:releaseEbook', async (_event, { absolutePath }) => {
    const p = String(absolutePath || '').trim();
    if (!p) return { ok: false, error: 'Thiếu đường dẫn file.' };
    const extractDir = ebookSessionCache.get(p);
    ebookSessionCache.delete(p);
    if (extractDir) {
      try {
        const resolved = path.resolve(extractDir);
        if (fs.existsSync(resolved)) {
          await fs.promises.rm(resolved, { recursive: true, force: true });
        }
      } catch {
        /* ignore cleanup errors */
      }
    }
    return { ok: true };
  });

  const { getReadCacheSummary, clearReadCache } = require('../lib/reader/cache/readCacheSummary');

  ipcMain.handle('cache:getSummary', async (_event, { hiddenAbsolutePaths } = {}) => {
    try {
      const summary = await getReadCacheSummary({
        hiddenAbsolutePaths,
        tempRoot: ipc_context.getCbzTempRoot(),
      });
      return { ok: true, ...summary };
    } catch (e) {
      return { ok: false, bytes: 0, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('cache:clear', async (_event, { hiddenAbsolutePaths } = {}) => {
    try {
      await clearReadCache({
        hiddenAbsolutePaths,
        tempRoot: ipc_context.getCbzTempRoot(),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

module.exports = { registerReaderIpc };
