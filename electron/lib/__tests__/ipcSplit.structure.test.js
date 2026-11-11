const fs = require('fs');
const path = require('path');
const { describe, it, expect } = require('@jest/globals');

const REPO_ROOT = path.join(__dirname, '../../..');

const CHANNEL_MAP = {
  'window.js': [
    'clipboard:readText',
    'window:minimize',
    'window:maximize',
    'window:close',
    'shell:showItemInFolder',
    'shell:openMangaFolder',
    'shell:openChapterFolder',
    'shell:openExternal',
    'shell:openPath',
    'shell:resolveMangaDir',
  ],
  'settings.js': [
    'app:defaultDownloadPath',
    'app:getSavedDownloadPath',
    'app:setSavedDownloadPath',
    'app:validateSaveDir',
    'app:getChapterFolderSettings',
    'app:setChapterFolderSettings',
    'backup:getAutoBackupPath',
    'backup:writeAutoBackup',
    'branding:get',
    'branding:set',
    'branding:reset',
    'branding:pickIconFile',
    'dialog:selectDirectory',
    'update:check',
    'update:download',
    'update:install',
  ],
  'library.js': [
    'manga:countLocalChapters',
    'manga:computeFavoriteChapterSync',
    'manga:listLocalMangaLibrary',
    'manga:loadOfflineFromAbsolutePath',
    'manga:loadOfflineFromDisk',
    'manga:filterChaptersWithLocalImages',
    'manga:listChapterImageFiles',
    'manga:readLocalChapterImage',
    'manga:checkChapterSubfolders',
    'manga:fetchRemoteImageAsDataUrl',
  ],
  'reader.js': [
    'manga:listCbzInDirectory',
    'manga:findFirstImageInDirectory',
    'manga:loadCbzFromAbsolutePath',
    'manga:pickAndLoadCbz',
    'manga:releaseCbzTempDir',
    'manga:pickAndLoadArchive',
    'manga:loadArchiveFromAbsolutePath',
    'manga:listArchivesInDirectory',
    'ebook:detectContentType',
    'ebook:loadTextEpub',
    'ebook:readSpineItem',
    'ebook:loadTextPdf',
    'ebook:readPdfPage',
    'ebook:releaseEbook',
    'cache:getSummary',
    'cache:clear',
  ],
  'download.js': [
    'manga:abortDownload',
    'app:listConnectors',
    'app:testConnector',
    'app:detectSiteFromUrl',
    'manga:load',
    'manga:fetchLatestUpdates',
    'manga:fetchComicvnMoiNhat',
    'bulkScan:getSessions',
    'bulkScan:saveSession',
    'manga:fetchBulkScan',
    'manga:fetchMangadexCovers',
    'manga:downloadMangadexCovers',
    'manga:downloadChapter',
  ],
  'export.js': [
    'dialog:selectCbzFiles',
    'dialog:selectImageFiles',
    'dialog:selectFiles',
    'manga:estimateCbzSizeSplit',
    'manga:exportCbz',
    'manga:scanImageFolder',
    'manga:cancelConvertImages',
    'manga:convertImages',
    'manga:renameScan',
    'manga:renamePreview',
    'manga:cancelRename',
    'manga:renameApply',
    'manga:renameUndo',
    'manga:combineCbz',
    'manga:splitCbz',
    'manga:exportpdf',
    'manga:exportPdfFromDir',
    'manga:scanForSplit',
    'manga:splitDoublePages',
    'manga:cancelSplitDoublePages',
    'manga:scanForDeskew',
    'manga:deskewImages',
    'manga:cancelDeskew',
    'manga:previewDeskew',
    'manga:scanForCrop',
    'manga:cropImages',
    'manga:cancelCrop',
    'manga:previewCrop',
    'ebook:selectFiles',
    'ebook:getKindleGenStatus',
    'ebook:downloadKindleGen',
    'ebook:importKindleGen',
    'ebook:convertBook',
    'ebook:batchConvert',
    'ebook:cancel',
    'ebook:scanMangaDir',
    'ebook:packManga',
  ],
  'plugins.js': [
    'plugin:list',
    'plugin:importFromFile',
    'plugin:importFromUrl',
    'plugin:confirmReplacement',
    'plugin:enable',
    'plugin:disable',
    'plugin:delete',
    'plugin:update',
    'plugin:exportAll',
    'plugin:restoreFromBackup',
    'plugin:analyzeMangaPage',
    'plugin:analyzeChapterPage',
    'plugin:getSource',
    'plugin:generateSource',
    'plugin:generateAndInstall',
  ],
  'auth.js': [
    'auth:getSession',
    'auth:loginGoogle',
    'auth:logout',
    'trial:ensureFreeUserCreditsByEmail',
    'trial:consumeFreeUserDownloadCredit',
  ],
  'kindle.js': [
    'kindle:getChapterSizes',
    'kindle:isLoggedIn',
    'kindle:login',
    'kindle:logout',
    'kindle:send',
    'kindle:pickFiles',
    'kindle:sendFile',
    'kindle:statFiles',
  ],
  'cookies.js': [
    'cookie:set',
    'cookie:delete',
    'cookie:getStatus',
    'cookie:setSendEnabled',
    'cookie:extractCloudflare',
  ],
  'tools.js': [
    'compress:scan',
    'compress:start',
    'compress:cancel',
    'duplicate:selectFolders',
    'duplicate:listFiles',
    'duplicate:scan',
    'duplicate:cancel-scan',
    'duplicate:readPreview',
    'duplicate:deleteFiles',
    'fs:getFileSize',
    'fs:getFolderSize',
    'system:getMetrics',
    'upscale:listModels',
    'upscale:checkBinary',
    'upscale:getGpuList',
    'upscale:getHardwareInfo',
    'upscale:start',
    'upscale:cancel',
    'upscale:downloadEngine',
  ],
  'imagePipeline.js': [
    'imagePipeline:scan',
    'imagePipeline:analyze',
    'imagePipeline:preview',
    'imagePipeline:run',
    'imagePipeline:cancel',
    'imagePipeline:exportTemplate',
    'imagePipeline:importTemplate',
  ],
};

