import React from 'react';
import { useI18n } from '../../../../context/I18nContext';

/**
 * MangaStudioProgressHud — Bảng HUD theo dõi tiến trình chạy Pipeline Dịch thuật AI
 * Hỗ trợ 2 chế độ:
 * - Thu gọn (Collapsed): Mini progress bar thanh mảnh
 * - Mở rộng (Expanded): Visual Stepper 5 bước (Detect, OCR, Translate, Verify, Typeset), live streaming logs terminal console
 */
export function MangaStudioProgressHud({
  isTranslating = false,
  translateProgress,
  isProgressHudCollapsed,
  setIsProgressHudCollapsed,
  displayModelName,
  showLogConsole,
  setShowLogConsole,
  logs = [],
  setLogs,
  logConsoleRef,
  setShowComparisonModal,
  handleCancelTranslate,
  setTranslateProgress,
  statusMessage,
  setStatusMessage,
  handleRetryResidualBubbles,
  isRetryingResidual = false,
}) {
  const { t } = useI18n();

  if (!isTranslating && !translateProgress?.isFinished) {
    return null;
  }

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-40 animate-slideDown select-none pointer-events-auto w-full px-4 transition-all duration-300 ${isProgressHudCollapsed ? 'top-2.5 max-w-xl' : 'top-4 max-w-2xl'
        }`}
    >
      <div
        className={`rounded-2xl bg-surface-container-lowest/95 text-on-surface backdrop-blur-xl shadow-2xl border transition-all duration-300 flex flex-col ${isProgressHudCollapsed
          ? 'border-primary/40 px-3.5 py-2 gap-1.5 shadow-xl'
          : 'border-primary/30 p-3.5 gap-2.5'
          }`}
      >
        {/* Top header row */}
        <div className="flex items-center justify-between gap-2.5">
          <div
            onClick={() => setIsProgressHudCollapsed?.((prev) => !prev)}
            className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-85 transition-opacity"
            data-tooltip={isProgressHudCollapsed ? t('translate.studio.progressExpandTooltip') : t('translate.studio.progressCollapseTooltip')}
          >
            {isTranslating ? (
              <span className="material-symbols-outlined text-[19px] text-primary animate-spin shrink-0">
                progress_activity
              </span>
            ) : translateProgress?.residualCount > 0 ? (
              <span className="material-symbols-outlined text-[19px] text-amber-500 shrink-0">
                warning
              </span>
            ) : (
              <span className="material-symbols-outlined text-[19px] text-emerald-500 shrink-0">
                check_circle
              </span>
            )}
            <span className="font-bold text-xs text-on-surface truncate">
              {translateProgress?.isFinished
                ? (translateProgress.residualCount > 0
                  ? t('translate.studio.progressPageResiduals', { count: translateProgress.residualCount })
                  : t('translate.studio.progressPageAllDone'))
                : (translateProgress?.imageIndex !== undefined && translateProgress?.total
                  ? t('translate.studio.progressBatchProcessing', { current: translateProgress.imageIndex + 1, total: translateProgress.total })
                  : t('translate.studio.progressTitleDefault'))}
            </span>
            {!isProgressHudCollapsed && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20 shrink-0">
                {displayModelName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-mono font-bold text-primary mr-0.5">
              {translateProgress?.isFinished ? '100%' : (typeof translateProgress?.percent === 'number' ? `${translateProgress.percent}%` : t('translate.studio.progressProcessingLabel'))}
            </span>

            {/* Nút bật tắt Live Console (chỉ hiện khi mở rộng) */}
            {!isProgressHudCollapsed && (
              <button
                type="button"
                onClick={() => setShowLogConsole?.((prev) => !prev)}
                className={`text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 font-medium ${showLogConsole
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                data-tooltip={showLogConsole ? t('translate.studio.logsToggleHide') : t('translate.studio.logsToggleShow')}
              >
                <span className="material-symbols-outlined text-[13px]">terminal</span>
                <span>{t('translate.studio.logsBtnLabel', { count: logs.length })}</span>
              </button>
            )}

            {/* Nút mở Bảng đối chiếu */}
            <button
              type="button"
              onClick={() => setShowComparisonModal?.(true)}
              className="text-[11px] px-2 py-1 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer flex items-center gap-1 font-medium"
              data-tooltip={t('translate.studio.compareTableOpen')}
            >
              <span className="material-symbols-outlined text-[13px] text-primary">table_chart</span>
              <span className={isProgressHudCollapsed ? 'hidden sm:inline' : ''}>{t('translate.studio.compareTableBtn')}</span>
            </button>

            {/* Nút Hủy / Đóng */}
            {isTranslating ? (
              <button
                type="button"
                onClick={handleCancelTranslate}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-container hover:bg-error/20 text-on-surface-variant hover:text-error transition-colors cursor-pointer flex items-center gap-1 font-medium"
                data-tooltip={t('translate.studio.stopTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                <span>{t('translate.studio.cancelBtn')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setTranslateProgress?.(null)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center gap-1 font-medium"
                data-tooltip={t('translate.studio.closeBtn')}
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
                <span>{t('translate.studio.closeBtn')}</span>
              </button>
            )}

            {/* Nút Thu gọn / Mở rộng (Collapse / Expand) */}
            <button
              type="button"
              onClick={() => setIsProgressHudCollapsed?.((prev) => !prev)}
              className="w-6.5 h-6.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center justify-center shrink-0 border border-outline-variant/20"
              data-tooltip={isProgressHudCollapsed ? t('translate.studio.progressExpandTooltip') : t('translate.studio.progressCollapseTooltip')}
            >
              <span className="material-symbols-outlined text-[17px]">
                {isProgressHudCollapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>
          </div>
        </div>

        {/* Mini progress bar khi thu gọn (Collapsed) */}
        {isProgressHudCollapsed && (
          <div className="w-full h-1 rounded-full bg-surface-container overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${translateProgress?.isFinished
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-primary via-primary to-emerald-500'
                }`}
              style={{
                width: `${translateProgress?.isFinished ? 100 : Math.max(5, Math.min(100, typeof translateProgress?.percent === 'number' ? translateProgress.percent : 25))}%`,
              }}
            />
          </div>
        )}

        {/* Chi tiết khi mở rộng (Expanded) */}
        {!isProgressHudCollapsed && (
          <>
            {/* 5-Step Visual Stepper */}
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { id: 'detect', label: t('translate.studio.pipelineStepDetect'), icon: 'crop_free', stepNum: 1 },
                { id: 'ocr', label: t('translate.studio.pipelineStepOcr'), icon: 'document_scanner', stepNum: 2 },
                { id: 'translate', label: t('translate.studio.pipelineStepTranslate'), icon: 'translate', stepNum: 3 },
                { id: 'verify', label: t('translate.studio.pipelineStepVerify'), icon: 'verified', stepNum: 4 },
                { id: 'typeset', label: t('translate.studio.pipelineStepTypeset'), icon: 'layers', stepNum: 5 },
              ].map((s) => {
                const stepOrder = { load: 0, detect: 1, ocr: 2, translate: 3, verify: 4, inpaint: 5, typeset: 5, review: 5, completed: 6 };
                const currentIdx = translateProgress?.isFinished ? 6 : (stepOrder[translateProgress?.step] ?? 1);
                const isDone = currentIdx > s.stepNum || translateProgress?.isFinished;
                const isCurrent = !translateProgress?.isFinished && currentIdx === s.stepNum;

                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-[11px] transition-all ${isDone
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : isCurrent
                        ? 'bg-primary/15 border-primary/50 text-primary font-bold shadow-2xs'
                        : 'border-outline-variant/15 bg-surface-container/50 text-on-surface-variant/70'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[15px] shrink-0">
                      {isDone ? 'check_circle' : (isCurrent ? 'radio_button_checked' : s.icon)}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${translateProgress?.isFinished
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-primary via-primary to-emerald-500'
                  }`}
                style={{
                  width: `${translateProgress?.isFinished ? 100 : Math.max(5, Math.min(100, typeof translateProgress?.percent === 'number' ? translateProgress.percent : 25))}%`,
                }}
              />
            </div>

            {/* Detail summary line */}
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
              <span className="truncate max-w-lg font-medium text-on-surface">
                {translateProgress?.detail || statusMessage?.text || t('translate.studio.processingCanvas')}
              </span>
              {translateProgress?.residualCount > 0 ? (
                <button
                  type="button"
                  onClick={handleRetryResidualBubbles}
                  disabled={isRetryingResidual}
                  className="text-amber-500 hover:text-amber-600 font-semibold flex items-center gap-0.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
                  data-tooltip={t('translate.studio.retryResidualTooltip')}
                >
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                  <span>{t('translate.studio.residualCountBtn', { count: translateProgress.residualCount })}</span>
                </button>
              ) : translateProgress?.isFinished ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5 shrink-0">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  <span>{t('translate.studio.allPassedBadge')}</span>
                </span>
              ) : null}
            </div>

            {/* Live Streaming Terminal Log Console */}
            {showLogConsole && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-outline-variant/20">
                <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                  <span className="flex items-center gap-1 font-semibold text-on-surface">
                    <span className="material-symbols-outlined text-[14px] text-primary">terminal</span>
                    <span>{t('translate.studio.detailedAiLogsTitle', { count: logs.length })}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const text = logs.map((l) => `[${l.time}] [${l.step?.toUpperCase()}] ${l.detail}`).join('\n');
                        navigator.clipboard?.writeText(text);
                        setStatusMessage?.({ text: t('translate.studio.logsCopiedToast'), type: 'info' });
                      }}
                      className="text-[10px] text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center gap-0.5"
                      data-tooltip={t('translate.studio.copyLogs')}
                    >
                      <span className="material-symbols-outlined text-[12px]">content_copy</span>
                      <span>{t('translate.studio.copyLogs')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogs?.([])}
                      className="text-[10px] text-on-surface-variant hover:text-error transition-colors cursor-pointer flex items-center gap-0.5"
                      data-tooltip={t('translate.studio.clearLogs')}
                    >
                      <span className="material-symbols-outlined text-[12px]">delete_sweep</span>
                      <span>{t('translate.studio.clearLogs')}</span>
                    </button>
                  </div>
                </div>

                <div
                  ref={logConsoleRef}
                  className="max-h-48 overflow-y-auto rounded-xl bg-surface-container-lowest border border-outline-variant/20 p-2.5 font-mono text-[11px] leading-relaxed space-y-1 shadow-inner select-text"
                >
                  {logs.length === 0 ? (
                    <div className="text-on-surface-variant/50 text-center py-2 italic text-[11px]">
                      {t('translate.studio.emptyLogs')}
                    </div>
                  ) : (
                    logs.map((log) => {
                      const isWarn = log.type === 'warn';
                      const isError = log.type === 'error';
                      const stepBadgeMap = {
                        init: t('translate.studio.logTagInit'),
                        detect: t('translate.studio.logTagDetect'),
                        ocr: t('translate.studio.logTagOcr'),
                        translate: t('translate.studio.logTagTranslate'),
                        verify: t('translate.studio.logTagVerify'),
                        inpaint: t('translate.studio.logTagInpaint'),
                        typeset: t('translate.studio.logTagTypeset'),
                        completed: t('translate.studio.logTagCompleted'),
                      };
                      const stepBadge = stepBadgeMap[log.step] || log.step?.toUpperCase() || 'INFO';
                      const stepColorMap = {
                        init: 'text-primary',
                        detect: 'text-cyan-500 dark:text-cyan-400',
                        ocr: 'text-sky-500 dark:text-sky-400',
                        translate: 'text-purple-500 dark:text-purple-400',
                        verify: isWarn ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400',
                        inpaint: 'text-pink-500 dark:text-pink-400',
                        typeset: 'text-indigo-500 dark:text-indigo-400',
                        completed: 'text-emerald-500 dark:text-emerald-400 font-bold',
                      };
                      const stepColor = stepColorMap[log.step] || 'text-primary';

                      return (
                        <div
                          key={log.id}
                          className={`flex items-start gap-1.5 py-0.5 transition-colors ${isError
                            ? 'text-error font-medium'
                            : isWarn
                              ? 'text-amber-600 dark:text-amber-300 font-medium'
                              : 'text-on-surface'
                            }`}
                        >
                          <span className="text-[10px] text-on-surface-variant/60 shrink-0 select-none">
                            [{log.time}]
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 select-none bg-surface-container ${stepColor}`}>
                            {stepBadge}
                          </span>
                          <span className="break-all whitespace-pre-wrap flex-1">{log.detail}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

