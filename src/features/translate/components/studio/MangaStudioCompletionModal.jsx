import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';

/**
 * Modal hiển thị kết quả hoàn tất tác vụ xuất hoặc dịch hàng loạt (Completion HUD)
 */
export function MangaStudioCompletionModal({
  modal,
  onClose,
  onOpenFolder,
}) {
  const { t } = useI18n();

  if (!modal || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <span className="material-symbols-outlined text-2xl">task_alt</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-on-surface leading-snug break-words">{modal.title}</h3>
              <p className="text-xs text-on-surface-variant line-clamp-1">Manga Studio Translation Engine</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <p className="text-xs text-on-surface leading-relaxed">
          {modal.message}
        </p>

        {modal.stats && (
          <div className="grid grid-cols-2 gap-2 bg-surface-container/60 p-3 rounded-xl border border-outline-variant/20 text-xs">
            {modal.stats.success !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">{t('translate.studio.completionExported')}</span>
                <span className="font-bold text-emerald-500">{t('translate.studio.pagesCount', { count: modal.stats.success })}</span>
              </div>
            )}
            {modal.stats.total !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">{t('translate.studio.completionTotal')}</span>
                <span className="font-bold text-on-surface">{t('translate.studio.pagesCount', { count: modal.stats.total })}</span>
              </div>
            )}
            {modal.stats.skipped !== undefined && modal.stats.skipped > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">{t('translate.studio.completionSkipped')}</span>
                <span className="font-semibold text-amber-500">{t('translate.studio.pagesCount', { count: modal.stats.skipped })}</span>
              </div>
            )}
            {modal.stats.error !== undefined && modal.stats.error > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant">{t('translate.studio.completionError')}</span>
                <span className="font-semibold text-error">{modal.stats.error}</span>
              </div>
            )}
          </div>
        )}

        {modal.folderPath && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">folder</span>
              <span>{t('translate.studio.completionFolderLabel')}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-container font-mono text-[11px] text-on-surface truncate select-all border border-outline-variant/15" data-tooltip={modal.folderPath}>
              {modal.folderPath}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            {t('translate.studio.closeModal')}
          </button>
          {modal.folderPath && (
            <button
              type="button"
              onClick={() => {
                if (onOpenFolder) onOpenFolder(modal.folderPath);
                onClose?.();
              }}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">folder_open</span>
              <span>{t('translate.studio.completionOpenFolderBtn')}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

