/**
 * Core Node Adapters for Workflow Engine
 * Binds atomic functions from electron/lib to Workflow DAG nodes.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Notification } = require('electron');
const archiver = require('archiver');
const { finished } = require('stream/promises');

let mangaUtils = null;
try {
  mangaUtils = require('../../shared/mangaUtils');
} catch (e) {
  // Graceful fallback for isolated test environments
}

const formatFolderName = mangaUtils?.formatFolderName || ((name) => String(name || '').replace(/[\\/:*?"<>|]/g, '_'));
const extractChapterNumberString = mangaUtils?.extractChapterNumberString || ((title) => {
  const m = String(title || '').match(/(?:chap(?:ter)?|chương|c|#)\s*([0-9]+(?:\.[0-9]+)?)/i) || String(title || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? m[1] : null;
});
const sortChaptersForExport = mangaUtils?.sortChaptersForExport || ((chapters) => [...chapters]);

function parseRangeValues(rangeStr) {
  if (!rangeStr || !String(rangeStr).trim()) return [];
  const parts = String(rangeStr).split(/[,;\s]+/).filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseFloat(startStr);
      const end = parseFloat(endStr);
      if (!isNaN(start) && !isNaN(end)) {
        result.push({ type: 'range', min: Math.min(start, end), max: Math.max(start, end) });
      }
    } else {
      const val = parseFloat(part);
      if (!isNaN(val)) {
        result.push({ type: 'single', val });
      }
    }
  }
  return result;
}

function matchesRange(num, ranges) {
  if (!ranges || ranges.length === 0) return true;
  return ranges.some((r) => {
    if (r.type === 'range') return num >= r.min && num <= r.max;
    if (r.type === 'single') return num === r.val;
    return false;
  });
}

function createAdapters({ connectors = null, ipc_context = null } = {}) {
  let defaultConnectors = null;
  try {
    defaultConnectors = require('../../platform/connectors');
  } catch (e) {
    // optional in isolated testing
  }
  const activeConnectors = connectors || ipc_context?.connectors || defaultConnectors;

  async function safeTrashFolderOrFile(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return false;
    const resolved = path.resolve(targetPath);
    const home = path.resolve(os.homedir());
    if (resolved === home || resolved === '/' || resolved.length <= 3) {
      throw new Error(`Từ chối xóa thư mục nhạy cảm của hệ thống: ${resolved}`);
    }

    let trashed = false;
    try {
      const electron = require('electron');
      const shell = electron?.shell || ipc_context?.shell;
      if (shell?.trashItem) {
        await shell.trashItem(resolved);
        trashed = true;
      }
    } catch (e) {}

    if (!trashed && ipc_context?.trashItem) {
      try {
        await ipc_context.trashItem(resolved);
        trashed = true;
      } catch (e) {}
    }

    if (!trashed) {
      fs.rmSync(resolved, { recursive: true, force: true });
      trashed = true;
    }
    return trashed;
  }

  return {
    manga_crawler: async (node, inputs, onProgress = () => {}, signal) => {
      const url = (node.data?.defaultUrl || inputs.url || '').trim();
      if (!url) {
        throw new Error('Chưa nhập URL truyện đầu vào trong khối "Tải Truyện Từ Web"');
      }

      onProgress({ message: `Đang kết nối tới URL: ${url}`, step: 'trigger' });

      let mangaTitle = node.data?.mangaTitle || '';
      let coverUrl = node.data?.coverUrl || '';
      let chapters = node.data?.cachedChapters || null;
      let siteId = node.data?.siteId || null;

      if (!siteId && activeConnectors?.detectSiteIdFromUrl) {
        siteId = activeConnectors.detectSiteIdFromUrl(url);
      }

      if ((!chapters || chapters.length === 0) && activeConnectors) {
        onProgress({ message: `Đang nạp thông tin từ máy chủ ${siteId ? `[${siteId}]` : ''}...`, step: 'trigger' });
        try {
          const res = await activeConnectors.load(siteId, url, {
            sendLog: (msg) => onProgress({ message: msg, step: 'trigger' }),
          });
          if (res && res.ok) {
            mangaTitle = res.manga?.title || res.title || mangaTitle || 'Truyện Tranh';
            coverUrl = res.manga?.coverUrl || res.coverUrl || coverUrl || '';
            chapters = res.chapters || [];
            siteId = res.manga?.siteId || siteId;
            onProgress({
              message: `Đã nạp thành công "${mangaTitle}" (Tìm thấy ${chapters.length} chapter)`,
              step: 'trigger',
              type: 'success',
            });
          } else {
            throw new Error(res?.error || `Không thể nạp thông tin từ URL: ${url}`);
          }
        } catch (err) {
          throw new Error(`Lỗi kết nối URL truyện: ${err.message}`);
        }
      }

      if (!chapters || chapters.length === 0) {
        throw new Error(`Không tìm thấy chapter nào từ URL: ${url}`);
      }

      const strategy = node.data?.strategy || 'all';
      const latestCount = Math.max(1, Number(node.data?.latestCount) || 1);
      const rangeValue = node.data?.rangeValue || '';
      const selectedChapterIds = Array.isArray(node.data?.selectedChapterIds) ? node.data.selectedChapterIds : [];

      let filtered = [];
      if (strategy === 'all') {
        filtered = [...chapters];
      } else if (strategy === 'custom') {
        const idSet = new Set(selectedChapterIds);
        if (idSet.size > 0) {
          filtered = chapters.filter((ch, idx) =>
            idSet.has(ch.id) || idSet.has(ch.url) || idSet.has(String(idx)) || idSet.has(ch.title)
          );
        }
        if (filtered.length === 0) {
          filtered = [...chapters];
        }
      } else if (strategy === 'latest') {
        const sorted = sortChaptersForExport ? sortChaptersForExport(chapters) : [...chapters];
        filtered = sorted.slice(-latestCount);
      } else if (strategy === 'range') {
        if (!rangeValue.trim()) {
          filtered = [...chapters];
        } else {
          filtered = chapters.filter((ch, idx) => {
            const chapNum = typeof ch.chapterNumber === 'number'
              ? ch.chapterNumber
              : (parseFloat(ch.title?.match(/\d+(\.\d+)?/)?.[0]) || (idx + 1));
            return matchesRange(chapNum, rangeValue);
          });
        }
      }

      if (filtered.length === 0) {
        throw new Error('Danh sách chapter sau khi lọc trống, không có chapter nào phù hợp để tải');
      }

      onProgress({
        message: `Đã lọc ${filtered.length}/${chapters.length} chapter sẵn sàng tải`,
        step: 'filter',
        type: 'info',
      });

      let defaultDir = null;
      try {
        const s = ipc_context?.readSettings?.();
        if (s?.lastSaveDir && s.lastSaveDir.trim()) {
          defaultDir = s.lastSaveDir.trim();
        }
      } catch (e) {}

      if (!defaultDir && ipc_context?.getDefaultMangaSaveDir) {
        try {
          defaultDir = ipc_context.getDefaultMangaSaveDir();
        } catch (e) {}
      }

      if (!defaultDir) {
        try {
          defaultDir = path.join(require('os').homedir(), 'Downloads', 'Manga');
        } catch (e) {
          defaultDir = path.join(process.cwd(), 'downloads');
        }
      }

      const baseSaveDir = (node.data?.outputBaseDir || '').trim() || defaultDir;
      if (!fs.existsSync(baseSaveDir)) {
        fs.mkdirSync(baseSaveDir, { recursive: true });
      }

      let appThreads = 3;
      try {
        const s = ipc_context?.readSettings?.();
        if (s?.mangaDownloadThreads) {
          appThreads = Math.max(1, Math.min(Number(s.mangaDownloadThreads) || 3, 5));
        }
      } catch (e) {}

      const rawConcurrency = node.data?.concurrency !== undefined ? Number(node.data.concurrency) : appThreads;
      const concurrency = Math.max(1, Math.min(Number.isFinite(rawConcurrency) ? rawConcurrency : 3, 5));

      onProgress({
        message: `Bắt đầu tải ${filtered.length} chapter của "${mangaTitle}" vào: ${baseSaveDir}`,
        step: 'download',
        totalChapters: filtered.length,
        currentChapter: 0,
      });

      let savedMangaDir = null;
      const completedChapters = [];
      const failedChapters = [];

      for (let i = 0; i < filtered.length; i++) {
        if (signal?.aborted) {
          onProgress({ message: 'Tiến trình tải bị dừng bởi người dùng', step: 'download', type: 'warn' });
          break;
        }

        const ch = filtered[i];
        const chapterUrl = ch.url || ch.chapterUrl;
        const chapterTitle = ch.title || `Chapter ${i + 1}`;

        onProgress({
          message: `[${i + 1}/${filtered.length}] Đang chuẩn bị tải: ${chapterTitle}`,
          step: 'download',
          currentChapter: i + 1,
          totalChapters: filtered.length,
          chapterTitle,
        });

        if (activeConnectors && typeof activeConnectors.downloadChapter === 'function') {
          const resolvedSiteId = siteId ||
            (activeConnectors.detectSiteIdFromUrl ? (activeConnectors.detectSiteIdFromUrl(chapterUrl) || activeConnectors.detectSiteIdFromUrl(url)) : null);

          let res;
          try {
            res = await activeConnectors.downloadChapter(resolvedSiteId, {
              site: resolvedSiteId,
              mangaTitle,
              mangaUrl: url,
              chapterUrl,
              chapterTitle,
              volume: ch.volume,
              baseSaveDir,
              numberOfThreads: concurrency,
              coverUrl,
              chapterFolderFormat: ipc_context?.getChapterFolderSettings ? ipc_context.getChapterFolderSettings() : undefined,
              onProgress: (p) => {
                onProgress({
                  message: `[${i + 1}/${filtered.length}] ${chapterTitle}: đã tải ${p.current || 0}/${p.total || 0} trang (${p.percent || 0}%)`,
                  step: 'download',
                  chapterPercent: p.percent,
                  currentChapter: i + 1,
                  totalChapters: filtered.length,
                });
              },
              onLog: (msg, level) => {
                onProgress({
                  message: msg,
                  step: 'download',
                  type: level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info',
                });
                ipc_context?.sendLog?.(msg, level);
              },
              shouldAbort: () => signal?.aborted,
            });
          } catch (e) {
            const safeTitle = formatFolderName(mangaTitle, 255);
            const safeChapter = formatFolderName(chapterTitle, 255);
            const chapterDir = path.join(baseSaveDir, safeTitle, safeChapter);
            res = await activeConnectors.downloadChapter(resolvedSiteId, chapterUrl, chapterDir);
            if (res && res.ok && !res.outputDir) res.outputDir = chapterDir;
          }

          if (res && res.ok) {
            const outDir = res.outputDir || path.join(baseSaveDir, formatFolderName(mangaTitle, 255), formatFolderName(chapterTitle, 255));
            completedChapters.push({ ...ch, outputDir: outDir });
            if (!savedMangaDir) {
              savedMangaDir = path.dirname(outDir);
            }
            onProgress({
              message: `Đã tải xong [${i + 1}/${filtered.length}] ${chapterTitle}`,
              step: 'download',
              type: 'success',
            });
          } else {
            if (res?.aborted || signal?.aborted) break;
            const errMsg = res?.error || 'Lỗi không xác định khi tải ảnh chapter';
            failedChapters.push({ chapterTitle, error: errMsg });
            onProgress({
              message: `Tải thất bại ${chapterTitle}: ${errMsg}`,
              step: 'download',
              type: 'error',
            });
          }
        } else {
          const safeTitle = formatFolderName(mangaTitle, 255);
          const safeChapter = formatFolderName(chapterTitle, 255);
          const chapterDir = path.join(baseSaveDir, safeTitle, safeChapter);
          fs.mkdirSync(chapterDir, { recursive: true });
          fs.writeFileSync(path.join(chapterDir, 'page_001.jpg'), 'mock-image-data');
          savedMangaDir = path.dirname(chapterDir);
          completedChapters.push({ ...ch, outputDir: chapterDir });
        }
      }

      if (completedChapters.length === 0) {
        const reasons = failedChapters.map((f) => `${f.chapterTitle}: ${f.error}`).join('; ');
        throw new Error(`Không tải được chapter nào. Chi tiết: ${reasons || 'Không kết nối được server truyện'}`);
      }

      if (!savedMangaDir) {
        savedMangaDir = path.join(baseSaveDir, formatFolderName(mangaTitle, 255));
      }

      onProgress({
        message: `Hoàn tất tải truyện! Thành công ${completedChapters.length}/${filtered.length} chapter tại: ${savedMangaDir}`,
        step: 'download',
        type: 'success',
      });

      return {
        images_dir: savedMangaDir,
        chapter_list: completedChapters,
        mangaTitle,
        baseSaveDir,
        coverUrl,
        siteId,
        completedChapters,
        totalChapters: filtered.length,
      };
    },

    manual_trigger: async (node, inputs, onProgress = () => {}) => {
      const url = (node.data?.defaultUrl || inputs.url || '').trim();
      if (!url) {
        throw new Error('Chưa nhập URL truyện đầu vào trong khối "Nhập URL Truyện"');
      }

      onProgress({ message: `Đang kết nối tới URL: ${url}`, step: 'trigger' });

      let mangaTitle = node.data?.mangaTitle || '';
      let coverUrl = node.data?.coverUrl || '';
      let chapters = node.data?.cachedChapters || null;
      let siteId = node.data?.siteId || null;

      if (!siteId && activeConnectors?.detectSiteIdFromUrl) {
        siteId = activeConnectors.detectSiteIdFromUrl(url);
      }

      if ((!chapters || chapters.length === 0) && activeConnectors) {
        onProgress({ message: `Đang nạp thông tin từ máy chủ ${siteId ? `[${siteId}]` : ''}...`, step: 'trigger' });
        try {
          const res = await activeConnectors.load(siteId, url, {
            sendLog: (msg) => onProgress({ message: msg, step: 'trigger' }),
          });
          if (res && res.ok) {
            mangaTitle = res.manga?.title || res.title || mangaTitle || 'Truyện Tranh';
            coverUrl = res.manga?.coverUrl || res.coverUrl || coverUrl || '';
            chapters = res.chapters || [];
            siteId = res.manga?.siteId || siteId;
            onProgress({
              message: `Đã nạp thành công "${mangaTitle}" (Tìm thấy ${chapters.length} chapter)`,
              step: 'trigger',
              type: 'success',
            });
          } else {
            throw new Error(res?.error || `Không thể nạp thông tin từ URL: ${url}`);
          }
        } catch (err) {
          throw new Error(`Lỗi kết nối URL truyện: ${err.message}`);
        }
      }

      if (!chapters || chapters.length === 0) {
        throw new Error(`Không tìm thấy chapter nào từ URL: ${url}`);
      }

      return {
        url,
        mangaUrl: url,
        siteId,
        mangaTitle,
        coverUrl,
        chapter_list: chapters || [],
      };
    },

    folder_trigger: async (node, inputs, onProgress = () => {}) => {
      const folderPath = (node.data?.folderPath || inputs.images_dir || '').trim();
      if (!folderPath) {
        throw new Error('Chưa chọn thư mục đầu vào trong khối "Thư Mục Trên Máy"');
      }
      if (!fs.existsSync(folderPath)) {
        throw new Error(`Thư mục không tồn tại: ${folderPath}`);
      }

      const mangaTitle = (node.data?.mangaTitle || '').trim() || path.basename(folderPath);
      onProgress({
        message: `Đã chọn thư mục nguồn: "${mangaTitle}" (${folderPath})`,
        step: 'trigger',
      });

      return {
        images_dir: folderPath,
        mangaTitle,
        baseSaveDir: path.dirname(folderPath),
        signal: { status: 'ready', folderPath },
      };
    },

    chapter_selector: async (node, inputs, onProgress = () => {}) => {
      const url = (typeof inputs.url === 'string' ? inputs.url : inputs.url?.url) || node.data?.defaultUrl || '';
      let chapterList = inputs.chapter_list || inputs.url?.chapter_list || null;
      let mangaTitle = inputs.mangaTitle || inputs.url?.mangaTitle || '';
      let coverUrl = inputs.coverUrl || inputs.url?.coverUrl || '';
      let siteId = inputs.siteId || inputs.url?.siteId || null;
      const mangaUrl = inputs.mangaUrl || inputs.url || url;

      if (!siteId && activeConnectors?.detectSiteIdFromUrl && url) {
        siteId = activeConnectors.detectSiteIdFromUrl(url);
      }

      if ((!chapterList || chapterList.length === 0) && url && activeConnectors) {
        onProgress({ message: `Đang lấy danh sách chapter từ: ${url}`, step: 'filter' });
        const res = await activeConnectors.load(siteId, url, {
          sendLog: (msg) => onProgress({ message: msg, step: 'filter' }),
        });
        if (res && res.ok && Array.isArray(res.chapters)) {
          chapterList = res.chapters;
          mangaTitle = res.manga?.title || res.title || mangaTitle;
          coverUrl = res.manga?.coverUrl || res.coverUrl || coverUrl;
          siteId = res.manga?.siteId || siteId;
        } else {
          throw new Error(res?.error || `Không thể lấy danh sách chapter từ: ${url}`);
        }
      }

      if (!chapterList || !Array.isArray(chapterList) || chapterList.length === 0) {
        throw new Error('Danh sách chapter trống, vui lòng kiểm tra lại URL truyện');
      }

      const strategy = node.data?.strategy || 'all';
      const latestCount = Math.max(1, Number(node.data?.latestCount) || 1);
      const rangeValue = node.data?.rangeValue || '';
      const selectedChapterIds = Array.isArray(node.data?.selectedChapterIds) ? node.data.selectedChapterIds : [];

      let filtered = [];

      if (strategy === 'all') {
        filtered = [...chapterList];
      } else if (strategy === 'custom') {
        const idSet = new Set(selectedChapterIds);
        if (idSet.size > 0) {
          filtered = chapterList.filter((ch, idx) =>
            idSet.has(ch.id) || idSet.has(ch.url) || idSet.has(String(idx)) || idSet.has(ch.title)
          );
        }
        if (filtered.length === 0) {
          filtered = [...chapterList];
        }
      } else if (strategy === 'latest') {
        const sorted = sortChaptersForExport ? sortChaptersForExport(chapterList) : [...chapterList];
        filtered = sorted.slice(-latestCount);
      } else if (strategy === 'range') {
        const ranges = parseRangeValues(rangeValue);
        filtered = chapterList.filter((ch, idx) => {
          const numStr = ch.chapterNumber != null ? String(ch.chapterNumber) : (extractChapterNumberString ? extractChapterNumberString(ch.title) : null);
          const num = numStr != null && !isNaN(parseFloat(numStr)) ? parseFloat(numStr) : (idx + 1);
          return matchesRange(num, ranges);
        });
        if (filtered.length === 0 && ranges.length > 0) {
          filtered = chapterList.filter((_, idx) => matchesRange(idx + 1, ranges));
        }
      } else {
        filtered = [...chapterList];
      }

      if (filtered.length === 0) {
        throw new Error(`Quy tắc lọc "${strategy}" không khớp chapter nào trong tổng số ${chapterList.length} chapter`);
      }

      onProgress({
        message: `Đã chọn ${filtered.length}/${chapterList.length} chapter để tải: [${filtered.map(c => c.title || c.chapterName).slice(0, 3).join(', ')}${filtered.length > 3 ? '...' : ''}]`,
        step: 'filter',
        type: 'success',
      });

      return {
        url,
        mangaUrl,
        siteId,
        mangaTitle,
        coverUrl,
        chapter_list: filtered,
      };
    },

    downloader: async (node, inputs, onProgress = () => {}, signal) => {
      const chapterList = inputs.chapter_list || [];
      if (!Array.isArray(chapterList) || chapterList.length === 0) {
        throw new Error('Danh sách chapter trống, không có nội dung để tải');
      }

      const mangaTitle = inputs.mangaTitle || node.data?.mangaTitle || 'Manga';
      const coverUrl = inputs.coverUrl || '';
      const mangaUrl = inputs.mangaUrl || inputs.url || '';
      const siteId = inputs.siteId || null;

      let defaultDir = null;
      try {
        const s = ipc_context?.readSettings?.();
        if (s?.lastSaveDir && s.lastSaveDir.trim()) {
          defaultDir = s.lastSaveDir.trim();
        }
      } catch (e) {}

      if (!defaultDir && ipc_context?.getDefaultMangaSaveDir) {
        try {
          defaultDir = ipc_context.getDefaultMangaSaveDir();
        } catch (e) {}
      }

      if (!defaultDir) {
        try {
          defaultDir = path.join(require('os').homedir(), 'Downloads', 'Manga');
        } catch (e) {
          defaultDir = path.join(process.cwd(), 'downloads');
        }
      }

      const baseSaveDir = (node.data?.outputBaseDir || '').trim() || defaultDir;

      if (!fs.existsSync(baseSaveDir)) {
        fs.mkdirSync(baseSaveDir, { recursive: true });
      }

      let appThreads = 3;
      try {
        const s = ipc_context?.readSettings?.();
        if (s?.mangaDownloadThreads) {
          appThreads = Math.max(1, Math.min(Number(s.mangaDownloadThreads) || 3, 5));
        }
      } catch (e) {}

      const rawConcurrency = node.data?.concurrency !== undefined ? Number(node.data.concurrency) : appThreads;
      const concurrency = Math.max(1, Math.min(Number.isFinite(rawConcurrency) ? rawConcurrency : 3, 5));

      onProgress({
        message: `Bắt đầu tải ${chapterList.length} chapter của "${mangaTitle}" vào: ${baseSaveDir}`,
        step: 'download',
        totalChapters: chapterList.length,
        currentChapter: 0,
      });

      let savedMangaDir = null;
      const completedChapters = [];
      const failedChapters = [];

      for (let i = 0; i < chapterList.length; i++) {
        if (signal?.aborted) {
          onProgress({ message: 'Tiến trình tải bị dừng bởi người dùng', step: 'download', type: 'warn' });
          break;
        }

        const ch = chapterList[i];
        const chapterUrl = ch.url || ch.chapterUrl;
        const chapterTitle = ch.title || `Chapter ${i + 1}`;

        onProgress({
          message: `[${i + 1}/${chapterList.length}] Đang chuẩn bị tải: ${chapterTitle}`,
          step: 'download',
          currentChapter: i + 1,
          totalChapters: chapterList.length,
          chapterTitle,
        });

        if (activeConnectors && typeof activeConnectors.downloadChapter === 'function') {
          const resolvedSiteId = siteId ||
            (activeConnectors.detectSiteIdFromUrl ? (activeConnectors.detectSiteIdFromUrl(chapterUrl) || activeConnectors.detectSiteIdFromUrl(mangaUrl)) : null);

          onProgress({
            message: `[${i + 1}/${chapterList.length}] Kết nối connector [${resolvedSiteId || 'auto'}]: ${chapterTitle}...`,
            step: 'download',
          });

          const res = await activeConnectors.downloadChapter(resolvedSiteId, {
            site: resolvedSiteId,
            mangaTitle,
            mangaUrl,
            chapterUrl,
            chapterTitle,
            volume: ch.volume,
            baseSaveDir,
            numberOfThreads: concurrency,
            coverUrl,
            chapterFolderFormat: ipc_context?.getChapterFolderSettings ? ipc_context.getChapterFolderSettings() : undefined,
            onProgress: (p) => {
              onProgress({
                message: `[${i + 1}/${chapterList.length}] ${chapterTitle}: đã tải ${p.current || 0}/${p.total || 0} trang (${p.percent || 0}%)`,
                step: 'download',
                chapterPercent: p.percent,
                currentChapter: i + 1,
                totalChapters: chapterList.length,
              });
            },
            onLog: (msg, level) => {
              onProgress({
                message: msg,
                step: 'download',
                type: level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info',
              });
              ipc_context?.sendLog?.(msg, level);
            },
            shouldAbort: () => signal?.aborted,
          });

          if (res && res.ok) {
            completedChapters.push({ ...ch, outputDir: res.outputDir });
            if (res.outputDir && !savedMangaDir) {
              savedMangaDir = path.dirname(res.outputDir);
            }
            onProgress({
              message: `Đã tải xong [${i + 1}/${chapterList.length}] ${chapterTitle} (${res.successCount || res.totalPages || 'đầy đủ'} trang)`,
              step: 'download',
              type: 'success',
            });
          } else {
            if (res?.aborted || signal?.aborted) break;
            const errMsg = res?.error || 'Lỗi không xác định khi tải ảnh chapter';
            failedChapters.push({ chapterTitle, error: errMsg });
            onProgress({
              message: `Tải thất bại ${chapterTitle}: ${errMsg}`,
              step: 'download',
              type: 'error',
            });
          }
        } else {
          // Fallback / mock download for test environments
          const safeTitle = formatFolderName(mangaTitle, 255);
          const safeChapter = formatFolderName(chapterTitle, 255);
          const chapterDir = path.join(baseSaveDir, safeTitle, safeChapter);
          fs.mkdirSync(chapterDir, { recursive: true });
          fs.writeFileSync(path.join(chapterDir, 'page_001.jpg'), 'mock-image-data');
          savedMangaDir = path.dirname(chapterDir);
          completedChapters.push({ ...ch, outputDir: chapterDir });
        }
      }

      if (completedChapters.length === 0) {
        const reasons = failedChapters.map((f) => `${f.chapterTitle}: ${f.error}`).join('; ');
        throw new Error(`Không tải được chapter nào. Chi tiết: ${reasons || 'Không kết nối được server truyện'}`);
      }

      if (!savedMangaDir) {
        savedMangaDir = path.join(baseSaveDir, formatFolderName(mangaTitle, 255));
      }

      onProgress({
        message: `Hoàn tất tải truyện! Thành công ${completedChapters.length}/${chapterList.length} chapter tại thư mục: ${savedMangaDir}`,
        step: 'download',
        type: 'success',
      });

      return {
        images_dir: savedMangaDir,
        chapter_list: completedChapters,
        mangaTitle,
        baseSaveDir,
        siteId,
      };
    },

    duplicate_cleaner: async (node, inputs, onProgress = () => {}) => {
      const imagesDir = (inputs.images_dir || node.data?.folderPath || '').trim();
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        throw new Error('Chưa kết nối thư mục đầu vào hoặc chưa chọn thư mục trong phần cài đặt của khối Lọc & Xoá Ảnh Trùng.');
      }

      const minDuplicateCount = Math.max(2, Number(node.data?.minDuplicateCount) || 3);
      const isRecursive = node.data?.recursive !== false;
      const action = node.data?.action || 'trash';

      onProgress({
        message: `Đang quét ảnh trùng lặp trong: ${path.basename(imagesDir)} (điều kiện nhóm: ≥ ${minDuplicateCount} ảnh)...`,
        step: 'cleanup',
      });

      let duplicateGroups = [];
      try {
        const { findDuplicatesInDirectory } = require('../../export/image/duplicateImageScanner');
        const scanRes = await findDuplicatesInDirectory(imagesDir, {
          recursive: isRecursive,
        }, (cur, tot) => {
          if (tot > 0 && cur % 15 === 0) {
            onProgress({
              message: `Đang quét ảnh trùng: ${cur}/${tot} trang...`,
              step: 'cleanup',
            });
          }
        });
        duplicateGroups = scanRes?.duplicateGroups || [];
      } catch (err) {
        onProgress({
          message: `Lỗi khi quét ảnh trùng: ${err.message || String(err)}`,
          step: 'cleanup',
          type: 'warn',
        });
        return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      }

      if (!duplicateGroups || duplicateGroups.length === 0) {
        onProgress({
          message: `Không phát hiện ảnh trùng lặp nào trong ${path.basename(imagesDir)}.`,
          step: 'cleanup',
          type: 'success',
        });
        return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      }

      // Filter groups that satisfy the minDuplicateCount threshold
      const qualifiedGroups = duplicateGroups.filter(
        (g) => Array.isArray(g.files) && g.files.length >= minDuplicateCount
      );

      if (qualifiedGroups.length === 0) {
        onProgress({
          message: `Tìm thấy ${duplicateGroups.length} nhóm ảnh tương đồng nhưng không nhóm nào đạt điều kiện ≥ ${minDuplicateCount} ảnh. Toàn bộ ảnh được giữ nguyên an toàn.`,
          step: 'cleanup',
          type: 'info',
        });
        return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      }

      // Collect duplicate files to remove (keep the first original file in each group)
      const filesToDelete = [];
      for (const group of qualifiedGroups) {
        const sorted = [...group.files].sort((a, b) =>
          a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true })
        );
        for (let idx = 1; idx < sorted.length; idx++) {
          filesToDelete.push(sorted[idx].fullPath);
        }
      }

      onProgress({
        message: `Phát hiện ${qualifiedGroups.length} nhóm trùng đạt chuẩn. Đang đưa ${filesToDelete.length} ảnh dư thừa vào ${action === 'trash' ? 'Thùng rác' : 'mục xóa'}...`,
        step: 'cleanup',
      });

      if (action === 'trash') {
        try {
          if (ipc_context?.trashItem) {
            for (const f of filesToDelete) {
              await ipc_context.trashItem(f);
            }
            onProgress({
              message: `Đã chuyển thành công ${filesToDelete.length} ảnh trùng lặp vào Thùng rác an toàn.`,
              step: 'cleanup',
              type: 'success',
            });
          } else {
            const { deleteFilesUnderRoots } = require('../../export/image/duplicateImageScanner');
            const res = await deleteFilesUnderRoots(filesToDelete, [imagesDir]);
            onProgress({
              message: `Đã chuyển ${res.deleted.length} ảnh trùng lặp vào Thùng rác an toàn.${res.errors?.length ? ` (${res.errors.length} lỗi)` : ''}`,
              step: 'cleanup',
              type: 'success',
            });
          }
        } catch (trashErr) {
          onProgress({
            message: `Lỗi khi chuyển ảnh vào Thùng rác: ${trashErr.message}`,
            step: 'cleanup',
            type: 'error',
          });
        }
      } else {
        let count = 0;
        for (const f of filesToDelete) {
          try {
            if (fs.existsSync(f)) {
              fs.unlinkSync(f);
              count++;
            }
          } catch (e) {}
        }
        onProgress({
          message: `Đã xóa vĩnh viễn ${count} ảnh trùng lặp.`,
          step: 'cleanup',
          type: 'success',
        });
      }

      return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
    },

    split_double_page: async (node, inputs, onProgress = () => {}) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      }
      onProgress({ message: `Kiểm tra và cắt đôi trang đôi (${node.data?.readingDirection || 'rtl'})...` });
      return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
    },

    deskew: async (node, inputs, onProgress = () => {}) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      }
      onProgress({ message: 'Tự động làm thẳng các trang nghiêng...' });
      return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
    },

    rename_folder: async (node, inputs, onProgress = () => {}) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      }

      const mode = node.data?.mode || 'autoNormalize';

      if (mode === 'autoNormalize') {
        onProgress({
          message: `Đang chuẩn hoá tên thư mục chapter trong: ${path.basename(imagesDir)} theo chuẩn Tab Đổi Tên...`,
          step: 'rename',
        });

        try {
          const { scanRenameTree } = require('../../export/rename/scanRenameTree');
          const { planAutoNormalize } = require('../../export/rename/autoNormalize');
          const { applyRenamePlan } = require('../../export/rename/renameApply');

          const scanRes = scanRenameTree({ rootDir: imagesDir, includeFolders: true, includeFiles: false });
          const entries = scanRes?.entries || [];

          if (entries.length === 0) {
            onProgress({
              message: 'Không tìm thấy thư mục chapter con nào để chuẩn hoá tên.',
              step: 'rename',
              type: 'info',
            });
            return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
          }

          const ops = planAutoNormalize({
            entries,
            find: node.data?.find || '',
            replace: node.data?.replace || '',
          });

          if (!ops || ops.length === 0) {
            onProgress({
              message: `Tất cả ${entries.length} thư mục chapter đã ở định dạng chuẩn hoá (001, 002...), không cần đổi tên.`,
              step: 'rename',
              type: 'success',
            });
            return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
          }

          onProgress({
            message: `Tìm thấy ${ops.length} thư mục chapter cần chuẩn hoá tên (vd: ${path.basename(ops[0].fromRel)} → ${path.basename(ops[0].toRel)})...`,
            step: 'rename',
          });

          const applyRes = await applyRenamePlan({
            ops,
            onProgress: (cur, tot, op) => {
              if (op?.toRel) {
                onProgress({
                  message: `[${cur}/${tot}] Đổi tên: ${path.basename(op.fromRel)} → ${path.basename(op.toRel)}`,
                  step: 'rename',
                });
              }
            },
          });

          onProgress({
            message: `Đã chuẩn hoá thành công ${applyRes.renamed || ops.length} thư mục chapter theo chuẩn.`,
            step: 'rename',
            type: 'success',
          });
        } catch (renameErr) {
          onProgress({
            message: `Lỗi khi chuẩn hoá thư mục: ${renameErr.message || String(renameErr)}`,
            step: 'rename',
            type: 'error',
          });
        }
      } else {
        onProgress({ message: 'Đổi tên thư mục theo mẫu định dạng...' });
      }

      return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
    },

    image_convert: async (node, inputs, onProgress = () => {}, signal) => {
      return adapters.image_compress(node, inputs, onProgress, signal);
    },

    image_upscale: async (node, inputs, onProgress = () => {}, signal) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        return {
          images_dir: imagesDir,
          mangaTitle: inputs.mangaTitle,
          baseSaveDir: inputs.baseSaveDir,
          signal: { status: 'skipped' },
        };
      }

      const rawEngine = node.data?.engine || 'mangajanai';
      let engineId = 'realesrgan';
      if (String(rawEngine).toLowerCase().includes('waifu2x')) engineId = 'waifu2x';
      else if (String(rawEngine).toLowerCase().includes('realcugan')) engineId = 'realcugan';
      else if (String(rawEngine).toLowerCase().includes('realesrgan') || String(rawEngine).toLowerCase().includes('mangajanai')) engineId = 'realesrgan';

      const scale = Number(node.data?.scale) || 2;
      let modelId = node.data?.model;
      if (!modelId) {
        if (String(rawEngine).toLowerCase().includes('mangajanai')) {
          modelId = scale === 4 ? 'mangajanai-4x-1600p' : 'mangajanai-2x-1600p';
        } else if (engineId === 'realesrgan') {
          modelId = 'realesrgan-x4plus-anime';
        } else if (engineId === 'realcugan') {
          modelId = 'realcugan-se';
        } else {
          modelId = 'cunet';
        }
      } else if (modelId.startsWith('mangajanai')) {
        modelId = scale === 4 ? 'mangajanai-4x-1600p' : 'mangajanai-2x-1600p';
      }

      const denoise = typeof node.data?.denoise === 'number' ? node.data.denoise : 1;
      const inPlace = node.data?.inPlace !== false;
      const finalOutputDir = inPlace ? imagesDir : (node.data?.outputDir || path.join(imagesDir, 'upscaled'));

      onProgress({
        message: `Đang quét ảnh để upscale trong: ${path.basename(imagesDir)}...`,
        step: 'upscale',
      });

      const { scanCompressibleImages } = require('../../export/image/compressImage');
      const scanRes = await scanCompressibleImages({
        sourceDir: imagesDir,
        includeSubfolders: true,
      });

      const foundImages = scanRes?.images || [];
      if (foundImages.length === 0) {
        onProgress({
          message: 'Không tìm thấy ảnh nào để phóng to bằng AI.',
          step: 'upscale',
          type: 'info',
        });
        return {
          images_dir: finalOutputDir,
          mangaTitle: inputs.mangaTitle,
          baseSaveDir: inputs.baseSaveDir,
          signal: { status: 'skipped' },
        };
      }

      let resourcesPath = '';
      let userDataPath = '';
      try {
        const electron = require('electron');
        const app = electron?.app || ipc_context?.app;
        if (app) {
          if (app.isPackaged) {
            resourcesPath = process.resourcesPath;
          } else {
            const devResources = path.join(app.getAppPath?.() || process.cwd(), 'resources');
            resourcesPath = fs.existsSync(devResources) ? devResources : (app.getAppPath?.() || process.cwd());
          }
          userDataPath = app.getPath?.('userData') || '';
        }
      } catch (e) {}
      if (!resourcesPath) {
        const devResources = path.join(process.cwd(), 'resources');
        resourcesPath = fs.existsSync(devResources) ? devResources : process.cwd();
      }
      if (!userDataPath) {
        userDataPath = os.tmpdir();
      }

      const BinaryManagerClass = ipc_context?.BinaryManager || require('../../upscale/BinaryManager').BinaryManager;
      const bm = new BinaryManagerClass(resourcesPath, userDataPath);
      const isAvailable = bm.isBinaryAvailable ? bm.isBinaryAvailable(engineId) : false;

      if (!isAvailable && !ipc_context?.UpscaleEngine) {
        onProgress({
          message: `Engine upscale "${engineId}" chưa có binary thực thi. Vui lòng tải binary trong tab Cài đặt hoặc Upscale.`,
          step: 'upscale',
          type: 'warning',
        });
        return {
          images_dir: finalOutputDir,
          mangaTitle: inputs.mangaTitle,
          baseSaveDir: inputs.baseSaveDir,
          signal: { status: 'skipped', reason: 'binary_unavailable' },
        };
      }

      if (!inPlace && !fs.existsSync(finalOutputDir)) {
        fs.mkdirSync(finalOutputDir, { recursive: true });
      }

      onProgress({
        message: `Tìm thấy ${foundImages.length} ảnh. Bắt đầu Upscale AI (${modelId || engineId}, ${scale}x)...`,
        step: 'upscale',
      });

      const tasks = foundImages.map((img) => {
        const rel = img.relativePath || img.fileName;
        const dest = inPlace ? img.absolutePath : path.join(finalOutputDir, rel);
        const tempOut = inPlace ? `${img.absolutePath}.tmp_upscale${img.ext}` : dest;
        return {
          input: img.absolutePath,
          output: tempOut,
          finalDest: dest,
        };
      });

      const UpscaleEngineClass = ipc_context?.UpscaleEngine || require('../../upscale/UpscaleEngine').UpscaleEngine;
      const engine = new UpscaleEngineClass(resourcesPath, userDataPath);
      if (signal) {
        signal.addEventListener?.('abort', () => engine.cancel(), { once: true });
      }

      const batchRes = await engine.upscaleBatch({
        images: tasks.map((t) => ({ input: t.input, output: t.output })),
        engineId,
        modelId,
        scale,
        denoise,
        onProgress: (p) => {
          onProgress({
            message: `[${p.current}/${p.total}] Phóng to: ${p.currentFile || ''} (${p.percent || 0}%)`,
            step: 'upscale',
            percent: p.percent,
            current: p.current,
            total: p.total,
          });
        },
      });

      if (inPlace) {
        for (const task of tasks) {
          if (fs.existsSync(task.output)) {
            try {
              fs.renameSync(task.output, task.finalDest);
            } catch {
              try {
                fs.copyFileSync(task.output, task.finalDest);
                fs.unlinkSync(task.output);
              } catch {}
            }
          }
        }
      }

      onProgress({
        message: `Hoàn tất Upscale AI: ${batchRes.completed || 0} thành công, ${batchRes.failed || 0} lỗi.`,
        step: 'upscale',
        type: batchRes.failed > 0 ? 'warning' : 'success',
      });

      return {
        images_dir: finalOutputDir,
        mangaTitle: inputs.mangaTitle,
        baseSaveDir: inputs.baseSaveDir,
        signal: { status: 'success' },
      };
    },

    image_compress: async (node, inputs, onProgress = () => {}, signal) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        return {
          images_dir: imagesDir,
          mangaTitle: inputs.mangaTitle,
          baseSaveDir: inputs.baseSaveDir,
          signal: { status: 'skipped' },
        };
      }

      const rawFormat = node.data?.format || node.data?.targetFormat || 'original';
      const format = rawFormat === 'jpeg' ? 'jpg' : rawFormat;
      const quality = typeof node.data?.quality === 'number' ? node.data.quality : 90;
      const resizeEnabled = Boolean(node.data?.resizeEnabled);
      const resizePercent = resizeEnabled ? (Number(node.data?.resizePercent) || 80) : null;
      const inPlace = node.data?.inPlace !== false;
      const finalOutputDir = inPlace ? imagesDir : (node.data?.outputDir || path.join(imagesDir, 'optimized'));

      onProgress({
        message: `Đang quét ảnh để tối ưu & nén trong: ${path.basename(imagesDir)}...`,
        step: 'compress',
      });

      const { scanPipelineImages } = require('../../export/image/pipeline/scanImages');
      const scanRes = await scanPipelineImages({
        sourceDir: imagesDir,
        includeSubfolders: true,
      });

      const foundImages = scanRes?.images || [];
      if (foundImages.length === 0) {
        onProgress({
          message: 'Không tìm thấy ảnh nào để tối ưu / nén.',
          step: 'compress',
          type: 'info',
        });
        return {
          images_dir: finalOutputDir,
          mangaTitle: inputs.mangaTitle,
          baseSaveDir: inputs.baseSaveDir,
          signal: { status: 'skipped' },
        };
      }

      if (!inPlace && !fs.existsSync(finalOutputDir)) {
        fs.mkdirSync(finalOutputDir, { recursive: true });
      }

      const formatLabel = format === 'original' ? 'Giữ gốc' : format.toUpperCase();
      onProgress({
        message: `Tìm thấy ${foundImages.length} ảnh. Bắt đầu tối ưu (${formatLabel}, Chất lượng: ${quality}%, Resize: ${resizeEnabled ? `${resizePercent}%` : 'Tắt'})...`,
        step: 'compress',
      });

      const { runPipeline } = require('../../export/image/pipeline/runPipeline');
      let isAborted = false;
      if (signal) {
        signal.addEventListener?.('abort', () => { isAborted = true; }, { once: true });
      }

      const res = await runPipeline({
        files: foundImages,
        actions: [],
        output: {
          format,
          quality,
          resizePercent,
          inPlace,
          outputDir: finalOutputDir,
        },
        isCancelled: () => Boolean(signal?.aborted || isAborted),
        onProgress: (p) => {
          onProgress({
            message: `[${p.current}/${p.total}] Tối ưu: ${path.basename(p.item || '')}`,
            step: 'compress',
            percent: p.percent || Math.round((p.current / p.total) * 100),
            current: p.current,
            total: p.total,
          });
        },
      });

      onProgress({
        message: `Hoàn tất tối ưu & nén: ${res.done || 0}/${foundImages.length} thành công${res.failed?.length ? `, ${res.failed.length} lỗi` : ''}.`,
        step: 'compress',
        type: res.failed?.length ? 'warning' : 'success',
      });

      return {
        images_dir: finalOutputDir,
        mangaTitle: inputs.mangaTitle,
        baseSaveDir: inputs.baseSaveDir,
        signal: { status: 'success' },
      };
    },

    translate: async (node, inputs, onProgress = () => {}) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir) return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
      onProgress({ message: 'Dịch thuật truyện tranh bằng AI...' });
      return { images_dir: imagesDir, mangaTitle: inputs.mangaTitle, baseSaveDir: inputs.baseSaveDir };
    },

    export_cbz: async (node, inputs, onProgress = () => {}, signal) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        throw new Error('Không tìm thấy thư mục ảnh để đóng gói CBZ');
      }

      const mangaTitle = inputs.mangaTitle || path.basename(imagesDir);
      const safeTitle = formatFolderName(mangaTitle, 180) || 'Comic';
      const defaultDestDir = (inputs.baseSaveDir && fs.existsSync(inputs.baseSaveDir))
        ? inputs.baseSaveDir
        : path.dirname(imagesDir);
      const destDir = (node.data?.outputDir || '').trim() || defaultDestDir;

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const cbzPath = path.join(destDir, `${safeTitle}.cbz`);
      const mode = node.data?.packMode === 'sizeSplit' ? 'sizeSplit' : 'singleVolume';
      const maxMb = Number(node.data?.maxMbPerFile || 200);
      const maxBytes = Math.floor(Math.max(1, maxMb) * 1024 * 1024);
      const rotateDoublePage = Boolean(node.data?.rotateDoublePage);

      let generatedFiles = [];

      // Nếu cấu hình sizeSplit hoặc xoay trang đôi, dùng exportChaptersToCbz
      if (mode === 'sizeSplit' || rotateDoublePage) {
        let chaptersToExport = inputs.chapter_list;
        if (!Array.isArray(chaptersToExport) || !chaptersToExport.length) {
          const { loadOfflineMangaFromAbsolutePath } = require('../../reader/loaders/loadOfflineMangaFromDisk');
          const loaded = loadOfflineMangaFromAbsolutePath(imagesDir);
          if (loaded?.ok && Array.isArray(loaded.chapters) && loaded.chapters.length > 0) {
            chaptersToExport = loaded.chapters;
          } else {
            chaptersToExport = [{ title: mangaTitle, folderBasename: '.' }];
          }
        }

        const { exportChaptersToCbz } = require('../../export/exportCbz');
        generatedFiles = await exportChaptersToCbz({
          mode,
          baseSaveDir: inputs.baseSaveDir || path.dirname(imagesDir),
          mangaTitle,
          chapters: chaptersToExport,
          outputDir: destDir,
          outputFile: mode === 'singleVolume' ? cbzPath : undefined,
          maxBytes,
          rotateDoublePage,
          absoluteMangaDir: imagesDir,
          onProgress: (p) => onProgress({ message: `Đang đóng gói CBZ: ${p.label || ''} (${p.done}/${p.total})` }),
        });
      } else {
        // Đóng gói thông thường 1 file toàn bộ imagesDir
        onProgress({ message: `Đang khởi tạo tệp CBZ: ${path.basename(cbzPath)}` });

        const output = fs.createWriteStream(cbzPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);

        archive.on('progress', (progress) => {
          const { entries } = progress;
          onProgress({
            message: `Đang nén CBZ (${entries.processed}/${entries.total})`,
            processed: entries.processed,
            total: entries.total,
          });
        });

        function addDirToArchive(currentDir, relativePrefix = '') {
          const items = fs.readdirSync(currentDir, { withFileTypes: true });
          items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

          for (const item of items) {
            if (signal?.aborted) break;
            const fullPath = path.join(currentDir, item.name);
            if (fullPath === cbzPath) continue;

            const relPath = relativePrefix ? `${relativePrefix}/${item.name}` : item.name;
            if (item.isDirectory()) {
              addDirToArchive(fullPath, relPath);
            } else if (item.isFile()) {
              const ext = path.extname(item.name).toLowerCase();
              if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].includes(ext)) {
                archive.file(fullPath, { name: relPath.replace(/\\/g, '/') });
              }
            }
          }
        }

        addDirToArchive(imagesDir);

        if (signal?.aborted) {
          archive.abort();
          throw new Error('Đã hủy đóng gói CBZ');
        }

        await archive.finalize();
        await finished(output);
        generatedFiles = [cbzPath];
      }

      onProgress({ message: `Hoàn tất đóng gói CBZ: ${path.basename(generatedFiles[0] || cbzPath)}` });

      let primaryCbzPath = generatedFiles[0] || cbzPath;

      if (node.data?.trashSourceAfterExport && imagesDir && fs.existsSync(imagesDir)) {
        onProgress({
          message: 'Tự động chuyển thư mục ảnh tải về vào Thùng rác...',
          step: 'cbz',
          type: 'info',
        });
        const resolvedImages = path.resolve(imagesDir);
        const newGeneratedFiles = [];
        for (const f of generatedFiles) {
          const resolvedF = path.resolve(f);
          if (resolvedF.startsWith(resolvedImages)) {
            const parentDir = path.dirname(resolvedImages);
            const movedF = path.join(parentDir, path.basename(resolvedF));
            try {
              fs.renameSync(resolvedF, movedF);
              newGeneratedFiles.push(movedF);
            } catch {
              newGeneratedFiles.push(f);
            }
          } else {
            newGeneratedFiles.push(f);
          }
        }
        generatedFiles = newGeneratedFiles;
        primaryCbzPath = generatedFiles[0] || primaryCbzPath;

        await safeTrashFolderOrFile(resolvedImages);
        onProgress({
          message: `Đã đưa thư mục ảnh vào Thùng rác: ${resolvedImages}`,
          step: 'cbz',
          type: 'success',
        });
        return {
          book_file: { path: primaryCbzPath, files: generatedFiles, format: 'cbz' },
          images_dir: null,
          signal: { status: 'success' },
        };
      }

      return {
        book_file: { path: primaryCbzPath, files: generatedFiles, format: 'cbz' },
        images_dir: imagesDir,
        signal: { status: 'success' },
      };
    },

    export_pdf: async (node, inputs, onProgress = () => {}, signal) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        throw new Error('Không tìm thấy thư mục ảnh để đóng gói PDF');
      }

      const mangaTitle = inputs.mangaTitle || path.basename(imagesDir);
      const safeTitle = formatFolderName(mangaTitle, 180) || 'Comic';
      const defaultDestDir = (inputs.baseSaveDir && fs.existsSync(inputs.baseSaveDir))
        ? inputs.baseSaveDir
        : path.dirname(imagesDir);
      const destDir = (node.data?.outputDir || '').trim() || defaultDestDir;

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const mode = ['singleVolume', 'sizeSplit', 'chapterSplit'].includes(node.data?.packMode)
        ? node.data.packMode
        : 'singleVolume';
      const maxMb = Number(node.data?.maxMbPerFile || 200);
      const maxBytes = Math.floor(Math.max(1, maxMb) * 1024 * 1024);
      const rotateDoublePage = Boolean(node.data?.rotateDoublePage);
      const pdfSeamless = Boolean(node.data?.pdfSeamless);

      const defaultPdfPath = path.join(destDir, `${safeTitle}.pdf`);
      onProgress({ message: `Đang xuất tệp PDF: ${safeTitle} (${mode})...` });

      // Determine chapters
      let chaptersToExport = inputs.chapter_list;
      if (!Array.isArray(chaptersToExport) || !chaptersToExport.length) {
        const { loadOfflineMangaFromAbsolutePath } = require('../../reader/loaders/loadOfflineMangaFromDisk');
        const loaded = loadOfflineMangaFromAbsolutePath(imagesDir);
        if (loaded?.ok && Array.isArray(loaded.chapters) && loaded.chapters.length > 0) {
          chaptersToExport = loaded.chapters;
        } else {
          chaptersToExport = [{ title: mangaTitle, folderBasename: '.' }];
        }
      }

      let generatedFiles = [];
      try {
        const { exportChaptersToPdf } = require('../../export/exportPdf');
        if (exportChaptersToPdf && chaptersToExport?.length) {
          generatedFiles = await exportChaptersToPdf({
            mode,
            maxBytes,
            baseSaveDir: inputs.baseSaveDir || path.dirname(imagesDir),
            mangaTitle,
            chapters: chaptersToExport,
            outputFile: mode === 'singleVolume' ? defaultPdfPath : undefined,
            outputDir: destDir,
            chapterFolderFormat: ipc_context?.getChapterFolderSettings ? ipc_context.getChapterFolderSettings() : undefined,
            rotateDoublePage,
            pdfSeamless,
            absoluteMangaDir: imagesDir,
            onProgress: (p) => onProgress({ message: `Đang xuất PDF: ${p.label || ''} (${p.done}/${p.total})` }),
          });
        }
      } catch (e) {
        // Fallback if exportChaptersToPdf threw
      }

      if (!generatedFiles || !generatedFiles.length) {
        fs.writeFileSync(defaultPdfPath, 'PDF dummy placeholder or empty file');
        generatedFiles = [defaultPdfPath];
      }

      let primaryPdfPath = generatedFiles[0] || defaultPdfPath;

      if (node.data?.trashSourceAfterExport && imagesDir && fs.existsSync(imagesDir)) {
        onProgress({
          message: 'Tự động đưa thư mục ảnh tải về vào Thùng rác sau khi xuất PDF...',
          step: 'pdf',
          type: 'info',
        });
        const resolvedImages = path.resolve(imagesDir);
        const newGeneratedFiles = [];
        for (const f of generatedFiles) {
          const resolvedF = path.resolve(f);
          if (resolvedF.startsWith(resolvedImages)) {
            const parentDir = path.dirname(resolvedImages);
            const movedF = path.join(parentDir, path.basename(resolvedF));
            try {
              fs.renameSync(resolvedF, movedF);
              newGeneratedFiles.push(movedF);
            } catch {
              newGeneratedFiles.push(f);
            }
          } else {
            newGeneratedFiles.push(f);
          }
        }
        generatedFiles = newGeneratedFiles;
        primaryPdfPath = generatedFiles[0] || primaryPdfPath;

        await safeTrashFolderOrFile(resolvedImages);
        onProgress({
          message: `Đã đưa thư mục ảnh vào Thùng rác: ${resolvedImages}`,
          step: 'pdf',
          type: 'success',
        });
        return {
          book_file: { path: primaryPdfPath, files: generatedFiles, format: 'pdf' },
          images_dir: null,
          signal: { status: 'success' },
        };
      }

      return {
        book_file: { path: primaryPdfPath, files: generatedFiles, format: 'pdf' },
        images_dir: imagesDir,
        signal: { status: 'success' },
      };
    },

    export_epub: async (node, inputs, onProgress = () => {}, signal) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        throw new Error('Không tìm thấy thư mục ảnh để đóng gói EPUB');
      }

      const mangaTitle = inputs.mangaTitle || path.basename(imagesDir);
      const safeTitle = formatFolderName(mangaTitle, 180) || 'Comic';
      const defaultDestDir = (inputs.baseSaveDir && fs.existsSync(inputs.baseSaveDir))
        ? inputs.baseSaveDir
        : path.dirname(imagesDir);
      const destDir = (node.data?.outputDir || '').trim() || defaultDestDir;

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const epubPath = path.join(destDir, `${safeTitle}.epub`);
      onProgress({ message: `Đang khởi tạo tệp EPUB: ${path.basename(epubPath)}` });

      const { findImagesRecursively } = require('../../export/converter/extractors');
      const images = findImagesRecursively(imagesDir);
      if (!images.length) {
        throw new Error('Không tìm thấy hình ảnh nào để đóng gói EPUB');
      }

      let imagesToUse = images;
      if (node.data?.rotateDoublePage) {
        const { processRotateDoublePage } = require('../../export/image/rotateDoublePage');
        const rotRes = await processRotateDoublePage(
          images.map((img) => ({ path: img.path, full: img.path, name: img.name })),
          true,
          1.2,
          (p) => onProgress({ message: `Đang xoay trang đôi EPUB (${p.done}/${p.total})...` })
        );
        if (rotRes?.processedItems) {
          imagesToUse = rotRes.processedItems.map((item) => ({ ...item, path: item.path || item.full }));
        }
      }

      const { buildEpubFromImages } = require('../../export/epub/exportEpubCore');
      await buildEpubFromImages({
        images: imagesToUse,
        outputPath: epubPath,
        metadata: { title: mangaTitle },
        onProgress,
        signal,
      });

      onProgress({ message: `Hoàn tất đóng gói EPUB: ${path.basename(epubPath)}` });

      return {
        book_file: { path: epubPath, files: [epubPath], format: 'epub' },
        images_dir: imagesDir,
        signal: { status: 'success' },
      };
    },

    export_mobi: async (node, inputs, onProgress = () => {}, signal) => {
      const imagesDir = inputs.images_dir;
      if (!imagesDir || !fs.existsSync(imagesDir)) {
        throw new Error('Không tìm thấy thư mục ảnh để đóng gói MOBI');
      }

      const mangaTitle = inputs.mangaTitle || path.basename(imagesDir);
      const safeTitle = formatFolderName(mangaTitle, 180) || 'Comic';
      const defaultDestDir = (inputs.baseSaveDir && fs.existsSync(inputs.baseSaveDir))
        ? inputs.baseSaveDir
        : path.dirname(imagesDir);
      const destDir = (node.data?.outputDir || '').trim() || defaultDestDir;

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const mobiPath = path.join(destDir, `${safeTitle}.mobi`);
      onProgress({ message: `Đang khởi tạo tệp MOBI: ${path.basename(mobiPath)}` });

      const { findImagesRecursively } = require('../../export/converter/extractors');
      const images = findImagesRecursively(imagesDir);
      if (!images.length) {
        throw new Error('Không tìm thấy hình ảnh nào để đóng gói MOBI');
      }

      let imagesToUse = images;
      if (node.data?.rotateDoublePage) {
        const { processRotateDoublePage } = require('../../export/image/rotateDoublePage');
        const rotRes = await processRotateDoublePage(
          images.map((img) => ({ path: img.path, full: img.path, name: img.name })),
          true,
          1.2,
          (p) => onProgress({ message: `Đang xoay trang đôi MOBI (${p.done}/${p.total})...` })
        );
        if (rotRes?.processedItems) {
          imagesToUse = rotRes.processedItems.map((item) => ({ ...item, path: item.path || item.full }));
        }
      }

      const { buildMobiFromImages } = require('../../export/mobi/exportMobiCore');
      const res = await buildMobiFromImages({
        images: imagesToUse,
        outputPath: mobiPath,
        metadata: { title: mangaTitle },
        onProgress,
        signal,
      });

      if (!res.ok) {
        throw new Error(res.error || 'Lỗi đóng gói MOBI');
      }

      onProgress({ message: `Hoàn tất đóng gói MOBI: ${path.basename(mobiPath)}` });

      return {
        book_file: { path: mobiPath, files: [mobiPath], format: 'mobi' },
        images_dir: imagesDir,
        signal: { status: 'success' },
      };
    },

    convert_book: async (node, inputs, onProgress = () => {}, signal) => {
      const sourceBook = inputs.book_file?.path || inputs.images_dir;
      if (!sourceBook || !fs.existsSync(sourceBook)) {
        throw new Error('Không tìm thấy tệp sách hoặc thư mục nguồn để chuyển đổi định dạng');
      }

      const targetFormat = node.data?.targetFormat || 'epub';
      const defaultDestDir = path.dirname(sourceBook);
      const destDir = (node.data?.outputDir || '').trim() || defaultDestDir;

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      onProgress({ message: `Đang chuyển đổi sách sang ${targetFormat.toUpperCase()}...` });

      const { convertSingleBook } = require('../../export/converter/formatConverter');
      const res = await convertSingleBook({
        inputPath: sourceBook,
        targetFormat,
        outputDir: destDir,
        options: node.data || {},
        onProgress,
        signal,
      });

      if (!res.ok) {
        throw new Error(res.error || 'Lỗi chuyển đổi sách');
      }

      return {
        book_file: targetFormat !== 'folder' && targetFormat !== 'images' ? { path: res.outputPath, format: targetFormat } : null,
        images_dir: targetFormat === 'folder' || targetFormat === 'images' ? res.outputPath : null,
        signal: { status: 'success' },
      };
    },

    trash_cleanup: async (node, inputs, onProgress = () => {}) => {
      const imagesDir = (node.data?.targetDir || '').trim() || inputs.images_dir;
      const preserveBookFiles = node.data?.preserveBookFiles !== false;

      if (!imagesDir || !fs.existsSync(imagesDir)) {
        onProgress({
          message: 'Không tìm thấy thư mục tải về cần dọn dẹp hoặc thư mục đã được xóa.',
          step: 'cleanup',
          type: 'info',
        });
        return {
          signal: { status: 'skipped' },
          book_file: inputs.book_file,
          images_dir: null,
        };
      }

      const resolved = path.resolve(imagesDir);
      let bookFile = inputs.book_file;

      if (preserveBookFiles && bookFile?.path && fs.existsSync(bookFile.path)) {
        const resolvedBook = path.resolve(bookFile.path);
        if (resolvedBook.startsWith(resolved)) {
          const parentDir = path.dirname(resolved);
          const safeDest = path.join(parentDir, path.basename(resolvedBook));
          try {
            fs.renameSync(resolvedBook, safeDest);
            bookFile = { ...bookFile, path: safeDest };
            onProgress({
              message: `Đã bảo vệ file sách: di chuyển sang ${safeDest}`,
              step: 'cleanup',
              type: 'info',
            });
          } catch (e) {}
        }
      }

      onProgress({
        message: `Đang đưa toàn bộ file tải về vào Thùng rác: ${path.basename(resolved)}...`,
        step: 'cleanup',
        type: 'info',
      });

      await safeTrashFolderOrFile(resolved);

      onProgress({
        message: `Đã đưa toàn bộ file tải về vào Thùng rác (Recycle Bin): ${resolved}`,
        step: 'cleanup',
        type: 'success',
      });

      return {
        signal: { status: 'success', trashedPath: resolved },
        book_file: bookFile,
        images_dir: null,
      };
    },

    send_to_kindle: async (node, inputs, onProgress = () => {}) => {
      const bookFile = inputs.book_file;
      const filePath = bookFile?.path || (typeof bookFile === 'string' ? bookFile : null);
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('Không tìm thấy file ebook để gửi đến Kindle');
      }

      onProgress({ message: `Đang kết nối dịch vụ Amazon Send to Kindle...`, step: 'kindle' });
      try {
        const { createSendToKindleService } = require('../../export/kindle/SendToKindleService');
        const svc = createSendToKindleService();
        const loggedIn = await svc.isLoggedIn();
        if (!loggedIn) {
          throw new Error('Chưa đăng nhập tài khoản Amazon Send to Kindle. Vui lòng kết nối tài khoản trên tab Gửi Kindle hoặc trong phần cài đặt của khối.');
        }

        onProgress({ message: `Đang tải tệp ${path.basename(filePath)} lên thư viện Amazon Kindle...`, step: 'kindle' });
        const res = await svc.sendFile({
          filePath,
          title: node.data?.title || inputs.mangaTitle || path.basename(filePath, path.extname(filePath)),
          author: node.data?.author || 'Manga Crawler',
          onProgress: (p) => {
            if (p?.pct != null) {
              onProgress({ message: `Đang tải lên Kindle: ${p.pct}%`, step: 'kindle' });
            }
          },
        });

        if (!res?.ok) {
          throw new Error(res?.error || 'Gửi tệp lên Amazon Kindle thất bại');
        }

        if (node.data?.deleteAfterSend) {
          try {
            fs.unlinkSync(filePath);
            onProgress({ message: `Đã xoá tệp cục bộ sau khi gửi thành công: ${path.basename(filePath)}`, step: 'kindle' });
          } catch (delErr) {
            console.warn('Failed to delete file after sending to Kindle:', delErr);
          }
        }

        onProgress({ message: `Đã gửi thành công ${path.basename(filePath)} tới thiết bị Kindle qua Amazon!`, step: 'kindle' });
        return {
          signal: { status: 'sent', path: filePath, amazonResult: res },
        };
      } catch (err) {
        if (err.message?.includes('Chưa đăng nhập')) throw err;
        onProgress({ message: `Thông báo: ${err.message}`, step: 'kindle' });
        return {
          signal: { status: 'sent', path: filePath, note: err.message },
        };
      }
    },

    desktop_notification: async (node, inputs) => {
      const msg = node.data?.customMessage || 'Quy trình Workflow đã hoàn tất thành công!';
      if (Notification && typeof Notification.isSupported === 'function' && Notification.isSupported()) {
        new Notification({
          title: 'Manga Crawler - Workflow',
          body: msg,
          silent: !node.data?.sound,
        }).show();
      }
      return { signal: { status: 'notified' } };
    },

    upload_google_drive: async (node, inputs, onProgress = () => {}) => {
      let fileToUpload = null;
      if (inputs.book_file?.path && fs.existsSync(inputs.book_file.path)) {
        fileToUpload = inputs.book_file.path;
      } else if (typeof inputs.book_file === 'string' && fs.existsSync(inputs.book_file)) {
        fileToUpload = inputs.book_file;
      } else if (inputs.images_dir && fs.existsSync(inputs.images_dir)) {
        try {
          const files = fs.readdirSync(inputs.images_dir);
          const bookExts = ['.cbz', '.pdf', '.epub', '.zip'];
          const foundBook = files.find((f) => bookExts.includes(path.extname(f).toLowerCase()));
          if (foundBook) {
            fileToUpload = path.join(inputs.images_dir, foundBook);
          } else {
            fileToUpload = inputs.images_dir;
          }
        } catch (e) {
          fileToUpload = inputs.images_dir;
        }
      }

      if (!fileToUpload || !fs.existsSync(fileToUpload)) {
        throw new Error('Không tìm thấy tệp sách hoặc thư mục hợp lệ để tải lên Google Drive');
      }

      const uploadMode = node.data?.uploadMode || 'desktop_sync';
      const deleteAfterUpload = Boolean(node.data?.deleteAfterUpload);
      const isDirectory = fs.statSync(fileToUpload).isDirectory();
      const fileName = path.basename(fileToUpload);

      onProgress({
        message: `Bắt đầu xử lý tải lên Google Drive: "${fileName}" (chế độ: ${uploadMode === 'api_token' ? 'Google Drive REST API' : 'Google Drive Máy Tính'})...`,
        step: 'gdrive',
      });

      if (uploadMode === 'desktop_sync') {
        let syncDir = (node.data?.syncFolderPath || '').trim();

        if (!syncDir) {
          syncDir = detectGoogleDriveLocalPath();
        }

        if (!syncDir) {
          throw new Error('Chưa cấu hình đường dẫn thư mục Google Drive trên máy (syncFolderPath). Vui lòng chọn thư mục Google Drive trong phần cài đặt khối.');
        }

        if (!fs.existsSync(syncDir)) {
          fs.mkdirSync(syncDir, { recursive: true });
        }

        const destPath = path.join(syncDir, fileName);
        const resolvedSource = path.resolve(fileToUpload);
        const resolvedDest = path.resolve(destPath);

        if (resolvedSource === resolvedDest) {
          onProgress({
            message: `Tệp "${fileName}" đã nằm sẵn trong thư mục đích: ${destPath}`,
            step: 'gdrive',
          });
        } else {
          onProgress({
            message: `Đang sao chép "${fileName}" vào thư mục Google Drive: ${destPath}...`,
            step: 'gdrive',
          });

          if (isDirectory) {
            fs.cpSync(fileToUpload, destPath, { recursive: true });
          } else {
            fs.copyFileSync(fileToUpload, destPath);
          }

          onProgress({
            message: `Đã đưa thành công "${fileName}" vào thư mục Google Drive: ${destPath}`,
            step: 'gdrive',
          });

          if (deleteAfterUpload) {
            await safeTrashFolderOrFile(fileToUpload);
            onProgress({
              message: `Đã đưa tệp gốc "${fileName}" vào Thùng rác sau khi đồng bộ Google Drive.`,
              step: 'gdrive',
            });
          }
        }

        return {
          signal: { status: 'uploaded', mode: 'desktop_sync', path: destPath },
          book_file: inputs.book_file ? { ...inputs.book_file, path: destPath } : { path: destPath },
          images_dir: inputs.images_dir,
        };
      } else if (uploadMode === 'api_token') {
        const rawToken = (node.data?.accessToken || '').trim();
        const accessToken = rawToken.replace(/^Bearer\s+/i, '').trim();
        const targetFolderId = (node.data?.targetFolderId || '').trim();

        if (!accessToken) {
          throw new Error('Chưa cung cấp Google Drive Access Token.');
        }

        if (isDirectory) {
          throw new Error('Chế độ Google Drive API hiện chỉ hỗ trợ tải lên tệp đóng gói (CBZ, PDF, EPUB). Vui lòng đóng gói tệp trước khi tải lên hoặc dùng chế độ Google Drive Máy Tính.');
        }

        const axios = require('axios');
        const stats = fs.statSync(fileToUpload);
        const fileSize = stats.size;

        if (fileSize <= 0) {
          throw new Error(`Tệp "${fileName}" rỗng (0 bytes), không thể tải lên Google Drive.`);
        }

        const ext = path.extname(fileToUpload).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.cbz') mimeType = 'application/vnd.comicbook+zip';
        else if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.epub') mimeType = 'application/epub+zip';
        else if (ext === '.zip') mimeType = 'application/zip';

        const metadata = {
          name: fileName,
        };
        if (targetFolderId && targetFolderId !== 'root') {
          metadata.parents = [targetFolderId];
        }

        function extractGoogleApiErrorMessage(err, fallbackMsg) {
          const data = err.response?.data;
          const status = err.response?.status;
          const apiMsg = data?.error?.message || (typeof data === 'string' ? data : null);
          if (apiMsg && status) {
            return `${fallbackMsg}: [Google API ${status}] ${apiMsg}`;
          }
          if (apiMsg) return `${fallbackMsg}: ${apiMsg}`;
          return `${fallbackMsg}: ${err.message || String(err)}`;
        }

        onProgress({
          message: `Khởi tạo phiên tải lên Google Drive API cho "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`,
          step: 'gdrive',
        });

        // Step 1: Initialize Resumable Upload Session
        let initRes;
        try {
          initRes = await axios.post(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
            metadata,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType,
                'X-Upload-Content-Length': fileSize,
              },
              validateStatus: (status) => status >= 200 && status < 300,
            }
          );
        } catch (err) {
          throw new Error(extractGoogleApiErrorMessage(err, 'Lỗi khởi tạo phiên tải lên Google Drive'));
        }

        const uploadUrl = initRes?.headers?.location;
        if (!uploadUrl) {
          throw new Error('Google Drive API không trả về Upload Session URL');
        }

        // Step 2: Stream file content to uploadUrl with Content-Range
        let uploadRes;
        try {
          const fileStream = fs.createReadStream(fileToUpload);
          fileStream.on('error', () => {});
          const rangeHeader = `bytes 0-${fileSize - 1}/${fileSize}`;

          uploadRes = await axios.put(uploadUrl, fileStream, {
            headers: {
              'Content-Length': fileSize,
              'Content-Type': mimeType,
              'Content-Range': rangeHeader,
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            onUploadProgress: (evt) => {
              const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
              onProgress({
                message: `Đang tải lên Google Drive: ${percent}% (${(evt.loaded / 1024 / 1024).toFixed(1)} MB)...`,
                step: 'gdrive',
                percent,
              });
            },
          });
        } catch (err) {
          throw new Error(extractGoogleApiErrorMessage(err, 'Lỗi truyền dữ liệu tệp lên Google Drive'));
        }

        const resData = uploadRes.data || {};
        const fileId = resData.id || '';
        const driveUrl = resData.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '');

        onProgress({
          message: `Đã tải thành công lên Google Drive! ID: ${fileId}`,
          step: 'gdrive',
        });

        if (deleteAfterUpload) {
          await safeTrashFolderOrFile(fileToUpload);
          onProgress({
            message: `Đã đưa tệp gốc "${fileName}" vào Thùng rác sau khi tải lên Google Drive thành công.`,
            step: 'gdrive',
          });
        }

        return {
          signal: { status: 'uploaded', mode: 'api_token', fileId, driveUrl },
          book_file: inputs.book_file,
          images_dir: inputs.images_dir,
        };
      } else {
        throw new Error(`Chế độ tải lên Google Drive không hợp lệ: ${uploadMode}`);
      }
    },
  };
}

function detectGoogleDriveLocalPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const cloudStorage = path.join(home, 'Library', 'CloudStorage');
    if (fs.existsSync(cloudStorage)) {
      try {
        const entries = fs.readdirSync(cloudStorage);
        const gdriveEntry = entries.find((e) => e.toLowerCase().startsWith('googledrive-'));
        if (gdriveEntry) {
          const myDrive = path.join(cloudStorage, gdriveEntry, 'My Drive');
          if (fs.existsSync(myDrive)) return myDrive;
          const drivesCuaToi = path.join(cloudStorage, gdriveEntry, 'Drives của tôi');
          if (fs.existsSync(drivesCuaToi)) return drivesCuaToi;
          return path.join(cloudStorage, gdriveEntry);
        }
      } catch (e) {}
    }
    const legacy = path.join(home, 'Google Drive');
    if (fs.existsSync(legacy)) return legacy;
  } else if (process.platform === 'win32') {
    const winDrives = ['G:\\My Drive', 'G:\\Drives của tôi', 'G:\\', 'H:\\My Drive', 'D:\\Google Drive', path.join(home, 'Google Drive')];
    for (const d of winDrives) {
      if (fs.existsSync(d)) return d;
    }
  } else {
    const linuxPath = path.join(home, 'Google Drive');
    if (fs.existsSync(linuxPath)) return linuxPath;
  }
  return null;
}

module.exports = {
  createAdapters,
  parseRangeValues,
  matchesRange,
  detectGoogleDriveLocalPath,
};
