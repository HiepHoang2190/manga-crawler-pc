import { useCallback, useMemo } from 'react';
import { DEFAULT_STUDIO_FONT } from './mangaStudioConstants';

/**
 * useMangaStudioPipelineRunner — Hook điều phối toàn bộ AI Translation & Inpainting Pipeline
 * - Dịch trang đơn hiện tại (Step-by-step: Run Translate Current)
 * - Tách bước độc lập (Step 1: Detect Bubbles, Step 2: OCR Text, Step 3: Translate Text, Step 4: Inpaint Background)
 * - Dịch hàng loạt toàn bộ Chapter (Batch translation / Smart Resume)
 * - Dịch lại các khung thoại sót chữ Nhật / dịch lỗi (Residual Bubbles Retry Trang hiện tại & Toàn Chapter)
 * - Sửa text inline & Dịch lại từng khung đơn lẻ từ Bảng Đối Chiếu (Comparison Modal)
 * - Hủy tiến trình dịch AI (Cancel Translate)
 */
export function useMangaStudioPipelineRunner({
  api,
  pages = [],
  setPages,
  activePage,
  activePageIndex = 0,
  currentProject,
  settings,
  isTranslating,
  setIsTranslating,
  setTranslateProgress,
  isRetryingResidual,
  setIsRetryingResidual,
  setRetryingSingleLayerId,
  addLog,
  setLogs,
  setStatusMessage,
  setErrorModal,
  setResumePromptModal,
  setSelectedLayerId,
  setExpandedLayerId,
  setIsTextGroupCollapsed,
  setShowCleanupLayer,
  onUpdatePages,
  onSavePage,
  onSaveChapter,
  onRunTranslate,
  isAutoModeEnabled,
  activeOutputDir,
  handleAutoExportPages,
  isLocalOnline,
  isModelInstalled,
  currentModelId,
  displayModelName,
  residualLayers = [],
  allChapterLayersWithMeta = [],
  isLayerResidual,
  t,
}) {
  const JAPANESE_CHAR_REGEX = useMemo(
    () => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/,
    []
  );

  // Run AI translate on current page
  const handleRunTranslateCurrent = useCallback(async () => {
    if (!activePage) {
      setErrorModal?.({
        title: t('translate.studio.noActivePageSelected'),
        message: t('translate.studio.noActivePageSelectedDesc'),
      });
      return;
    }

    const isLocalTranslateProvider =
      settings?.translationProvider === 'ollama' ||
      settings?.translationProvider === 'lmstudio' ||
      settings?.translationProvider === 'openai_compatible';

    if (isLocalTranslateProvider) {
      const ep =
        settings?.providers?.[settings?.translationProvider]?.baseUrl ||
        settings?.apiKeys?.openaiCompatible?.endpoint ||
        'http://localhost:11434/v1';
      if (!isLocalOnline) {
        setErrorModal?.({
          title: t('translate.studio.missingLocalServerTitle'),
          message: t('translate.studio.missingLocalServerDesc', { model: displayModelName, endpoint: ep }),
          suggestion: t('translate.studio.missingLocalServerTip'),
          canSwitchToCloud: true,
          openSettings: true,
        });
        setStatusMessage?.({
          text: t('translate.studio.localServerOfflineToast', { ep }),
          type: 'error',
        });
        return;
      }
      if (!isModelInstalled?.(currentModelId)) {
        setErrorModal?.({
          title: t('translate.studio.missingLocalModelTitle'),
          message: t('translate.studio.missingLocalModelDesc', { model: displayModelName, id: currentModelId }),
          suggestion: t('translate.studio.missingLocalModelTip', { id: currentModelId }),
          canSwitchToCloud: true,
          openSettings: true,
        });
        setStatusMessage?.({
          text: t('translate.studio.localModelNotInstalledToast', { id: currentModelId }),
          type: 'error',
        });
        return;
      }
    }

    if (settings?.translationProvider === 'openai' && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal?.({
        title: t('translate.studio.missingOpenAiKeyTitle'),
        message: t('translate.studio.missingOpenAiKeyDesc'),
        suggestion: t('translate.studio.missingOpenAiKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      setStatusMessage?.({
        text: t('translate.studio.missingOpenAiKeyToast'),
        type: 'error',
      });
      return;
    }

    if (settings?.translationProvider === 'gemini' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim())) {
      setErrorModal?.({
        title: t('translate.studio.missingApiKeyTitle'),
        message: t('translate.studio.missingGeminiKeyDesc'),
        suggestion: t('translate.studio.missingGeminiKeyTip'),
        canSwitchToCloud: false,
        openSettings: true,
      });
      setStatusMessage?.({
        text: t('translate.studio.missingGeminiKeyToast'),
        type: 'error',
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && (!settings?.apiKeys?.deepl || !settings.apiKeys.deepl.trim())) {
      setErrorModal?.({
        title: t('translate.studio.missingDeeplKeyTitle'),
        message: t('translate.studio.missingDeeplKeyDesc'),
        suggestion: t('translate.studio.missingDeeplKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      setStatusMessage?.({
        text: t('translate.studio.missingDeeplKeyToast'),
        type: 'error',
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && settings?.ocrProvider !== 'local' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim()) && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal?.({
        title: t('translate.studio.needOcrKeyTitle'),
        message: t('translate.studio.needOcrKeyDesc'),
        suggestion: t('translate.studio.needOcrKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      setStatusMessage?.({
        text: t('translate.studio.deeplNeedsOcrToast'),
        type: 'error',
      });
      return;
    }

    setIsTranslating?.(true);
    setLogs?.([]);
    addLog?.('init', t('translate.studio.startingPageLog', { name: activePage.filename, model: displayModelName }), 'info');
    setTranslateProgress?.({ step: 'init', percent: 10, detail: t('translate.studio.pageInitDetail', { name: activePage.filename }) });
    setStatusMessage?.({
      text: t('translate.studio.pageTranslatingToast', { name: activePage.filename, model: displayModelName }),
      type: 'info',
    });

    let hasError = false;
    try {
      if (api?.translateImage && (activePage.imagePath || activePage.dataUrl || activePage.originalDataUrl)) {
        const res = await api.translateImage({
          imagePath: activePage.imagePath || undefined,
          imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
          forceFresh: true,
        });

        if (res) {
          const rawTranslations = Array.isArray(res.translations) ? res.translations : [];
          const newLayers = rawTranslations.map((tr, lIdx) => {
            const sourceText = tr.sourceText || tr.originalText || tr.rawText || '';
            const text = tr.text || tr.translatedText || '';
            const hasResidual = Boolean(tr.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(text));
            return {
              id: `layer-${activePageIndex}-${lIdx}-${Date.now()}`,
              type: 'dialogue',
              sourceText,
              text,
              bbox: Array.isArray(tr.bbox) ? [...tr.bbox] : [100, 100, 200, 150],
              fontFamily: tr.fontFamily || DEFAULT_STUDIO_FONT,
              fontSize: tr.fontSize || 'auto',
              fontWeight: tr.fontWeight || '700',
              fontStyle: tr.fontStyle || 'normal',
              color: tr.color || '#000000',
              strokeColor: tr.strokeColor || '#ffffff',
              strokeWidth: typeof tr.strokeWidth === 'number' ? tr.strokeWidth : 1.5,
              align: tr.align || 'center',
              direction: tr.direction || 'auto',
              textTransform: tr.textTransform || 'uppercase',
              hasBubble: tr.hasBubble !== false,
              fillBackground: false,
              visible: tr.visible !== false,
              opacity: tr.opacity ?? 1,
              isTranslated: tr.isTranslated !== false && !hasResidual,
              hasResidualJapanese: hasResidual,
            };
          });

          const nextPages = pages.map((p, i) =>
            i === activePageIndex
              ? {
                ...p,
                layers: newLayers,
                cleanDataUrl: res.cleanDataUrl || p.cleanDataUrl || null,
                translatedImageDataUrl: res.translatedImageDataUrl || p.translatedImageDataUrl,
                dataUrl: p.originalDataUrl || p.dataUrl || res.translatedImageDataUrl,
                width: (res.width && res.width > 100) ? res.width : p.width,
                height: (res.height && res.height > 100) ? res.height : p.height,
              }
              : p
          );

          setPages?.(nextPages);
          onUpdatePages?.(nextPages);
          onSavePage?.({
            index: activePageIndex,
            savePath: activePage.savedPath || res.savePath,
            dataUrl: res.translatedImageDataUrl || activePage.dataUrl,
            layers: newLayers,
            width: res.width || activePage.width,
            height: res.height || activePage.height,
          });

          setSelectedLayerId?.(null);
          setExpandedLayerId?.(null);

          const resResidualCount = newLayers.filter((l) => l.hasResidualJapanese).length;
          addLog?.('completed', t('translate.studio.pageCompletedLog', { name: activePage.filename, bubbles: newLayers.length, residuals: resResidualCount }), resResidualCount > 0 ? 'warn' : 'info');

          if (resResidualCount > 0) {
            setStatusMessage?.({
              text: t('translate.studio.pageCompletedWithResidualsToast', { residuals: resResidualCount, bubbles: newLayers.length }),
              type: 'warning',
            });
          } else {
            setStatusMessage?.({
              text: t('translate.studio.pageCompletedToast', { bubbles: newLayers.length }),
              type: 'success',
            });
          }

          if (isAutoModeEnabled) {
            const updatedPage = {
              ...activePage,
              cleanDataUrl: res.cleanDataUrl || activePage.cleanDataUrl,
              layers: newLayers,
            };
            addLog?.('auto', t('translate.studio.batchAutoExportLog', { count: 1, dir: activeOutputDir }), 'info');
            await handleAutoExportPages?.([updatedPage], activeOutputDir);
          }
        }
      } else if (onRunTranslate) {
        await onRunTranslate();
        addLog?.('completed', t('translate.studio.pageRetranslateLog'), 'info');
        setStatusMessage?.({ text: t('translate.studio.pageRetranslateToast'), type: 'success' });
      }
    } catch (err) {
      hasError = true;
      if (err?.message === 'Cancelled' || String(err).includes('cancel')) {
        addLog?.('cancel', t('translate.studio.pageTranslateCancelledLog'), 'warn');
        setStatusMessage?.({ text: t('translate.studio.pageTranslateCancelledToast'), type: 'info' });
      } else {
        console.error('[MangaStudioEditor] Translate page error:', err);
        addLog?.('error', t('translate.studio.pageTranslateErrorToast', { error: err?.message || 'Unknown' }), 'error');
        setErrorModal?.({
          title: t('translate.studio.pageTranslateErrorTitle'),
          message: err?.message || t('translate.studio.pageTranslateErrorDesc'),
        });
        setStatusMessage?.({ text: t('translate.studio.pageTranslateErrorToast', { error: err?.message || 'Unknown' }), type: 'error' });
      }
    } finally {
      setIsTranslating?.(false);
      if (!hasError) {
        setTranslateProgress?.((prev) => prev ? {
          ...prev,
          isFinished: true,
          percent: 100,
          step: 'completed',
          detail: prev.detail || t('translate.studio.pageTranslateCompletedDetail'),
        } : null);
      } else {
        setTranslateProgress?.((prev) => prev ? {
          ...prev,
          isFinished: true,
          isError: true,
          step: 'error',
          detail: t('translate.studio.pageTranslateErrorDetail'),
        } : null);
      }
    }
  }, [
    activePage,
    activePageIndex,
    api,
    pages,
    setPages,
    settings,
    isLocalOnline,
    isModelInstalled,
    currentModelId,
    displayModelName,
    JAPANESE_CHAR_REGEX,
    onUpdatePages,
    onSavePage,
    onRunTranslate,
    isAutoModeEnabled,
    activeOutputDir,
    handleAutoExportPages,
    addLog,
    setLogs,
    setStatusMessage,
    setErrorModal,
    setSelectedLayerId,
    setExpandedLayerId,
    setIsTranslating,
    setTranslateProgress,
    t,
  ]);

  // Step 1: Run Detection
  const handleRunDetection = useCallback(async () => {
    if (!activePage) {
      setErrorModal?.({
        title: t('translate.studio.detectNoPageTitle'),
        message: t('translate.studio.detectNoPageDesc'),
      });
      return;
    }

    setIsTranslating?.(true);
    setLogs?.([]);
    addLog?.('detect', t('translate.studio.detectStartLog', { name: activePage.filename }), 'info');
    setTranslateProgress?.({ step: 'detect', percent: 20, detail: t('translate.studio.detectProgressDetailAi') });
    setStatusMessage?.({
      text: t('translate.studio.detectScanningToast', { name: activePage.filename }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunDetection?.({
        imagePath: activePage.imagePath || undefined,
        imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
      });

      if (res?.detections) {
        const rawDetections = Array.isArray(res.detections) ? res.detections : [];
        const newLayers = rawDetections.map((d, lIdx) => ({
          id: `layer-${activePageIndex}-${lIdx}-${Date.now()}`,
          type: 'dialogue',
          sourceText: '',
          text: '',
          bbox: Array.isArray(d.bbox) ? [...d.bbox] : [100, 100, 200, 150],
          fontFamily: DEFAULT_STUDIO_FONT,
          fontSize: 'auto',
          fontWeight: '700',
          fontStyle: 'normal',
          color: '#000000',
          strokeColor: '#ffffff',
          strokeWidth: 1.5,
          align: 'center',
          direction: 'auto',
          textTransform: 'uppercase',
          hasBubble: d.hasBubble !== false,
          fillBackground: false,
          visible: true,
          opacity: 1,
          isTranslated: null,
          hasResidualJapanese: false,
        }));

        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, layers: newLayers }
            : p
        );

        setPages?.(nextPages);
        onUpdatePages?.(nextPages);

        setSelectedLayerId?.(null);
        setExpandedLayerId?.(null);
        setIsTextGroupCollapsed?.(false);

        addLog?.('detect', t('translate.studio.detectCompletedLog', { count: newLayers.length }), 'info');
        setStatusMessage?.({
          text: t('translate.studio.detectCompletedToast', { count: newLayers.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run Detection] Detection error:', err);
      addLog?.('detect', t('translate.studio.logDetectError', { error: err?.message || err }), 'error');
      setStatusMessage?.({ text: t('translate.studio.toastDetectError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating?.(false);
      setTranslateProgress?.((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  }, [
    activePage,
    activePageIndex,
    api,
    pages,
    setPages,
    onUpdatePages,
    setSelectedLayerId,
    setExpandedLayerId,
    setIsTextGroupCollapsed,
    setIsTranslating,
    setTranslateProgress,
    addLog,
    setLogs,
    setStatusMessage,
    setErrorModal,
    t,
  ]);

  // Step 2: Run OCR
  const handleRunOCR = useCallback(async () => {
    if (!activePage) return;
    const currentLayers = Array.isArray(activePage.layers) ? activePage.layers : [];
    if (currentLayers.length === 0) {
      setErrorModal?.({
        title: t('translate.studio.noBubblesForTranslateTitle'),
        message: t('translate.studio.noBubblesRunDetectTip'),
      });
      return;
    }

    setIsTranslating?.(true);
    setLogs?.([]);
    addLog?.('ocr', t('translate.studio.logOcrStart', { count: currentLayers.length, name: activePage.filename }), 'info');
    setTranslateProgress?.({ step: 'ocr', percent: 20, detail: t('translate.studio.ocrProgressDetail', { count: currentLayers.length }) });
    setStatusMessage?.({
      text: t('translate.studio.ocrToast', { count: currentLayers.length }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunOCR?.({
        imagePath: activePage.imagePath || undefined,
        imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
        layers: currentLayers,
      });

      if (res?.ocrResults) {
        const ocrList = Array.isArray(res.ocrResults) ? res.ocrResults : [];
        const ocrMap = new Map();
        ocrList.forEach((r, idx) => {
          ocrMap.set(idx, r.text);
          if (r.id !== undefined) ocrMap.set(r.id, r.text);
        });

        const updatedLayers = currentLayers.map((l, idx) => {
          const recognized = ocrMap.get(idx) ?? ocrMap.get(l.id) ?? l.sourceText ?? '';
          return {
            ...l,
            sourceText: recognized,
          };
        });

        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, layers: updatedLayers }
            : p
        );

        setPages?.(nextPages);
        onUpdatePages?.(nextPages);

        addLog?.('ocr', t('translate.studio.logOcrDoneWithTotal', { count: ocrList.length, total: currentLayers.length }), 'info');
        setStatusMessage?.({
          text: t('translate.studio.toastOcrDone', { count: ocrList.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run OCR] OCR error:', err);
      addLog?.('ocr', t('translate.studio.logOcrError', { error: err?.message || err }), 'error');
      setStatusMessage?.({ text: t('translate.studio.toastOcrError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating?.(false);
      setTranslateProgress?.((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  }, [
    activePage,
    activePageIndex,
    api,
    pages,
    setPages,
    onUpdatePages,
    setIsTranslating,
    setTranslateProgress,
    addLog,
    setLogs,
    setStatusMessage,
    setErrorModal,
    t,
  ]);

  // Step 3: Run Translation
  const handleRunTranslation = useCallback(async () => {
    if (!activePage) return;
    const currentLayers = Array.isArray(activePage.layers) ? activePage.layers : [];
    if (currentLayers.length === 0) {
      setErrorModal?.({
        title: t('translate.studio.noBubblesForTranslateTitle'),
        message: t('translate.studio.noBubblesForTranslateDesc'),
      });
      return;
    }

    const hasAnyText = currentLayers.some((l) => (l.sourceText || l.text || '').trim());
    if (!hasAnyText) {
      setErrorModal?.({
        title: t('translate.studio.noTextForTranslateTitle'),
        message: t('translate.studio.noTextForTranslateDesc'),
      });
      return;
    }

    setIsTranslating?.(true);
    setLogs?.([]);
    addLog?.('translate', t('translate.studio.logTranslateStart', { count: currentLayers.length }), 'info');
    setTranslateProgress?.({ step: 'translate', percent: 20, detail: t('translate.studio.translateProgressDetail', { count: currentLayers.length }) });
    setStatusMessage?.({
      text: t('translate.studio.translateToast', { count: currentLayers.length }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunTranslation?.({
        layers: currentLayers,
      });

      if (res?.translations) {
        const transList = Array.isArray(res.translations) ? res.translations : [];
        const transMap = new Map();
        transList.forEach((tr, idx) => {
          transMap.set(idx, tr);
          if (tr.id !== undefined) transMap.set(tr.id, tr);
        });

        const updatedLayers = currentLayers.map((l, idx) => {
          const tr = transMap.get(idx) ?? transMap.get(l.id);
          if (!tr) return l;
          const translatedText = tr.translatedText || tr.text || l.text || '';
          const hasResidual = Boolean(tr.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(translatedText));
          return {
            ...l,
            text: translatedText,
            translatedText: translatedText,
            sourceText: tr.sourceText || l.sourceText || '',
            isTranslated: tr.isTranslated !== false && !hasResidual,
            hasResidualJapanese: hasResidual,
          };
        });

        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, layers: updatedLayers }
            : p
        );

        setPages?.(nextPages);
        onUpdatePages?.(nextPages);

        const cleanCount = updatedLayers.filter((l) => l.isTranslated && !l.hasResidualJapanese).length;
        addLog?.('translate', t('translate.studio.logTranslateDoneWithTotal', { clean: cleanCount, total: updatedLayers.length }), 'info');
        setStatusMessage?.({
          text: t('translate.studio.toastTranslateDone', { clean: cleanCount, total: updatedLayers.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run Translation] Translation error:', err);
      addLog?.('translate', t('translate.studio.logTranslateError', { error: err?.message || err }), 'error');
      setStatusMessage?.({ text: t('translate.studio.toastTranslateError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating?.(false);
      setTranslateProgress?.((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  }, [
    activePage,
    activePageIndex,
    api,
    pages,
    setPages,
    onUpdatePages,
    JAPANESE_CHAR_REGEX,
    setIsTranslating,
    setTranslateProgress,
    addLog,
    setLogs,
    setStatusMessage,
    setErrorModal,
    t,
  ]);

  // Step 4: Run Inpainting
  const handleRunInpainting = useCallback(async () => {
    if (!activePage) return;
    const currentLayers = Array.isArray(activePage.layers) ? activePage.layers : [];

    setIsTranslating?.(true);
    setLogs?.([]);
    addLog?.('inpaint', t('translate.studio.logInpaintStart', { name: activePage.filename }), 'info');
    setTranslateProgress?.({ step: 'inpaint', percent: 20, detail: t('translate.studio.inpaintProgressDetail') });
    setStatusMessage?.({
      text: t('translate.studio.inpaintToast', { name: activePage.filename }),
      type: 'info',
    });

    try {
      const res = await api?.translateRunInpainting?.({
        imagePath: activePage.imagePath || undefined,
        imageDataUrl: (!activePage.imagePath ? (activePage.originalDataUrl || activePage.dataUrl) : undefined),
        layers: currentLayers,
      });

      if (res?.cleanDataUrl) {
        const nextPages = pages.map((p, i) =>
          i === activePageIndex
            ? { ...p, cleanDataUrl: res.cleanDataUrl }
            : p
        );

        setPages?.(nextPages);
        onUpdatePages?.(nextPages);
        setShowCleanupLayer?.(true);

        addLog?.('inpaint', t('translate.studio.logInpaintDoneWithTotal'), 'info');
        setStatusMessage?.({
          text: t('translate.studio.toastInpaintDone'),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[Run Inpainting] Inpainting error:', err);
      addLog?.('inpaint', t('translate.studio.logInpaintError', { error: err?.message || err }), 'error');
      setStatusMessage?.({ text: t('translate.studio.toastInpaintError', { error: err?.message || err }), type: 'error' });
    } finally {
      setIsTranslating?.(false);
      setTranslateProgress?.((prev) => prev ? { ...prev, isFinished: true, percent: 100 } : null);
    }
  }, [
    activePage,
    activePageIndex,
    api,
    pages,
    setPages,
    onUpdatePages,
    setShowCleanupLayer,
    setIsTranslating,
    setTranslateProgress,
    addLog,
    setLogs,
    setStatusMessage,
    t,
  ]);

  // Update text from Comparison modal
  const handleUpdateComparisonText = useCallback((targetPageIndex, layerId, newText) => {
    const isStillRes = Boolean(JAPANESE_CHAR_REGEX.test(newText));
    setPages?.((prev) =>
      prev.map((p, pIdx) => {
        if (pIdx !== targetPageIndex) return p;
        return {
          ...p,
          layers: (p.layers || []).map((l) =>
            l.id === layerId
              ? { ...l, text: newText, isTranslated: true, hasResidualJapanese: isStillRes }
              : l
          ),
        };
      })
    );
  }, [JAPANESE_CHAR_REGEX, setPages]);

  // Retry single bubble from Comparison Modal or Layers List
  const handleRetrySingleLayerInComparison = useCallback(async (targetPageIndex, layer, originalIdx) => {
    if (!api?.translateTextSegments || !layer) return;
    setRetryingSingleLayerId?.(layer.id);
    try {
      setStatusMessage?.({ text: t('translate.studio.retryingSingleBubble', { id: originalIdx + 1 }), type: 'info' });
      const ret = await api.translateTextSegments({
        segments: [{
          index: layer.id,
          id: layer.id,
          sourceText: layer.sourceText || layer.text,
          text: layer.sourceText || layer.text,
          bbox: layer.bbox,
        }],
        sourceLanguage: settings?.sourceLanguage || 'ja',
        targetLanguage: settings?.targetLanguage || 'vi',
      });
      if (Array.isArray(ret) && ret.length > 0) {
        const newText = ret[0].translatedText || ret[0].text || '';
        const isStillRes = Boolean(ret[0].hasResidualJapanese || JAPANESE_CHAR_REGEX.test(newText));
        setPages?.((prev) => {
          const next = prev.map((p, pIdx) => {
            if (pIdx !== targetPageIndex) return p;
            return {
              ...p,
              layers: (p.layers || []).map((l) =>
                l.id === layer.id
                  ? { ...l, text: newText, isTranslated: true, hasResidualJapanese: isStillRes }
                  : l
              ),
            };
          });
          onUpdatePages?.(next);
          return next;
        });
        setStatusMessage?.({ text: t('translate.studio.retriedSingleBubbleSuccess', { id: originalIdx + 1 }), type: 'success' });
      }
    } catch (err) {
      setStatusMessage?.({ text: t('translate.studio.retriedSingleBubbleError', { id: originalIdx + 1, error: err?.message }), type: 'error' });
    } finally {
      setRetryingSingleLayerId?.(null);
    }
  }, [api, settings, JAPANESE_CHAR_REGEX, onUpdatePages, setPages, setRetryingSingleLayerId, setStatusMessage, t]);

  // Retry residual Japanese bubbles (Current page or Entire chapter)
  const handleRetryResidualBubbles = useCallback(async (scope = 'current') => {
    const isAllScope = scope === 'all';
    const targetResiduals = isAllScope
      ? allChapterLayersWithMeta.filter(({ layer }) => isLayerResidual?.(layer))
      : residualLayers.map((l) => ({ layer: l, pageIndex: activePageIndex }));

    if (targetResiduals.length === 0 || isRetryingResidual) return;
    setIsRetryingResidual?.(true);
    setStatusMessage?.({
      text: t('translate.studio.retryingResidualsToast', { count: targetResiduals.length, scope: isAllScope ? t('translate.studio.scopeAllChapter') : t('translate.studio.scopeCurrentPage') }),
      type: 'info',
    });

    try {
      const segments = targetResiduals.map(({ layer }) => ({
        index: layer.id,
        id: layer.id,
        sourceText: layer.sourceText || layer.text,
        text: layer.sourceText || layer.text,
        bbox: layer.bbox,
      }));

      const res = await api?.translateTextSegments?.({
        segments,
        sourceLanguage: settings?.sourceLanguage || 'ja',
        targetLanguage: settings?.targetLanguage || 'vi',
      });

      if (Array.isArray(res)) {
        const resMap = new Map(res.map((r) => [r.index, r]));
        const nextPages = pages.map((p, pIdx) => {
          if (!isAllScope && pIdx !== activePageIndex) return p;
          const updatedLayers = (p.layers || []).map((l) => {
            const retried = resMap.get(l.id);
            if (retried) {
              const newText = retried.translatedText || retried.text || '';
              const hasRes = Boolean(retried.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(newText));
              return {
                ...l,
                text: newText,
                isTranslated: retried.isTranslated !== false && !hasRes,
                hasResidualJapanese: hasRes,
              };
            }
            return l;
          });
          return { ...p, layers: updatedLayers };
        });

        setPages?.(nextPages);
        onUpdatePages?.(nextPages);

        setStatusMessage?.({
          text: t('translate.studio.retriedResidualsSuccess', { count: targetResiduals.length }),
          type: 'success',
        });
      }
    } catch (err) {
      console.error('[MangaStudioEditor] Retry residual error:', err);
      setStatusMessage?.({ text: t('translate.studio.retriedResidualsError', { error: err?.message }), type: 'error' });
    } finally {
      setIsRetryingResidual?.(false);
    }
  }, [
    activePageIndex,
    allChapterLayersWithMeta,
    api,
    isLayerResidual,
    isRetryingResidual,
    pages,
    residualLayers,
    setPages,
    settings,
    JAPANESE_CHAR_REGEX,
    onUpdatePages,
    setIsRetryingResidual,
    setStatusMessage,
    t,
  ]);

  // Batch AI translate on entire chapter or untranslated pages
  const doRunTranslateAll = useCallback(async (onlyUntranslated = false) => {
    const hasTranslation = (p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim());
    const targetPages = onlyUntranslated
      ? pages.filter((p) => !hasTranslation(p))
      : pages;

    if (targetPages.length === 0) {
      setErrorModal?.({
        title: t('translate.studio.noResidualPagesToTranslate'),
        message: onlyUntranslated
          ? t('translate.studio.noPagesToTranslateDescAll')
          : t('translate.studio.noPagesToTranslateDescEmpty'),
      });
      return;
    }

    const isLocalTranslateProvider =
      settings?.translationProvider === 'ollama' ||
      settings?.translationProvider === 'lmstudio' ||
      settings?.translationProvider === 'openai_compatible';

    if (isLocalTranslateProvider) {
      const ep =
        settings?.providers?.[settings?.translationProvider]?.baseUrl ||
        settings?.apiKeys?.openaiCompatible?.endpoint ||
        'http://localhost:11434/v1';
      if (!isLocalOnline) {
        setErrorModal?.({
          title: t('translate.studio.missingLocalServerTitle'),
          message: t('translate.studio.missingLocalServerDesc', { model: displayModelName, endpoint: ep }),
          suggestion: t('translate.studio.missingLocalServerTip'),
          canSwitchToCloud: true,
          openSettings: true,
        });
        return;
      }
      if (!isModelInstalled?.(currentModelId)) {
        setErrorModal?.({
          title: t('translate.studio.missingLocalModelTitle'),
          message: t('translate.studio.missingLocalModelDesc', { model: displayModelName, id: currentModelId }),
          suggestion: t('translate.studio.missingLocalModelTip', { id: currentModelId }),
          canSwitchToCloud: true,
          openSettings: true,
        });
        return;
      }
    }

    if (settings?.translationProvider === 'openai' && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal?.({
        title: t('translate.studio.missingOpenAiKeyTitle'),
        message: t('translate.studio.missingOpenAiKeyDesc'),
        suggestion: t('translate.studio.missingOpenAiKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      return;
    }

    if (settings?.translationProvider === 'gemini' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim())) {
      setErrorModal?.({
        title: t('translate.studio.missingApiKeyTitle'),
        message: t('translate.studio.missingGeminiKeyDesc'),
        suggestion: t('translate.studio.missingGeminiKeyTip'),
        canSwitchToCloud: false,
        openSettings: true,
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && (!settings?.apiKeys?.deepl || !settings.apiKeys.deepl.trim())) {
      setErrorModal?.({
        title: t('translate.studio.missingDeeplKeyTitle'),
        message: t('translate.studio.missingDeeplKeyDesc'),
        suggestion: t('translate.studio.missingDeeplKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      return;
    }

    if (settings?.translationProvider === 'deepl' && settings?.ocrProvider !== 'local' && (!settings?.apiKeys?.gemini || !settings.apiKeys.gemini.trim()) && (!settings?.apiKeys?.openai || !settings.apiKeys.openai.trim())) {
      setErrorModal?.({
        title: t('translate.studio.needOcrKeyTitle'),
        message: t('translate.studio.needOcrKeyDesc'),
        suggestion: t('translate.studio.needOcrKeyTip'),
        canSwitchToCloud: true,
        openSettings: true,
      });
      return;
    }

    setIsTranslating?.(true);
    setLogs?.([]);
    addLog?.('init', t('translate.studio.startingBatchLog', { count: targetPages.length, model: displayModelName }), 'info');
    setTranslateProgress?.({
      step: 'init',
      percent: 5,
      detail: t('translate.studio.batchInitDetail', { count: targetPages.length }),
      imageIndex: 0,
      total: targetPages.length,
    });
    setStatusMessage?.({
      text: t('translate.studio.batchTranslatingToast', { count: targetPages.length, model: displayModelName }),
      type: 'info',
    });

    let hasError = false;
    try {
      if (api?.translateChapter) {
        const res = await api.translateChapter({
          projectId: currentProject?.id,
          imagePaths: targetPages.map((p) => p.imagePath).filter(Boolean),
          imageItems: targetPages.map((p) => ({
            path: p.imagePath,
            dataUrl: p.originalDataUrl || p.dataUrl,
            filename: p.filename,
          })),
        });

        if (res && Array.isArray(res.pages)) {
          const resMap = new Map();
          res.pages.forEach((rp) => {
            if (rp.imagePath) resMap.set(rp.imagePath, rp);
          });

          const nextPages = pages.map((p, idx) => {
            const rp = resMap.get(p.imagePath) || (targetPages.length === pages.length ? res.pages[idx] : null);
            if (!rp) return p;

            const rawTranslations = Array.isArray(rp.translations) ? rp.translations : [];
            const newLayers = rawTranslations.map((tr, lIdx) => {
              const sourceText = tr.sourceText || tr.originalText || tr.rawText || '';
              const text = tr.text || tr.translatedText || '';
              return {
                id: `layer-${p.index}-${lIdx}-${Date.now()}`,
                type: 'dialogue',
                sourceText,
                text,
                bbox: Array.isArray(tr.bbox) ? [...tr.bbox] : [100, 100, 200, 150],
                fontFamily: tr.fontFamily || DEFAULT_STUDIO_FONT,
                fontSize: tr.fontSize || 'auto',
                fontWeight: tr.fontWeight || '700',
                fontStyle: tr.fontStyle || 'normal',
                color: tr.color || '#000000',
                strokeColor: tr.strokeColor || '#ffffff',
                strokeWidth: typeof tr.strokeWidth === 'number' ? tr.strokeWidth : 1.5,
                align: tr.align || 'center',
                direction: tr.direction || 'auto',
                textTransform: tr.textTransform || 'uppercase',
                hasBubble: tr.hasBubble !== false,
                fillBackground: false,
                visible: tr.visible !== false,
                opacity: tr.opacity ?? 1,
                isTranslated: tr.isTranslated !== false,
              };
            });

            return {
              ...p,
              cleanDataUrl: rp.cleanDataUrl || p.cleanDataUrl || null,
              dataUrl: p.originalDataUrl || p.dataUrl,
              layers: newLayers.length > 0 ? newLayers : p.layers,
              savedPath: rp.savedPath || p.savedPath,
              translatedImageDataUrl: rp.savedPath ? `file://${rp.savedPath}` : p.translatedImageDataUrl,
            };
          });

          setPages?.(nextPages);
          onUpdatePages?.(nextPages);
          onSaveChapter?.({
            outputDir: res.outputDir,
            savedPaths: nextPages.map((p) => p.savedPath).filter(Boolean),
            pages: nextPages,
          });

          const totalDetected = res.pages.reduce((acc, rp) => acc + (rp.translations?.length || 0), 0);
          addLog?.('completed', t('translate.studio.batchCompleteLog', { count: res.pages.length, bubbles: totalDetected }), 'info');
          setStatusMessage?.({
            text: t('translate.studio.batchCompleteToast', { count: res.pages.length, bubbles: totalDetected }),
            type: 'success',
          });

          if (isAutoModeEnabled) {
            addLog?.('auto', t('translate.studio.batchAutoExportLog', { count: nextPages.length, dir: activeOutputDir }), 'info');
            await handleAutoExportPages?.(nextPages, activeOutputDir);
          }
        }
      } else if (onRunTranslate) {
        await onRunTranslate();
        addLog?.('completed', t('translate.studio.batchAllDoneLog'), 'info');
        setStatusMessage?.({ text: t('translate.studio.batchAllDoneToast'), type: 'success' });
      }
    } catch (err) {
      hasError = true;
      if (err?.message === 'Cancelled' || String(err).includes('cancel')) {
        addLog?.('cancel', t('translate.studio.batchCancelledLog'), 'warn');
        setStatusMessage?.({ text: t('translate.studio.batchCancelledToast'), type: 'info' });
      } else {
        console.error('[MangaStudioEditor] Batch translation error:', err);
        addLog?.('error', t('translate.studio.batchErrorToast', { error: err?.message || 'Unknown' }), 'error');
        setErrorModal?.({
          title: t('translate.studio.batchErrorTitle'),
          message: err?.message || t('translate.studio.batchErrorDesc'),
        });
        setStatusMessage?.({ text: t('translate.studio.batchErrorToast', { error: err?.message || 'Unknown' }), type: 'error' });
      }
    } finally {
      setIsTranslating?.(false);
      if (!hasError) {
        setTranslateProgress?.((prev) => prev ? {
          ...prev,
          isFinished: true,
          percent: 100,
          step: 'completed',
          detail: prev.detail || t('translate.studio.batchAllDoneToast'),
        } : null);
      } else {
        setTranslateProgress?.((prev) => prev ? {
          ...prev,
          isFinished: true,
          isError: true,
          step: 'error',
          detail: t('translate.studio.batchErrorDetail'),
        } : null);
      }
    }
  }, [
    api,
    currentProject,
    pages,
    setPages,
    settings,
    isLocalOnline,
    isModelInstalled,
    currentModelId,
    displayModelName,
    onUpdatePages,
    onSaveChapter,
    onRunTranslate,
    isAutoModeEnabled,
    activeOutputDir,
    handleAutoExportPages,
    addLog,
    setLogs,
    setStatusMessage,
    setErrorModal,
    setIsTranslating,
    setTranslateProgress,
    t,
  ]);

  // Smart Resume Translate Handler
  const handleRunTranslateAll = useCallback(async (onlyUntranslated = false) => {
    const hasTranslation = (p) => Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim());
    const translatedPages = pages.filter(hasTranslation);
    const untranslatedPages = pages.filter((p) => !hasTranslation(p));

    if (!onlyUntranslated && translatedPages.length > 0 && untranslatedPages.length > 0) {
      setResumePromptModal?.({
        translatedCount: translatedPages.length,
        untranslatedCount: untranslatedPages.length,
        totalCount: pages.length,
        onResume: () => doRunTranslateAll(true),
        onReTranslateAll: () => doRunTranslateAll(false),
      });
      return;
    }

    doRunTranslateAll(onlyUntranslated);
  }, [doRunTranslateAll, pages, setResumePromptModal]);

  // Cancel running translation
  const handleCancelTranslate = useCallback(async () => {
    try {
      if (api?.translateCancel) {
        await api.translateCancel();
        setStatusMessage?.({ text: t('translate.studio.stopBatchSent'), type: 'info' });
      }
    } catch (e) {
      console.warn('[MangaStudioEditor] Cancel translation error:', e);
    } finally {
      setIsTranslating?.(false);
      setTranslateProgress?.(null);
    }
  }, [api, setIsTranslating, setTranslateProgress, setStatusMessage, t]);

  return {
    handleRunTranslateCurrent,
    handleRunDetection,
    handleRunOCR,
    handleRunTranslation,
    handleRunInpainting,
    handleUpdateComparisonText,
    handleRetrySingleLayerInComparison,
    handleRetryResidualBubbles,
    handleRunTranslateAll,
    handleCancelTranslate,
  };
}

