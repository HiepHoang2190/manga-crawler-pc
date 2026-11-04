/**
 * IPC handlers cho Manga Translation Pipeline.
 *
 * Kết nối frontend UI với TranslatePipeline backend.
 */
const { ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const logger = require('../lib/shared/logger');
const { ModelManager } = require('../lib/translate/ModelManager');
const TranslatePipeline = require('../lib/translate/TranslatePipeline');
const { loadSettings, saveSettings, resetSettings, SOURCE_LANGUAGES, TARGET_LANGUAGES } = require('../lib/translate/TranslateSettings');
const { PROVIDER_INFO, createProvider, formatProviderError } = require('../lib/translate/providers/index');
const { fetchAvailableModels } = require('../lib/translate/services/modelDiscoveryService');
const StudioSession = require('../lib/translate/StudioSession');
const AutoProcessor = require('../lib/translate/AutoProcessor');

let pipeline = null;
let modelManager = null;
let autoProcessor = null;

function getModelManager() {
  if (!modelManager) modelManager = new ModelManager();
  return modelManager;
}

function getPipeline() {
  if (!pipeline) pipeline = new TranslatePipeline();
  return pipeline;
}

function registerTranslateIpc(ipc_context) {
  const getMainWindow = () => {
    if (typeof ipc_context?.getMainWindow === 'function') {
      return ipc_context.getMainWindow();
    }
    return ipc_context?.mainWindow || null;
  };

  const getWebContents = (sender) => {
    if (sender && !sender.isDestroyed()) return sender;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) return win.webContents;
    return null;
  };
  // --- Settings ---
  ipcMain.handle('translate:getSettings', () => {
    return loadSettings();
  });

  ipcMain.handle('translate:saveSettings', (_event, settings) => {
    saveSettings(settings);
    // Dispose pipeline to pick up new settings
    if (pipeline) {
      pipeline.dispose().catch(() => {});
      pipeline = null;
    }
    return { success: true };
  });

  ipcMain.handle('translate:resetSettings', (_event, { keepApiKeys = true } = {}) => {
    try {
      const reset = resetSettings(keepApiKeys);
      if (pipeline) {
        pipeline.dispose().catch(() => {});
        pipeline = null;
      }
      return { success: true, settings: reset };
    } catch (err) {
      logger.error('[TranslateIPC] Failed to reset settings:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('translate:getLanguages', () => {
    return { source: SOURCE_LANGUAGES, target: TARGET_LANGUAGES };
  });

  // --- Providers ---
  ipcMain.handle('translate:getProviders', () => {
    return PROVIDER_INFO;
  });

  ipcMain.handle('translate:testProvider', async (_event, { provider, apiKey, endpoint, model }) => {
    const startTime = Date.now();
    try {
      const settings = loadSettings();
      // Temporary override for testing
      const testSettings = {
        ...settings,
        activeModel: model || settings.activeModel,
        providers: {
          ...(settings.providers || {}),
          [provider]: {
            type: settings.providers?.[provider]?.type || (provider === 'ollama' || provider === 'lmstudio' ? 'local' : (provider === 'gemini' ? 'gemini' : (provider === 'claude' ? 'claude' : (provider === 'deepl' ? 'deepl' : (provider === 'openai' ? 'openai' : 'openai_compatible'))))),
            ...(settings.providers?.[provider] || {}),
            id: provider,
            credential: apiKey || settings.providers?.[provider]?.credential || (provider === 'lmstudio' ? 'lm-studio' : (provider === 'ollama' ? 'ollama' : '')),
            baseUrl: endpoint || settings.providers?.[provider]?.baseUrl || (provider === 'lmstudio' ? 'http://localhost:1234/v1' : (provider === 'ollama' ? 'http://localhost:11434/v1' : '')),
            defaultModel: model || settings.providers?.[provider]?.defaultModel || (provider === 'lmstudio' ? 'local-model' : (provider === 'ollama' ? 'qwen2.5:7b' : '')),
          },
        },
        apiKeys: {
          ...settings.apiKeys,
          [provider]: apiKey || settings.apiKeys?.[provider],
          ...(provider === 'openai_compatible' || provider === 'ollama' || provider === 'lmstudio' ? {
            openaiCompatible: {
              endpoint: endpoint || settings.apiKeys?.openaiCompatible?.endpoint || (provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434/v1'),
              key: apiKey || settings.apiKeys?.openaiCompatible?.key || (provider === 'lmstudio' ? 'lm-studio' : 'ollama'),
              model: model || settings.apiKeys?.openaiCompatible?.model || (provider === 'lmstudio' ? 'local-model' : 'qwen2.5:7b'),
            },
          } : {}),
        },
      };
      const providerInstance = createProvider(provider, testSettings);
      const res = await providerInstance.testConnection();
      return {
        ...res,
        error: res.error ? (typeof res.error === 'string' ? res.error : formatProviderError(res.error, { model })) : undefined,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: formatProviderError(err, { model }),
        latencyMs: Date.now() - startTime,
      };
    }
  });

  ipcMain.handle('translate:testProviderConnection', async (_event, config = {}) => {
    const startTime = Date.now();
    const { id, type, credential, baseUrl } = config;
    const model = config.defaultModel || config.model || '';
    try {
      const testId = id || 'test_provider';
      const testSettings = {
        activeModel: model,
        providers: {
          [testId]: {
            id: testId,
            type: type || 'openai_compatible',
            credential: credential || '',
            baseUrl: baseUrl || '',
            defaultModel: model,
            model: model,
          },
        },
      };
      const providerInstance = createProvider(testId, testSettings);
      const res = await providerInstance.testConnection();
      return {
        ...res,
        error: res.error ? (typeof res.error === 'string' ? res.error : formatProviderError(res.error, { model })) : undefined,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: formatProviderError(err, { model }),
        latencyMs: Date.now() - startTime,
      };
    }
  });

  ipcMain.handle('translate:fetchAvailableModels', async (_event, config = {}) => {
    return await fetchAvailableModels(config);
  });

  // --- Local LLM Engine Discovery (Ollama, LM Studio, Koharu Cache) ---
  ipcMain.handle('translate:detectLocalEngines', async (_event, options = {}) => {
    const axios = require('axios');
    const customEndpoint = options?.endpoint || options?.baseUrl;
    const results = {
      ollama: { online: false, endpoint: 'http://localhost:11434/v1', models: [] },
      lmstudio: { online: false, endpoint: 'http://localhost:1234/v1', models: [] },
      custom: { online: false, endpoint: customEndpoint || '', models: [] },
      detectedModels: [],
      koharuModels: [],
      activeEngine: null,
    };

    // 1. Check Ollama tags (http://localhost:11434/api/tags)
    try {
      const res = await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
      if (res.status === 200 && Array.isArray(res.data?.models)) {
        results.ollama.online = true;
        results.ollama.models = res.data.models.map((m) => ({
          id: m.name,
          name: m.name,
          size: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB` : '',
          engine: 'Ollama',
        }));
        results.activeEngine = 'ollama';
      }
    } catch {
      // Fallback: check Ollama v1/models
      try {
        const resV1 = await axios.get('http://localhost:11434/v1/models', { timeout: 2000 });
        if (resV1.status === 200 && Array.isArray(resV1.data?.data)) {
          results.ollama.online = true;
          results.ollama.models = resV1.data.data.map((m) => ({
            id: m.id,
            name: m.id,
            engine: 'Ollama',
          }));
          results.activeEngine = 'ollama';
        }
      } catch {}
    }

    // 2. Check LM Studio (http://localhost:1234/v1/models)
    try {
      const resLm = await axios.get('http://localhost:1234/v1/models', { timeout: 2000 });
      if (resLm.status === 200 && Array.isArray(resLm.data?.data)) {
        results.lmstudio.online = true;
        results.lmstudio.models = resLm.data.data.map((m) => ({
          id: m.id,
          name: m.id,
          size: 'LM Studio',
          engine: 'LM Studio',
        }));
        if (!results.activeEngine) results.activeEngine = 'lmstudio';
      }
    } catch {}

    // 3. Check custom endpoint if specified (and not already 11434/1234)
    if (customEndpoint && typeof customEndpoint === 'string') {
      const epTrimmed = customEndpoint.trim().replace(/\/+$/, '');
      if (!epTrimmed.includes('11434') && !epTrimmed.includes('1234')) {
        try {
          const targetUrl = epTrimmed.endsWith('/v1') ? `${epTrimmed}/models` : `${epTrimmed}/v1/models`;
          const resCust = await axios.get(targetUrl, { timeout: 2000 });
          if (resCust.status === 200 && Array.isArray(resCust.data?.data)) {
            results.custom.online = true;
            results.custom.models = resCust.data.data.map((m) => ({
              id: m.id,
              name: m.id,
              size: 'Custom Local',
              engine: 'Custom Local',
            }));
            if (!results.activeEngine) results.activeEngine = 'custom';
          }
        } catch {}
      }
    }

    // Combine detected models into unified map (chỉ chứa các model thực sự do engine phục vụ)
    const combined = new Map();
    for (const m of results.ollama.models) {
      combined.set(m.id, { ...m, engine: 'Ollama', endpoint: 'http://localhost:11434/v1' });
    }
    for (const m of results.lmstudio.models) {
      if (!combined.has(m.id)) {
        combined.set(m.id, { ...m, engine: 'LM Studio', endpoint: 'http://localhost:1234/v1' });
      }
    }
    for (const m of results.custom.models) {
      if (!combined.has(m.id)) {
        combined.set(m.id, { ...m, engine: 'Custom Local', endpoint: customEndpoint });
      }
    }

    results.detectedModels = Array.from(combined.values());
    return results;
  });

  // --- Ollama Pull & Stream Progress ---
  const activeOllamaPulls = new Map();

  ipcMain.handle('translate:pullOllamaModel', async (_event, { modelName }) => {
    if (!modelName || typeof modelName !== 'string') {
      return { success: false, error: 'Tên model không hợp lệ' };
    }
    const trimmed = modelName.trim();
    const wc = getWebContents(_event?.sender);

    try {
      const axios = require('axios');
      const abortController = new AbortController();
      activeOllamaPulls.set(trimmed, abortController);

      const response = await axios({
        method: 'POST',
        url: 'http://localhost:11434/api/pull',
        data: { name: trimmed, stream: true },
        responseType: 'stream',
        signal: abortController.signal,
        timeout: 0,
      });

      let buffer = '';
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // giữ phần chưa kết thúc dòng

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          try {
            const data = JSON.parse(trimmedLine);
            const percent = (data.total && data.completed)
              ? Math.min(100, Math.round((data.completed / data.total) * 100))
              : (data.status === 'success' ? 100 : null);

            if (wc && !wc.isDestroyed()) {
              wc.send('translate:ollamaPullProgress', {
                modelName: trimmed,
                status: data.status || 'Đang tải...',
                total: data.total || 0,
                completed: data.completed || 0,
                percent,
                done: data.status === 'success',
              });
            }
          } catch {}
        }
      });

      return await new Promise((resolve) => {
        response.data.on('end', () => {
          activeOllamaPulls.delete(trimmed);
          if (wc && !wc.isDestroyed()) {
            wc.send('translate:ollamaPullProgress', {
              modelName: trimmed,
              status: 'Hoàn tất tải model!',
              percent: 100,
              done: true,
            });
          }
          resolve({ success: true, modelName: trimmed });
        });

        response.data.on('error', (err) => {
          activeOllamaPulls.delete(trimmed);
          if (wc && !wc.isDestroyed()) {
            wc.send('translate:ollamaPullProgress', {
              modelName: trimmed,
              status: `Lỗi: ${err.message}`,
              error: err.message,
              done: true,
            });
          }
          resolve({ success: false, error: err.message });
        });
      });
    } catch (err) {
      activeOllamaPulls.delete(trimmed);
      const errorMsg = err.response?.data?.error || err.message;
      return { success: false, error: errorMsg };
    }
  });

  ipcMain.handle('translate:cancelOllamaPull', (_event, { modelName }) => {
    const trimmed = modelName?.trim();
    if (trimmed && activeOllamaPulls.has(trimmed)) {
      try {
        activeOllamaPulls.get(trimmed).abort();
        activeOllamaPulls.delete(trimmed);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Không tìm thấy tiến trình tải tương ứng' };
  });

  // --- Model Management ---
  ipcMain.handle('translate:getModelStatus', () => {
    const mm = getModelManager();
    return mm.listRegisteredModels();
  });

  ipcMain.handle('translate:downloadModel', async (_event, { modelId }) => {
    const mm = getModelManager();
    try {
      await mm.downloadModel(modelId, (progress) => {
        const wc = getWebContents(_event?.sender);
        if (wc) {
          wc.send('translate:modelDownloadProgress', progress);
        }
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('translate:cancelModelDownload', (_event, { modelId }) => {
    const mm = getModelManager();
    mm.cancelDownload(modelId);
    return { success: true };
  });

  ipcMain.handle('translate:deleteModel', async (_event, { modelId }) => {
    const mm = getModelManager();
    await mm.deleteModel(modelId);
    return { success: true };
  });

  ipcMain.handle('translate:importModelFile', async (_event, { modelId, targetFilename } = {}) => {
    const mm = getModelManager();
    const info = mm.getModelInfo(modelId);
    if (!info) return { success: false, error: 'Model không tồn tại.' };

    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: `Chọn file ONNX cho ${info.name}${targetFilename ? ` (${targetFilename})` : ''}`,
      filters: [
        { name: 'ONNX Models (*.onnx)', extensions: ['onnx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }

    try {
      const res = await mm.importModelFile(modelId, filePaths[0], targetFilename);
      return { success: true, ...res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('translate:openModelFolder', async (_event, { modelId } = {}) => {
    const mm = getModelManager();
    const targetDir = modelId ? path.join(mm.modelDir, modelId) : mm.modelDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    await shell.openPath(targetDir);
    return { success: true, folderPath: targetDir };
  });

  const parseImageBuffer = (imagePath, imageDataUrl) => {
    if (imagePath) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`File không tồn tại: ${imagePath}`);
      }
      return fs.readFileSync(imagePath);
    }
    if (imageDataUrl) {
      if (imageDataUrl.startsWith('file://')) {
        const filePath = decodeURIComponent(imageDataUrl.replace(/^file:\/\//, ''));
        if (!fs.existsSync(filePath)) {
          throw new Error(`File không tồn tại: ${filePath}`);
        }
        return fs.readFileSync(filePath);
      }
      if (imageDataUrl.startsWith('data:')) {
        const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64, 'base64');
      }
      return Buffer.from(imageDataUrl, 'base64');
    }
    throw new Error('No image provided');
  };

  // --- Translation (Full Pipeline) ---
  ipcMain.handle('translate:translateImage', async (_event, { imageDataUrl, imagePath, forceFresh }) => {
    const pipe = getPipeline();
    const imageBuffer = parseImageBuffer(imagePath, imageDataUrl);

    const result = await pipe.translateImage(imageBuffer, forceFresh ? { forceFresh: true } : undefined, (progress) => {
      const wc = getWebContents(_event?.sender);
      if (wc) {
        wc.send('translate:progress', progress);
      }
    });

    // Convert Buffer → base64 data URL cho renderer với đúng MIME type
    const isPng = result.finalImage.length > 8 && result.finalImage[0] === 0x89 && result.finalImage[1] === 0x50;
    const mimeType = isPng ? 'image/png' : 'image/jpeg';
    const base64 = result.finalImage.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    let cleanDataUrl = null;
    if (result.cleanImage) {
      const isCleanPng = result.cleanImage.length > 8 && result.cleanImage[0] === 0x89 && result.cleanImage[1] === 0x50;
      const cleanMime = isCleanPng ? 'image/png' : 'image/jpeg';
      cleanDataUrl = `data:${cleanMime};base64,${result.cleanImage.toString('base64')}`;
    }

    return {
      translatedImageDataUrl: dataUrl,
      cleanDataUrl,
      width: result.width || 0,
      height: result.height || 0,
      detections: result.detections,
      ocrResults: result.ocrResults,
      translations: result.translations,
      timings: result.timings,
      detectedCount: result.detectedCount || 0,
      ocrCount: result.ocrCount || 0,
      sentCount: result.sentCount || 0,
      receivedCount: result.receivedCount || 0,
      failedCount: result.failedCount || 0,
      hasQuotaError: Boolean(result.hasQuotaError),
    };
  });

  // --- Selective Pipeline (Chạy độc lập từng bước chuẩn Koharu) ---
  ipcMain.handle('translate:runDetection', async (_event, { imageDataUrl, imagePath, overrideSettings }) => {
    const pipe = getPipeline();
    const imageBuffer = parseImageBuffer(imagePath, imageDataUrl);
    const detections = await pipe.runDetection(imageBuffer, overrideSettings || {}, (progress) => {
      const wc = getWebContents(_event?.sender);
      if (wc) wc.send('translate:progress', progress);
    });
    return { detections };
  });

  ipcMain.handle('translate:runOCR', async (_event, { imageDataUrl, imagePath, detections, layers, overrideSettings }) => {
    const pipe = getPipeline();
    const imageBuffer = parseImageBuffer(imagePath, imageDataUrl);
    const targetDetections = detections || layers || [];
    const ocrResults = await pipe.runOCR(imageBuffer, targetDetections, overrideSettings || {}, (progress) => {
      const wc = getWebContents(_event?.sender);
      if (wc) wc.send('translate:progress', progress);
    });
    return { ocrResults };
  });

  ipcMain.handle('translate:runTranslation', async (_event, { segments, layers, overrideSettings }) => {
    const pipe = getPipeline();
    const targetSegments = segments || layers || [];
    const translations = await pipe.runTranslation(targetSegments, overrideSettings || {}, (progress) => {
      const wc = getWebContents(_event?.sender);
      if (wc) wc.send('translate:progress', progress);
    });
    return { translations };
  });

  ipcMain.handle('translate:runInpainting', async (_event, { imageDataUrl, imagePath, regions, layers, overrideSettings }) => {
    const pipe = getPipeline();
    const imageBuffer = parseImageBuffer(imagePath, imageDataUrl);
    const targetRegions = regions || layers || [];
    const result = await pipe.runInpainting(imageBuffer, targetRegions, overrideSettings || {}, (progress) => {
      const wc = getWebContents(_event?.sender);
      if (wc) wc.send('translate:progress', progress);
    });
    const isCleanPng = result.cleanImage.length > 8 && result.cleanImage[0] === 0x89 && result.cleanImage[1] === 0x50;
    const cleanMime = isCleanPng ? 'image/png' : 'image/jpeg';
    const cleanDataUrl = `data:${cleanMime};base64,${result.cleanImage.toString('base64')}`;
    return { cleanDataUrl };
  });

  ipcMain.handle('translate:translateTextSegments', async (_event, { segments, sourceLanguage, targetLanguage, customPrompt }) => {
    const pipe = getPipeline();
    return await pipe.translateTextSegments(segments, { sourceLanguage, targetLanguage, customPrompt });
  });

  ipcMain.handle('translate:translateChapter', async (_event, payload) => {
    const pipe = getPipeline();
    let {
      imagePaths,
      outputDir,
      baseSaveDir,
      mangaTitle,
      chapterTitle,
      folderBasename,
      offlineMangaDirAbsolute,
    } = payload || {};

    if (!imagePaths || imagePaths.length === 0) {
      // Resolve chapter directory from library params if provided
      const { resolveChapterDir } = require('../lib/download/connector/connectorPathUtils');
      const { listChapterImageFiles } = require('../lib/library/listChapterImageFiles');
      const { formatChapterFolderName } = require('../lib/shared/mangaUtils');

      let chapterDir;
      const mangaRoot = ipc_context?.resolveMangaRootForRead
        ? ipc_context.resolveMangaRootForRead(baseSaveDir, mangaTitle, offlineMangaDirAbsolute)
        : null;
      const cf = ipc_context?.getChapterFolderSettings
        ? ipc_context.getChapterFolderSettings()
        : null;

      if (folderBasename && mangaRoot) {
        chapterDir = path.join(mangaRoot, path.basename(folderBasename));
      } else if (String(offlineMangaDirAbsolute || '').trim() && mangaRoot) {
        chapterDir = path.join(mangaRoot, formatChapterFolderName(chapterTitle, cf));
      } else if (baseSaveDir && mangaTitle && chapterTitle) {
        chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, cf);
      }

      if (chapterDir && fs.existsSync(chapterDir)) {
        const listRes = listChapterImageFiles(chapterDir);
        if (listRes.ok && Array.isArray(listRes.files) && listRes.files.length > 0) {
          imagePaths = listRes.files.map((f) => path.join(chapterDir, f));
        }
      }
    }

    let images = [];

    // Prioritize loading from imageItems if provided (supports dataUrl for dropped/in-memory images)
    if (Array.isArray(payload?.imageItems) && payload.imageItems.length > 0) {
      for (const item of payload.imageItems) {
        let buffer = null;
        if (item.path && fs.existsSync(item.path)) {
          try {
            buffer = fs.readFileSync(item.path);
          } catch (_) {}
        }
        if (!buffer && item.dataUrl) {
          try {
            if (item.dataUrl.startsWith('file://')) {
              const fp = decodeURIComponent(item.dataUrl.replace(/^file:\/\//, ''));
              if (fs.existsSync(fp)) buffer = fs.readFileSync(fp);
            } else if (item.dataUrl.startsWith('data:')) {
              const base64 = item.dataUrl.replace(/^data:image\/\w+;base64,/, '');
              buffer = Buffer.from(base64, 'base64');
            } else {
              buffer = Buffer.from(item.dataUrl, 'base64');
            }
          } catch (_) {}
        }
        if (buffer) {
          images.push({
            path: item.path || item.filename || 'image.png',
            buffer,
          });
        }
      }
    }

    // Fallback to loading from imagePaths
    if (images.length === 0 && Array.isArray(imagePaths) && imagePaths.length > 0) {
      images = imagePaths
        .filter((p) => p && fs.existsSync(p))
        .map((p) => ({
          path: p,
          buffer: fs.readFileSync(p),
        }));
    }

    if (images.length === 0) {
      throw new Error('Không tìm thấy dữ liệu ảnh hợp lệ nào trong chương để dịch.');
    }

    const targetProjectId = payload?.projectId;

    const results = await pipe.translateChapter(images, undefined, (progress) => {
      const wc = getWebContents(_event?.sender);
      if (wc) {
        wc.send('translate:chapterProgress', progress);

        // Intermediate Step Checkpoint: khi mỗi trang xong 1 bước con (detect, ocr, translate)
        if (progress.step === 'page_step_done') {
          try {
            StudioSession.checkpointPageStep(targetProjectId, progress.path, progress);
            wc.send('translate:chapterStepDone', progress);
          } catch (stepErr) {
            logger.warn('[IPC] Error processing streaming chapterStepDone:', stepErr.message);
          }
        }

        // Streaming Checkpoint: khi mỗi trang dịch xong (step === 'page_done')
        if (progress.step === 'page_done' && progress.pageResult) {
          try {
            let cleanDataUrl = null;
            if (progress.pageResult.cleanImage) {
              const isCleanPng = progress.pageResult.cleanImage.length > 8 && progress.pageResult.cleanImage[0] === 0x89 && progress.pageResult.cleanImage[1] === 0x50;
              const cleanMime = isCleanPng ? 'image/png' : 'image/jpeg';
              cleanDataUrl = `data:${cleanMime};base64,${progress.pageResult.cleanImage.toString('base64')}`;
            }

            const pagePayload = {
              index: progress.pageIndex,
              imagePath: progress.pageResult.path,
              cleanDataUrl,
              translations: progress.pageResult.translations || [],
              detections: progress.pageResult.detections || [],
              ocrResults: progress.pageResult.ocrResults || [],
              width: progress.pageResult.width,
              height: progress.pageResult.height,
              translatedCount: progress.pageResult.translatedCount,
              totalCount: progress.pageResult.totalCount,
            };

            // 1. Gửi sự kiện Live Stream về Frontend để giao diện cập nhật ngay lập tức
            wc.send('translate:chapterPageDone', pagePayload);

            // 2. Ghi checkpoint an toàn vào session đĩa cứng (ngay tại Main Process)
            StudioSession.checkpointPage(targetProjectId, progress.pageResult.path, pagePayload);
          } catch (streamErr) {
            logger.warn('[IPC] Error processing streaming chapterPageDone:', streamErr.message);
          }
        }
      }
    });

    // Theo chuẩn Koharu: Không tự động xuất file ra đĩa trước khi user xem & biên tập trong Studio.
    const saveDir = outputDir || (imagePaths[0] ? path.join(path.dirname(imagePaths[0]), '_translated') : null);

    return {
      success: true,
      outputDir: saveDir,
      savedPaths: [], // Chưa xuất file nào ra đĩa
      totalImages: results.length,
      translatedImages: results.filter((r) => !r.error).length,
      hasQuotaError: Boolean(results.hasQuotaError),
      totalDetected: results.totalDetected || 0,
      totalOcr: results.totalOcr || 0,
      totalSent: results.totalSent || results.totalOcr || 0,
      totalReceived: results.totalReceived || results.totalTranslated || 0,
      totalTranslated: results.totalTranslated || 0,
      totalFailed: results.totalFailed || 0,
      pages: results.map((r, index) => {
        let cleanDataUrl = null;
        if (r.cleanImage) {
          const isCleanPng = r.cleanImage.length > 8 && r.cleanImage[0] === 0x89 && r.cleanImage[1] === 0x50;
          const cleanMime = isCleanPng ? 'image/png' : 'image/jpeg';
          cleanDataUrl = `data:${cleanMime};base64,${r.cleanImage.toString('base64')}`;
        }
        return {
          index,
          imagePath: r.path,
          cleanDataUrl,
          savedPath: '', // Sẽ được cập nhật khi user bấm xuất trong Studio
          translations: r.translations || [],
          detections: r.detections || [],
          ocrResults: r.ocrResults || [],
          timings: r.timings || {},
          hasQuotaError: Boolean(r.hasQuotaError),
          translatedCount: r.translatedCount || 0,
          totalCount: r.totalCount || 0,
          failedCount: r.failedCount || 0,
          error: r.error || null,
        };
      }),
    };
  });

  // --- Export Single Edited Page with Layers ---
  ipcMain.handle('translate:exportEditedPage', async (_event, { imagePath, layers, renderedDataUrl, options }) => {
    try {
      const origExt = imagePath ? path.extname(imagePath) : '.png';
      const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
      const basename = path.basename(imagePath, path.extname(imagePath)) + '_translated' + ext;

      let savePath = options?.savePath;
      if (!savePath) {
        const saveDir = options?.outputDir || (imagePath ? path.join(path.dirname(imagePath), '_translated') : null);
        if (!saveDir) throw new Error('Không xác định được thư mục lưu ảnh');
        savePath = path.join(saveDir, basename);
      }

      const targetDir = path.dirname(savePath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      // Nếu Studio đã render WYSIWYG chuẩn 100% bằng HTML5 Canvas của Chromium, ghi trực tiếp ra đĩa
      if (renderedDataUrl) {
        const base64 = renderedDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const finalBuffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(savePath, finalBuffer);

        return {
          success: true,
          savePath,
          savedBytes: finalBuffer.length,
          dataUrl: renderedDataUrl,
        };
      }

      // Fallback: Dùng TypesettingStep cho tiến trình headless
      const TypesettingStep = require('../lib/translate/pipeline/TypesettingStep');
      if (!fs.existsSync(imagePath)) throw new Error(`File không tồn tại: ${imagePath}`);

      const origBuffer = fs.readFileSync(imagePath);
      const format = ext === '.png' ? 'png' : (ext === '.webp' ? 'webp' : 'jpeg');

      const step = new TypesettingStep();
      const finalBuffer = await step.typeset(origBuffer, layers || [], {
        ...options,
        format,
        quality: options?.quality || 92,
        fillBackground: options?.fillBackground === true,
      });

      fs.writeFileSync(savePath, finalBuffer);

      const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
      let dataUrl = null;
      // Chỉ encode base64 nếu dung lượng nhỏ hơn 4MB để tránh áp lực RAM lên renderer process
      if (finalBuffer.length < 4 * 1024 * 1024) {
        dataUrl = `data:${mime};base64,${finalBuffer.toString('base64')}`;
      }

      return {
        success: true,
        savePath,
        savedBytes: finalBuffer.length,
        dataUrl,
      };
    } catch (err) {
      logger.error('[translate:exportEditedPage] Lỗi:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  // --- Export Entire Edited Chapter with Layers ---
  ipcMain.handle('translate:exportEditedChapter', async (_event, { pages, outputDir, options }) => {
    try {
      const TypesettingStep = require('../lib/translate/pipeline/TypesettingStep');
      if (!pages || pages.length === 0) throw new Error('Không có trang nào để xuất');

      const saveDir = outputDir || null;
      let step = null;
      const savedPaths = [];
      const errors = [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (!page.imagePath || (!page.renderedDataUrl && !fs.existsSync(page.imagePath))) {
          savedPaths.push('');
          continue;
        }
        try {
          const origExt = path.extname(page.imagePath) || '.jpg';
          const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
          const basename = path.basename(page.imagePath, path.extname(page.imagePath)) + '_translated' + ext;
          let savePath = page.savedPath;
          if (!savePath) {
            const targetDir = saveDir || path.join(path.dirname(page.imagePath), '_translated');
            savePath = path.join(targetDir, basename);
          }
          if (!fs.existsSync(path.dirname(savePath))) fs.mkdirSync(path.dirname(savePath), { recursive: true });

          if (page.renderedDataUrl) {
            const base64 = page.renderedDataUrl.replace(/^data:image\/\w+;base64,/, '');
            const finalBuffer = Buffer.from(base64, 'base64');
            fs.writeFileSync(savePath, finalBuffer);
            savedPaths.push(savePath);
          } else {
            if (!step) step = new TypesettingStep();
            const origBuffer = fs.readFileSync(page.imagePath);
            const format = ext === '.png' ? 'png' : (ext === '.webp' ? 'webp' : 'jpeg');
            const finalBuffer = await step.typeset(origBuffer, page.layers || [], {
              ...options,
              format,
              quality: options?.quality || 92,
              fillBackground: options?.fillBackground === true,
            });
            fs.writeFileSync(savePath, finalBuffer);
            savedPaths.push(savePath);
          }
        } catch (pageErr) {
          logger.error(`[exportEditedChapter] Lỗi tại trang ${i + 1}: ${pageErr.message}`);
          errors.push({ pageIndex: i, error: pageErr.message });
          savedPaths.push(page.savedPath || '');
        }
      }

      return {
        success: true,
        outputDir: saveDir,
        savedPaths,
        total: savedPaths.filter(Boolean).length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err) {
      logger.error('[translate:exportEditedChapter] Lỗi:', err.message);
      return {
        success: false,
        error: err.message,
        savedPaths: [],
        total: 0,
      };
    }
  });

  ipcMain.handle('translate:cancelTranslation', () => {
    if (pipeline) pipeline.cancel();
    return { success: true };
  });

  // --- CBZ Export ---
  ipcMain.handle('translate:exportCbz', async (_event, { imagePaths, outputFile, title }) => {
    const archiver = require('archiver');
    const { finished } = require('stream/promises');

    let targetFile = outputFile;
    if (!targetFile) {
      const defaultName = `${title || 'Translated_Chapter'}.cbz`;
      const win = getMainWindow();
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Lưu file CBZ bản dịch',
        defaultPath: defaultName,
        filters: [{ name: 'Comic Book Archive', extensions: ['cbz'] }],
      });
      if (canceled || !filePath) return { canceled: true };
      targetFile = filePath;
    }

    const output = fs.createWriteStream(targetFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);

    for (let i = 0; i < imagePaths.length; i++) {
      const p = imagePaths[i];
      if (fs.existsSync(p)) {
        const ext = path.extname(p);
        const entryName = `page_${String(i + 1).padStart(4, '0')}${ext}`;
        archive.file(p, { name: entryName });
      }
    }

    await archive.finalize();
    await finished(output);

    return { success: true, filePath: targetFile };
  });

  // --- Open Folder / File ---
  ipcMain.handle('translate:openFolder', async (_event, payload) => {
    const targetPath = typeof payload === 'string' ? payload : (payload?.folderPath || payload?.filePath);
    if (targetPath && fs.existsSync(targetPath)) {
      try {
        const stat = fs.statSync(targetPath);
        if (stat.isFile()) {
          shell.showItemInFolder(targetPath);
        } else {
          await shell.openPath(targetPath);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Đường dẫn không tồn tại.' };
  });

  // --- Disk usage ---
  ipcMain.handle('translate:getDiskUsage', () => {
    const mm = getModelManager();
    const { TranslateCache } = require('../lib/translate/TranslateCache');
    const StudioSession = require('../lib/translate/StudioSession');
    const cache = new TranslateCache();
    const sessionBytes = StudioSession.getDiskUsage();
    const cacheBytes = cache.getDiskUsage() + sessionBytes;
    return {
      modelBytes: mm.getTotalDiskUsage(),
      cacheBytes,
      sessionBytes,
      totalBytes: mm.getTotalDiskUsage() + cacheBytes,
      modelDir: mm.modelDir,
    };
  });

  // --- Clear cache (xóa cả cache dịch AI và session tiến độ tạm thời) ---
  ipcMain.handle('translate:clearCache', () => {
    const { TranslateCache } = require('../lib/translate/TranslateCache');
    const StudioSession = require('../lib/translate/StudioSession');
    const cache = new TranslateCache();
    const cacheResult = cache.clear();
    const sessionBytes = StudioSession.getDiskUsage();
    StudioSession.clearSession();
    return {
      deletedFiles: (cacheResult?.deletedFiles || 0) + 1,
      freedBytes: (cacheResult?.freedBytes || 0) + sessionBytes,
    };
  });

  // --- Image Directory Scanning & Reading ---
  ipcMain.handle('translate:listImagesInDir', (_event, { dirPath }) => {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return { ok: false, error: 'Thư mục không tồn tại.', files: [] };
    }
    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.avif']);
    try {
      const names = fs.readdirSync(dirPath);
      const files = names
        .filter((n) => !n.startsWith('.') && IMAGE_EXTS.has(path.extname(n).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map((n) => path.join(dirPath, n));
      return { ok: true, files, dirName: path.basename(dirPath) };
    } catch (e) {
      return { ok: false, error: e.message, files: [] };
    }
  });

  // --- Recursive Image Directory Scanning ---
  ipcMain.handle('translate:listImagesInDirRecursive', (_event, { dirPath }) => {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return { ok: false, error: 'Thư mục không tồn tại.', files: [], subfolderCount: 0 };
    }
    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.avif']);
    try {
      const results = [];
      let subfolderCount = 0;

      const scanDir = (currentDir, relPrefix) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        // Separate files and directories, sort each naturally
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        const imageFiles = entries
          .filter((e) => e.isFile() && !e.name.startsWith('.') && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        // Add image files in this directory first
        for (const f of imageFiles) {
          const relPath = relPrefix ? path.join(relPrefix, f.name) : f.name;
          results.push({
            absPath: path.join(currentDir, f.name),
            relPath,
            filename: f.name,
            subfolder: relPrefix || '',
          });
        }

        // Then recurse into subdirectories
        for (const d of dirs) {
          subfolderCount++;
          const nextRel = relPrefix ? path.join(relPrefix, d.name) : d.name;
          scanDir(path.join(currentDir, d.name), nextRel);
        }
      };

      scanDir(dirPath, '');

      return {
        ok: true,
        files: results.map((r) => r.absPath),
        fileDetails: results,
        dirName: path.basename(dirPath),
        subfolderCount,
        totalFiles: results.length,
      };
    } catch (e) {
      return { ok: false, error: e.message, files: [], subfolderCount: 0 };
    }
  });

  ipcMain.handle('translate:readImageDataUrl', (_event, { filePath }) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: 'File không tồn tại.' };
    }
    try {
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const buf = fs.readFileSync(filePath);
      return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // --- Studio Multi-Project & Session Persistence (Quản lý nhiều dự án Manga Studio) ---

  ipcMain.handle('translate:listProjects', async () => {
    return StudioSession.listProjects();
  });

  ipcMain.handle('translate:createProject', async (_event, payload) => {
    return StudioSession.createProject(payload);
  });

  ipcMain.handle('translate:switchProject', async (_event, payload) => {
    return StudioSession.switchProject(payload);
  });

  ipcMain.handle('translate:renameProject', async (_event, payload) => {
    return StudioSession.renameProject(payload);
  });

  ipcMain.handle('translate:deleteProject', async (_event, payload) => {
    return StudioSession.deleteProject(payload);
  });

  ipcMain.handle('translate:saveSession', async (_event, sessionData) => {
    return StudioSession.saveSession(sessionData);
  });

  ipcMain.handle('translate:loadSession', async (_event, payload) => {
    const projectId = typeof payload === 'string' ? payload : payload?.projectId;
    return StudioSession.loadSession(projectId);
  });

  ipcMain.handle('translate:clearSession', async (_event, payload) => {
    const projectId = typeof payload === 'string' ? payload : payload?.projectId;
    return StudioSession.clearSession(projectId);
  });

  ipcMain.handle('translate:hasSession', async (_event, payload) => {
    const projectId = typeof payload === 'string' ? payload : payload?.projectId;
    return StudioSession.hasSession(projectId);
  });

  ipcMain.handle('translate:deletePageBlobs', async (_event, { page, remainingPages, projectId } = {}) => {
    StudioSession.deletePageBlobs(page, remainingPages, projectId);
    if (page?.imagePath) {
      try {
        const { TranslateCache } = require('../lib/translate/TranslateCache');
        const cache = new TranslateCache();
        cache.deleteImage(page.imagePath);
      } catch (_) {}
    }
    return { success: true };
  });

  // --- Auto-Processing Mode (Xử lý đệ quy folder, tự động xuất file) ---

  ipcMain.handle('translate:selectFolder', async (_event, { title = 'Chọn thư mục' } = {}) => {
    const win = ipc_context?.mainWindow;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title,
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, folderPath: filePaths[0] };
  });

  ipcMain.handle('translate:scanFolderImages', async (_event, { folderPath }) => {
    if (!folderPath) return { images: [], count: 0 };
    const images = AutoProcessor.scanImagesRecursive(folderPath);
    return { images, count: images.length };
  });

  ipcMain.handle('translate:startAutoProcess', async (event, { inputDir, outputDir, options = {} }) => {
    if (!inputDir || !outputDir) {
      return { success: false, error: 'Vui lòng chọn cả thư mục đầu vào và thư mục đầu ra.' };
    }

    const currentPipeline = getPipeline();
    autoProcessor = new AutoProcessor(currentPipeline);

    const fullSettings = {
      ...loadSettings(),
      ...options,
      autoProcessing: {
        ...loadSettings().autoProcessing,
        ...options.autoProcessing,
        inputDir,
        outputDir,
      },
    };

    // Chạy bất đồng bộ, gửi tiến trình qua IPC event
    autoProcessor.process(
      inputDir,
      outputDir,
      fullSettings,
      (progressData) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('translate:autoProcessProgress', progressData);
          }
        } catch (_) {}
      }
    ).catch((err) => {
      logger.error('[IPC] AutoProcessor error:', err.message);
      try {
        if (!event.sender.isDestroyed()) {
          event.sender.send('translate:autoProcessProgress', {
            status: 'error',
            detail: err.message,
            error: err.message,
          });
        }
      } catch (_) {}
    });

    return { success: true };
  });

  ipcMain.handle('translate:cancelAutoProcess', async () => {
    if (autoProcessor) {
      autoProcessor.cancel();
      return { success: true };
    }
    return { success: false, error: 'Không có tiến trình Auto nào đang chạy' };
  });

  ipcMain.handle('translate:getAutoProcessStatus', async () => {
    return {
      isProcessing: autoProcessor ? autoProcessor.isProcessing : false,
      stats: autoProcessor ? autoProcessor.stats : null,
    };
  });
}

module.exports = { registerTranslateIpc };
