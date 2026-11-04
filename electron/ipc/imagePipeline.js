'use strict';

const fs = require('fs');
const { ipcMain, dialog } = require('electron');

function sanitizeFileName(name) {
  return String(name || 'template').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'template';
}

function registerImagePipelineIpc(ipc_context) {
  let activeJob = null;

  const send = (payload) => {
    const win = ipc_context.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('imagePipeline:progress', payload);
  };

  const startJob = () => {
    if (activeJob) activeJob.cancelled = true;
    const job = { cancelled: false };
    activeJob = job;
    return job;
  };

  const endJob = (job) => {
    if (activeJob === job) activeJob = null;
  };

  const errorResult = (e, extra = {}) => ({ ok: false, error: String(e?.message || e), ...extra });

  ipcMain.handle('imagePipeline:scan', async (_event, payload) => {
    try {
      const { scanPipelineImages } = require('../lib/export/image/pipeline/scanImages');
      return await scanPipelineImages({
        sourceDir: String(payload?.sourceDir || '').trim(),
        sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : [],
        includeSubfolders: payload?.includeSubfolders !== false,
      });
    } catch (e) {
      return errorResult(e, { images: [] });
    }
  });

  ipcMain.handle('imagePipeline:analyze', async (_event, payload) => {
    const job = startJob();
    try {
      const { analyzePipeline } = require('../lib/export/image/pipeline/analyzePipeline');
      return await analyzePipeline({
        files: Array.isArray(payload?.files) ? payload.files : [],
        actions: Array.isArray(payload?.actions) ? payload.actions : [],
        overrides: payload?.overrides && typeof payload.overrides === 'object' ? payload.overrides : {},
        onProgress: send,
        isCancelled: () => job.cancelled,
      });
    } catch (e) {
      return errorResult(e, { results: [] });
    } finally {
      endJob(job);
    }
  });

  ipcMain.handle('imagePipeline:preview', async (_event, payload) => {
    try {
      const { previewPipeline } = require('../lib/export/image/pipeline/previewPipeline');
      return await previewPipeline({
        filePath: String(payload?.filePath || ''),
        actions: Array.isArray(payload?.actions) ? payload.actions : [],
        fileOverrides: payload?.fileOverrides && typeof payload.fileOverrides === 'object' ? payload.fileOverrides : {},
        upToStep: Number.isInteger(payload?.upToStep) ? payload.upToStep : null,
        mode: ['stepInput', 'stepOutput', 'final'].includes(payload?.mode) ? payload.mode : 'final',
        frameIndex: Number.isInteger(payload?.frameIndex) ? payload.frameIndex : null,
        output: payload?.output && typeof payload.output === 'object' ? payload.output : {},
      });
    } catch (e) {
      return errorResult(e);
    }
  });

  ipcMain.handle('imagePipeline:run', async (_event, payload) => {
    const job = startJob();
    try {
      const { runPipeline } = require('../lib/export/image/pipeline/runPipeline');
      return await runPipeline({
        files: Array.isArray(payload?.files) ? payload.files : [],
        actions: Array.isArray(payload?.actions) ? payload.actions : [],
        overrides: payload?.overrides && typeof payload.overrides === 'object' ? payload.overrides : {},
        output: payload?.output && typeof payload.output === 'object' ? payload.output : {},
        concurrency: payload?.concurrency,
        onProgress: send,
        isCancelled: () => job.cancelled,
      });
    } catch (e) {
      return errorResult(e, { done: 0, failed: [], outputs: [], cancelled: false });
    } finally {
      endJob(job);
    }
  });

  ipcMain.handle('imagePipeline:cancel', async () => {
    if (activeJob) activeJob.cancelled = true;
    return { ok: true };
  });

  ipcMain.handle('imagePipeline:exportTemplate', async (_event, payload) => {
    try {
      const template = payload?.template;
      if (!template || typeof template !== 'object') return { ok: false, error: 'INVALID_TEMPLATE' };
      const { canceled, filePath } = await dialog.showSaveDialog(ipc_context.getMainWindow(), {
        defaultPath: `${sanitizeFileName(template.name)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      await fs.promises.writeFile(filePath, JSON.stringify(template, null, 2), 'utf-8');
      return { ok: true, filePath };
    } catch (e) {
      return errorResult(e);
    }
  });

  ipcMain.handle('imagePipeline:importTemplate', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(ipc_context.getMainWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePaths?.length) return { ok: false, canceled: true };
      const text = await fs.promises.readFile(filePaths[0], 'utf-8');
      return { ok: true, text };
    } catch (e) {
      return errorResult(e);
    }
  });
}

module.exports = { registerImagePipelineIpc };
