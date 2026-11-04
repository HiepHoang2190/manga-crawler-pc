const { app, ipcMain } = require('electron');
const connectors = require('../lib/platform/connectors');
const cookieManager = require('../lib/platform/cookies/cookieManager');

function registerDownloadIpc(ipc_context) {
  ipcMain.on('manga:abortDownload', () => {
    ipc_context.setAbortRequested(true);
  });

  ipcMain.handle('app:listConnectors', () => connectors.listConnectors());
  ipcMain.handle('app:testConnector', async (event, { siteId, activeDomain }) => {
    return connectors.testConnector(siteId, activeDomain, (step, status, durationMs) => {
      event.sender.send('app:testConnectorProgress', { siteId, step, status, durationMs });
    });
  });

  ipcMain.handle('app:detectSiteFromUrl', (_event, url) => {
    return connectors.detectSiteIdFromUrl(String(url || '').trim());
  });

  ipcMain.handle('manga:load', async (_event, { site, url, mangadexLanguage, comickLanguage, mangaballLanguage }) => {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'URL trống.' };
    }

    // Get cookie for the site if it requires cookie
    const siteId = site || connectors.detectSiteIdFromUrl(trimmed);
    let cookie = '';
    if (siteId) {
      const connector = connectors.get(siteId);
      if (connector?.requiresCookie) {
        cookie = cookieManager.getEffectiveCookie(siteId);
      }
    }

    return connectors.load(site, trimmed, {
      mangadexLanguage,
      comickLanguage,
      mangaballLanguage,
      cookie,
      sendLog: ipc_context.sendLog,
    });
  });

  ipcMain.handle('manga:fetchLatestUpdates', async (_event, payload) => {
    const rawIds = payload && payload.siteIds;
    const siteIds = Array.isArray(rawIds)
      ? rawIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const page = connectors.clampLatestUpdatesListingPage(
      payload && payload.page,
    );
    return connectors.fetchLatestUpdates(siteIds, {
      page,
      latestUpdatesSearch: String(payload?.latestUpdatesSearch || '').trim(),
      searchLimit: payload?.searchLimit,
      mangadexLanguage: payload?.mangadexLanguage,
      minotruyenListingCategory: payload?.minotruyenListingCategory,
      comickLanguage: payload?.comickLanguage,
      mangaballLanguage: payload?.mangaballLanguage,
      getCookieForSite: (sid) => cookieManager.getEffectiveCookie(sid),
    });
  });

  ipcMain.handle('manga:fetchComicvnMoiNhat', async (event, payload) => {
    const comicvn = require('../lib/platform/connectors/comicvn');
    const maxPages = payload && payload.maxPages;
    try {
      return await comicvn.fetchMoiNhatListing({
        maxPages,
        onProgress: (p) => {
          try {
            event.sender.send('manga:comicvnMoiNhatProgress', p);
          } catch {
            /* ignore */
          }
        },
      });
    } catch (e) {
      return {
        ok: false,
        siteId: 'comicvn',
        pagesFetched: 0,
        totalPagesDetected: 1,
        items: [],
        error: String(e?.message || e),
      };
    }
  });

  const bulkScanSessionStore = require('../lib/download/bulkScanSessionStore');

  ipcMain.handle('bulkScan:getSessions', () => {
    try {
      return { ok: true, sessions: bulkScanSessionStore.readAll(app.getPath('userData')) };
    } catch (e) {
      return { ok: false, sessions: {}, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('bulkScan:saveSession', (_event, payload) => {
    try {
      return bulkScanSessionStore.saveSession(
        app.getPath('userData'),
        payload?.siteId,
        payload?.session || {},
      );
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:fetchBulkScan', async (event, payload) => {
    const siteId = String(payload?.siteId || '').trim();
    const maxPages = payload && payload.maxPages;
    try {
      return await connectors.fetchBulkScan(siteId, {
        maxPages,
        onProgress: (p) => {
          try {
            event.sender.send('manga:bulkScanProgress', { siteId, ...p });
          } catch {
            /* ignore */
          }
        },
      });
    } catch (e) {
      return {
        ok: false,
        siteId,
        pagesFetched: 0,
        totalPagesDetected: 1,
        items: [],
        error: String(e?.message || e),
      };
    }
  });

  ipcMain.handle('manga:fetchMangadexCovers', async (_event, { urlOrId }) => {
    const { fetchCovers } = require('../lib/platform/connectors/services/mangadexService');
    const input = String(urlOrId || '').trim();
    if (!input) {
      return { ok: false, error: 'URL hoặc ID truyện trống.' };
    }
    try {
      return await fetchCovers(input);
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle('manga:downloadMangadexCovers', async (_event, { covers, directory, mangaTitle }) => {
    const fs = require('fs');
    const path = require('path');
    const { downloadImageWithRetry } = require('../lib/download/connector/connectorDownloadUtils');
    const { resolveMangaDir } = require('../lib/download/connector/connectorPathUtils');

    if (!Array.isArray(covers) || covers.length === 0) {
      return { ok: false, error: 'No covers to download' };
    }

    if (!directory || !fs.existsSync(directory)) {
      return { ok: false, error: 'Invalid directory' };
    }

    // Create manga directory and _covers subfolder
    const mangaDir = resolveMangaDir(directory, mangaTitle);
    const coversDir = path.join(mangaDir, '_covers');

    try {
      if (!fs.existsSync(mangaDir)) {
        fs.mkdirSync(mangaDir, { recursive: true });
      }
      if (!fs.existsSync(coversDir)) {
        fs.mkdirSync(coversDir, { recursive: true });
      }
    } catch (err) {
      return { ok: false, error: `Failed to create folders: ${err.message}` };
    }

    const results = [];
    const sanitizedTitle = String(mangaTitle || 'manga').replace(/[<>:"/\\|?*]/g, '_');

    for (const cover of covers) {
      try {
        const volumeStr = cover.volume
          ? `vol_${String(cover.volume).padStart(3, '0')}`
          : `cover_${cover.id.slice(0, 8)}`;

        const ext = cover.fileName.split('.').pop() || 'jpg';
        const filename = `${sanitizedTitle}_${volumeStr}.${ext}`;
        const filePath = path.join(coversDir, filename);

        // Use the same download utility as chapter images
        const headers = {
          'Referer': 'https://mangadex.org/',
        };

        const result = await downloadImageWithRetry(cover.urlOriginal, filePath, headers, 3);

        if (!result.ok) {
          throw new Error(result.error || 'Download failed');
        }

        results.push({ id: cover.id, ok: true, filePath });
      } catch (err) {
        results.push({ id: cover.id, ok: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    const errorCount = results.filter(r => !r.ok).length;

    return {
      ok: true,
      successCount,
      errorCount,
      results,
      coversFolder: coversDir,
    };
  });

  ipcMain.handle(
    'manga:downloadChapter',
    async (
      _event,
      {
        site,
        mangaTitle,
        mangaUrl,
        chapterUrl,
        chapterTitle,
        baseSaveDir,
        numberOfThreads,
        coverUrl,
        streamRequestId,
        mangadexLanguage,
        comickLanguage,
        mangaballLanguage,
        prefetchChapterUrls,
      }
    ) => {
      ipc_context.setAbortRequested(false);
      const onLog = (msg, level) => ipc_context.sendLog(msg, level);
      const onProgress = (payload) => ipc_context.sendDownloadProgress(payload);
      const n = Number(numberOfThreads);
      const threadsClamped = Math.max(1, Math.min(Number.isFinite(n) && n > 0 ? Math.floor(n) : 5, 5));
      const stream_id = typeof streamRequestId === 'string' && streamRequestId.trim() ? streamRequestId.trim() : '';
      const sender = _event?.sender;
      const onChapterTotal =
        stream_id && sender && typeof sender.send === 'function'
          ? (total) =>
            sender.send('manga:streamingChapterEvent', {
              streamRequestId: stream_id,
              type: 'total',
              total,
            })
          : undefined;
      const onPageDownloaded =
        stream_id && sender && typeof sender.send === 'function'
          ? (fileName, pageIndex, total) =>
            sender.send('manga:streamingChapterEvent', {
              streamRequestId: stream_id,
              type: 'page',
              fileName,
              pageIndex,
              total,
            })
          : undefined;
      return connectors.downloadChapter(site, {
        mangaTitle,
        mangaUrl,
        chapterUrl,
        chapterTitle,
        baseSaveDir,
        numberOfThreads: threadsClamped,
        coverUrl,
        chapterFolderFormat: ipc_context.getChapterFolderSettings(),
        mangadexLanguage,
        comickLanguage,
        mangaballLanguage,
        onLog,
        onProgress,
        shouldAbort: () => ipc_context.isAbortRequested(),
        prefetchChapterUrls: Array.isArray(prefetchChapterUrls)
          ? prefetchChapterUrls.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 8)
          : [],
        ...(onChapterTotal ? { onChapterTotal } : {}),
        ...(onPageDownloaded ? { onPageDownloaded } : {}),
      });
    }
  );
}

module.exports = { registerDownloadIpc };
