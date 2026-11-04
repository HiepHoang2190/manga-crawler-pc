import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useI18n } from '../../../context/I18nContext';

/**
 * TranslateProcessTracker — Khối hiển thị tiến trình dịch thuật chuẩn xác
 * theo các bước thực tế của Manga Translation Pipeline:
 * 1. Nạp & Kiểm tra ảnh (load)
 * 2. Nhận diện khung thoại (detect)
 * 3. Đọc chữ trong ảnh - OCR (ocr)
 * 4. Dịch sang tiếng Việt (translate)
 * 5. Tẩy chữ gốc bằng LaMa AI (inpaint)
 * 6. Chèn chữ dịch vào khung thoại (typeset)
 * 7. Biên tập Layer (review)
 * 8. Hoàn tất & Xuất file (completed)
 */

function formatDuration(ms, t) {
  if (!ms || ms <= 0) return t ? t('translate.tracker.durationSeconds', { sec: 0 }) : '0s';
  if (ms < 1000) return t ? t('translate.tracker.durationSeconds', { sec: (ms / 1000).toFixed(1) }) : `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return t ? t('translate.tracker.durationSeconds', { sec: totalSec }) : `${totalSec}s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return seconds > 0
    ? (t ? t('translate.tracker.durationMinutesSeconds', { min: minutes, sec: seconds }) : `${minutes}m ${seconds}s`)
    : (t ? t('translate.tracker.durationMinutes', { min: minutes }) : `${minutes}m`);
}

function timeAgo(date, t) {
  if (!date) return t ? t('translate.tracker.timeJustNow') : 'Just now';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return t ? t('translate.tracker.timeJustNow') : 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return t ? t('translate.tracker.timeMinutesAgo', { min }) : `${min}m ago`;
  const hr = Math.floor(min / 60);
  return t ? t('translate.tracker.timeHoursAgo', { hr }) : `${hr}h ago`;
}

function getLangName(langCode, t) {
  const map = {
    auto: t ? t('translate.tracker.langAuto') : 'Auto Detect',
    ja: t ? t('translate.tracker.langJa') : 'Japanese',
    zh: t ? t('translate.tracker.langZh') : 'Chinese',
    ko: t ? t('translate.tracker.langKo') : 'Korean',
    en: t ? t('translate.tracker.langEn') : 'English',
    vi: t ? t('translate.tracker.langVi') : 'Vietnamese',
  };
  return map[langCode] || (langCode === 'auto' ? (t ? t('translate.tracker.langAuto') : 'Auto Detect') : langCode);
}

