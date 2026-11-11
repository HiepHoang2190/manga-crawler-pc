import { useState, useEffect, useMemo, useCallback } from 'react';
import { renderPageToDataUrl } from './mangaStudioCanvasRender';

/**
 * useMangaStudioAutoPipeline — Hook điều phối Chế độ Dịch Tự Động Nền (Auto Processing Mode)
 * - Quản lý thư mục nguồn (inputDir) và thư mục đích (outputDir)
 * - Tự động nhận diện thư mục dự án và đề xuất thư mục xuất file
 * - Lắng nghe tiến trình dịch ngầm (IPC `subscribeAutoProcessProgress`)
 * - Quét thư mục ảnh đệ quy và mở Modal đồng bộ vào Studio khi phát hiện thư mục mới
 * - Tự động kết xuất (Auto-Export) ảnh đã dịch sang thư mục đích kèm chế độ xóa chữ gốc
 */
export function useMangaStudioAutoPipeline({
  api,
  settings,
  handleUpdateSetting,
  pages = [],
  setPages,
  propSelectedDir = '',
  currentProject,
  autoOpenExportFolder = false,
  onSaveChapter,
  addLog,
  setStatusMessage,
  setErrorModal,
  setCompletionModal,
  setTranslateProgress,
  setIsExporting,
  processImportedFiles,
  t,
}) {
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoInputDir, setAutoInputDir] = useState('');
  const [autoOutputDir, setAutoOutputDir] = useState('');
  const [autoSkipExisting, setAutoSkipExisting] = useState(true);
  const [autoScannedCount, setAutoScannedCount] = useState(null);
  const [autoScannedData, setAutoScannedData] = useState(null);
  const [syncFolderModal, setSyncFolderModal] = useState(null);
  const [isScanningAuto, setIsScanningAuto] = useState(false);
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [autoProgress, setAutoProgress] = useState(null);

  // Tự động nhận diện thư mục gốc của dự án hiện tại từ danh sách trang
  const detectedProjectDir = useMemo(() => {
    if (propSelectedDir) return propSelectedDir;
    if (pages.length > 0 && pages[0]?.imagePath) {
      const p0 = pages[0];
      const parentDir = p0.imagePath.substring(0, p0.imagePath.lastIndexOf('/'));
      if (p0.subfolder) {
        const levels = p0.subfolder.split(/[/\\]/).filter(Boolean).length;
        let dir = parentDir;
        for (let l = 0; l < levels; l++) {
          dir = dir.substring(0, dir.lastIndexOf('/'));
        }
        return dir;
      }
      return parentDir;
    }
    return '';
  }, [propSelectedDir, pages]);

  // Thư mục đầu ra mặc định: [Thư mục dự án]_translated
  const defaultOutputDir = useMemo(() => {
    if (!detectedProjectDir) return '';
    return `${detectedProjectDir}_translated`;
  }, [detectedProjectDir]);

  // Thư mục đầu vào & đầu ra hiệu lực (ưu tiên user tùy chọn, fallback về dự án hiện tại)
  const activeInputDir = autoInputDir || detectedProjectDir;
  const activeOutputDir = autoOutputDir || defaultOutputDir;

  // Trạng thái Chế Độ Tự Động 100% (Auto Mode Checkbox)
  const isAutoModeEnabled = Boolean(settings?.autoProcessing?.enabled);

  const toggleAutoMode = useCallback((newVal) => {
    const nextVal = typeof newVal === 'boolean' ? newVal : !isAutoModeEnabled;
    handleUpdateSetting?.({
      autoProcessing: {
        ...(settings?.autoProcessing || {}),
        enabled: nextVal,
        inputDir: autoInputDir || detectedProjectDir,
        outputDir: autoOutputDir || defaultOutputDir,
      },
    });
    setStatusMessage?.({
      type: nextVal ? 'success' : 'info',
      text: nextVal
        ? t('translate.auto.toastAutoOn', { dir: activeOutputDir || 'output' })
        : t('translate.auto.toastAutoOff'),
    });
  }, [isAutoModeEnabled, settings?.autoProcessing, handleUpdateSetting, autoInputDir, detectedProjectDir, autoOutputDir, defaultOutputDir, activeOutputDir, setStatusMessage, t]);

  // Sync settings when available
  useEffect(() => {
    if (settings?.autoProcessing) {
      if (!autoInputDir && settings.autoProcessing.inputDir) {
        setAutoInputDir(settings.autoProcessing.inputDir);
      }
      if (!autoOutputDir && settings.autoProcessing.outputDir) {
        setAutoOutputDir(settings.autoProcessing.outputDir);
      }
      if (typeof settings.autoProcessing.skipExisting === 'boolean') {
        setAutoSkipExisting(settings.autoProcessing.skipExisting);
      }
    }
  }, [settings]);

  // Helper: Tự động kết xuất và lưu tất cả các trang đã dịch vào thư mục đầu ra
  const handleAutoExportPages = useCallback(async (targetPages, customOutputDir) => {
    if (!api?.translateExportEditedPage || !targetPages || targetPages.length === 0) return;
    const finalOutputDir = customOutputDir || activeOutputDir || defaultOutputDir;
    if (!finalOutputDir) return;

    setIsExporting?.(true);
    let successCount = 0;

    for (let i = 0; i < targetPages.length; i++) {
      const p = targetPages[i];
      setTranslateProgress?.({
        step: 'export',
        percent: Math.round(((i + 1) / targetPages.length) * 100),
        detail: t('translate.auto.exportProgressDetail', { current: i + 1, total: targetPages.length }),
        imageIndex: i + 1,
        total: targetPages.length,
      });

      try {
        // Khi xuất file, chế độ Cleanup luôn luôn bật (showCleanupLayer: true) để tẩy sạch chữ Nhật gốc
        const rendered = await renderPageToDataUrl(
          p,
          { showCleanupLayer: true, fillBackground: false, quality: 92 },
          api
        );

        const pageLayers = Array.isArray(p.layers) ? p.layers : [];

        let computedSavePath = p.savedPath || undefined;
        if (!computedSavePath) {
          const rootFolderName = activeInputDir
            ? activeInputDir.split(/[/\\]/).filter(Boolean).pop()
            : (detectedProjectDir ? detectedProjectDir.split(/[/\\]/).filter(Boolean).pop() : (currentProject?.name || ''));
          const outBase = finalOutputDir ? finalOutputDir.split(/[/\\]/).filter(Boolean).pop() || '' : '';
          const isSameOrTranslated =
            rootFolderName &&
            (outBase.toLowerCase() === rootFolderName.toLowerCase() ||
              outBase.toLowerCase() === `${rootFolderName}_translated`.toLowerCase());

          const origExt = p.imagePath ? p.imagePath.substring(p.imagePath.lastIndexOf('.')) : '.jpg';
          const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
          const baseName = p.imagePath ? p.imagePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + '_translated' + ext : `page_${i + 1}.jpg`;
          const sub = p.subfolder || '';

          if (!isSameOrTranslated && rootFolderName) {
            computedSavePath = sub
              ? `${finalOutputDir}/${rootFolderName}/${sub}/${baseName}`
              : `${finalOutputDir}/${rootFolderName}/${baseName}`;
          } else if (sub) {
            computedSavePath = `${finalOutputDir}/${sub}/${baseName}`;
          } else {
            computedSavePath = `${finalOutputDir}/${baseName}`;
          }
        }

        const res = await api.translateExportEditedPage({
          imagePath: p.imagePath,
          layers: pageLayers.filter((l) => l.visible),
          renderedDataUrl: rendered?.dataUrl,
          options: {
            quality: 92,
            fillBackground: false,
            savePath: computedSavePath,
            outputDir: finalOutputDir,
          },
        });

        if (res?.success) {
          successCount++;
          if (res.dataUrl) {
            setPages?.((prev) =>
              prev.map((item, idx) =>
                item.id === p.id || idx === i
                  ? { ...item, savedPath: res.savePath, dataUrl: res.dataUrl, translatedImageDataUrl: res.dataUrl }
                  : item
              )
            );
          }
        }
      } catch (e) {
        console.error(`[AutoExport] Export page error ${i}:`, e);
      }
    }

    setIsExporting?.(false);
    addLog?.('completed', t('translate.auto.logExportDone', { count: successCount, total: targetPages.length, dir: finalOutputDir }), 'info');
    setStatusMessage?.({
      type: 'success',
      text: t('translate.auto.toastExportDone', { count: successCount, total: targetPages.length, dir: finalOutputDir }),
      action: finalOutputDir ? {
        label: t('translate.studio.completionOpenFolderBtn'),
        onClick: () => {
          if (api?.translateOpenFolder) api.translateOpenFolder(finalOutputDir);
          else if (window.electronAPI?.openPath) window.electronAPI.openPath(finalOutputDir);
        },
      } : undefined,
    });

    // Tự động mở thư mục sau khi hoàn thành nếu bật autoOpenExportFolder
    if (autoOpenExportFolder && finalOutputDir) {
      if (api?.translateOpenFolder) api.translateOpenFolder(finalOutputDir);
      else if (window.electronAPI?.openPath) window.electronAPI.openPath(finalOutputDir);
    }

    // Hiển thị modal thông báo hoàn thành nổi bật
    setCompletionModal?.({
      title: t('translate.auto.completionAutoExportTitle'),
      message: t('translate.auto.completionAutoExportDesc', { count: successCount, total: targetPages.length }),
      folderPath: finalOutputDir,
      stats: { success: successCount, total: targetPages.length },
    });

    onSaveChapter?.({
      outputDir: finalOutputDir,
      savedPaths: targetPages.map((p) => p.savedPath).filter(Boolean),
      pages: targetPages,
    });
  }, [api, activeInputDir, defaultOutputDir, autoOpenExportFolder, onSaveChapter, addLog, currentProject, detectedProjectDir, setPages, setStatusMessage, setCompletionModal, setTranslateProgress, setIsExporting, t]);

  // Subscribe Auto-Processing progress
  useEffect(() => {
    if (!api?.subscribeAutoProcessProgress) return;
    const unsub = api.subscribeAutoProcessProgress((data) => {
      setAutoProgress(data);
      if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
        setIsAutoProcessing(false);
        if (data.status === 'completed') {
          setStatusMessage?.({
            type: 'success',
            text: t('translate.auto.toastAutoProcessDone', { count: data.successCount, skipped: data.skippedCount }),
            action: activeOutputDir ? {
              label: t('translate.studio.completionOpenFolderBtn'),
              onClick: () => {
                if (api?.translateOpenFolder) api.translateOpenFolder(activeOutputDir);
                else if (window.electronAPI?.openPath) window.electronAPI.openPath(activeOutputDir);
              },
            } : undefined,
          });

          // Tự động mở thư mục sau khi Auto-Processing hoàn tất
          if (autoOpenExportFolder && activeOutputDir) {
            if (api?.translateOpenFolder) api.translateOpenFolder(activeOutputDir);
            else if (window.electronAPI?.openPath) window.electronAPI.openPath(activeOutputDir);
          }

          // Hiển thị modal thông báo hoàn tất Auto-Processing
          setCompletionModal?.({
            title: t('translate.auto.completionAutoProcessTitle'),
            message: t('translate.auto.completionAutoProcessDesc', { count: data.successCount }),
            folderPath: activeOutputDir,
            stats: { success: data.successCount, skipped: data.skippedCount, error: data.errorCount },
          });
        }
      } else {
        setIsAutoProcessing(true);
      }

      // Live sync: Cập nhật trạng thái trang đã dịch thành công trong Studio
      if (data.status === 'page_success' && data.stepData?.filePath) {
        const normTarget = (data.stepData.filePath || '').replace(/\\/g, '/').toLowerCase().trim();
        setPages?.((prev) =>
          prev.map((p) => {
            const normP = (p.imagePath || '').replace(/\\/g, '/').toLowerCase().trim();
            if (normP === normTarget) {
              return {
                ...p,
                savedPath: data.stepData.destPath || p.savedPath,
                layers: data.stepData.layers?.length ? data.stepData.layers : p.layers,
              };
            }
            return p;
          })
        );
      }
    });
    return () => unsub?.();
  }, [api, activeOutputDir, autoOpenExportFolder, setPages, setStatusMessage, setCompletionModal, t]);

  // Check running auto process on mount
  useEffect(() => {
    if (!api?.translateGetAutoProcessStatus) return;
    (async () => {
      try {
        const statusRes = await api.translateGetAutoProcessStatus();
        if (statusRes?.isProcessing) {
          setIsAutoProcessing(true);
        }
      } catch (_) { }
    })();
  }, [api]);

  const handleSelectAutoInputDir = useCallback(async () => {
    try {
      const res = await api?.translateSelectFolder?.({ title: t('translate.auto.selectFolderTitle') });
      if (!res?.canceled && res?.folderPath) {
        const folderPath = res.folderPath;
        setAutoInputDir(folderPath);
        setIsScanningAuto(true);

        // Quét đệ quy thư mục để lấy chi tiết danh sách ảnh và cấu trúc thư mục con
        const scanRes = api?.translateListImagesInDirRecursive
          ? await api.translateListImagesInDirRecursive(folderPath)
          : await api?.translateScanFolderImages?.(folderPath);

        const files = scanRes?.files || [];
        const fileDetails = scanRes?.fileDetails || null;
        const count = files.length || scanRes?.count || 0;

        setAutoScannedCount(count);
        setAutoScannedData({ folderPath, files, fileDetails, count });
        setIsScanningAuto(false);

        if (files.length === 0) {
          setErrorModal?.({
            title: t('translate.studio.noImagesFoundTitle'),
            message: t('translate.studio.noImageInFolderDescDetailed', { dir: folderPath }),
          });
          return;
        }

        // Kiểm tra xem các file này đã có trong Studio chưa
        const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();
        const existingPathSet = new Set(pages.map((p) => normalizePath(p.imagePath)).filter(Boolean));
        const allAlreadyInStudio = files.every((fp) => existingPathSet.has(normalizePath(fp)));

        if (pages.length === 0) {
          // Studio đang trống -> Tự động nạp đồng bộ ngay lập tức vào Studio
          await processImportedFiles?.(files, true, folderPath, fileDetails, true);
        } else if (!allAlreadyInStudio) {
          // Studio đang có trang -> Mở Modal gợi ý đồng bộ linh hoạt
          const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || t('translate.studio.projectNewDefaultName');
          setSyncFolderModal?.({
            folderPath,
            folderBaseName,
            files,
            fileDetails,
            count,
            currentProjectName: currentProject?.name || t('translate.studio.projectCurrentDefaultName'),
            currentPageCount: pages.length,
          });
        }
      }
    } catch (e) {
      console.error('[AutoMode] Select input dir error:', e);
      setIsScanningAuto(false);
    }
  }, [api, pages, currentProject, processImportedFiles, setErrorModal, t]);

  // Kiểm tra xem thư mục đầu vào hiện tại đã được đồng bộ vào Studio hay chưa
  const isFolderSyncedToStudio = useMemo(() => {
    if (!activeInputDir || pages.length === 0) return false;
    if (activeInputDir === detectedProjectDir && pages.length > 0) return true;
    if (autoScannedData?.files?.length > 0) {
      const normalizePath = (p) => (p || '').replace(/\\/g, '/').toLowerCase().trim();
      const existingPathSet = new Set(pages.map((p) => normalizePath(p.imagePath)).filter(Boolean));
      return autoScannedData.files.every((fp) => existingPathSet.has(normalizePath(fp)));
    }
    return false;
  }, [activeInputDir, detectedProjectDir, pages, autoScannedData]);

  // Kích hoạt đồng bộ thủ công từ Auto-Processing Modal ra Studio
  const handleTriggerSyncFromAuto = useCallback(async () => {
    let files = autoScannedData?.files;
    let fileDetails = autoScannedData?.fileDetails;
    let folderPath = autoScannedData?.folderPath || activeInputDir;

    if (!files || files.length === 0) {
      if (!folderPath) return;
      setIsScanningAuto(true);
      const scanRes = api?.translateListImagesInDirRecursive
        ? await api.translateListImagesInDirRecursive(folderPath)
        : await api?.translateScanFolderImages?.(folderPath);
      files = scanRes?.files || [];
      fileDetails = scanRes?.fileDetails || null;
      setAutoScannedCount(files.length);
      setAutoScannedData({ folderPath, files, fileDetails, count: files.length });
      setIsScanningAuto(false);
    }

    if (!files || files.length === 0) {
      setErrorModal?.({
        title: t('translate.studio.noImagesFoundTitle'),
        message: t('translate.studio.noImageInFolderDescDetailed', { dir: folderPath }),
      });
      return;
    }

    if (pages.length === 0) {
      await processImportedFiles?.(files, true, folderPath, fileDetails, true);
    } else {
      const folderBaseName = folderPath.split(/[/\\]/).filter(Boolean).pop() || t('translate.studio.projectNewDefaultName');
      setSyncFolderModal?.({
        folderPath,
        folderBaseName,
        files,
        fileDetails,
        count: files.length,
        currentProjectName: currentProject?.name || t('translate.studio.projectCurrentDefaultName'),
        currentPageCount: pages.length,
      });
    }
  }, [api, autoScannedData, activeInputDir, pages, currentProject, processImportedFiles, setErrorModal, t]);

  const handleSelectAutoOutputDir = useCallback(async () => {
    try {
      const res = await api?.translateSelectFolder?.({ title: t('translate.studio.selectDestFolderTitle') });
      if (!res?.canceled && res?.folderPath) {
        setAutoOutputDir(res.folderPath);
      }
    } catch (e) {
      console.error('[AutoMode] Select output dir error:', e);
    }
  }, [api, t]);

  const handleStartAuto = useCallback(async () => {
    const inputDirToUse = activeInputDir;
    const outputDirToUse = activeOutputDir;
    if (!inputDirToUse || !outputDirToUse) {
      setErrorModal?.({
        title: t('translate.studio.missingFoldersTitle'),
        message: t('translate.studio.missingFoldersDesc'),
      });
      return;
    }

    try {
      setIsAutoProcessing(true);
      setAutoProgress(null);
      const res = await api?.translateStartAutoProcess?.({
        inputDir: inputDirToUse,
        outputDir: outputDirToUse,
        options: {
          autoProcessing: {
            skipExisting: autoSkipExisting,
          },
        },
      });
      if (!res?.success) {
        setIsAutoProcessing(false);
        setErrorModal?.({
          title: t('translate.studio.errorStartAuto'),
          message: res?.error || t('translate.studio.errorUnknown'),
        });
      }
    } catch (e) {
      setIsAutoProcessing(false);
      console.error('[AutoMode] Start error:', e);
    }
  }, [api, activeInputDir, activeOutputDir, autoSkipExisting, setErrorModal, t]);

  const handleCancelAuto = useCallback(async () => {
    try {
      await api?.translateCancelAutoProcess?.();
      setIsAutoProcessing(false);
    } catch (e) {
      console.error('[AutoMode] Cancel error:', e);
    }
  }, [api]);

  return {
    showAutoModal,
    setShowAutoModal,
    autoInputDir,
    setAutoInputDir,
    autoOutputDir,
    setAutoOutputDir,
    autoSkipExisting,
    setAutoSkipExisting,
    autoScannedCount,
    autoScannedData,
    syncFolderModal,
    setSyncFolderModal,
    isScanningAuto,
    isAutoProcessing,
    autoProgress,
    detectedProjectDir,
    defaultOutputDir,
    activeInputDir,
    activeOutputDir,
    isAutoModeEnabled,
    toggleAutoMode,
    handleAutoExportPages,
    handleSelectAutoInputDir,
    handleTriggerSyncFromAuto,
    handleSelectAutoOutputDir,
    handleStartAuto,
    handleCancelAuto,
    isFolderSyncedToStudio,
  };
}

