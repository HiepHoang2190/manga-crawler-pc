import { useState, useRef, useMemo, useCallback } from 'react';
import { renderPageToDataUrl } from './mangaStudioCanvasRender';

/**
 * useMangaStudioExport — Hook điều phối toàn bộ Hệ thống Xuất bản (Export Operations)
 * - Xuất trang hiện tại (WYSIWYG 100% Canvas Render + Verification Gate nếu chưa có bản dịch)
 * - Xuất toàn bộ Chapter (giữ nguyên cấu trúc thư mục con)
 * - Đóng gói truyện tranh CBZ
 * - Quản lý modal xác nhận xuất trang chưa dịch (Smart Verification Gate)
 */
export function useMangaStudioExport({
  api,
  pages = [],
  setPages,
  activePageIndex = 0,
  activePage,
  showCleanupLayer = true,
  chapterTitle = 'Manga Chapter',
  propSelectedDir = '',
  onSavePage,
  onSaveChapter,
  setStatusMessage,
  t,
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [exportConfirmModal, setExportConfirmModal] = useState(null);
  const exportDropdownRef = useRef(null);

  const [autoOpenExportFolder, setAutoOpenExportFolder] = useState(() => {
    try {
      return localStorage.getItem('manga_studio_auto_open_export_v1') !== 'false';
    } catch (_) {
      return true;
    }
  });

  const handleToggleAutoOpenExport = useCallback((val) => {
    setAutoOpenExportFolder(val);
    try {
      localStorage.setItem('manga_studio_auto_open_export_v1', String(val));
    } catch (_) { }
  }, []);

  const currentDirectory = useMemo(() => {
    if (propSelectedDir) return propSelectedDir;
    if (activePage?.imagePath) {
      return activePage.imagePath.substring(0, activePage.imagePath.lastIndexOf('/'));
    }
    return '';
  }, [propSelectedDir, activePage?.imagePath]);

  // --- 1. Xuất Trang Hiện Tại (Single Page Export) ---
  const doExportCurrentPage = useCallback(async () => {
    if (!api?.translateExportEditedPage || !activePage) return;
    setIsExporting(true);
    setStatusMessage?.({ text: t('translate.studio.renderingPage'), type: 'info' });

    try {
      // Render bằng HTML5 Canvas của Chromium ở độ phân giải gốc 100%
      const rendered = await renderPageToDataUrl(
        activePage,
        { showCleanupLayer, fillBackground: false, quality: 92 },
        api
      );

      const outputDir = activePage.savedPath
        ? activePage.savedPath.substring(0, activePage.savedPath.lastIndexOf('/'))
        : undefined;

      const pageLayers = Array.isArray(activePage.layers) ? activePage.layers : [];
      const res = await api.translateExportEditedPage({
        imagePath: activePage.imagePath,
        layers: pageLayers.filter((l) => l.visible),
        renderedDataUrl: rendered?.dataUrl,
        options: {
          quality: 92,
          fillBackground: false,
          outputDir,
          savePath: activePage.savedPath || undefined,
        },
      });

      if (res?.success) {
        const sizeKb = Math.round((res.savedBytes || 0) / 1024);
        const folderToOpen = res.savePath ? res.savePath.substring(0, res.savePath.lastIndexOf('/')) : outputDir;
        setStatusMessage?.({
          text: t('translate.studio.renderedPageSuccess', { path: res.savePath, size: sizeKb }),
          type: 'success',
          action: folderToOpen ? {
            label: t('translate.studio.completionOpenFolderBtn'),
            onClick: () => {
              if (api?.translateOpenFolder) api.translateOpenFolder(folderToOpen);
              else if (window.electronAPI?.openPath) window.electronAPI.openPath(folderToOpen);
            },
          } : undefined,
        });

        // Tự động mở thư mục nếu được bật
        if (autoOpenExportFolder && folderToOpen) {
          if (api?.translateOpenFolder) api.translateOpenFolder(folderToOpen);
          else if (window.electronAPI?.openPath) window.electronAPI.openPath(folderToOpen);
        }

        if (res.dataUrl) {
          setPages?.((prev) =>
            prev.map((p, i) =>
              i === activePageIndex
                ? { ...p, savedPath: res.savePath, dataUrl: res.dataUrl, translatedImageDataUrl: res.dataUrl }
                : p
            )
          );
        }
        onSavePage?.({
          index: activePageIndex,
          savePath: res.savePath,
          dataUrl: res.dataUrl,
          layers: pageLayers,
          width: activePage.width,
          height: activePage.height,
        });
      } else {
        setStatusMessage?.({ text: t('translate.studio.exportPageError', { error: res?.error || 'Unknown' }), type: 'error' });
      }
    } catch (err) {
      console.error('[MangaStudioExport] doExportCurrentPage error:', err);
      setStatusMessage?.({ text: t('translate.studio.exportPageError', { error: err.message }), type: 'error' });
    } finally {
      setIsExporting(false);
    }
  }, [api, activePage, showCleanupLayer, autoOpenExportFolder, activePageIndex, setPages, onSavePage, setStatusMessage, t]);

  const handleExportCurrentPage = useCallback(async () => {
    if (!activePage) return;
    const hasLayers = Array.isArray(activePage.layers) && activePage.layers.some((l) => l.text && l.text.trim());
    if (!hasLayers) {
      setExportConfirmModal({
        type: 'single',
        title: t('translate.studio.singleUntranslatedTitle'),
        message: t('translate.studio.singleUntranslatedDesc', {
          name: activePage.filename || t('translate.compare.pageBtn', { page: activePageIndex + 1 }),
        }),
        confirmText: t('translate.studio.singleUntranslatedConfirm'),
        onConfirm: () => doExportCurrentPage(),
      });
      return;
    }
    doExportCurrentPage();
  }, [activePage, activePageIndex, doExportCurrentPage, t]);

  // --- 2. Xuất Toàn Bộ Chapter (Batch Chapter Export) ---
  const doExportAllChapter = useCallback(async (options = { includeUntranslated: true }) => {
    if (!api?.translateExportEditedPage || pages.length === 0) return;
    setIsExporting(true);
    let successCount = 0;

    const pagesToExport = options.includeUntranslated
      ? pages
      : pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));

    if (pagesToExport.length === 0) {
      setStatusMessage?.({ text: t('translate.studio.noPageEligibleExport'), type: 'warn' });
      setIsExporting(false);
      return;
    }

    // Xác định thư mục gốc đầu ra: _translated cạnh thư mục gốc import
    const baseDir = pages[0]?.imagePath
      ? (() => {
        const sub = pages[0].subfolder || '';
        const parentDir = pages[0].imagePath.substring(0, pages[0].imagePath.lastIndexOf('/'));
        if (sub) {
          const levels = sub.split(/[/\\]/).filter(Boolean).length;
          let dir = parentDir;
          for (let l = 0; l < levels; l++) {
            dir = dir.substring(0, dir.lastIndexOf('/'));
          }
          return dir;
        }
        return parentDir;
      })()
      : null;
    const outputBaseDir = baseDir ? `${baseDir}/_translated` : null;

    for (let i = 0; i < pagesToExport.length; i++) {
      const p = pagesToExport[i];
      setStatusMessage?.({
        text: t('translate.studio.renderingPageProgress', { current: i + 1, total: pagesToExport.length }),
        type: 'info',
      });
      try {
        const rendered = await renderPageToDataUrl(
          p,
          { showCleanupLayer, fillBackground: false, quality: 92 },
          api
        );

        const pageLayers = Array.isArray(p.layers) ? p.layers : [];

        // Tính savePath giữ nguyên cấu trúc thư mục con khi export
        let computedSavePath = p.savedPath || undefined;
        if (!computedSavePath && outputBaseDir && p.subfolder) {
          const origExt = p.imagePath ? p.imagePath.substring(p.imagePath.lastIndexOf('.')) : '.jpg';
          const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
          const baseName = p.imagePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + '_translated' + ext;
          computedSavePath = `${outputBaseDir}/${p.subfolder}/${baseName}`;
        }

        const res = await api.translateExportEditedPage({
          imagePath: p.imagePath,
          layers: pageLayers.filter((l) => l.visible),
          renderedDataUrl: rendered?.dataUrl,
          options: {
            quality: 92,
            fillBackground: false,
            savePath: computedSavePath,
            ...(outputBaseDir && !p.subfolder ? { outputDir: outputBaseDir } : {}),
          },
        });
        if (res?.success) {
          successCount++;
          if (res.dataUrl) {
            setPages?.((prev) =>
              prev.map((item) =>
                item.imagePath === p.imagePath
                  ? { ...item, savedPath: res.savePath, dataUrl: res.dataUrl, translatedImageDataUrl: res.dataUrl }
                  : item
              )
            );
          }
        }
      } catch (e) {
        console.error(`[MangaStudioExport] Export page ${i} failed:`, e);
      }
    }

    setIsExporting(false);
    const targetFolderToOpen = outputBaseDir || (pagesToExport[0]?.savedPath ? pagesToExport[0].savedPath.substring(0, pagesToExport[0].savedPath.lastIndexOf('/')) : null);
    setStatusMessage?.({
      text: t('translate.studio.exportAllSuccess', { count: successCount, total: pagesToExport.length, path: outputBaseDir || '' }),
      type: 'success',
      action: targetFolderToOpen ? {
        label: t('translate.studio.completionOpenFolderBtn'),
        onClick: () => {
          if (api?.translateOpenFolder) api.translateOpenFolder(targetFolderToOpen);
          else if (window.electronAPI?.openPath) window.electronAPI.openPath(targetFolderToOpen);
        },
      } : undefined,
    });

    if (autoOpenExportFolder && targetFolderToOpen) {
      if (api?.translateOpenFolder) api.translateOpenFolder(targetFolderToOpen);
      else if (window.electronAPI?.openPath) window.electronAPI.openPath(targetFolderToOpen);
    }

    onSaveChapter?.({
      outputDir: outputBaseDir || (activePage?.savedPath ? activePage.savedPath.substring(0, activePage.savedPath.lastIndexOf('/')) : undefined),
      savedPaths: pages.map((p) => p.savedPath).filter(Boolean),
      pages,
    });
  }, [api, pages, showCleanupLayer, autoOpenExportFolder, activePage, setPages, onSaveChapter, setStatusMessage, t]);

  const handleExportAllChapter = useCallback(async () => {
    if (!pages || pages.length === 0) return;
    const translatedPages = pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));
    const untranslatedCount = pages.length - translatedPages.length;

    if (translatedPages.length === 0) {
      setExportConfirmModal({
        type: 'all_untranslated',
        title: t('translate.studio.noTranslatedPageTitle'),
        message: t('translate.studio.exportChapterConfirmDesc', { count: pages.length }),
        confirmText: t('translate.studio.exportChapterConfirmBtn'),
        onConfirm: () => doExportAllChapter({ includeUntranslated: true }),
      });
      return;
    }

    if (untranslatedCount > 0) {
      setExportConfirmModal({
        type: 'partial_chapter',
        title: t('translate.studio.exportChapterConfirmTitle'),
        translatedCount: translatedPages.length,
        untranslatedCount,
        totalCount: pages.length,
        isCbz: false,
        onConfirm: (includeUntranslated) => doExportAllChapter({ includeUntranslated }),
      });
      return;
    }

    doExportAllChapter({ includeUntranslated: true });
  }, [pages, doExportAllChapter, t]);

  // --- 3. Đóng Gói Tệp Truyện Tranh CBZ ---
  const doExportCbz = useCallback(async (options = { includeUntranslated: true }) => {
    if (!pages || pages.length === 0) {
      setStatusMessage?.({ text: t('translate.studio.noPageForCbz'), type: 'warn' });
      return;
    }
    setIsExporting(true);
    setStatusMessage?.({ text: t('translate.studio.packagingCbz'), type: 'info' });
    try {
      const pagesToInclude = options.includeUntranslated
        ? pages
        : pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));

      let pathsToExport = pagesToInclude.map((p) => p.savedPath).filter(Boolean);
      if (pathsToExport.length < pagesToInclude.length) {
        await doExportAllChapter(options);
        pathsToExport = pagesToInclude.map((p) => p.savedPath).filter(Boolean);
      }
      if (pathsToExport.length > 0 && api?.translateExportCbz) {
        const folderName = currentDirectory ? currentDirectory.split(/[/\\]/).filter(Boolean).pop() : (chapterTitle || 'Manga');
        const title = `${folderName} [Translated]`;
        const res = await api.translateExportCbz({
          imagePaths: pathsToExport,
          title,
        });
        if (res?.success) {
          const folderToOpen = res.filePath ? res.filePath.substring(0, res.filePath.lastIndexOf('/')) : null;
          setStatusMessage?.({
            text: t('translate.studio.exportCbzSuccess', { path: res.filePath }),
            type: 'success',
            action: (res.filePath || folderToOpen) ? {
              label: t('translate.studio.completionOpenFolderBtn'),
              onClick: () => {
                if (api?.translateOpenFolder) api.translateOpenFolder(res.filePath || folderToOpen);
                else if (window.electronAPI?.openPath) window.electronAPI.openPath(res.filePath || folderToOpen);
              },
            } : undefined,
          });
          if (autoOpenExportFolder && (res.filePath || folderToOpen)) {
            if (api?.translateOpenFolder) api.translateOpenFolder(res.filePath || folderToOpen);
            else if (window.electronAPI?.openPath) window.electronAPI.openPath(res.filePath || folderToOpen);
          }
        } else if (!res?.canceled) {
          setStatusMessage?.({ text: t('translate.studio.exportCbzError', { error: 'Failed' }), type: 'error' });
        }
      } else {
        setStatusMessage?.({ text: t('translate.studio.noImagesForCbz'), type: 'warn' });
      }
    } catch (err) {
      console.error('[MangaStudioExport] handleExportCbz error:', err);
      setStatusMessage?.({ text: t('translate.studio.exportCbzError', { error: err.message }), type: 'error' });
    } finally {
      setIsExporting(false);
    }
  }, [api, pages, currentDirectory, chapterTitle, autoOpenExportFolder, doExportAllChapter, setStatusMessage, t]);

  const handleExportCbz = useCallback(async () => {
    if (!pages || pages.length === 0) {
      setStatusMessage?.({ text: t('translate.studio.noPageForCbz'), type: 'warn' });
      return;
    }
    const translatedPages = pages.filter((p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim()));
    const untranslatedCount = pages.length - translatedPages.length;

    if (translatedPages.length === 0) {
      setExportConfirmModal({
        type: 'all_untranslated_cbz',
        title: t('translate.studio.noTranslatedPageTitle'),
        message: t('translate.studio.exportCbzConfirmDesc', { count: pages.length }),
        confirmText: t('translate.studio.exportCbzConfirmBtn'),
        onConfirm: () => doExportCbz({ includeUntranslated: true }),
      });
      return;
    }

    if (untranslatedCount > 0) {
      setExportConfirmModal({
        type: 'partial_chapter',
        title: t('translate.studio.exportCbzConfirmTitle'),
        translatedCount: translatedPages.length,
        untranslatedCount,
        totalCount: pages.length,
        isCbz: true,
        onConfirm: (includeUntranslated) => doExportCbz({ includeUntranslated }),
      });
      return;
    }

    doExportCbz({ includeUntranslated: true });
  }, [pages, doExportCbz, t]);

  return {
    isExporting,
    setIsExporting,
    showExportDropdown,
    setShowExportDropdown,
    exportDropdownRef,
    autoOpenExportFolder,
    setAutoOpenExportFolder: handleToggleAutoOpenExport,
    exportConfirmModal,
    setExportConfirmModal,
    handleExportCurrentPage,
    handleExportAllChapter,
    handleExportCbz,
    currentDirectory,
  };
}

