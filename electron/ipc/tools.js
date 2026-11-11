const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, app } = require('electron');

function registerToolsIpc(ipc_context) {
  ipcMain.handle('duplicate:selectFolders', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
      properties: ['openDirectory', 'multiSelections'],
    });
    if (canceled || !filePaths?.length) return { ok: true, folders: [] };
    return { ok: true, folders: filePaths };
  });

  ipcMain.handle('duplicate:listFiles', async (_event, payload) => {
    const { listImportedImages } = require('../lib/export/image/duplicateImageScanner');
    try {
      return await listImportedImages(payload);
    } catch (e) {
      return { ok: false, error: String(e?.message || e), files: [], total: 0 };
    }
  });

  ipcMain.handle('duplicate:scan', async (event, payload) => {
    const { scanDuplicateImages } = require('../lib/export/image/duplicateImageScanner');
    const roots = payload?.roots;
    const recursive = payload?.recursive;
    const maxDepth = payload?.maxDepth;
    const files = payload?.files;
    try {
      const onProgress = (processed, total, currentFile) => {
        event.sender.send('duplicate:scan-progress', { processed, total, currentFile });
      };
      return await scanDuplicateImages(roots, { recursive, maxDepth, files }, onProgress);
    } catch (e) {
      return { ok: false, error: String(e?.message || e), buckets: [] };
    }
  });

  ipcMain.handle('duplicate:cancel-scan', async () => {
    const { cancelScan } = require('../lib/export/image/duplicateImageScanner');
    cancelScan();
    return { ok: true };
  });

  const DUPLICATE_PREVIEW_MAX_BYTES = 200 * 1024 * 1024; // Up to 200MB images

  ipcMain.handle('duplicate:readPreview', async (_event, { filePath }) => {
    const fp = path.resolve(String(filePath || '').trim());
    if (!fs.existsSync(fp)) return { ok: false, error: 'File not found.' };
    const st = fs.statSync(fp);
    if (!st.isFile()) return { ok: false, error: 'Not a file.' };
    if (st.size > DUPLICATE_PREVIEW_MAX_BYTES) {
      return { ok: false, error: 'File too large for preview.' };
    }

    // For large images (> 5MB), generate a lightweight thumbnail using sharp to prevent IPC/memory bottleneck
    if (st.size > 5 * 1024 * 1024) {
      try {
        const sharp = require('sharp');
        const thumbBuf = await sharp(fp)
          .resize({ width: 1400, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        return { ok: true, dataUrl: `data:image/webp;base64,${thumbBuf.toString('base64')}` };
      } catch {
        // Fall back to direct file read if sharp fails
      }
    }

    const ext = path.extname(fp).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.avif'
              ? 'image/avif'
              : 'image/jpeg';
    try {
      const buf = fs.readFileSync(fp);
      const b64 = buf.toString('base64');
      return { ok: true, dataUrl: `data:${mime};base64,${b64}` };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('duplicate:deleteFiles', async (_event, { allowedRoots, paths }) => {
    const { deleteFilesUnderRoots } = require('../lib/export/image/duplicateImageScanner');
    const roots = Array.isArray(allowedRoots) ? allowedRoots : [];
    const list = Array.isArray(paths) ? paths : [];
    try {
      return { ok: true, ...(await deleteFilesUnderRoots(list, roots)) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), deleted: [], errors: [] };
    }
  });

  ipcMain.handle('fs:getFileSize', async (_e, filePath) => {
    try {
      const st = fs.statSync(String(filePath || '').trim());
      return { ok: true, size: st.size };
    } catch (e) {
      return { ok: false, size: 0 };
    }
  });

  ipcMain.handle('fs:getFolderSize', async (_event, dir) => {
    if (typeof dir !== 'string' || !dir) {
      return { bytes: 0, files: 0, error: 'invalid-path' };
    }
    try {
      const stat = await fs.promises.stat(dir);
      if (!stat.isDirectory()) {
        return { bytes: 0, files: 0, error: 'not-a-directory' };
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        return { bytes: 0, files: 0, error: 'not-found' };
      }
      return { bytes: 0, files: 0, error: String(e?.message || e) };
    }
    let bytes = 0;
    let files = 0;
    async function walk(current) {
      let entries;
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const p = path.join(current, entry.name);
        try {
          if (entry.isDirectory()) {
            await walk(p);
          } else if (entry.isFile()) {
            const s = await fs.promises.stat(p);
            bytes += s.size;
            files += 1;
          }
        } catch {
          // skip unreadable entries
        }
      }
    }
    await walk(dir);
    return { bytes, files };
  });

  let prevCpuTimes = null;

  ipcMain.handle('system:getMetrics', async () => {
    try {
      const os = require('os');
      const totalMemBytes = os.totalmem();
      let appMemBytes = 0;
      let appCpuPercent = 0;

      // 1. App Process metrics from Electron
      if (typeof app?.getAppMetrics === 'function') {
        const metrics = app.getAppMetrics();
        for (const m of metrics) {
          if (m.memory?.workingSetSize) {
            appMemBytes += m.memory.workingSetSize * 1024;
          }
          if (m.cpu?.percentCPUUsage) {
            appCpuPercent += m.cpu.percentCPUUsage;
          }
        }
      }

      if (!appMemBytes) {
        try {
          appMemBytes = process.memoryUsage().rss;
        } catch {}
      }

      // 2. System CPU calculation
      let systemCpuPercent = 0;
      const cpus = os.cpus();
      if (cpus && cpus.length > 0) {
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
          for (const type in cpu.times) {
            total += cpu.times[type];
          }
          idle += cpu.times.idle;
        }
        if (prevCpuTimes) {
          const idleDiff = idle - prevCpuTimes.idle;
          const totalDiff = total - prevCpuTimes.total;
          if (totalDiff > 0) {
            systemCpuPercent = Math.max(0, Math.min(100, Math.round((1 - idleDiff / totalDiff) * 100)));
          }
        }
        prevCpuTimes = { idle, total };
      }

      const effectiveCpu = Math.max(Math.round(appCpuPercent), systemCpuPercent);

      const ramUsedGB = (appMemBytes / (1024 ** 3)).toFixed(1);
      const ramTotalGB = (totalMemBytes / (1024 ** 3)).toFixed(1);
      const ramPercent = Math.min(100, Math.max(0, Math.round((appMemBytes / totalMemBytes) * 100)));
      const cpuPercent = Math.min(100, Math.max(0, effectiveCpu));

      return {
        ok: true,
        ramUsedGB: parseFloat(ramUsedGB) || 0,
        ramTotalGB: parseFloat(ramTotalGB) || 0,
        ramPercent,
        cpuPercent,
      };
    } catch (e) {
      return {
        ok: false,
        ramUsedGB: 0,
        ramTotalGB: 0,
        ramPercent: 0,
        cpuPercent: 0,
      };
    }
  });

  // ── Upscale IPC handlers ──
  let _upscaleEngine = null;

  function getUpscaleResourcesPath() {
    if (app.isPackaged) {
      return process.resourcesPath;
    }
    const devResources = path.join(app.getAppPath(), 'resources');
    if (fs.existsSync(devResources)) {
      return devResources;
    }
    return app.getAppPath();
  }

  ipcMain.handle('upscale:listModels', async () => {
    const { getAllModels, getAllEngines } = require('../lib/upscale/engineConfigs');
    return { ok: true, engines: getAllEngines(), models: getAllModels() };
  });

  ipcMain.handle('upscale:checkBinary', async (_event, engineId) => {
    const { BinaryManager } = require('../lib/upscale/BinaryManager');
    const resourcesPath = getUpscaleResourcesPath();
    const userDataPath = app.getPath('userData');
    const bm = new BinaryManager(resourcesPath, userDataPath);
    const available = bm.isBinaryAvailable(engineId);
    const binaryPath = bm.resolveBinaryPath(engineId);
    return { ok: true, available, binaryPath };
  });

  ipcMain.handle('upscale:getGpuList', async () => {
    const { UpscaleEngine } = require('../lib/upscale/UpscaleEngine');
    const gpus = UpscaleEngine.discoveredGpus || [];
    return { ok: true, gpus };
  });

  ipcMain.handle('upscale:getHardwareInfo', async () => {
    const { UpscaleEngine } = require('../lib/upscale/UpscaleEngine');
    const resourcesPath = getUpscaleResourcesPath();
    const userDataPath = app.getPath('userData');
    const engine = new UpscaleEngine(resourcesPath, userDataPath);
    return { ok: true, info: engine.getHardwareAccelerationInfo() };
  });

  ipcMain.handle('upscale:start', async (event, payload) => {
    const { UpscaleEngine } = require('../lib/upscale/UpscaleEngine');
    const resourcesPath = getUpscaleResourcesPath();
    const userDataPath = app.getPath('userData');

    const {
      images = [],
      engineId = 'waifu2x',
      modelId = 'cunet',
      scale = 2,
      denoise = -1,
      tileSize = 0,
      outputFormat = 'original',
      skipExisting = false,
      gpuId = 'auto',
      engineMode = 'auto',
      compress = null,
    } = payload || {};

    // Cancel any previous run
    if (_upscaleEngine) {
      _upscaleEngine.cancel();
    }

    _upscaleEngine = new UpscaleEngine(resourcesPath, userDataPath);

    try {
      const result = await _upscaleEngine.upscaleBatch({
        images,
        engineId,
        modelId,
        scale,
        denoise,
        tileSize,
        gpuId,
        engineMode,
        outputFormat,
        skipExisting,
        compress,
        onProgress: (data) => {
          try {
            event.sender.send('upscale:progress', data);
          } catch {
            // Window may be closed
          }
        },
      });
      _upscaleEngine = null;
      return { ok: true, ...result };
    } catch (e) {
      _upscaleEngine = null;
      return { ok: false, error: String(e?.message || e), completed: 0, failed: 0, total: 0 };
    }
  });

  ipcMain.handle('upscale:cancel', async () => {
    if (_upscaleEngine) {
      _upscaleEngine.cancel();
      return { ok: true };
    }
    return { ok: true, message: 'No active upscale process' };
  });

  ipcMain.handle('upscale:downloadEngine', async (event, engineId) => {
    try {
      const { downloadEngine, getPlatformDir } = require('../lib/upscale/BinaryDownloader');
      const { BinaryManager } = require('../lib/upscale/BinaryManager');
      const resourcesPath = getUpscaleResourcesPath();
      const userDataPath = app.getPath('userData');
      const platformDir = getPlatformDir();

      // In packaged app, process.resourcesPath is read-only, so install into userData/upscale
      // In dev mode, install into resources/upscale (or userData if dev resources isn't writable)
      let destRoot = path.join(userDataPath, 'upscale');
      if (!app.isPackaged) {
        const devResources = path.join(app.getAppPath(), 'resources', 'upscale');
        if (fs.existsSync(devResources)) {
          destRoot = devResources;
        }
      }

      const res = await downloadEngine(engineId, {
        platform: platformDir,
        destRoot,
        force: true,
        onLog: (msg) => console.log(`[IPC upscale:downloadEngine] ${msg}`),
      });

      if (!res.ok) {
        return { ok: false, error: res.error || 'Download failed.' };
      }

      // Re-check if binary is now available
      const bm = new BinaryManager(resourcesPath, userDataPath);
      const available = bm.isBinaryAvailable(engineId);
      const binaryPath = bm.resolveBinaryPath(engineId);
      return { ok: true, available, binaryPath };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // ── Compress IPC handlers ──

  ipcMain.handle('compress:scan', async (_event, payload) => {
    const { scanCompressibleImages } = require('../lib/export/image/compressImage');
    try {
      return await scanCompressibleImages(payload || {});
    } catch (e) {
      return { ok: false, error: String(e?.message || e), images: [] };
    }
  });

  ipcMain.handle('compress:start', async (event, payload) => {
    const {
      batchCompressImages,
      resetCompressCancel,
    } = require('../lib/export/image/compressImage');
    resetCompressCancel();

    const {
      images = [],
      quality = 90,
      resizePercent = 100,
      sourceDir = '',
      inPlace = false,
      outputDir = '',
    } = payload || {};

    const sendProgress = (data) => {
      try {
        event.sender.send('compress:progress', data);
      } catch {
        // Window may be closed
      }
    };

    try {
      const result = await batchCompressImages({
        images,
        quality,
        resizePercent,
        sourceDir,
        inPlace,
        outputDir,
        onProgress: sendProgress,
      });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), completed: 0, failed: 0, total: 0 };
    }
  });

  ipcMain.handle('compress:cancel', async () => {
    const { requestCancelCompress } = require('../lib/export/image/compressImage');
    requestCancelCompress();
    return { ok: true };
  });
}

module.exports = { registerToolsIpc };
