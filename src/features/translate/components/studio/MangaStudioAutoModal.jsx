import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';

/**
 * Modal cấu hình và quản lý chế độ Dịch Tự Động (Auto-Processing Mode)
 */
export function MangaStudioAutoModal({
  isOpen,
  onClose,
  isAutoProcessing,
  autoInputDir,
  setAutoInputDir,
  detectedProjectDir,
  activeInputDir,
  handleSelectAutoInputDir,
  isScanningAuto,
  isFolderSyncedToStudio,
  pagesCount,
  autoScannedCount,
  handleTriggerSyncFromAuto,
  autoOutputDir,
  setAutoOutputDir,
  defaultOutputDir,
  activeOutputDir,
  handleSelectAutoOutputDir,
  isAutoModeEnabled,
  toggleAutoMode,
  autoSkipExisting,
  setAutoSkipExisting,
  autoProgress,
  handleCancelAuto,
  isTranslating,
  handleRunTranslateAll,
}) {
  const { t } = useI18n();

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isAutoProcessing) onClose?.();
      }}
    >
      <div className="max-w-2xl w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-6 flex flex-col text-on-surface space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">auto_mode</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface flex items-center gap-2">
                <span>{t('translate.auto.title')}</span>
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            data-tooltip={t('translate.auto.closeTitle')}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Folder Selection Section */}
        <div className="space-y-3">
          {/* Input Folder */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-on-surface">
                {t('translate.auto.inputFolder')}
              </label>
              {autoInputDir && autoInputDir !== detectedProjectDir && detectedProjectDir && (
                <button
                  type="button"
                  onClick={() => setAutoInputDir('')}
                  className="text-[11px] text-primary hover:opacity-80 cursor-pointer transition-opacity"
                >
                  {t('translate.auto.restoreProjectFolder')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activeInputDir}
                placeholder={t('translate.auto.placeholderInput')}
                className="flex-1 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/25 text-xs text-on-surface font-mono truncate focus:outline-hidden"
              />
              <button
                type="button"
                disabled={isAutoProcessing}
                onClick={handleSelectAutoInputDir}
                className="px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shrink-0 min-w-[115px]"
              >
                <span className="material-symbols-outlined text-[16px]">folder_open</span>
                <span>{t('translate.auto.changeFolder')}</span>
              </button>
              {activeInputDir && (
                <button
                  type="button"
                  onClick={() => window.electronAPI?.openPath(activeInputDir)}
                  className="px-2.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors shrink-0"
                  data-tooltip={t('translate.auto.openFolder')}
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </button>
              )}
            </div>
            {isScanningAuto ? (
              <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                <span>{t('translate.auto.scanningImages')}</span>
              </p>
            ) : isFolderSyncedToStudio ? (
              <div className="flex items-center justify-between mt-1 px-0.5">
                <p className="text-[11px] text-primary flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  <span>{t('translate.auto.syncedToStudio', { count: pagesCount })}</span>
                </p>
              </div>
            ) : autoScannedCount !== null && autoScannedCount > 0 ? (
              <div className="flex items-center justify-between mt-1 px-0.5">
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">folder</span>
                  <span>{t('translate.auto.foundImages', { count: autoScannedCount })}</span>
                </p>
                <button
                  type="button"
                  disabled={isAutoProcessing}
                  onClick={handleTriggerSyncFromAuto}
                  className="text-[11px] text-primary hover:opacity-80 font-semibold flex items-center gap-1 cursor-pointer transition-opacity"
                >
                  <span className="material-symbols-outlined text-[13px]">sync</span>
                  <span>{t('translate.auto.syncToStudio')}</span>
                </button>
              </div>
            ) : activeInputDir === detectedProjectDir && pagesCount > 0 ? (
              <p className="text-[11px] text-primary mt-1 flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                <span>{t('translate.auto.detectedProjectDir', { count: pagesCount })}</span>
              </p>
            ) : null}
          </div>

          {/* Output Folder */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-on-surface">
                {t('translate.auto.outputFolder')}
              </label>
              {autoOutputDir && autoOutputDir !== defaultOutputDir && defaultOutputDir && (
                <button
                  type="button"
                  onClick={() => setAutoOutputDir('')}
                  className="text-[11px] text-emerald-600 hover:opacity-80 cursor-pointer transition-opacity"
                >
                  {t('translate.auto.useDefault')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activeOutputDir}
                placeholder={t('translate.auto.placeholderOutput')}
                className="flex-1 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/25 text-xs text-on-surface font-mono truncate focus:outline-hidden"
              />
              <button
                type="button"
                disabled={isAutoProcessing}
                onClick={handleSelectAutoOutputDir}
                className="px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shrink-0 min-w-[115px]"
              >
                <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                <span>{t('translate.auto.changeFolder')}</span>
              </button>
              {activeOutputDir && (
                <button
                  type="button"
                  onClick={() => window.electronAPI?.openPath(activeOutputDir)}
                  className="px-2.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors shrink-0"
                  data-tooltip={t('translate.auto.openFolder')}
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                </button>
              )}
            </div>
            {!autoOutputDir && defaultOutputDir && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                <span>{t('translate.auto.defaultOutputNote')}</span>
              </p>
            )}
          </div>

          {/* Options Section */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-on-surface cursor-pointer select-none p-2.5 rounded-xl bg-surface-container border border-outline-variant/25 hover:bg-surface-container-high transition-colors">
              <input
                type="checkbox"
                checked={isAutoModeEnabled}
                onChange={(e) => toggleAutoMode(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold">
                  <span className="material-symbols-outlined text-[16px]">auto_mode</span>
                  <span>{t('translate.auto.autoModeCheckbox')}</span>
                </div>
                <p className="text-[11px] text-on-surface-variant font-normal mt-0.5">
                  {t('translate.auto.autoModeDesc')}
                </p>
              </div>
            </label>

            {/* Option: Skip existing */}
            <label className="flex items-start gap-2.5 text-xs font-medium text-on-surface cursor-pointer select-none px-1 pt-2.5">
              <input
                type="checkbox"
                disabled={isAutoProcessing}
                checked={autoSkipExisting}
                onChange={(e) => setAutoSkipExisting(e.target.checked)}
                className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-on-surface block">
                  {t('translate.auto.skipExistingTitle')}
                </span>
                <p className="text-[11px] text-on-surface-variant font-normal mt-0.5 leading-relaxed">
                  {t('translate.auto.skipExistingDesc')}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Live Progress HUD (if running or completed) */}
        {(isAutoProcessing || autoProgress) && (
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/25 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 text-on-surface truncate max-w-[360px]">
                <span className={`material-symbols-outlined text-[16px] ${isAutoProcessing ? 'text-primary animate-spin' : 'text-emerald-500'}`}>
                  {isAutoProcessing ? 'progress_activity' : 'check_circle'}
                </span>
                <span className="truncate">
                  {autoProgress?.detail || (isAutoProcessing ? t('translate.auto.processingStatus') : t('translate.auto.readyStatus'))}
                </span>
              </span>
              <span className="font-mono text-primary text-sm font-bold shrink-0">
                {autoProgress?.percent ?? 0}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${autoProgress?.percent ?? 0}%` }}
              />
            </div>

            {/* Stat pills */}
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                  {t('translate.auto.statDone', { count: autoProgress?.successCount ?? 0 })}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-semibold">
                  {t('translate.auto.statSkipped', { count: autoProgress?.skippedCount ?? 0 })}
                </span>
                {(autoProgress?.errorCount ?? 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-error/10 text-error font-semibold border border-error/20">
                    {t('translate.auto.statError', { count: autoProgress?.errorCount })}
                  </span>
                )}
              </div>
              {autoProgress?.etaSeconds > 0 && (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {t('translate.auto.statEta', { minutes: Math.ceil(autoProgress.etaSeconds / 60) })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer / Actions */}
        <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-outline-variant/20">
          <div>
            {activeOutputDir && (
              <button
                type="button"
                onClick={() => window.electronAPI?.openPath(activeOutputDir)}
                className="text-xs text-primary hover:opacity-80 flex items-center gap-1 font-medium cursor-pointer transition-opacity"
              >
                <span className="material-symbols-outlined text-[15px]">folder</span>
                <span>{t('translate.auto.openOutputDir')}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAutoProcessing ? (
              <button
                type="button"
                onClick={handleCancelAuto}
                className="px-4 py-2 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                <span>{t('translate.auto.stopProgress')}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
                >
                  {t('translate.auto.close')}
                </button>
                {!isFolderSyncedToStudio && autoScannedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleTriggerSyncFromAuto}
                    className="px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">sync</span>
                    <span>{t('translate.auto.syncCountBtn', { count: autoScannedCount })}</span>
                  </button>
                )}
                {pagesCount > 0 && (
                  <button
                    type="button"
                    disabled={!activeInputDir || !activeOutputDir || isTranslating}
                    onClick={() => {
                      onClose?.();
                      handleRunTranslateAll?.(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-tooltip={t('translate.auto.translateExportNowTitle')}
                  >
                    <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                    <span>{t('translate.auto.translateExportNowBtn', { count: pagesCount })}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