function read_repo_file(relative_path) {
  return fs.readFileSync(path.join(REPO_ROOT, relative_path), 'utf8');
}

function list_ipc_channels(source_text) {
  return [...source_text.matchAll(/ipcMain\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g)].map(
    (match_row) => match_row[1],
  );
}

describe('electron IPC split', () => {
  it('exports registerAllIpc from electron/ipc/index.js', () => {
    const index_source = read_repo_file('electron/ipc/index.js');
    expect(index_source).toMatch(/function registerAllIpc\s*\(\s*ipc_context\s*\)/);
    expect(index_source).toMatch(/module\.exports\s*=\s*\{[^}]*registerAllIpc/);
  });

  it('main.js defines createIpcContext and calls registerAllIpc', () => {
    const main_source = read_repo_file('electron/main.js');
    expect(main_source).toMatch(/function createIpcContext\s*\(/);
    expect(main_source).toMatch(/registerAllIpc\s*\(\s*createIpcContext\s*\(\s*\)\s*\)/);
  });

  it('each existing ipc feature file owns exactly its mapped channels and main.js does not', () => {
    const main_channels = list_ipc_channels(read_repo_file('electron/main.js'));
    for (const [file_name, expected_channels] of Object.entries(CHANNEL_MAP)) {
      const file_path = path.join(REPO_ROOT, 'electron/ipc', file_name);
      if (!fs.existsSync(file_path)) continue;
      const file_channels = list_ipc_channels(fs.readFileSync(file_path, 'utf8'));
      expect(file_channels.sort()).toEqual([...expected_channels].sort());
      for (const channel_name of expected_channels) {
        expect(main_channels).not.toContain(channel_name);
      }
    }
  });

  it('when all ipc modules exist, main.js has zero ipcMain.handle/on', () => {
    const missing_file = Object.keys(CHANNEL_MAP).some(
      (file_name) => !fs.existsSync(path.join(REPO_ROOT, 'electron/ipc', file_name)),
    );
    if (missing_file) return;
    const main_channels = list_ipc_channels(read_repo_file('electron/main.js'));
    expect(main_channels).toEqual([]);
  });
});
