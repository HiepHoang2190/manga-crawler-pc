import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';

/**
 * TranslateOverlay — Overlay dịch manga trong Reader.
 *
 * Hỗ trợ dịch 1 trang hoặc toàn bộ chapter (batch translation),
 * kèm tính năng xem chi tiết bản dịch, mở thư mục kết quả và xuất file CBZ.
 */

const STEP_ICONS = {
  detection: 'frame_inspect',
  ocr: 'text_fields',
  translation: 'translate',
  inpainting: 'auto_fix_high',
  typesetting: 'text_increase',
};

const STEP_ORDER = ['detection', 'ocr', 'translation', 'inpainting', 'typesetting'];

export default function TranslateOverlay({
  open,
  onClose,
  currentImageDataUrl,
  currentImagePath,
  fetchCurrentImage,
  chapterTitle,
  mangaTitle,
  chapterParams,
  allImagePaths,
  pageCount = 0,
  currentPageIndex = 0,
  onTranslatedImage,
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState('single'); // 'single' | 'chapter'
  const [status, setStatus] = useState('idle'); // 'idle' | 'translating' | 'done' | 'error'
  const [singleProgress, setSingleProgress] = useState({ step: '', percent: 0, detail: '' });
  const [chapterProgress, setChapterProgress] = useState({ imageIndex: 0, total: 0, step: '', percent: 0 });
  const [singleResult, setSingleResult] = useState(null);
  const [chapterResult, setChapterResult] = useState(null);
  const [error, setError] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  const getStepLabel = useCallback((step) => {
    switch (step) {
      case 'detection': return t('translate.overlay.stepDetection');
      case 'ocr': return t('translate.overlay.stepOcr');
      case 'translation': return t('translate.overlay.stepTranslation');
      case 'inpainting': return t('translate.overlay.stepInpainting');
      case 'typesetting': return t('translate.overlay.stepTypesetting');
      default: return step;
    }
  }, [t]);

  // Subscriptions
  useEffect(() => {
    if (!open) return;
    const unsubSingle = window.electronAPI.subscribeTranslateProgress((p) => {
      setSingleProgress(p);
    });
    const unsubChapter = window.electronAPI.subscribeTranslateChapterProgress((p) => {
      setChapterProgress(p);
    });
    return () => {
      if (typeof unsubSingle === 'function') unsubSingle();
      if (typeof unsubChapter === 'function') unsubChapter();
    };
  }, [open]);

  // Reset state when opened or current page changes
  useEffect(() => {
    if (open) {
      setStatus('idle');
      setError('');
      setExportMessage('');
    }
  }, [open, currentPageIndex]);

  // Translate Single Page
  const handleTranslateSingle = useCallback(async () => {
    setStatus('translating');
    setMode('single');
    setSingleProgress({ step: 'detection', percent: 0, detail: t('translate.overlay.preparingImage') });
    setError('');
    setSingleResult(null);
    setShowOriginal(false);

    try {
      let dataUrl = currentImageDataUrl;
      let imgPath = currentImagePath;

      if (!dataUrl && !imgPath && typeof fetchCurrentImage === 'function') {
        const fetched = await fetchCurrentImage();
        dataUrl = fetched?.dataUrl;
        imgPath = fetched?.absPath;
      }

      if (!dataUrl && !imgPath) {
        throw new Error(t('translate.overlay.noImageData'));
      }

      const res = await window.electronAPI.translateImage({
        imageDataUrl: dataUrl,
        imagePath: imgPath,
      });

      setSingleResult(res);
      setStatus('done');
      if (onTranslatedImage) {
        onTranslatedImage(res.translatedImageDataUrl);
      }
    } catch (err) {
      setError(err.message || t('translate.overlay.failedSingle'));
      setStatus('error');
    }
  }, [currentImageDataUrl, currentImagePath, fetchCurrentImage, onTranslatedImage, t]);

  // Translate Entire Chapter (Batch)
  const handleTranslateChapter = useCallback(async () => {
    setStatus('translating');
    setMode('chapter');
    setChapterProgress({ imageIndex: 0, total: pageCount || 1, step: 'detection', percent: 0 });
    setError('');
    setChapterResult(null);

    try {
      const payload = {
        imagePaths: allImagePaths && allImagePaths.length > 0 ? allImagePaths : undefined,
        baseSaveDir: chapterParams?.baseSaveDir,
        mangaTitle: chapterParams?.mangaTitle || mangaTitle,
        chapterTitle: chapterParams?.chapterTitle || chapterTitle,
        folderBasename: chapterParams?.folderBasename,
        offlineMangaDirAbsolute: chapterParams?.offlineMangaDirAbsolute,
      };

      const res = await window.electronAPI.translateChapter(payload);
      setChapterResult(res);
      setStatus('done');
    } catch (err) {
      setError(err.message || t('translate.overlay.failedChapter'));
      setStatus('error');
    }
  }, [allImagePaths, chapterParams, chapterTitle, mangaTitle, pageCount, t]);

  // Cancel translation
  const handleCancel = useCallback(() => {
    window.electronAPI.translateCancel();
    setStatus('idle');
  }, []);

  // Open translated folder
  const handleOpenFolder = useCallback(async () => {
    if (chapterResult?.outputDir) {
      await window.electronAPI.translateOpenFolder(chapterResult.outputDir);
    }
  }, [chapterResult]);

  // Export to CBZ
  const handleExportCbz = useCallback(async () => {
    if (!chapterResult?.savedPaths?.length) return;
    setExportBusy(true);
    setExportMessage('');
    try {
      const title = `${mangaTitle || 'Manga'} - ${chapterTitle || 'Chapter'} [Translated]`;
      const res = await window.electronAPI.translateExportCbz({
        imagePaths: chapterResult.savedPaths,
        title: title.replace(/[/\\?%*:|"<>]/g, '_'),
      });
      if (res?.success) {
        setExportMessage(t('translate.overlay.exportSuccess'));
      } else if (!res?.canceled) {
        setExportMessage(t('translate.overlay.exportFailed'));
      }
    } catch (err) {
      setExportMessage(t('translate.overlay.exportError', { error: err.message }));
    } finally {
      setExportBusy(false);
    }
  }, [chapterResult, chapterTitle, mangaTitle, t]);

  if (!open) return null;

  const currentStepIndex = STEP_ORDER.indexOf(singleProgress.step);

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-surface-container-high/50 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-[24px] text-primary">translate</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-on-surface truncate">{t('translate.overlay.title')}</h2>
            {chapterTitle && (
              <p className="text-xs text-on-surface-variant truncate">{chapterTitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Status: Idle */}
          {status === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-on-surface-variant">
                {t('translate.overlay.desc')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleTranslateSingle}
                  className="cursor-pointer flex flex-col items-center text-center p-4 rounded-xl border border-outline-variant/25 bg-surface-container-lowest hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                  <span className="material-symbols-outlined text-[32px] text-primary mb-2 group-hover:scale-110 transition-transform">
                    crop_original
                  </span>
                  <span className="text-sm font-semibold text-on-surface">{t('translate.overlay.single')}</span>
                  <span className="text-xs text-on-surface-variant mt-1">
                    {t('translate.overlay.singleSub', {
                      current: currentPageIndex + 1,
                      total: pageCount ? ` / ${pageCount}` : '',
                    })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleTranslateChapter}
                  className="cursor-pointer flex flex-col items-center text-center p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all group"
                >
                  <span className="material-symbols-outlined text-[32px] text-primary mb-2 group-hover:scale-110 transition-transform">
                    auto_stories
                  </span>
                  <span className="text-sm font-semibold text-primary">{t('translate.overlay.chapter')}</span>
                  <span className="text-xs text-on-surface-variant mt-1">
                    {t('translate.overlay.chapterSub', { count: pageCount || '' })}
                  </span>
                </button>
              </div>

              <div className="rounded-lg bg-surface-container-high/30 p-3 text-xs text-on-surface-variant space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-primary">info</span>
                  {t('translate.overlay.notes')}
                </p>
                <p>• {t('translate.overlay.noteCache')}</p>
                <p>• {t('translate.overlay.noteSettings')}</p>
              </div>
            </div>
          )}

          {/* Status: Translating — Single page */}
          {status === 'translating' && mode === 'single' && (
            <div className="space-y-3">
              <div className="text-center pb-1">
                <span className="text-sm font-medium text-on-surface">
                  {t('translate.overlay.translatingPage', { page: currentPageIndex + 1 })}
                </span>
              </div>

              {STEP_ORDER.map((step, i) => {
                const label = getStepLabel(step);
                const icon = STEP_ICONS[step];
                const isActive = step === singleProgress.step;
                const isDone = i < currentStepIndex;

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 rounded-xl p-3 transition-all ${
                      isActive
                        ? 'bg-primary/8 border border-primary/30 shadow-sm'
                        : isDone
                          ? 'opacity-60 bg-surface-container-high/20'
                          : 'opacity-30'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${
                      isDone ? 'text-green-500' : isActive ? 'text-primary animate-pulse' : 'text-on-surface-variant'
                    }`}>
                      {isDone ? 'check_circle' : isActive ? 'progress_activity' : icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${isActive ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>
                        {label}
                      </p>
                      {isActive && singleProgress.detail && (
                        <p className="text-xs text-on-surface-variant mt-0.5">{singleProgress.detail}</p>
                      )}
                    </div>
                    {isActive && (
                      <span className="text-xs font-semibold text-primary tabular-nums">
                        {singleProgress.percent}%
                      </span>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleCancel}
                className="cursor-pointer w-full rounded-xl border border-outline-variant/25 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                {t('translate.overlay.cancel')}
              </button>
            </div>
          )}

          {/* Status: Translating — Chapter batch */}
          {status === 'translating' && mode === 'chapter' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-on-surface">
                  {t('translate.overlay.chapterProgress', {
                    current: chapterProgress.imageIndex + 1,
                    total: chapterProgress.total || pageCount,
                  })}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {getStepLabel(chapterProgress.step)} ({chapterProgress.percent || 0}%)
                </p>
              </div>

              {/* Overall Progress bar */}
              <div className="w-full bg-surface-container-high rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        3,
                        (((chapterProgress.imageIndex) + (chapterProgress.percent || 0) / 100) / (chapterProgress.total || pageCount || 1)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>

              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3 space-y-2 text-xs">
                <div className="flex justify-between text-on-surface-variant">
                  <span>{t('translate.overlay.overallProgress')}</span>
                  <span className="font-semibold text-primary">
                    {chapterProgress.total > 0
                      ? `${Math.round(((chapterProgress.imageIndex) / chapterProgress.total) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                {chapterProgress.detail && (
                  <p className="text-on-surface-variant truncate">{chapterProgress.detail}</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleCancel}
                className="cursor-pointer w-full rounded-xl border border-outline-variant/25 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                {t('translate.overlay.cancel')}
              </button>
            </div>
          )}

          {/* Status: Done — Single page */}
          {status === 'done' && mode === 'single' && singleResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 p-3">
                <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[20px]">check_circle</span>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  {t('translate.overlay.singleDone', { count: singleResult.translations?.length || 0 })}
                </p>
              </div>

              {/* Timings */}
              {singleResult.timings && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(singleResult.timings).map(([step, ms]) => (
                    <span
                      key={step}
                      className="text-xs text-on-surface-variant bg-surface-container-high rounded-full px-2.5 py-0.5"
                    >
                      {getStepLabel(step)}: {(ms / 1000).toFixed(1)}s
                    </span>
                  ))}
                </div>
              )}

              {/* Toggle original/translated */}
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={showOriginal}
                  onChange={(e) => {
                    setShowOriginal(e.target.checked);
                    if (onTranslatedImage) {
                      onTranslatedImage(e.target.checked ? null : singleResult.translatedImageDataUrl);
                    }
                  }}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-sm text-on-surface">{t('translate.overlay.showOriginal')}</span>
              </label>

              {/* Translation details */}
              {singleResult.translations?.length > 0 && (
                <details className="rounded-xl border border-outline-variant/15 overflow-hidden">
                  <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high/50 transition-colors">
                    {t('translate.overlay.detailsTitle', { count: singleResult.translations.length })}
                  </summary>
                  <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
                    {singleResult.translations.map((item, i) => (
                      <div key={i} className="rounded-lg bg-surface-container-high/40 p-2 text-xs space-y-1">
                        <p className="text-on-surface-variant">
                          <span className="font-semibold">{t('translate.overlay.labelOriginal')}</span> {item.originalText}
                        </p>
                        <p className="text-on-surface font-medium">
                          <span className="font-semibold text-primary">{t('translate.overlay.labelTranslated')}</span> {item.translatedText}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setStatus('idle'); setSingleResult(null); }}
                  className="cursor-pointer flex-1 rounded-xl border border-outline-variant/25 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  {t('translate.overlay.translateAnother')}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary hover:brightness-110 transition-all"
                >
                  {t('translate.overlay.viewImage')}
                </button>
              </div>
            </div>
          )}

          {/* Status: Done — Chapter batch */}
          {status === 'done' && mode === 'chapter' && chapterResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 p-3">
                <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[24px]">check_circle</span>
                <div>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                    {t('translate.overlay.chapterDone')}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    {t('translate.overlay.chapterSuccessCount', {
                      success: chapterResult.translatedImages,
                      total: chapterResult.totalImages,
                    })}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3 space-y-2">
                <p className="text-xs text-on-surface-variant">
                  {t('translate.overlay.outputFolderLabel')}
                </p>
                <p className="text-xs font-mono text-on-surface bg-surface-container-high/60 p-2 rounded-lg break-all">
                  {chapterResult.outputDir}
                </p>
              </div>

              {exportMessage && (
                <p className={`text-xs ${exportMessage.startsWith('✓') ? 'text-green-600 dark:text-green-400' : 'text-error'}`}>
                  {exportMessage}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-lowest py-2.5 px-3 text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">folder_open</span>
                  {t('translate.overlay.openImagesFolder')}
                </button>

                <button
                  type="button"
                  onClick={handleExportCbz}
                  disabled={exportBusy}
                  className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-3 text-sm font-semibold text-on-primary hover:brightness-110 transition-all disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {exportBusy ? 'progress_activity' : 'archive'}
                  </span>
                  {exportBusy ? t('translate.overlay.exporting') : t('translate.overlay.exportCbzBtn')}
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer w-full rounded-xl border border-outline-variant/25 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                {t('translate.overlay.close')}
              </button>
            </div>
          )}

          {/* Status: Error */}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-error/10 border border-error/20 p-3">
                <span className="material-symbols-outlined text-error text-[20px] shrink-0 mt-0.5">error</span>
                <div>
                  <p className="text-sm font-medium text-error">{t('translate.overlay.failed')}</p>
                  <p className="text-xs text-error/80 mt-1">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStatus('idle')}
                className="cursor-pointer w-full rounded-xl border border-outline-variant/25 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                {t('translate.overlay.retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
