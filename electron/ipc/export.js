const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, shell } = require('electron');
const { formatFolderName } = require('../lib/shared/mangaUtils');

function registerExportIpc(ipc_context) {
  ipcMain.handle('dialog:selectCbzFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'CBZ Files', extensions: ['cbz'] }],
    });
    return canceled ? [] : (filePaths || []);
  });

  ipcMain.handle('dialog:selectImageFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'avif', 'tiff', 'gif'],
        },
      ],
    });
    return canceled ? [] : (filePaths || []);
  });

  ipcMain.handle('dialog:selectFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
    });
    return canceled ? [] : (filePaths || []);
  });

  ipcMain.handle('manga:estimateCbzSizeSplit', async (_event, payload) => {
    const { estimateSizeSplitCbzExport } = require('../lib/export/exportCbz');
    const base = String(payload?.baseSaveDir || '').trim();
    const mt = String(payload?.mangaTitle || '').trim();
    const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
    const absoluteMangaDir = String(payload?.absoluteMangaDir || '').trim();
    if (!absoluteMangaDir && (!base || !mt)) {
      return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.' };
    }
    const normalized = chapters
      .map((c) => ({
        title: String(c?.title || '').trim(),
        ...(c?.folderBasename ? { folderBasename: String(c.folderBasename).trim() } : {}),
      }))
      .filter((c) => c.title);
    if (!normalized.length) {
      return { ok: false, error: 'Chưa chọn chương nào.' };
    }
    const mb = Number(payload?.maxMbPerFile);
    const mbClamped = Number.isFinite(mb) ? Math.min(4096, Math.max(1, mb)) : 200;
    const maxBytes = Math.floor(mbClamped * 1024 * 1024);
    try {
      const estimate = estimateSizeSplitCbzExport({
        baseSaveDir: base,
        mangaTitle: mt,
        chapters: normalized,
        maxBytes,
        chapterFolderFormat: ipc_context.getChapterFolderSettings(),
        flattenSubfolders: Boolean(payload?.flattenSubfolders),
        absoluteMangaDir,
      });
      return estimate;
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:exportCbz', async (_event, payload) => {
    const { exportChaptersToCbz } = require('../lib/export/exportCbz');
    const base = String(payload?.baseSaveDir || '').trim();
    const mt = String(payload?.mangaTitle || '').trim();
    const mode = payload?.mode;
    const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
    const absoluteMangaDir = String(payload?.absoluteMangaDir || '').trim();
    const rotateDoublePage = Boolean(payload?.rotateDoublePage);
    const rotateThreshold = payload?.rotateThreshold || 1.2;

    if (!absoluteMangaDir && (!base || !mt)) {
      return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.' };
    }
    if (mode !== 'sizeSplit' && mode !== 'singleVolume') {
      return { ok: false, error: 'Chế độ xuất không hợp lệ.' };
    }
    // Keep folderBasename when present (offline folder); title is enough to pack
    const normalized = chapters
      .map((c) => ({
        title: String(c?.title || '').trim(),
        ...(c?.folderBasename ? { folderBasename: String(c.folderBasename).trim() } : {}),
      }))
      .filter((c) => c.title);
    if (!normalized.length) {
      return { ok: false, error: 'Chưa chọn chương nào.' };
    }

    let outputDir;
    let outputFile;
    let maxBytes;
    // outputBaseName: user-supplied custom file name (without .cbz)
    const outputBaseName = payload?.outputBaseName ? String(payload.outputBaseName).trim() : '';
    // Effective title for naming: use outputBaseName if provided, else mangaTitle
    const effectiveName = outputBaseName || mt;

    if (mode === 'sizeSplit') {
      const mb = Number(payload?.maxMbPerFile);
      const mbClamped = Number.isFinite(mb) ? Math.min(4096, Math.max(1, mb)) : 200;
      maxBytes = Math.floor(mbClamped * 1024 * 1024);
      if (payload?.outputDir) {
        outputDir = String(payload.outputDir).trim();
      } else if (payload?.skipDialog) {
        outputDir = absoluteMangaDir || base;
      } else {
        const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
          properties: ['openDirectory', 'createDirectory'],
        });
        if (canceled || !filePaths?.length) {
          return { ok: false, cancelled: true };
        }
        outputDir = filePaths[0];
      }
    } else {
      if (payload?.outputFile) {
        outputFile = String(payload.outputFile).trim();
        if (!outputFile.toLowerCase().endsWith('.cbz')) outputFile += '.cbz';
      } else if (payload?.outputDir) {
        outputFile = path.join(
          String(payload.outputDir).trim(),
          `${formatFolderName(effectiveName) || 'manga'}.cbz`
        );
      } else if (payload?.skipDialog) {
        const fallbackDir = absoluteMangaDir ? path.dirname(absoluteMangaDir) : base;
        outputFile = path.join(fallbackDir, `${formatFolderName(effectiveName) || 'manga'}.cbz`);
      } else {
        const defaultName = `${formatFolderName(effectiveName) || 'manga'}.cbz`;
        const { canceled, filePath } = await dialog.showSaveDialog(ipc_context.getMainWindow(), {
          defaultPath: defaultName,
          filters: [{ name: 'Comic CBZ', extensions: ['cbz'] }],
        });
        if (canceled || !filePath) {
          return { ok: false, cancelled: true };
        }
        outputFile = filePath.trim();
        if (!outputFile.toLowerCase().endsWith('.cbz')) {
          outputFile += '.cbz';
        }
      }
    }

    const sendProgress = (p) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:exportCbzProgress', p);
      }
    };

    const materialized = await ipc_context.materializeIfSession(absoluteMangaDir, normalized);
    if (!materialized.ok) return { ok: false, error: materialized.error };
    const effectiveMangaDir = materialized.materialized ? materialized.dir : absoluteMangaDir;

    try {
      const exportOpts = {
        mode,
        baseSaveDir: base,
        mangaTitle: effectiveName,
        chapters: normalized,
        outputDir,
        outputFile,
        chapterFolderFormat: ipc_context.getChapterFolderSettings(),
        flattenSubfolders: Boolean(payload?.flattenSubfolders),
        rotateDoublePage,
        rotateThreshold,
        onProgress: sendProgress,
        ...(effectiveMangaDir ? { absoluteMangaDir: effectiveMangaDir } : {}),
      };
      if (mode === 'sizeSplit') {
        exportOpts.maxBytes = maxBytes;
      }
      const outputFiles = await exportChaptersToCbz(exportOpts);
      return { ok: true, outputFiles };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    } finally {
      await materialized.cleanup();
    }
  });

  ipcMain.handle('manga:scanImageFolder', async (_event, payload) => {
    try {
      const { scanImageFolder } = require('../lib/export/image/convertFolderImages');
      return await scanImageFolder({
        sourceDir: payload?.sourceDir,
        sourceFiles: payload?.sourceFiles,
        includeSubfolders: Boolean(payload?.includeSubfolders),
        targetFormat: payload?.targetFormat || 'png',
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), images: [], skipped: [] };
    }
  });

  ipcMain.handle('manga:cancelConvertImages', async () => {
    const { requestCancelConvertFolderImages } = require('../lib/export/image/convertFolderImages');
    requestCancelConvertFolderImages();
    return { ok: true };
  });

  ipcMain.handle('manga:convertImages', async (_event, payload) => {
    const {
      convertFolderImages,
      resetConvertFolderImagesCancel,
    } = require('../lib/export/image/convertFolderImages');
    resetConvertFolderImagesCancel();

    const sendProgress = (p) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:convertImagesProgress', p);
      }
    };

    try {
      return await convertFolderImages({
        sourceDir: payload?.sourceDir,
        sourceFiles: payload?.sourceFiles,
        outputDir: payload?.outputDir,
        sameAsSource: Boolean(payload?.sameAsSource),
        targetFormat: payload?.targetFormat,
        includeSubfolders: Boolean(payload?.includeSubfolders),
        moveOriginalsToTrash: Boolean(payload?.moveOriginalsToTrash),
        onProgress: sendProgress,
        trashItem: async (filePath) => {
          await shell.trashItem(path.resolve(filePath));
        },
      });
    } catch (e) {
      const msg = String(e?.message || e);
      const safe = /sharp|Cannot find module/i.test(msg)
        ? 'Image conversion failed (native image module unavailable). Reinstall the app or run ensure:win-native for Windows builds.'
        : msg;
      return {
        ok: false,
        error: safe,
        converted: 0,
        skipped: 0,
        failed: 0,
        cancelled: false,
        errors: [],
        warnings: [],
      };
    }
  });

  ipcMain.handle('manga:renameScan', async (_event, payload) => {
    try {
      const { scanRenameTree } = require('../lib/export/rename');
      return scanRenameTree({
        rootDir: payload?.rootDir,
        includeFolders: payload?.includeFolders !== false,
        includeFiles: payload?.includeFiles !== false,
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), entries: [] };
    }
  });

  ipcMain.handle('manga:renamePreview', async (_event, payload) => {
    try {
      const { scanRenameTree, buildRenamePlan } = require('../lib/export/rename');
      const scan_result = scanRenameTree({
        rootDir: payload?.rootDir,
        sourceFiles: payload?.sourceFiles,
        includeFolders: payload?.includeFolders !== false,
        includeSubfolders: payload?.includeSubfolders !== false,
        // Cleanup (.DS_Store) always needs files even if UI folders-only is on
        includeFiles:
          payload?.category === 'cleanup'
            ? true
            : payload?.includeFiles !== false,
      });
      if (!scan_result.ok) {
        return {
          ok: false,
          error: scan_result.error || 'Scan failed',
          ops: [],
          unchangedCount: 0,
          blocked: [],
        };
      }
      return buildRenamePlan({
        entries: scan_result.entries,
        category: payload?.category,
        action: payload?.action,
        params: payload?.params || {},
      });
    } catch (e) {
      return {
        ok: false,
        error: String(e?.message || e),
        ops: [],
        unchangedCount: 0,
        blocked: [],
      };
    }
  });

  ipcMain.handle('manga:cancelRename', async () => {
    const { requestCancelRename } = require('../lib/export/rename');
    requestCancelRename();
    return { ok: true };
  });

  ipcMain.handle('manga:renameApply', async (_event, payload) => {
    const {
      applyRenamePlan,
      resetRenameCancel,
    } = require('../lib/export/rename');
    resetRenameCancel();

    const send_progress = (progress_payload) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:renameProgress', progress_payload);
      }
    };

    try {
      const raw_ops = Array.isArray(payload?.ops) ? payload.ops : [];
      const valid_ops = raw_ops.filter((op_value) => {
        if (!op_value || typeof op_value.fromAbs !== 'string') return false;
        if (!fs.existsSync(op_value.fromAbs)) return false;
        if (op_value.opType === 'delete') return true;
        return typeof op_value.toAbs === 'string';
      });
      return await applyRenamePlan({
        ops: valid_ops,
        onProgress: send_progress,
        trashItem: async (file_path) => {
          await shell.trashItem(path.resolve(file_path));
        },
      });
    } catch (e) {
      return {
        ok: false,
        error: String(e?.message || e),
        renamed: 0,
        cancelled: false,
        undoOps: [],
      };
    }
  });

  ipcMain.handle('manga:renameUndo', async (_event, payload) => {
    const {
      applyUndoOps,
      resetRenameCancel,
    } = require('../lib/export/rename');
    resetRenameCancel();

    const send_progress = (progress_payload) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:renameProgress', progress_payload);
      }
    };

    try {
      return await applyUndoOps({
        undoOps: Array.isArray(payload?.undoOps) ? payload.undoOps : [],
        onProgress: send_progress,
      });
    } catch (e) {
      return {
        ok: false,
        error: String(e?.message || e),
        renamed: 0,
        cancelled: false,
        undoOps: [],
      };
    }
  });

  ipcMain.handle('manga:combineCbz', async (_event, payload) => {
    const { combineCbz } = require('../lib/export/combineCbz');
    const inputFiles = payload?.inputFiles;

    // Validate inputFiles: must be array with ≥ 2 non-empty strings
    if (
      !Array.isArray(inputFiles) ||
      inputFiles.length < 2 ||
      !inputFiles.every((f) => typeof f === 'string' && f.trim().length > 0)
    ) {
      return { ok: false, error: 'Cần ít nhất 2 file CBZ để nối.' };
    }

    const outputDir = payload?.outputDir
      ? String(payload.outputDir).trim()
      : path.dirname(inputFiles[0]);
    const outputFileName = payload?.outputFileName ? String(payload.outputFileName).trim() : undefined;

    const onProgress = (p) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:combineCbzProgress', p);
      }
    };

    try {
      return await combineCbz({ inputFiles, outputDir, outputFileName, onProgress });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:splitCbz', async (_event, payload) => {
    const { splitCbz } = require('../lib/export/splitCbz');
    const inputFile = String(payload?.inputFile || '').trim();

    // Validate inputFile: must be non-empty string
    if (!inputFile) {
      return { ok: false, error: 'Thiếu đường dẫn file CBZ nguồn.' };
    }

    // Clamp maxMbPerFile to [1, 4096]
    const mb = Number(payload?.maxMbPerFile);
    const maxMbPerFile = Number.isFinite(mb) ? Math.min(4096, Math.max(1, mb)) : 200;
    const maxBytes = Math.floor(maxMbPerFile * 1024 * 1024);

    const outputDir = payload?.outputDir
      ? String(payload.outputDir).trim()
      : path.dirname(inputFile);

    const onProgress = (p) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:splitCbzProgress', p);
      }
    };

    try {
      const outputBaseName = payload?.outputBaseName ? String(payload.outputBaseName).trim() : '';
      return await splitCbz({ inputFile, outputDir, maxBytes, onProgress, ...(outputBaseName ? { outputBaseName } : {}) });
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:exportpdf', async (_event, payload) => {
    const { exportChaptersToPdf } = require('../lib/export/exportPdf');
    const base = String(payload?.baseSaveDir || '').trim();
    const mt = String(payload?.mangaTitle || '').trim();
    const mode = payload?.mode;
    const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
    const absoluteMangaDir = String(payload?.absoluteMangaDir || '').trim();
    const rotateDoublePage = Boolean(payload?.rotateDoublePage);
    const rotateThreshold = payload?.rotateThreshold || 1.4;
    const pdfSeamless = Boolean(payload?.pdfSeamless);
    const openFolderAfter = Boolean(payload?.openFolderAfter);

    // Validate base path or absolute path
    if (!absoluteMangaDir && (!base || !mt)) {
      return { ok: false, error: 'Thiếu đường dẫn hoặc tên truyện.' };
    }

    // Validate mode
    if (mode !== 'sizeSplit' && mode !== 'singleVolume' && mode !== 'chapterSplit') {
      return { ok: false, error: 'Chế độ xuất không hợp lệ.' };
    }

    // Normalize chapters
    const normalized = chapters
      .map((c) => ({
        title: String(c?.title || '').trim(),
        ...(c?.folderBasename ? { folderBasename: String(c.folderBasename).trim() } : {}),
      }))
      .filter((c) => c.title);
    if (!normalized.length) {
      return { ok: false, error: 'Chưa chọn chương nào.' };
    }

    let outputDir;
    let outputFile;
    let maxBytes;
    const outputBaseName = payload?.outputBaseName ? String(payload.outputBaseName).trim() : '';
    const effectiveName = outputBaseName || mt;

    // Determine output paths based on mode
    if (mode === 'sizeSplit' || mode === 'chapterSplit') {
      const mb = Number(payload?.maxMbPerFile);
      const mbClamped = Number.isFinite(mb) ? Math.min(4096, Math.max(1, mb)) : 200;
      maxBytes = Math.floor(mbClamped * 1024 * 1024);

      if (payload?.outputDir) {
        outputDir = String(payload.outputDir).trim();
      } else if (payload?.skipDialog) {
        outputDir = absoluteMangaDir || base;
      } else {
        const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
          properties: ['openDirectory', 'createDirectory'],
        });
        if (canceled || !filePaths?.length) {
          return { ok: false, cancelled: true };
        }
        outputDir = filePaths[0];
      }
    } else {
      // Single volume — needs a file path (without extension)
      if (payload?.outputFile) {
        outputFile = String(payload.outputFile).trim();
      } else if (payload?.outputDir) {
        const dir = String(payload.outputDir).trim();
        outputFile = path.join(dir, `${formatFolderName(effectiveName) || 'manga'}.pdf`);
      } else if (payload?.skipDialog) {
        const fallbackDir = absoluteMangaDir
          ? path.dirname(absoluteMangaDir)   // parent of manga folder, not the folder itself
          : (base || path.join(require('os').homedir(), 'Downloads'));
        outputFile = path.join(fallbackDir, `${formatFolderName(effectiveName) || 'manga'}.pdf`);
      } else {
        const baseName = formatFolderName(effectiveName) || 'manga';
        const { canceled, filePath } = await dialog.showSaveDialog(ipc_context.getMainWindow(), {
          defaultPath: `${baseName}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (canceled || !filePath) {
          return { ok: false, cancelled: true };
        }
        outputFile = filePath.trim().replace(/\.pdf$/i, '');
      }
    }

    const sendProgress = (p) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:exportPdfEpubProgress', p);
      }
    };

    const materialized = await ipc_context.materializeIfSession(absoluteMangaDir, normalized);
    if (!materialized.ok) return { ok: false, error: materialized.error };
    const effectiveMangaDir = materialized.materialized ? materialized.dir : absoluteMangaDir;

    try {
      const exportOpts = {
        mode,
        baseSaveDir: base,
        mangaTitle: effectiveName,
        chapters: normalized,
        outputDir,
        outputFile,
        chapterFolderFormat: ipc_context.getChapterFolderSettings(),
        flattenSubfolders: Boolean(payload?.flattenSubfolders),
        rotateDoublePage,
        rotateThreshold,
        pdfSeamless,
        onProgress: sendProgress,
        ...(effectiveMangaDir ? { absoluteMangaDir: effectiveMangaDir } : {}),
      };
      if (mode === 'sizeSplit') {
        exportOpts.maxBytes = maxBytes;
      }

      const outputFiles = await exportChaptersToPdf(exportOpts);

      if (openFolderAfter && outputFiles.length > 0) {
        const folderToOpen = outputDir || path.dirname(outputFiles[0]);
        await shell.openPath(folderToOpen);
      }

      return { ok: true, outputFiles };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    } finally {
      await materialized.cleanup();
    }
  });

  ipcMain.handle('manga:exportPdfFromDir', async (_event, payload) => {
    const { exportChaptersToPdf } = require('../lib/export/exportPdf');

    const mangaDir = String(payload?.mangaDir || '').trim();
    if (!mangaDir) return { ok: false, error: 'Thiếu đường dẫn thư mục.' };
    // Directory export needs real files on disk. Users should use
    // "Export PDF" in the reader (manga:exportpdf — already session-aware).
    {
      const cbzSession = require('../lib/reader/cbzSessionService');
      const pdfSession = require('../lib/reader/pdfSessionService');
      if (cbzSession.isSessionUri(mangaDir) || pdfSession.isSessionUri(mangaDir)) {
        return {
          ok: false,
          error: 'Để xuất từ file đang đọc, dùng nút Export trong reader.',
        };
      }
    }

    const mode = payload?.mode;
    if (!['singleVolume', 'sizeSplit', 'chapterSplit'].includes(mode)) {
      return { ok: false, error: 'Chế độ xuất không hợp lệ.' };
    }

    const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
    const normalized = chapters
      .map((c) => ({ title: String(c?.title || '').trim() }))
      .filter((c) => c.title);
    if (!normalized.length) return { ok: false, error: 'Chưa chọn chương nào.' };

    // Parse mangaDir → baseSaveDir + mangaTitle
    const sep = mangaDir.includes('/') ? '/' : '\\';
    const parts = mangaDir.replace(/[\/\\]+$/, '').split(sep);
    const mangaTitle = parts[parts.length - 1];

    const outputBaseName = payload?.outputBaseName ? String(payload.outputBaseName).trim() : '';
    const effectiveName = outputBaseName || mangaTitle;

    const rotateDoublePage = Boolean(payload?.rotateDoublePage);
    const pdfSeamless = Boolean(payload?.pdfSeamless);

    let outputDir;
    let outputFile;
    let maxBytes;

    if (mode === 'sizeSplit' || mode === 'chapterSplit') {
      const mb = Number(payload?.maxMbPerFile);
      const mbClamped = Number.isFinite(mb) ? Math.min(4096, Math.max(1, mb)) : 200;
      maxBytes = Math.floor(mbClamped * 1024 * 1024);
      outputDir = payload?.outputDir
        ? String(payload.outputDir).trim()
        : path.dirname(mangaDir);
    } else {
      // singleVolume
      const dir = payload?.outputDir
        ? String(payload.outputDir).trim()
        : path.dirname(mangaDir);
      outputFile = path.join(dir, `${formatFolderName(effectiveName) || 'manga'}.pdf`);
    }

    const sendProgress = (p) => {
      const main_window = ipc_context.getMainWindow();
      if (main_window && !main_window.isDestroyed()) {
        main_window.webContents.send('manga:exportPdfFromDirProgress', p);
      }
    };

    try {
      const exportOpts = {
        mode,
        baseSaveDir: path.dirname(mangaDir),
        mangaTitle: effectiveName,
        chapters: normalized,
        outputDir,
        outputFile,
        chapterFolderFormat: ipc_context.getChapterFolderSettings(),
        rotateDoublePage,
        pdfSeamless,
        onProgress: sendProgress,
        absoluteMangaDir: mangaDir,
      };
      if (mode === 'sizeSplit') exportOpts.maxBytes = maxBytes;

      const outputFiles = await exportChaptersToPdf(exportOpts);

      if (payload?.openFolderAfter && outputFiles.length > 0) {
        const folderToOpen = outputDir || path.dirname(outputFiles[0]);
        await shell.openPath(folderToOpen);
      }

      return { ok: true, outputFiles };
    } catch (e) {
      const errorMsg = String(e?.message || e);

      // Check if error is related to sharp/canvas not being available
      if (errorMsg.includes('sharp') || errorMsg.includes('canvas') || errorMsg.includes('Could not load')) {
        const { isSharpAvailable } = require('../lib/shared/checkSharp');

        let helpMsg = 'Không thể export PDF: thiếu module sharp hoặc canvas.\n\n';

        if (process.platform === 'win32') {
          helpMsg += 'Trên Windows:\n' +
            '1. App sẽ tự động cài sharp khi khởi động lần đầu\n' +
            '2. Nếu vẫn lỗi, restart app và thử lại\n' +
            '3. Hoặc cài thủ công: mở Command Prompt tại thư mục app, chạy:\n' +
            '   npm install --force sharp\n\n';
        } else {
          helpMsg += 'Cài thủ công: npm install --force sharp\n\n';
        }

        helpMsg += 'Sharp available: ' + (isSharpAvailable() ? 'Yes' : 'No') + '\n';
        helpMsg += 'Platform: ' + process.platform + '\n';
        helpMsg += 'Lỗi chi tiết: ' + errorMsg;

        return {
          ok: false,
          error: helpMsg
        };
      }

      return { ok: false, error: errorMsg };
    }
  });

  // ─── Split Double Page ─────────────────────────────────────────────────────

  ipcMain.handle('manga:scanForSplit', async (_event, payload) => {
    try {
      const { scanForSplit } = require('../lib/export/image/splitDoublePage');
      return await scanForSplit({
        sourceDir: String(payload?.sourceDir || '').trim(),
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : undefined,
        minWidth: typeof payload?.minWidth === 'number' ? payload.minWidth : 1200,
        ratioThreshold: typeof payload?.ratioThreshold === 'number' ? payload.ratioThreshold : 1.15,
        includeSubfolders: payload?.includeSubfolders !== false,
        maxDepth: typeof payload?.maxDepth === 'number' ? payload.maxDepth : 5,
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), images: [], stats: {} };
    }
  });

  ipcMain.handle('manga:splitDoublePages', async (_event, payload) => {
    try {
      const { splitDoublePages } = require('../lib/export/image/splitDoublePage');
      const win = ipc_context.getMainWindow();

      const result = await splitDoublePages({
        sourceDir: String(payload?.sourceDir || '').trim(),
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : undefined,
        outputDir: payload?.outputDir ? String(payload.outputDir).trim() : null,
        readingDirection: payload?.readingDirection === 'rtl' ? 'rtl' : 'ltr',
        minWidth: typeof payload?.minWidth === 'number' ? payload.minWidth : 1200,
        ratioThreshold: typeof payload?.ratioThreshold === 'number' ? payload.ratioThreshold : 1.15,
        outputFormat: String(payload?.outputFormat || 'original').toLowerCase(),
        includeSubfolders: payload?.includeSubfolders !== false,
        maxDepth: typeof payload?.maxDepth === 'number' ? payload.maxDepth : 5,
        excludedSplitPaths: Array.isArray(payload?.excludedSplitPaths) ? payload.excludedSplitPaths : [],
        customSplitPositions:
          payload?.customSplitPositions && typeof payload.customSplitPositions === 'object'
            ? payload.customSplitPositions
            : {},
        onProgress: (progress) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('manga:splitProgress', progress);
          }
        },
      });

      return result;
    } catch (e) {
      return { ok: false, split: 0, copied: 0, failed: 0, cancelled: false, errors: [{ error: String(e?.message || e) }] };
    }
  });

  ipcMain.handle('manga:cancelSplitDoublePages', async () => {
    const { requestCancelSplitDoublePages } = require('../lib/export/image/splitDoublePage');
    requestCancelSplitDoublePages();
    return { ok: true };
  });

  // ─── Deskew / Straighten Image ──────────────────────────────────────────────

  ipcMain.handle('manga:scanForDeskew', async (_event, payload) => {
    try {
      const { scanForDeskew } = require('../lib/export/image/deskewImage');
      return await scanForDeskew({
        sourceDir: payload?.sourceDir ? String(payload.sourceDir).trim() : null,
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : null,
        includeSubfolders: payload?.includeSubfolders !== false,
        maxDepth: typeof payload?.maxDepth === 'number' ? payload.maxDepth : 5,
        autoDetect: payload?.autoDetect !== false,
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), images: [], stats: {} };
    }
  });

  ipcMain.handle('manga:deskewImages', async (_event, payload) => {
    try {
      const { deskewBatch } = require('../lib/export/image/deskewImage');
      const win = ipc_context.getMainWindow();

      const result = await deskewBatch({
        sourceDir: payload?.sourceDir ? String(payload.sourceDir).trim() : null,
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : null,
        outputDir: payload?.outputDir ? String(payload.outputDir).trim() : null,
        cropMode: String(payload?.cropMode || 'autoCrop'),
        outputFormat: String(payload?.outputFormat || 'original').toLowerCase(),
        includeSubfolders: payload?.includeSubfolders !== false,
        maxDepth: typeof payload?.maxDepth === 'number' ? payload.maxDepth : 5,
        excludedPaths: Array.isArray(payload?.excludedPaths) ? payload.excludedPaths : [],
        customAngles:
          payload?.customAngles && typeof payload.customAngles === 'object'
            ? payload.customAngles
            : {},
        onProgress: (progress) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('manga:deskewProgress', progress);
          }
        },
      });

      return result;
    } catch (e) {
      return { ok: false, deskewed: 0, skipped: 0, failed: 0, cancelled: false, errors: [{ error: String(e?.message || e) }] };
    }
  });

  ipcMain.handle('manga:cancelDeskew', async () => {
    const { requestCancelDeskew } = require('../lib/export/image/deskewImage');
    requestCancelDeskew();
    return { ok: true };
  });

  ipcMain.handle('manga:previewDeskew', async (_event, payload) => {
    try {
      const { previewDeskew } = require('../lib/export/image/deskewImage');
      return await previewDeskew(
        String(payload?.imagePath || ''),
        typeof payload?.angle === 'number' ? payload.angle : 0,
        String(payload?.cropMode || 'autoCrop')
      );
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // ─── Crop Image ──────────────────────────────────────────────────────────

  ipcMain.handle('manga:scanForCrop', async (_event, payload) => {
    try {
      const { scanForCrop } = require('../lib/export/image/cropImage');
      return await scanForCrop({
        sourceDir: String(payload?.sourceDir || '').trim(),
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : undefined,
        includeSubfolders: payload?.includeSubfolders !== false,
        maxDepth: typeof payload?.maxDepth === 'number' ? payload.maxDepth : 5,
        cropMode: String(payload?.cropMode || 'autoTrim'),
        options: payload?.options && typeof payload.options === 'object' ? payload.options : {},
      });
    } catch (e) {
      return { ok: false, error: String(e?.message || e), images: [], stats: {} };
    }
  });

  ipcMain.handle('manga:cropImages', async (_event, payload) => {
    try {
      const { cropBatch } = require('../lib/export/image/cropImage');
      const win = ipc_context.getMainWindow();

      const result = await cropBatch({
        sourceDir: String(payload?.sourceDir || '').trim(),
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : undefined,
        outputDir: payload?.outputDir ? String(payload.outputDir).trim() : null,
        inPlace: Boolean(payload?.inPlace),
        outputFormat: String(payload?.outputFormat || 'original').toLowerCase(),
        cropSettings: payload?.cropSettings && typeof payload.cropSettings === 'object' ? payload.cropSettings : {},
        customCropBoxes: payload?.customCropBoxes && typeof payload.customCropBoxes === 'object' ? payload.customCropBoxes : {},
        selectedPaths: Array.isArray(payload?.selectedPaths) ? payload.selectedPaths : undefined,
        excludedPaths: Array.isArray(payload?.excludedPaths) ? payload.excludedPaths : [],
        onProgress: (progress) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('manga:cropProgress', progress);
          }
        },
      });

      return result;
    } catch (e) {
      return { ok: false, cropped: 0, skipped: 0, failed: 0, cancelled: false, errors: [{ error: String(e?.message || e) }] };
    }
  });

  ipcMain.handle('manga:cancelCrop', async () => {
    const { requestCancelCrop } = require('../lib/export/image/cropImage');
    requestCancelCrop();
    return { ok: true };
  });

  ipcMain.handle('manga:previewCrop', async (_event, payload) => {
    try {
      const { previewCrop } = require('../lib/export/image/cropImage');
      return await previewCrop(
        String(payload?.imagePath || ''),
        payload?.cropBox && typeof payload.cropBox === 'object' ? payload.cropBox : null
      );
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // --- Ebook Studio & Format Converter IPC ---
  let activeEbookAbortController = null;

  ipcMain.handle('ebook:selectFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Comic & Ebook Files',
          extensions: ['cbz', 'zip', 'pdf', 'epub', 'mobi', 'azw', 'azw3'],
        },
      ],
    });
    return canceled ? [] : (filePaths || []);
  });

  ipcMain.handle('ebook:getKindleGenStatus', async () => {
    const { getKindleCompilerStatus, repairKindleCompilerIfZip } = require('../lib/export/tools/kindleGenManager');
    await repairKindleCompilerIfZip();
    return getKindleCompilerStatus();
  });

  ipcMain.handle('ebook:downloadKindleGen', async () => {
    const { downloadKindleCompiler } = require('../lib/export/tools/kindleGenManager');
    const win = ipc_context.getMainWindow();
    return await downloadKindleCompiler((p) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ebook:toolProgress', p);
      }
    });
  });

  ipcMain.handle('ebook:importKindleGen', async (_event, payload) => {
    let filePath = typeof payload === 'string' ? payload : payload?.filePath;
    if (!filePath) {
      const isWin = process.platform === 'win32';
      const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
        properties: ['openFile'],
        title: 'Chọn file KindleGen hoặc Calibre',
        filters: isWin
          ? [
              { name: 'Công cụ biên dịch hoặc file nén (*.exe, *.zip)', extensions: ['exe', 'zip'] },
              { name: 'Tất cả file (*.*)', extensions: ['*'] },
            ]
          : [
              { name: 'Tất cả file (*.*)', extensions: ['*'] },
            ],
      });
      if (canceled || !filePaths?.length) {
        return { ok: false, canceled: true };
      }
      filePath = filePaths[0];
    }
    const { importKindleCompiler } = require('../lib/export/tools/kindleGenManager');
    return await importKindleCompiler(filePath);
  });

  ipcMain.handle('ebook:convertBook', async (_event, payload) => {
    activeEbookAbortController = new AbortController();
    const { convertSingleBook } = require('../lib/export/converter/formatConverter');
    const win = ipc_context.getMainWindow();
    try {
      const result = await convertSingleBook({
        inputPath: payload?.inputPath,
        targetFormat: payload?.targetFormat,
        outputDir: payload?.outputDir,
        options: payload?.options || {},
        onProgress: (p) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('ebook:convertProgress', p);
          }
        },
        signal: activeEbookAbortController.signal,
      });
      return result;
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    } finally {
      activeEbookAbortController = null;
    }
  });

  ipcMain.handle('ebook:batchConvert', async (_event, payload) => {
    activeEbookAbortController = new AbortController();
    const { batchConvertBooks } = require('../lib/export/converter/formatConverter');
    const win = ipc_context.getMainWindow();
    try {
      const results = await batchConvertBooks({
        inputPaths: payload?.inputPaths || [],
        targetFormat: payload?.targetFormat,
        outputDir: payload?.outputDir,
        options: payload?.options || {},
        onItemProgress: (p) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('ebook:batchProgress', p);
          }
        },
        signal: activeEbookAbortController.signal,
      });
      return { ok: true, results };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    } finally {
      activeEbookAbortController = null;
    }
  });

  ipcMain.handle('ebook:cancel', async () => {
    if (activeEbookAbortController) {
      activeEbookAbortController.abort();
      activeEbookAbortController = null;
    }
    return { ok: true };
  });

function diagnoseInvalidMangaDir(targetDir, loadedError) {
  let entries;
  try {
    entries = fs.readdirSync(targetDir, { withFileTypes: true });
  } catch (err) {
    return `Không thể đọc nội dung thư mục (${err?.message || 'Lỗi truy cập'}).`;
  }

  const visible = entries.filter((e) => !e.name.startsWith('.') && !e.name.startsWith('._'));
  if (visible.length === 0) {
    return 'Thư mục được chọn hoàn toàn trống, không chứa bất kỳ tệp hoặc thư mục nào.';
  }

  const subdirs = visible.filter((e) => e.isDirectory());
  const files = visible.filter((e) => e.isFile());

  const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp']);
  const COMIC_EXT = new Set(['.cbz', '.zip', '.pdf', '.epub', '.mobi', '.cbr', '.rar', '.7z']);

  // Case 1: Multi-manga root folder
  if (loadedError && loadedError.includes('nhiều bộ truyện')) {
    const sample = subdirs.slice(0, 3).map((d) => `"${d.name}"`).join(', ');
    return `Thư mục được chọn là thư mục gốc chứa nhiều bộ truyện khác nhau (${sample}${subdirs.length > 3 ? '...' : ''}). Vui lòng chọn trực tiếp thư mục của một bộ truyện cụ thể.`;
  }

  // Case 2: Only loose files, none are supported images or books
  if (subdirs.length === 0 && files.length > 0) {
    const presentExts = [...new Set(files.map((f) => path.extname(f.name).toLowerCase()))].filter(Boolean);
    const hasAnySupported = files.some(
      (f) => IMAGE_EXT.has(path.extname(f.name).toLowerCase()) || COMIC_EXT.has(path.extname(f.name).toLowerCase())
    );
    if (!hasAnySupported) {
      return `Thư mục chỉ chứa các tệp không được hỗ trợ (${presentExts.slice(0, 4).join(', ')}). Cần có tệp ảnh (.jpg, .png, .webp...) hoặc tệp sách (.cbz, .zip, .epub, .pdf).`;
    }
  }

  // Case 3: Has subdirectories, but inside those subdirectories there are no images
  if (subdirs.length > 0) {
    const { collectChapterImages } = require('../lib/export/exportCbz');
    let anyImageInSub = false;
    for (const d of subdirs) {
      const subPath = path.join(targetDir, d.name);
      const subImages = collectChapterImages(subPath, true);
      if (subImages.length > 0) {
        anyImageInSub = true;
        break;
      }
    }
    if (!anyImageInSub) {
      const sampleNames = subdirs.slice(0, 3).map((d) => `"${d.name}"`).join(', ');
      return `Các thư mục con (${sampleNames}${subdirs.length > 3 ? '...' : ''}) không chứa tệp hình ảnh (.jpg, .png, .webp...). Mỗi thư mục chương cần chứa trực tiếp các tệp ảnh.`;
    }
  }

  return loadedError || 'Không tìm thấy chương hoặc hình ảnh trong thư mục đã chọn.';
}

  ipcMain.handle('ebook:scanMangaDir', async (_event, payload) => {
    const rawDir = typeof payload === 'string' ? payload : (payload?.dir || payload?.path || '');
    const targetDir = String(rawDir || '').trim();
    if (!targetDir || !fs.existsSync(targetDir)) {
      return { ok: false, error: 'Thư mục không tồn tại.', chapters: [] };
    }
    let st;
    try {
      st = fs.statSync(targetDir);
    } catch (e) {
      return { ok: false, error: 'Không đọc được thư mục.', chapters: [] };
    }
    if (!st.isDirectory()) {
      return { ok: false, error: 'Đường dẫn không phải là thư mục.', chapters: [] };
    }

    try {
      const { loadOfflineMangaFromAbsolutePath } = require('../lib/reader/loaders/loadOfflineMangaFromDisk');
      const loaded = loadOfflineMangaFromAbsolutePath(targetDir);
      if (loaded?.ok && Array.isArray(loaded.chapters) && loaded.chapters.length > 0) {
        const mappedChapters = loaded.chapters.map((c) => ({
          title: String(c.title || c.folderBasename || '').trim(),
          folderBasename: String(c.folderBasename || '').trim(),
          url: c.url,
          path: c.folderBasename && c.folderBasename !== '.' ? path.join(targetDir, c.folderBasename) : targetDir,
        }));
        return {
          ok: true,
          manga: loaded.manga || { title: path.basename(targetDir), offlineMangaDirAbsolute: targetDir },
          chapters: mappedChapters,
        };
      }

      // Fallback: check if directory contains comic archive or ebook files
      const COMIC_EXTS = new Set(['.cbz', '.zip', '.pdf', '.epub', '.mobi', '.cbr', '.rar', '.7z']);
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      const bookFiles = entries
        .filter((e) => e.isFile() && COMIC_EXTS.has(path.extname(e.name).toLowerCase()))
        .map((e) => ({
          title: path.basename(e.name, path.extname(e.name)),
          folderBasename: e.name,
          path: path.join(targetDir, e.name),
          isSingleFile: true,
        }));

      if (bookFiles.length > 0) {
        bookFiles.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
        );
        return {
          ok: true,
          manga: { title: path.basename(targetDir), offlineMangaDirAbsolute: targetDir },
          chapters: bookFiles,
        };
      }

      return {
        ok: false,
        error: diagnoseInvalidMangaDir(targetDir, loaded?.error),
        chapters: [],
      };
    } catch (err) {
      return { ok: false, error: String(err?.message || err), chapters: [] };
    }
  });

  ipcMain.handle('ebook:packManga', async (_event, payload) => {
    const { sourceDir, chapters, targetFormat, outputDir, outputBaseName, options } = payload || {};
    const win = ipc_context.getMainWindow();
    const sendProgress = (p) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ebook:packProgress', p);
      }
    };

    const targetFmt = String(targetFormat || 'cbz').toLowerCase();
    const normalizedChapters = Array.isArray(chapters) ? chapters : [];
    if (!normalizedChapters.length) {
      return { ok: false, error: 'Chưa chọn chương nào để đóng gói.' };
    }

    const effectiveOutputDir = String(outputDir || sourceDir || '').trim();
    if (!effectiveOutputDir) {
      return { ok: false, error: 'Thiếu thư mục đích.' };
    }
    if (!fs.existsSync(effectiveOutputDir)) {
      fs.mkdirSync(effectiveOutputDir, { recursive: true });
    }

    const effectiveMangaTitle =
      String(outputBaseName || '').trim() || (sourceDir ? path.basename(sourceDir) : 'Manga');
    const safeTitle = formatFolderName(effectiveMangaTitle) || 'manga';

    const { sortChaptersForExport } = require('../lib/shared/mangaUtils');
    const { prepareChaptersForPackaging } = require('../lib/export/mangaPackHelper');
    const sortedChapters = sortChaptersForExport(normalizedChapters);

    let packWorkRoot = null;
    try {
      const prepRes = await prepareChaptersForPackaging({
        chapters: sortedChapters,
        sourceDir,
        onProgress: (p) => sendProgress(p),
      });
      packWorkRoot = prepRes.tempRoot;
      const { preparedChapters, allImages, effectiveMangaDir } = prepRes;

      if (!allImages.length) {
        return { ok: false, error: 'Không tìm thấy hình ảnh nào trong các chương đã chọn.' };
      }

      if (targetFmt === 'cbz') {
        const { exportChaptersToCbz } = require('../lib/export/exportCbz');
        const mode = options?.packMode === 'sizeSplit' ? 'sizeSplit' : 'singleVolume';
        const maxMb = Number(options?.maxMbPerFile || 200);
        const maxBytes = Math.floor(Math.max(1, maxMb) * 1024 * 1024);
        const outputFile = path.join(effectiveOutputDir, `${safeTitle}.cbz`);

        const resultFiles = await exportChaptersToCbz({
          mode,
          baseSaveDir: effectiveMangaDir ? path.dirname(effectiveMangaDir) : effectiveOutputDir,
          mangaTitle: effectiveMangaTitle,
          chapters: preparedChapters.map((c) => ({
            title: c.title,
            folderBasename: c.folderBasename,
          })),
          outputDir: effectiveOutputDir,
          outputFile: mode === 'singleVolume' ? outputFile : undefined,
          maxBytes,
          chapterFolderFormat: ipc_context?.getChapterFolderSettings
            ? ipc_context.getChapterFolderSettings()
            : undefined,
          rotateDoublePage: Boolean(options?.rotateDoublePage),
          absoluteMangaDir: effectiveMangaDir,
          onProgress: (p) =>
            sendProgress({
              ...p,
              message: `Đang đóng gói CBZ: ${p.label || ''} (${p.done}/${p.total})`,
            }),
        });
        return {
          ok: true,
          files: resultFiles,
          message: `Đóng gói thành công ${resultFiles.length} file CBZ.`,
        };
      }

      if (targetFmt === 'pdf') {
        const { exportChaptersToPdf } = require('../lib/export/exportPdf');
        const mode = options?.packMode === 'sizeSplit' ? 'sizeSplit' : 'singleVolume';
        const maxMb = Number(options?.maxMbPerFile || 200);
        const maxBytes = Math.floor(Math.max(1, maxMb) * 1024 * 1024);
        const outputFile = path.join(effectiveOutputDir, `${safeTitle}.pdf`);

        const resultFiles = await exportChaptersToPdf({
          mode,
          baseSaveDir: effectiveMangaDir ? path.dirname(effectiveMangaDir) : effectiveOutputDir,
          mangaTitle: effectiveMangaTitle,
          chapters: preparedChapters.map((c) => ({
            title: c.title,
            folderBasename: c.folderBasename,
          })),
          outputDir: effectiveOutputDir,
          outputFile: mode === 'singleVolume' ? outputFile : undefined,
          maxBytes,
          chapterFolderFormat: ipc_context?.getChapterFolderSettings
            ? ipc_context.getChapterFolderSettings()
            : undefined,
          rotateDoublePage: Boolean(options?.rotateDoublePage),
          pdfSeamless: Boolean(options?.pdfSeamless),
          absoluteMangaDir: effectiveMangaDir,
          onProgress: (p) =>
            sendProgress({
              ...p,
              message: `Đang xuất PDF: ${p.label || ''} (${p.done}/${p.total})`,
            }),
        });
        return {
          ok: true,
          files: resultFiles,
          message: `Đóng gói thành công ${resultFiles.length} file PDF.`,
        };
      }

      if (targetFmt === 'epub') {
        const { exportEpubCore } = require('../lib/export/epub/exportEpubCore');
        const { processRotateDoublePage } = require('../lib/export/image/rotateDoublePage');

        const rotateDoublePage = Boolean(options?.rotateDoublePage);
        const { processedItems, tempDir } = await processRotateDoublePage(
          allImages.map((img) => ({ full: img.path, path: img.path, title: img.title })),
          rotateDoublePage,
          1.2,
          (p) => sendProgress({ ...p, message: `Đang xử lý xoay trang đôi EPUB (${p.done}/${p.total})...` })
        );

        try {
          const packMode = options?.packMode === 'sizeSplit' ? 'sizeSplit' : 'singleVolume';
          const res = await exportEpubCore({
            images: processedItems.map((img) => ({ path: img.path || img.full, title: img.title })),
            mangaTitle: effectiveMangaTitle,
            outputDir: effectiveOutputDir,
            packMode,
            maxMbPerFile: options?.maxMbPerFile || 200,
            metadata: { author: options?.author || '' },
            onProgress: (p) => sendProgress({ ...p, message: 'Đang tạo EPUB...' }),
          });
          if (res.ok) {
            return {
              ok: true,
              files: res.outputFiles,
              message: `Đóng gói thành công ${res.outputFiles.length} file EPUB.`,
            };
          }
          return res;
        } finally {
          if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
          }
        }
      }

      if (targetFmt === 'mobi') {
        const { exportMobiCore } = require('../lib/export/mobi/exportMobiCore');
        const { processRotateDoublePage } = require('../lib/export/image/rotateDoublePage');

        const rotateDoublePage = Boolean(options?.rotateDoublePage);
        const { processedItems, tempDir } = await processRotateDoublePage(
          allImages.map((img) => ({ full: img.path, path: img.path, title: img.title })),
          rotateDoublePage,
          1.2,
          (p) => sendProgress({ ...p, message: `Đang xử lý xoay trang đôi MOBI (${p.done}/${p.total})...` })
        );

        try {
          const packMode = options?.packMode === 'sizeSplit' ? 'sizeSplit' : 'singleVolume';
          const res = await exportMobiCore({
            images: processedItems.map((img) => ({ path: img.path || img.full, title: img.title })),
            mangaTitle: effectiveMangaTitle,
            outputDir: effectiveOutputDir,
            packMode,
            maxMbPerFile: options?.maxMbPerFile || 200,
            onProgress: (p) => sendProgress(p),
          });
          if (res.ok) {
            return {
              ok: true,
              files: res.outputFiles,
              message: `Đóng gói thành công ${res.outputFiles.length} file MOBI.`,
            };
          }
          return res;
        } finally {
          if (tempDir) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
          }
        }
      }

      return { ok: false, error: `Định dạng không hỗ trợ: ${targetFmt}` };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    } finally {
      if (packWorkRoot) {
        try { fs.rmSync(packWorkRoot, { recursive: true, force: true }); } catch {}
      }
    }
  });
}

module.exports = { registerExportIpc };
