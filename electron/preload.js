const { contextBridge, ipcRenderer } = require('electron');

const api = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText'),

  getDefaultDownloadPath: () => ipcRenderer.invoke('app:defaultDownloadPath'),
  getSavedDownloadPath: () => ipcRenderer.invoke('app:getSavedDownloadPath'),
  setSavedDownloadPath: (dir) => ipcRenderer.invoke('app:setSavedDownloadPath', dir),
  getChapterFolderSettings: () => ipcRenderer.invoke('app:getChapterFolderSettings'),
  setChapterFolderSettings: (partial) => ipcRenderer.invoke('app:setChapterFolderSettings', partial),
  selectDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectDirectory', defaultPath),
  selectCbzFiles: () => ipcRenderer.invoke('dialog:selectCbzFiles'),
  selectImageFiles: () => ipcRenderer.invoke('dialog:selectImageFiles'),
  selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
  duplicateSelectFolders: () => ipcRenderer.invoke('duplicate:selectFolders'),
  duplicateListFiles: (payload) => ipcRenderer.invoke('duplicate:listFiles', payload),
  listImportedImages: (payload) => ipcRenderer.invoke('duplicate:listFiles', payload),
  duplicateScan: (payload) => ipcRenderer.invoke('duplicate:scan', payload),
  duplicateCancelScan: () => ipcRenderer.invoke('duplicate:cancel-scan'),
  onDuplicateScanProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('duplicate:scan-progress', listener);
    return () => ipcRenderer.removeListener('duplicate:scan-progress', listener);
  },
  duplicateReadPreview: (filePath) => ipcRenderer.invoke('duplicate:readPreview', { filePath }),
  readImagePreview: (filePath) => ipcRenderer.invoke('duplicate:readPreview', { filePath }),
  duplicateDeleteFiles: (allowedRoots, paths) =>
    ipcRenderer.invoke('duplicate:deleteFiles', { allowedRoots, paths }),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
  openMangaFolder: (baseSaveDir, mangaTitle) =>
    ipcRenderer.invoke('shell:openMangaFolder', { baseSaveDir, mangaTitle }),
  resolveMangaDir: (baseSaveDir, mangaTitle) =>
    ipcRenderer.invoke('shell:resolveMangaDir', { baseSaveDir, mangaTitle }),
  openChapterFolder: (baseSaveDir, mangaTitle, chapterTitle) =>
    ipcRenderer.invoke('shell:openChapterFolder', { baseSaveDir, mangaTitle, chapterTitle }),
  listConnectors: () => ipcRenderer.invoke('app:listConnectors'),
  testConnector: (siteId, activeDomain) => ipcRenderer.invoke('app:testConnector', { siteId, activeDomain }),
  onTestConnectorProgress: (callback) => {
    ipcRenderer.on('app:testConnectorProgress', (_event, data) => callback(data));
  },
  detectSiteFromUrl: (url) => ipcRenderer.invoke('app:detectSiteFromUrl', url),
  loadManga: (site, url, opts) =>
    ipcRenderer.invoke('manga:load', { site, url, ...(opts && typeof opts === 'object' ? opts : {}) }),
  fetchLatestUpdates: (payload) => ipcRenderer.invoke('manga:fetchLatestUpdates', payload),
  fetchComicvnMoiNhat: (payload) =>
    ipcRenderer.invoke('manga:fetchComicvnMoiNhat', payload || {}),
  fetchBulkScan: (payload) => ipcRenderer.invoke('manga:fetchBulkScan', payload || {}),
  getBulkScanSessions: () => ipcRenderer.invoke('bulkScan:getSessions'),
  saveBulkScanSession: (siteId, session) =>
    ipcRenderer.invoke('bulkScan:saveSession', { siteId, session }),
  subscribeBulkScanProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, p) => callback(p);
    ipcRenderer.on('manga:bulkScanProgress', handler);
    return () => ipcRenderer.removeListener('manga:bulkScanProgress', handler);
  },
  subscribeComicvnMoiNhatProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('manga:comicvnMoiNhatProgress', handler);
    return () => ipcRenderer.removeListener('manga:comicvnMoiNhatProgress', handler);
  },
  fetchMangadexCovers: (urlOrId) => ipcRenderer.invoke('manga:fetchMangadexCovers', { urlOrId }),
  downloadMangadexCovers: (covers, directory, mangaTitle) => 
    ipcRenderer.invoke('manga:downloadMangadexCovers', { covers, directory, mangaTitle }),
  loadMangaOfflineFromDisk: (baseSaveDir, mangaTitle) =>
    ipcRenderer.invoke('manga:loadOfflineFromDisk', { baseSaveDir, mangaTitle }),
  loadMangaOfflineFromAbsolutePath: (absoluteMangaDir) =>
    ipcRenderer.invoke('manga:loadOfflineFromAbsolutePath', { absoluteMangaDir }),
  pickAndLoadCbz: () => ipcRenderer.invoke('manga:pickAndLoadCbz'),
  listCbzInDirectory: (dir) => ipcRenderer.invoke('manga:listCbzInDirectory', { dir }),
  findFirstImageInDirectory: (dir) =>
    ipcRenderer.invoke('manga:findFirstImageInDirectory', { dir }),
  loadCbzFromAbsolutePath: (absoluteCbzPath) =>
    ipcRenderer.invoke('manga:loadCbzFromAbsolutePath', { absoluteCbzPath }),
  releaseCbzTempDir: (dir) => ipcRenderer.invoke('manga:releaseCbzTempDir', { dir }),
  pickAndLoadArchive: () => ipcRenderer.invoke('manga:pickAndLoadArchive'),
  loadArchiveFromAbsolutePath: (p) => ipcRenderer.invoke('manga:loadArchiveFromAbsolutePath', { absolutePath: p }),
  listArchivesInDirectory: (dir) => ipcRenderer.invoke('manga:listArchivesInDirectory', { dir }),

  // Ebook (EPUB / PDF text reader)
  detectEbookContentType: (absolutePath) => ipcRenderer.invoke('ebook:detectContentType', { absolutePath }),
  loadTextEpub: (absolutePath) => ipcRenderer.invoke('ebook:loadTextEpub', { absolutePath }),
  readSpineItem: (absolutePath, spineItemHref) => ipcRenderer.invoke('ebook:readSpineItem', { absolutePath, spineItemHref }),
  loadTextPdf: (absolutePath) => ipcRenderer.invoke('ebook:loadTextPdf', { absolutePath }),
  readPdfPage: (absolutePath, pageIndex) => ipcRenderer.invoke('ebook:readPdfPage', { absolutePath, pageIndex }),
  releaseEbook: (absolutePath) => ipcRenderer.invoke('ebook:releaseEbook', { absolutePath }),
  listLocalMangaLibrary: (baseSaveDir, options) =>
    ipcRenderer.invoke('manga:listLocalMangaLibrary', {
      baseSaveDir,
      force: options?.force === true,
    }),
  /** Cover CDN (Comix static + CF): tải trong main kèm cookie Flare → data URL. */
  fetchRemoteImageAsDataUrl: (imageUrl) =>
    ipcRenderer.invoke('manga:fetchRemoteImageAsDataUrl', imageUrl),
  listChapterImageFiles: (baseSaveDir, mangaTitle, chapterTitle, folderBasename, offlineMangaDirAbsolute) =>
    ipcRenderer.invoke('manga:listChapterImageFiles', {
      baseSaveDir,
      mangaTitle,
      chapterTitle,
      folderBasename,
      offlineMangaDirAbsolute,
    }),
  filterChaptersWithLocalImages: (baseSaveDir, mangaTitle, chapters, absoluteMangaDir) =>
    ipcRenderer.invoke('manga:filterChaptersWithLocalImages', { baseSaveDir, mangaTitle, chapters, absoluteMangaDir }),
  readLocalChapterImage: (baseSaveDir, mangaTitle, chapterTitle, fileName, folderBasename, offlineMangaDirAbsolute) =>
    ipcRenderer.invoke('manga:readLocalChapterImage', {
      baseSaveDir,
      mangaTitle,
      chapterTitle,
      fileName,
      folderBasename,
      offlineMangaDirAbsolute,
    }),
  countLocalChapters: (baseSaveDir, mangaTitle) =>
    ipcRenderer.invoke('manga:countLocalChapters', { baseSaveDir, mangaTitle }),
  computeFavoriteChapterSync: (baseSaveDir, mangaTitle, remoteChapters) =>
    ipcRenderer.invoke('manga:computeFavoriteChapterSync', {
      baseSaveDir,
      mangaTitle,
      remoteChapters,
    }),
  estimateCbzSizeSplit: (payload) => ipcRenderer.invoke('manga:estimateCbzSizeSplit', payload),
  exportCbz: (payload) => ipcRenderer.invoke('manga:exportCbz', payload),
  scanImageFolder: (payload) => ipcRenderer.invoke('manga:scanImageFolder', payload),
  convertImages: (payload) => ipcRenderer.invoke('manga:convertImages', payload),
  cancelConvertImages: () => ipcRenderer.invoke('manga:cancelConvertImages'),
  renameScan: (payload) => ipcRenderer.invoke('manga:renameScan', payload),
  renamePreview: (payload) => ipcRenderer.invoke('manga:renamePreview', payload),
  renameApply: (payload) => ipcRenderer.invoke('manga:renameApply', payload),
  cancelRename: () => ipcRenderer.invoke('manga:cancelRename'),
  renameUndo: (payload) => ipcRenderer.invoke('manga:renameUndo', payload),
  exportPdfFromDir: (payload) => ipcRenderer.invoke('manga:exportPdfFromDir', payload),
  exportpdf: (payload) => ipcRenderer.invoke('manga:exportpdf', payload),
  checkChapterSubfolders: (payload) => ipcRenderer.invoke('manga:checkChapterSubfolders', payload),
  combineCbz: (payload) => ipcRenderer.invoke('manga:combineCbz', payload),
  splitCbz: (payload) => ipcRenderer.invoke('manga:splitCbz', payload),
  scanForSplit: (payload) => ipcRenderer.invoke('manga:scanForSplit', payload),
  splitDoublePages: (payload) => ipcRenderer.invoke('manga:splitDoublePages', payload),
  cancelSplitDoublePages: () => ipcRenderer.invoke('manga:cancelSplitDoublePages'),
  subscribeSplitProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:splitProgress', listener);
    return () => ipcRenderer.removeListener('manga:splitProgress', listener);
  },
  scanForDeskew: (payload) => ipcRenderer.invoke('manga:scanForDeskew', payload),
  deskewImages: (payload) => ipcRenderer.invoke('manga:deskewImages', payload),
  cancelDeskew: () => ipcRenderer.invoke('manga:cancelDeskew'),
  previewDeskew: (payload) => ipcRenderer.invoke('manga:previewDeskew', payload),
  subscribeDeskewProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:deskewProgress', listener);
    return () => ipcRenderer.removeListener('manga:deskewProgress', listener);
  },
  scanForCrop: (payload) => ipcRenderer.invoke('manga:scanForCrop', payload),
  cropImages: (payload) => ipcRenderer.invoke('manga:cropImages', payload),
  cancelCrop: () => ipcRenderer.invoke('manga:cancelCrop'),
  previewCrop: (payload) => ipcRenderer.invoke('manga:previewCrop', payload),
  subscribeCropProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:cropProgress', listener);
    return () => ipcRenderer.removeListener('manga:cropProgress', listener);
  },
  pipelineScan: (payload) => ipcRenderer.invoke('imagePipeline:scan', payload),
  pipelineAnalyze: (payload) => ipcRenderer.invoke('imagePipeline:analyze', payload),
  pipelinePreview: (payload) => ipcRenderer.invoke('imagePipeline:preview', payload),
  pipelineRun: (payload) => ipcRenderer.invoke('imagePipeline:run', payload),
  pipelineCancel: () => ipcRenderer.invoke('imagePipeline:cancel'),
  pipelineExportTemplate: (payload) => ipcRenderer.invoke('imagePipeline:exportTemplate', payload),
  pipelineImportTemplate: () => ipcRenderer.invoke('imagePipeline:importTemplate'),
  subscribePipelineProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('imagePipeline:progress', listener);
    return () => ipcRenderer.removeListener('imagePipeline:progress', listener);
  },

  // Upscale
  upscaleListModels: () => ipcRenderer.invoke('upscale:listModels'),
  upscaleCheckBinary: (engineId) => ipcRenderer.invoke('upscale:checkBinary', engineId),
  upscaleStart: (payload) => ipcRenderer.invoke('upscale:start', payload),
  upscaleCancel: () => ipcRenderer.invoke('upscale:cancel'),
  subscribeUpscaleProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('upscale:progress', listener);
    return () => ipcRenderer.removeListener('upscale:progress', listener);
  },
  upscaleDownloadEngine: (engineId) => ipcRenderer.invoke('upscale:downloadEngine', engineId),
  upscaleGetGpuList: () => ipcRenderer.invoke('upscale:getGpuList'),
  // Compress
  compressScan: (payload) => ipcRenderer.invoke('compress:scan', payload),
  compressStart: (payload) => ipcRenderer.invoke('compress:start', payload),
  compressCancel: () => ipcRenderer.invoke('compress:cancel'),
  subscribeCompressProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('compress:progress', listener);
    return () => ipcRenderer.removeListener('compress:progress', listener);
  },
  getFileSize: (filePath) => ipcRenderer.invoke('fs:getFileSize', filePath),
  getFolderSize: (dir) => ipcRenderer.invoke('fs:getFolderSize', dir),
  getReadCacheSummary: (payload) => ipcRenderer.invoke('cache:getSummary', payload),
  clearReadCache: (payload) => ipcRenderer.invoke('cache:clear', payload),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  downloadChapter: (payload) => ipcRenderer.invoke('manga:downloadChapter', payload),
  abortDownload: () => ipcRenderer.send('manga:abortDownload'),

  subscribeMangaLog: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:log', listener);
    return () => ipcRenderer.removeListener('manga:log', listener);
  },

  /** Plugin sandbox console.* — tab Cập nhật (JS plugin). */
  subscribePluginConsole: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:pluginConsole', listener);
    return () => ipcRenderer.removeListener('manga:pluginConsole', listener);
  },

  subscribeDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:downloadProgress', listener);
    return () => ipcRenderer.removeListener('manga:downloadProgress', listener);
  },

  subscribeStreamingChapterEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:streamingChapterEvent', listener);
    return () => ipcRenderer.removeListener('manga:streamingChapterEvent', listener);
  },

  subscribeExportCbzProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:exportCbzProgress', listener);
    return () => ipcRenderer.removeListener('manga:exportCbzProgress', listener);
  },

  subscribeConvertImagesProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:convertImagesProgress', listener);
    return () => ipcRenderer.removeListener('manga:convertImagesProgress', listener);
  },

  subscribeRenameProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:renameProgress', listener);
    return () => ipcRenderer.removeListener('manga:renameProgress', listener);
  },

  subscribeExportPdfFromDirProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:exportPdfFromDirProgress', listener);
    return () => ipcRenderer.removeListener('manga:exportPdfFromDirProgress', listener);
  },

  subscribeExportpdfProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('manga:exportpdfProgress', listener);
    return () => ipcRenderer.removeListener('manga:exportpdfProgress', listener);
  },

  subscribeCombineCbzProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('manga:combineCbzProgress', listener);
    return () => ipcRenderer.removeListener('manga:combineCbzProgress', listener);
  },

  subscribeSplitCbzProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('manga:splitCbzProgress', listener);
    return () => ipcRenderer.removeListener('manga:splitCbzProgress', listener);
  },

  subscribeCbzLoadProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('manga:cbzLoadProgress', listener);
    return () => ipcRenderer.removeListener('manga:cbzLoadProgress', listener);
  },

  getAuthSession: () => ipcRenderer.invoke('auth:getSession'),
  loginGoogle: () => ipcRenderer.invoke('auth:loginGoogle'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  subscribeAuthSessionInvalidated: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('auth:sessionInvalidated', listener);
    return () => ipcRenderer.removeListener('auth:sessionInvalidated', listener);
  },
  ensureFreeUserCreditsByEmail: (payload) => ipcRenderer.invoke('trial:ensureFreeUserCreditsByEmail', payload),
  consumeFreeUserDownloadCredit: (payload) => ipcRenderer.invoke('trial:consumeFreeUserDownloadCredit', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),



  getAutoBackupPath: () => ipcRenderer.invoke('backup:getAutoBackupPath'),
  writeAutoBackupFile: (jsonText) => ipcRenderer.invoke('backup:writeAutoBackup', jsonText),

  getCookieStatus: () => ipcRenderer.invoke('cookie:getStatus'),
  setCookie: (siteId, cookieValue) => ipcRenderer.invoke('cookie:set', { siteId, cookieValue }),
  extractCloudflareCookie: (targetUrl) => ipcRenderer.invoke('cookie:extractCloudflare', { targetUrl }),
  setCookieSendEnabled: (siteId, enabled) =>
    ipcRenderer.invoke('cookie:setSendEnabled', { siteId, enabled }),
  deleteCookie: (siteId) => ipcRenderer.invoke('cookie:delete', { siteId }),

  // Auto-update
  checkUpdate: (versionJsonUrl) => ipcRenderer.invoke('update:check', { versionJsonUrl }),
  downloadUpdate: (downloadInfo) => ipcRenderer.invoke('update:download', { downloadInfo }),
  installUpdate: (filePath) => ipcRenderer.invoke('update:install', { filePath }),
  subscribeUpdateDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update:downloadProgress', listener);
    return () => ipcRenderer.removeListener('update:downloadProgress', listener);
  },

  // Branding Customization
  getBranding: () => ipcRenderer.invoke('branding:get'),
  setBranding: (payload) => ipcRenderer.invoke('branding:set', payload),
  resetBranding: () => ipcRenderer.invoke('branding:reset'),
  pickBrandingIconFile: () => ipcRenderer.invoke('branding:pickIconFile'),
  subscribeBrandingChanged: (callback) => {
    const listener = (_event, config) => callback(config);
    ipcRenderer.on('branding:changed', listener);
    return () => ipcRenderer.removeListener('branding:changed', listener);
  },

  // JS Plugin Management
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  importPluginFromFile: () => ipcRenderer.invoke('plugin:importFromFile'),
  importPluginFromUrl: (url) => ipcRenderer.invoke('plugin:importFromUrl', { url }),
  confirmPluginReplacement: (pluginId) => ipcRenderer.invoke('plugin:confirmReplacement', { pluginId }),
  enablePlugin: (pluginId) => ipcRenderer.invoke('plugin:enable', { pluginId }),
  disablePlugin: (pluginId) => ipcRenderer.invoke('plugin:disable', { pluginId }),
  deletePlugin: (pluginId) => ipcRenderer.invoke('plugin:delete', { pluginId }),
  updatePlugin: (pluginId, source, sourceUrl) => ipcRenderer.invoke('plugin:update', { pluginId, source, sourceUrl }),
  exportAllPlugins: () => ipcRenderer.invoke('plugin:exportAll'),
  restorePluginsFromBackup: (zipPath) => ipcRenderer.invoke('plugin:restoreFromBackup', { zipPath }),

  getPluginSource: (pluginId) => ipcRenderer.invoke('plugin:getSource', { pluginId }),

  // Plugin Auto-Generator
  analyzeMangaPage: (url) => ipcRenderer.invoke('plugin:analyzeMangaPage', { url }),
  analyzeChapterPage: (chapterUrl, baseUrl) => ipcRenderer.invoke('plugin:analyzeChapterPage', { chapterUrl, baseUrl }),
  generatePluginSource: (siteInfo, detected) => ipcRenderer.invoke('plugin:generateSource', { siteInfo, detected }),
  generateAndInstallPlugin: (siteInfo, detected, customSource) => ipcRenderer.invoke('plugin:generateAndInstall', { siteInfo, detected, customSource }),

  // Send to Kindle (Amazon web-upload)
  sendToKindleIsLoggedIn: () => ipcRenderer.invoke('kindle:isLoggedIn'),
  sendToKindleLogin: () => ipcRenderer.invoke('kindle:login'),
  sendToKindleLogout: () => ipcRenderer.invoke('kindle:logout'),
  sendToKindleGetChapterSizes: (payload) =>
    ipcRenderer.invoke('kindle:getChapterSizes', payload),
  sendToKindleSend: (payload) => ipcRenderer.invoke('kindle:send', payload),
  sendToKindleSendFile: (payload) => ipcRenderer.invoke('kindle:sendFile', payload),
  sendToKindlePickFiles: () => ipcRenderer.invoke('kindle:pickFiles'),
  sendToKindleStatFiles: (payload) => ipcRenderer.invoke('kindle:statFiles', payload),
  subscribeSendToKindleProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('kindle:progress', listener);
    return () => ipcRenderer.removeListener('kindle:progress', listener);
  },

  // ─── Manga Translation Pipeline ───
  translateGetSettings: () => ipcRenderer.invoke('translate:getSettings'),
  translateSaveSettings: (settings) => ipcRenderer.invoke('translate:saveSettings', settings),
  translateResetSettings: (options) => ipcRenderer.invoke('translate:resetSettings', options),
  translateGetLanguages: () => ipcRenderer.invoke('translate:getLanguages'),
  translateGetProviders: () => ipcRenderer.invoke('translate:getProviders'),
  translateTestProvider: (payload) => ipcRenderer.invoke('translate:testProvider', payload),
  translateTestProviderConnection: (config) => ipcRenderer.invoke('translate:testProviderConnection', config),
  translateFetchAvailableModels: (config) => ipcRenderer.invoke('translate:fetchAvailableModels', config),
  translateDetectLocalEngines: (options) => ipcRenderer.invoke('translate:detectLocalEngines', options),
  translatePullOllamaModel: (payload) => ipcRenderer.invoke('translate:pullOllamaModel', payload),
  translateCancelOllamaPull: (payload) => ipcRenderer.invoke('translate:cancelOllamaPull', payload),
  translateGetModelStatus: () => ipcRenderer.invoke('translate:getModelStatus'),
  translateDownloadModel: (modelId) => ipcRenderer.invoke('translate:downloadModel', { modelId }),
  translateCancelModelDownload: (modelId) => ipcRenderer.invoke('translate:cancelModelDownload', { modelId }),
  translateDeleteModel: (modelId) => ipcRenderer.invoke('translate:deleteModel', { modelId }),
  translateImportModelFile: (modelId, targetFilename) => ipcRenderer.invoke('translate:importModelFile', { modelId, targetFilename }),
  translateOpenModelFolder: (modelId) => ipcRenderer.invoke('translate:openModelFolder', { modelId }),
  translateImage: (payload) => ipcRenderer.invoke('translate:translateImage', payload),
  translateRunDetection: (payload) => ipcRenderer.invoke('translate:runDetection', payload),
  translateRunOCR: (payload) => ipcRenderer.invoke('translate:runOCR', payload),
  translateRunTranslation: (payload) => ipcRenderer.invoke('translate:runTranslation', payload),
  translateRunInpainting: (payload) => ipcRenderer.invoke('translate:runInpainting', payload),
  translateChapter: (payload) => ipcRenderer.invoke('translate:translateChapter', payload),
  translateTextSegments: (payload) => ipcRenderer.invoke('translate:translateTextSegments', payload),
  translateCancel: () => ipcRenderer.invoke('translate:cancelTranslation'),
  translateGetDiskUsage: () => ipcRenderer.invoke('translate:getDiskUsage'),
  translateClearCache: () => ipcRenderer.invoke('translate:clearCache'),
  translateExportCbz: (payload) => ipcRenderer.invoke('translate:exportCbz', payload),
  translateOpenFolder: (folderPath) => ipcRenderer.invoke('translate:openFolder', { folderPath }),
  translateListImagesInDir: (dirPath) => ipcRenderer.invoke('translate:listImagesInDir', { dirPath }),
  translateListImagesInDirRecursive: (dirPath) => ipcRenderer.invoke('translate:listImagesInDirRecursive', { dirPath }),
  translateExportEditedPage: (payload) => ipcRenderer.invoke('translate:exportEditedPage', payload),
  translateExportEditedChapter: (payload) => ipcRenderer.invoke('translate:exportEditedChapter', payload),
  translateReadImageDataUrl: (filePath) => ipcRenderer.invoke('translate:readImageDataUrl', { filePath }),

  // --- Studio Multi-Project & Session Persistence ---
  translateListProjects: () => ipcRenderer.invoke('translate:listProjects'),
  translateCreateProject: (payload) => ipcRenderer.invoke('translate:createProject', payload),
  translateSwitchProject: (payload) => ipcRenderer.invoke('translate:switchProject', payload),
  translateRenameProject: (payload) => ipcRenderer.invoke('translate:renameProject', payload),
  translateDeleteProject: (payload) => ipcRenderer.invoke('translate:deleteProject', payload),
  translateSaveSession: (sessionData) => ipcRenderer.invoke('translate:saveSession', sessionData),
  translateLoadSession: (payload) => ipcRenderer.invoke('translate:loadSession', payload),
  translateClearSession: (payload) => ipcRenderer.invoke('translate:clearSession', payload),
  translateHasSession: (payload) => ipcRenderer.invoke('translate:hasSession', payload),
  translateDeletePageBlobs: (page, remainingPages, projectId) => ipcRenderer.invoke('translate:deletePageBlobs', { page, remainingPages, projectId }),
  // --- Auto-Processing Mode ---
  translateSelectFolder: (options) => ipcRenderer.invoke('translate:selectFolder', options),
  translateScanFolderImages: (folderPath) => ipcRenderer.invoke('translate:scanFolderImages', { folderPath }),
  translateStartAutoProcess: (payload) => ipcRenderer.invoke('translate:startAutoProcess', payload),
  translateCancelAutoProcess: () => ipcRenderer.invoke('translate:cancelAutoProcess'),
  translateGetAutoProcessStatus: () => ipcRenderer.invoke('translate:getAutoProcessStatus'),
  subscribeAutoProcessProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:autoProcessProgress', listener);
    return () => ipcRenderer.removeListener('translate:autoProcessProgress', listener);
  },

  subscribeOllamaPullProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:ollamaPullProgress', listener);
    return () => ipcRenderer.removeListener('translate:ollamaPullProgress', listener);
  },

  subscribeTranslateProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:progress', listener);
    return () => ipcRenderer.removeListener('translate:progress', listener);
  },
  subscribeTranslateChapterProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:chapterProgress', listener);
    return () => ipcRenderer.removeListener('translate:chapterProgress', listener);
  },
  subscribeTranslateChapterPageDone: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:chapterPageDone', listener);
    return () => ipcRenderer.removeListener('translate:chapterPageDone', listener);
  },
  subscribeTranslateChapterStepDone: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:chapterStepDone', listener);
    return () => ipcRenderer.removeListener('translate:chapterStepDone', listener);
  },
  subscribeModelDownloadProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('translate:modelDownloadProgress', listener);
    return () => ipcRenderer.removeListener('translate:modelDownloadProgress', listener);
  },
  getSystemMetrics: () => ipcRenderer.invoke('system:getMetrics'),

  // Workflow Automation API
  workflowRun: (payload) => ipcRenderer.invoke('workflow:run', payload),
  workflowResume: (payload) => ipcRenderer.invoke('workflow:resume', payload),
  workflowStop: (payload) => ipcRenderer.invoke('workflow:stop', payload),
  workflowGetRun: (payload) => ipcRenderer.invoke('workflow:getRun', payload),
  workflowDetectGoogleDrive: () => ipcRenderer.invoke('workflow:detectGoogleDrive'),
  workflowTestGoogleDriveToken: (payload) => ipcRenderer.invoke('workflow:testGoogleDriveToken', payload),
  subscribeWorkflowEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('workflow:event', listener);
    return () => ipcRenderer.removeListener('workflow:event', listener);
  },
  onWorkflowEvent: (callback) => api.subscribeWorkflowEvent(callback),

  // Ebook Studio & Format Converter API
  ebookSelectFiles: () => ipcRenderer.invoke('ebook:selectFiles'),
  ebookGetKindleGenStatus: () => ipcRenderer.invoke('ebook:getKindleGenStatus'),
  ebookDownloadKindleGen: () => ipcRenderer.invoke('ebook:downloadKindleGen'),
  ebookImportKindleGen: (filePath) => ipcRenderer.invoke('ebook:importKindleGen', { filePath }),
  ebookConvertBook: (payload) => ipcRenderer.invoke('ebook:convertBook', payload),
  ebookBatchConvert: (payload) => ipcRenderer.invoke('ebook:batchConvert', payload),
  ebookCancel: () => ipcRenderer.invoke('ebook:cancel'),
  ebookScanMangaDir: (dir) => ipcRenderer.invoke('ebook:scanMangaDir', { dir }),
  ebookPackManga: (payload) => ipcRenderer.invoke('ebook:packManga', payload),
  subscribeEbookConvertProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ebook:convertProgress', listener);
    return () => ipcRenderer.removeListener('ebook:convertProgress', listener);
  },
  subscribeEbookBatchProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ebook:batchProgress', listener);
    return () => ipcRenderer.removeListener('ebook:batchProgress', listener);
  },
  subscribeEbookToolProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ebook:toolProgress', listener);
    return () => ipcRenderer.removeListener('ebook:toolProgress', listener);
  },
  subscribeEbookPackProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ebook:packProgress', listener);
    return () => ipcRenderer.removeListener('ebook:packProgress', listener);
  },

  // Extras (On-demand AI & Upscale Binaries)
  extrasGetStatus: () => ipcRenderer.invoke('extras:getStatus'),
  extrasOpenFolder: () => ipcRenderer.invoke('extras:openFolder'),
  extrasSelectZipFile: () => ipcRenderer.invoke('extras:selectZipFile'),
  extrasInstallFromZip: (filePath) => ipcRenderer.invoke('extras:installFromZip', { filePath }),
  extrasStartDownload: (overrideUrl) => ipcRenderer.invoke('extras:startDownload', { overrideUrl }),
  extrasCancel: () => ipcRenderer.invoke('extras:cancel'),
  extrasDelete: () => ipcRenderer.invoke('extras:delete'),
  onExtrasProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('extras:progress', listener);
    return () => ipcRenderer.removeListener('extras:progress', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
try {
  contextBridge.exposeInMainWorld('electron', api);
} catch (e) {
  // ignore if already exposed
}