export default function TranslateProcessTracker({
  isTranslating = false,
  isCompleted = false,
  isError = false,
  errorMessage = '',
  title = '',
  sourcePath = '',
  sourceLang = 'auto',
  targetLang = 'vi',
  pageCount = 1,
  startTime = null,
  completedTime = null,
  progress = {},
  timings = {},
  logs = [],
  layers = [],
  onCancel,
  onOpenFolder,
  onExportCbz,
  onOpenStudio,
  exportBusy = false,
  exportMessage = '',
}) {
  const { t } = useI18n();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeTab, setActiveTab] = useState('steps'); // 'steps' | 'layers' | 'logs'
  const [layerSearch, setLayerSearch] = useState('');
  const [layerFilter, setLayerFilter] = useState('all'); // 'all' | 'translated' | 'untranslated'
  const [copiedLog, setCopiedLog] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logContainerRef = useRef(null);

  // Live stopwatch counter while translating
  useEffect(() => {
    if (!isTranslating || !startTime) {
      if (completedTime && startTime) {
        setElapsedMs(Math.max(0, completedTime.getTime() - startTime.getTime()));
      }
      return;
    }

    const interval = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startTime.getTime()));
    }, 200);

    return () => clearInterval(interval);
  }, [isTranslating, startTime, completedTime]);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (activeTab === 'logs' && autoScrollLogs && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, activeTab, autoScrollLogs]);

  // Copy logs handler
  const handleCopyLogs = useCallback(() => {
    if (!logs || logs.length === 0) return;
    const logText = logs.map((l) => `[${l.time}] [${(l.step || 'INFO').toUpperCase()}] ${l.detail}`).join('\n');
    navigator.clipboard?.writeText(logText).then(() => {
      setCopiedLog(true);
      setTimeout(() => setCopiedLog(false), 2000);
    });
  }, [logs]);

  const srcLangName = getLangName(sourceLang, t);
  const tgtLangName = getLangName(targetLang, t);

  // Normalized dialogue layers
  const layerList = useMemo(() => {
    const raw = Array.isArray(layers) && layers.length > 0
      ? layers
      : (Array.isArray(progress.layers) ? progress.layers : []);
    return raw.map((item, idx) => {
      const source = item.sourceText || item.originalText || item.rawText || '';
      const text = item.text || item.translatedText || '';
      const isTranslated = item.isTranslated !== false && Boolean(text.trim() && text.trim() !== source.trim());
      const bbox = Array.isArray(item.bbox) ? item.bbox : [0, 0, 100, 100];
      return {
        id: item.id || `layer-${idx}`,
        index: idx,
        bbox,
        sourceText: source,
        text,
        isTranslated,
        error: item.error || null,
      };
    });
  }, [layers, progress.layers]);

  // Filtered layers
  const filteredLayers = useMemo(() => {
    return layerList.filter((l) => {
      if (layerFilter === 'translated' && !l.isTranslated) return false;
      if (layerFilter === 'untranslated' && l.isTranslated) return false;
      if (layerSearch.trim()) {
        const q = layerSearch.toLowerCase();
        const bubbleIdxName = t ? t('translate.tracker.bubbleIndex', { index: l.index + 1 }).toLowerCase() : `khung ${l.index + 1}`;
        return (
          l.sourceText.toLowerCase().includes(q) ||
          l.text.toLowerCase().includes(q) ||
          bubbleIdxName.includes(q) ||
          `khung ${l.index + 1}`.includes(q)
        );
      }
      return true;
    });
  }, [layerList, layerFilter, layerSearch, t]);

  // Real-time metric counts with rock-solid fallbacks (never 0 if layers exist)
  const detectedCount = progress.detectedCount || layerList.length || 0;
  const ocrCount = progress.ocrCount || layerList.length || 0;
  const sentCount = progress.sentCount ?? ocrCount;
  const receivedCount = progress.receivedCount ?? progress.translatedCount ?? layerList.filter((l) => l.isTranslated).length;
  const failedCount = progress.failedCount ?? Math.max(0, sentCount - receivedCount);

  // 8 authentic steps of the translation pipeline
  const STEP_KEYS = ['load', 'detect', 'ocr', 'translate', 'inpaint', 'typeset', 'review', 'completed'];
  const stepKey = progress.step || (isCompleted ? 'completed' : 'load');
  const currentStepIdx = STEP_KEYS.indexOf(stepKey);

  const steps = [
    {
      id: 'load',
      name: t('translate.tracker.stepLoad'),
      icon: 'photo_library',
      badge: pageCount > 1
        ? t('translate.tracker.badgeLoadedPages', { count: pageCount })
        : t('translate.tracker.badgeLoadedSingle'),
    },
    {
      id: 'detect',
      name: t('translate.tracker.stepDetect'),
      icon: 'crop_free',
      badge: detectedCount
        ? t('translate.tracker.badgeDetectedCount', { count: detectedCount })
        : isCompleted
          ? t('translate.tracker.badgeDetectedDone')
          : t('translate.tracker.badgeScanning'),
    },
    {
      id: 'ocr',
      name: t('translate.tracker.stepOcr'),
      icon: 'document_scanner',
      badge: (ocrCount !== undefined && detectedCount !== undefined)
        ? t('translate.tracker.badgeOcrRatio', { ocr: ocrCount, total: detectedCount })
        : ocrCount
          ? t('translate.tracker.badgeOcrCount', { count: ocrCount })
          : isCompleted
            ? t('translate.tracker.badgeOcrDone')
            : t('translate.tracker.badgeOcrRunning'),
    },
    {
      id: 'translate',
      name: t('translate.tracker.stepTranslate'),
      icon: 'translate',
      badge: (sentCount !== undefined && receivedCount !== undefined)
        ? t('translate.tracker.badgeTranslateRatio', { sent: sentCount, received: receivedCount })
        : receivedCount
          ? t('translate.tracker.badgeTranslateCount', { count: receivedCount })
          : isCompleted
            ? t('translate.tracker.badgeTranslateDone')
            : t('translate.tracker.badgeTranslateRunning'),
    },
    {
      id: 'inpaint',
      name: t('translate.tracker.stepInpaint'),
      icon: 'auto_fix_high',
      badge: isCompleted || currentStepIdx > 4 ? t('translate.tracker.badgeInpaintDone') : t('translate.tracker.badgeInpaintRunning'),
    },
    {
      id: 'typeset',
      name: t('translate.tracker.stepTypeset'),
      icon: 'format_shapes',
      badge: isCompleted || currentStepIdx > 5 ? t('translate.tracker.badgeTypesetDone') : t('translate.tracker.badgeTypesetRunning'),
    },
    {
      id: 'review',
      name: t('translate.tracker.stepReview'),
      icon: 'layers',
      badge: layerList.length
        ? t('translate.tracker.badgeReviewLayers', { count: layerList.length })
        : isCompleted || currentStepIdx >= 6
          ? t('translate.tracker.badgeReviewReady')
          : t('translate.tracker.badgeReviewWaiting'),
    },
    {
      id: 'completed',
      name: t('translate.tracker.stepCompleted'),
      icon: 'check_circle',
      badge: isCompleted ? t('translate.tracker.badgeCompletedDone') : t('translate.tracker.badgeCompletedWaiting'),
    },
  ];

  return (
    <div className="space-y-4">
      {/* ─── 1. Header Card & Meta Grid ─── */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-xs space-y-5">
        {/* Top title bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Status Pill Badge */}
            {isCompleted ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                {t('translate.tracker.statusDone')}
              </span>
            ) : isError ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                <span className="material-symbols-outlined text-[15px]">error</span>
                {t('translate.tracker.statusFailed')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-500/30">
                <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                {t('translate.tracker.statusRunning')}
              </span>
            )}

            {/* Title / Name */}
            <span className="text-base font-bold text-on-surface truncate" title={title || sourcePath}>
              {title || (sourcePath ? sourcePath.split(/[/\\]/).filter(Boolean).pop() : t('translate.tracker.defaultDocTitle'))}
            </span>

            {sourcePath && (
              <button
                type="button"
                onClick={onOpenFolder}
                title={t('translate.tracker.openFolderTitle')}
                className="cursor-pointer text-on-surface-variant hover:text-primary transition-colors inline-flex items-center"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              </button>
            )}
          </div>

          {isTranslating && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">cancel</span>
              {t('translate.tracker.cancelProcess')}
            </button>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6 text-xs border-t border-outline-variant/10 pt-4">
          <div>
            <p className="text-on-surface-variant text-[11px] mb-1">{t('translate.tracker.sourceLanguage')}</p>
            <p className="font-semibold text-on-surface text-sm">{srcLangName}</p>
          </div>

          <div>
            <p className="text-on-surface-variant text-[11px] mb-1">{t('translate.tracker.targetLanguage')}</p>
            <p className="font-semibold text-on-surface text-sm">{tgtLangName}</p>
          </div>

          <div>
            <p className="text-on-surface-variant text-[11px] mb-1">{t('translate.tracker.pageCountLabel')}</p>
            <p className="font-semibold text-on-surface text-sm">{t('translate.tracker.pageCountValue', { count: pageCount })}</p>
          </div>

          <div>
            <p className="text-on-surface-variant text-[11px] mb-1">{t('translate.tracker.elapsedTime')}</p>
            <p className="font-semibold text-on-surface text-sm font-mono">{formatDuration(elapsedMs, t)}</p>
          </div>

          <div>
            <p className="text-on-surface-variant text-[11px] mb-1">{t('translate.tracker.createdAt')}</p>
            <p className="text-on-surface font-medium">{startTime ? timeAgo(startTime, t) : t('translate.tracker.timeJustNow')}</p>
          </div>

          <div className="sm:col-span-3">
            <p className="text-on-surface-variant text-[11px] mb-1">{t('translate.tracker.sourceLabel')}</p>
            <p
              onClick={onOpenFolder}
              className="text-amber-700 dark:text-amber-400 font-mono text-[11px] truncate cursor-pointer hover:opacity-80 inline-flex items-center gap-1 transition-opacity"
              title={sourcePath}
            >
              <span>{sourcePath || t('translate.tracker.localFolder')}</span>
              <span className="material-symbols-outlined text-[13px]">open_in_new</span>
            </p>
          </div>
        </div>

        {/* ─── Real-time Dialogue & Text Processing Metrics ─── */}
        {(detectedCount > 0 || layerList.length > 0 || isCompleted || isTranslating) && (
          <div className="border-t border-outline-variant/10 pt-4">
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
              {t('translate.tracker.metricsTitle')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Box 1: Bóc tách khung chat */}
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-on-surface-variant mb-1">
                  <span className="text-[11px] font-medium">{t('translate.tracker.boxDetected')}</span>
                  <span className="material-symbols-outlined text-[16px] text-primary">crop_free</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black text-on-surface font-mono">{detectedCount}</span>
                  <span className="text-[11px] text-on-surface-variant">{t('translate.tracker.unitBubbles')}</span>
                </div>
                <span className="text-[10px] text-on-surface-variant/70 mt-0.5 truncate">{t('translate.tracker.descDetected')}</span>
              </div>

              {/* Box 2: Đọc được chữ (OCR) */}
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-on-surface-variant mb-1">
                  <span className="text-[11px] font-medium">{t('translate.tracker.boxOcr')}</span>
                  <span className="material-symbols-outlined text-[16px] text-indigo-500">document_scanner</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black text-on-surface font-mono">{ocrCount}</span>
                  <span className="text-[11px] text-on-surface-variant">{t('translate.tracker.unitBubblesOf', { count: detectedCount })}</span>
                </div>
                <span className="text-[10px] text-on-surface-variant/70 mt-0.5 truncate">{t('translate.tracker.descOcr')}</span>
              </div>

              {/* Box 3: Đã gửi sang AI dịch */}
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-on-surface-variant mb-1">
                  <span className="text-[11px] font-medium">{t('translate.tracker.boxSent')}</span>
                  <span className="material-symbols-outlined text-[16px] text-blue-500">send</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black text-on-surface font-mono">
                    {sentCount}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">{t('translate.tracker.unitSentences')}</span>
                </div>
                <span className="text-[10px] text-on-surface-variant/70 mt-0.5 truncate">{t('translate.tracker.descSent')}</span>
              </div>

              {/* Box 4: Nhận về bản dịch */}
              <div className={`rounded-xl border p-3 flex flex-col justify-between transition-colors ${
                ((failedCount > 0) || progress.isQuota)
                  ? 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-outline-variant/20 bg-surface-container-low/50'
              }`}>
                <div className="flex items-center justify-between text-on-surface-variant mb-1">
                  <span className="text-[11px] font-medium">{t('translate.tracker.boxReceived')}</span>
                  <span className={`material-symbols-outlined text-[16px] ${
                    ((failedCount > 0) || progress.isQuota) ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {((failedCount > 0) || progress.isQuota) ? 'warning' : 'download_done'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-black font-mono ${
                    ((failedCount > 0) || progress.isQuota) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {receivedCount}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {t('translate.tracker.unitSentencesOf', { count: sentCount })}
                  </span>
                </div>
                <span className={`text-[10px] mt-0.5 truncate font-medium ${
                  ((failedCount > 0) || progress.isQuota) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {failedCount > 0
                    ? t('translate.tracker.statusRemaining', { count: failedCount })
                    : (isCompleted ? t('translate.tracker.statusReceivedAll') : t('translate.tracker.statusSyncing'))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── 2. Status Notification Banner ─── */}
      {isCompleted ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-emerald-600 shrink-0">check_circle</span>
            <span className="font-medium">
              {t('translate.tracker.completedBanner', { count: layerList.length })}
            </span>
          </div>
          {onOpenStudio && (
            <button
              type="button"
              onClick={() => onOpenStudio()}
              className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition-colors shrink-0 shadow-xs self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[16px]">layers</span>
              {t('translate.tracker.openStudioBannerBtn')}
            </button>
          )}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-rose-600 shrink-0 mt-0.5">error</span>
          <div>
            <p className="font-bold">{t('translate.tracker.errorBannerTitle')}</p>
            <p className="mt-0.5">{errorMessage || t('translate.tracker.errorBannerFallback')}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-emerald-600 animate-spin shrink-0">progress_activity</span>
          <span className="font-medium">
            {progress.detail || t('translate.tracker.runningBannerFallback')}
          </span>
        </div>
      )}

      {/* ─── 3. Multi-view Tabs Card: Các bước | Chi tiết Layer | Nhật ký Log ─── */}
      <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-xs overflow-hidden">
        {/* Tab Navigation Header */}
        <div className="px-6 py-3 border-b border-outline-variant/10 flex flex-wrap items-center justify-between gap-3 bg-surface-container-low/30">
          <div className="flex items-center gap-1.5 p-1 bg-surface-container-high rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('steps')}
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'steps'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">linear_scale</span>
              <span>{t('translate.tracker.tabStepsFull')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('layers')}
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'layers'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">layers</span>
              <span>{t('translate.tracker.tabLayersFull')}</span>
              {layerList.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-primary/10 text-primary font-bold">
                  {layerList.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'logs'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              <span>{t('translate.tracker.tabLogsFull')}</span>
              {logs.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-surface-container-highest text-on-surface-variant">
                  {logs.length}
                </span>
              )}
            </button>
          </div>

          {/* Right Action for Tab */}
          {activeTab === 'steps' && isTranslating && (
            <span className="text-[11px] text-primary font-medium flex items-center gap-1 animate-pulse">
              <span className="material-symbols-outlined text-[14px]">sync</span>
              {t('translate.tracker.processingStatus')}
            </span>
          )}

          {activeTab === 'layers' && onOpenStudio && (
            <button
              type="button"
              onClick={() => onOpenStudio()}
              className="cursor-pointer inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">draw</span>
              <span>{t('translate.tracker.openInStudioBtn')}</span>
            </button>
          )}

          {activeTab === 'logs' && (
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoScrollLogs}
                  onChange={(e) => setAutoScrollLogs(e.target.checked)}
                  className="accent-primary rounded w-3.5 h-3.5"
                />
                <span>{t('translate.tracker.autoScrollLogs')}</span>
              </label>

              <button
                type="button"
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedLog ? 'check' : 'content_copy'}
                </span>
                <span>{copiedLog ? t('translate.tracker.copiedLogsBtn') : t('translate.tracker.copyLogsBtn')}</span>
              </button>
            </div>
          )}
        </div>

        {/* ─── TAB CONTENT 1: Tiến trình 8 bước ─── */}
        {activeTab === 'steps' && (
          <div className="p-6 space-y-5">
            {steps.map((step, idx) => {
              const isStepDone = isCompleted || idx < currentStepIdx;
              const isStepActive = !isCompleted && idx === currentStepIdx;
              const isStepPending = !isCompleted && idx > currentStepIdx;

              let durationText = '';
              if (timings && typeof timings[step.id] === 'number' && timings[step.id] > 0) {
                durationText = formatDuration(timings[step.id], t);
              } else if (isStepActive) {
                durationText = t('translate.tracker.processingStatus');
              }

              return (
                <div key={step.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          isStepDone
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : isStepActive
                              ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                              : 'bg-surface-container-high text-on-surface-variant/60'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[19px]">
                          {isStepDone ? 'check' : isStepActive ? 'progress_activity' : step.icon}
                        </span>
                      </div>

                      <span className={`text-sm font-bold truncate ${isStepPending ? 'text-on-surface-variant/60' : 'text-on-surface'}`}>
                        {step.name}
                      </span>

                      {(isStepDone || isStepActive) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-container-high/80 text-on-surface">
                          {isStepDone && <span className="material-symbols-outlined text-[13px] text-emerald-600">check_circle</span>}
                          {step.badge}
                        </span>
                      )}

                      {durationText && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-surface-container-high/60 text-on-surface-variant">
                          <span>⏱</span>
                          <span>{durationText}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                      style={{
                        width: isStepDone ? '100%' : isStepActive ? `${Math.min(95, Math.max(15, progress.percent || 50))}%` : '0%',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── TAB CONTENT 2: Chi tiết từng Layer thoại ─── */}
        {activeTab === 'layers' && (
          <div className="p-5 space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface">{t('translate.tracker.filterLabel')}</span>
                <button
                  type="button"
                  onClick={() => setLayerFilter('all')}
                  className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    layerFilter === 'all'
                      ? 'bg-primary text-on-primary font-bold'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('translate.tracker.filterAllCount', { count: layerList.length })}
                </button>
                <button
                  type="button"
                  onClick={() => setLayerFilter('translated')}
                  className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    layerFilter === 'translated'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('translate.tracker.filterTranslatedCount', { count: layerList.filter((l) => l.isTranslated).length })}
                </button>
                <button
                  type="button"
                  onClick={() => setLayerFilter('untranslated')}
                  className={`cursor-pointer px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    layerFilter === 'untranslated'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('translate.tracker.filterKeepOriginalCount', { count: layerList.filter((l) => !l.isTranslated).length })}
                </button>
              </div>

              <div className="relative w-64">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
                  search
                </span>
                <input
                  type="text"
                  value={layerSearch}
                  onChange={(e) => setLayerSearch(e.target.value)}
                  placeholder={t('translate.tracker.searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>

            {/* Layer Table or Empty state */}
            {filteredLayers.length > 0 ? (
              <div className="border border-outline-variant/20 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container-high/60 text-on-surface-variant text-[11px] font-semibold sticky top-0 border-b border-outline-variant/20 backdrop-blur">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-36">{t('translate.tracker.colBBox')}</th>
                        <th className="py-2.5 px-3 w-1/3">{t('translate.tracker.colSourceOcr')}</th>
                        <th className="py-2.5 px-3 w-1/3">{t('translate.tracker.colTranslation')}</th>
                        <th className="py-2.5 px-3 w-28 text-center">{t('translate.tracker.colStatus')}</th>
                        <th className="py-2.5 px-3 w-24 text-right">{t('translate.tracker.colActions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {filteredLayers.map((layer) => {
                        const [x, y, w, h] = layer.bbox;
                        return (
                          <tr key={layer.id} className="hover:bg-surface-container-low/50 transition-colors">
                            <td className="py-2.5 px-3 text-center font-bold text-on-surface-variant">
                              {layer.index + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant">
                              [{Math.round(x)}, {Math.round(y)}, {Math.round(w)}, {Math.round(h)}]
                            </td>
                            <td className="py-2.5 px-3 text-on-surface font-medium leading-relaxed">
                              {layer.sourceText ? (
                                <span className="line-clamp-2" title={layer.sourceText}>
                                  {layer.sourceText}
                                </span>
                              ) : (
                                <span className="text-on-surface-variant/40 italic">{t('translate.tracker.noOcrText')}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-on-surface leading-relaxed">
                              {layer.text ? (
                                <span className="line-clamp-2 text-primary" title={layer.text}>
                                  {layer.text}
                                </span>
                              ) : (
                                <span className="text-on-surface-variant/50 italic">{t('translate.tracker.noTranslationText')}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {layer.isTranslated ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  <span className="material-symbols-outlined text-[12px]">check</span>
                                  {t('translate.tracker.badgeTranslated')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" title={layer.error || t('translate.tracker.filterUntranslated')}>
                                  <span className="material-symbols-outlined text-[12px]">info</span>
                                  {t('translate.tracker.badgeOriginal')}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {onOpenStudio && (
                                <button
                                  type="button"
                                  onClick={() => onOpenStudio(layer.id)}
                                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                                  title={t('translate.tracker.editInStudioTitle')}
                                >
                                  <span>{t('translate.tracker.editBtn')}</span>
                                  <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-outline-variant/30 p-8 text-center space-y-2">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">layers_clear</span>
                <p className="text-xs font-semibold text-on-surface">
                  {layerSearch ? t('translate.tracker.emptySearchResult') : t('translate.tracker.emptyNoLayers')}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {t('translate.tracker.emptyActionHint')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB CONTENT 3: Nhật ký tiến trình (Terminal Log Console) ─── */}
        {activeTab === 'logs' && (
          <div className="p-5 space-y-2.5">
            <div
              ref={logContainerRef}
              className="font-mono text-xs bg-black/95 text-emerald-400 p-4 rounded-xl max-h-80 overflow-y-auto space-y-1.5 shadow-inner border border-white/10 select-text"
            >
              {logs.length > 0 ? (
                logs.map((log) => {
                  const stepBadge = (log.step || 'info').toUpperCase();
                  const isWarn = log.type === 'warn';
                  const isErr = log.type === 'error';
                  const isSuccess = log.type === 'success';

                  return (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-white/40 shrink-0 select-none">[{log.time}]</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 uppercase ${
                          isErr
                            ? 'bg-rose-500/20 text-rose-400'
                            : isWarn
                              ? 'bg-amber-500/20 text-amber-300'
                              : isSuccess
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-blue-500/20 text-blue-300'
                        }`}
                      >
                        {stepBadge}
                      </span>
                      <span
                        className={`${
                          isErr
                            ? 'text-rose-300'
                            : isWarn
                              ? 'text-amber-200'
                              : isSuccess
                                ? 'text-emerald-300 font-semibold'
                                : 'text-white/90'
                        }`}
                      >
                        {log.detail}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-white/40 italic py-4 text-center">
                  {t('translate.tracker.emptyLogsMessage')}
                </div>
              )}
            </div>

            <p className="text-[11px] text-on-surface-variant flex items-center justify-between">
              <span>{t('translate.tracker.logsFooterDesc')}</span>
              <span className="font-mono text-[10px] text-on-surface-variant/70">{t('translate.tracker.logsTotalEvents', { count: logs.length })}</span>
            </p>
          </div>
        )}

        {/* Footnote */}
        <div className="px-6 py-3.5 border-t border-outline-variant/10 bg-surface-container-low/40">
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            {t('translate.tracker.footnote')}
          </p>
        </div>
      </div>
    </div>
  );
}
