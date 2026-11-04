'use strict';

const fs = require('fs');
const path = require('path');

describe('Ebook Studio IPC Registration', () => {
  test('electron/ipc/export.js registers all required ebook channels', () => {
    const exportIpcPath = path.join(__dirname, '../../../ipc/export.js');
    const content = fs.readFileSync(exportIpcPath, 'utf8');

    const expectedChannels = [
      'ebook:selectFiles',
      'ebook:getKindleGenStatus',
      'ebook:downloadKindleGen',
      'ebook:importKindleGen',
      'ebook:convertBook',
      'ebook:batchConvert',
      'ebook:cancel',
      'ebook:scanMangaDir',
      'ebook:packManga',
    ];

    for (const channel of expectedChannels) {
      expect(content).toContain(`'${channel}'`);
    }
  });

  test('electron/preload.js exposes ebook APIs', () => {
    const preloadPath = path.join(__dirname, '../../../preload.js');
    const content = fs.readFileSync(preloadPath, 'utf8');

    const expectedApis = [
      'ebookSelectFiles',
      'ebookGetKindleGenStatus',
      'ebookDownloadKindleGen',
      'ebookImportKindleGen',
      'ebookConvertBook',
      'ebookBatchConvert',
      'ebookCancel',
      'ebookScanMangaDir',
      'ebookPackManga',
      'subscribeEbookConvertProgress',
      'subscribeEbookBatchProgress',
      'subscribeEbookToolProgress',
      'subscribeEbookPackProgress',
    ];

    for (const api of expectedApis) {
      expect(content).toContain(`${api}:`);
    }
  });
});
