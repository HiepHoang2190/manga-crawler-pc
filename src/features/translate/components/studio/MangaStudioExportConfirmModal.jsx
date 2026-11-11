import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';

/**
 * Modal xác nhận xuất trang chưa dịch (Smart Verification Gate)
 */
export function MangaStudioExportConfirmModal({
  modal,
  onClose,
}) {
  const { t } = useI18n();
  const [includeUntranslatedPages, setIncludeUntranslatedPages] = useState(true);

  if (!modal || typeof document === 'undefined') return null;

  const onConfirm = modal.onConfirm;
  const isPartial = modal.type === 'partial_chapter';

  const handleConfirm = () => {
    onClose?.();
    if (isPartial) {
      onConfirm?.(includeUntranslatedPages);
    } else {
      onConfirm?.();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 animate-scaleUp text-on-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <span className="material-symbols-outlined text-[24px]">
              {modal.type === 'partial_chapter' ? 'fact_check' : 'warning'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-on-surface truncate">
              {modal.title || t('translate.studio.exportConfirmDefaultTitle')}
            </h3>
            <p className="text-xs text-on-surface-variant">
              {modal.isCbz ? t('translate.studio.exportConfirmCbzSub') : t('translate.studio.exportConfirmImgSub')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {modal.type === 'partial_chapter' ? (
          <div className="space-y-3 text-xs">
            <p className="text-on-surface leading-relaxed">
              {t('translate.studio.exportTotalPagesDesc', { count: modal.totalCount })}
            </p>
            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-surface-container border border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500 text-[18px]">check_circle</span>
                <div>
                  <div className="font-bold text-on-surface">{modal.translatedCount} trang</div>
                  <div className="text-[10px] text-on-surface-variant">{t('translate.studio.exportTranslatedBadge')}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-[18px]">help_outline</span>
                <div>
                  <div className="font-bold text-on-surface">{modal.untranslatedCount} trang</div>
                  <div className="text-[10px] text-on-surface-variant">{t('translate.studio.exportUntranslatedBadge')}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <p className="font-semibold text-on-surface">{t('translate.studio.exportUntranslatedQuestion')}</p>
              <label className="flex items-start gap-2.5 p-2 rounded-xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="export_untranslated_mode"
                  checked={includeUntranslatedPages}
                  onChange={() => setIncludeUntranslatedPages(true)}
                  className="accent-primary mt-0.5 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-on-surface">{t('translate.studio.exportAllOptionTitle', { count: modal.totalCount })}</p>
                  <p className="text-[11px] text-on-surface-variant">{t('translate.studio.exportAllOptionDesc')}</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2 rounded-xl border border-outline-variant/30 hover:bg-surface-container-high transition-colors cursor-pointer">
                <input
                  type="radio"
                  name="export_untranslated_mode"
                  checked={!includeUntranslatedPages}
                  onChange={() => setIncludeUntranslatedPages(false)}
                  className="accent-primary mt-0.5 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-on-surface">{t('translate.studio.exportOnlyTranslatedTitle', { count: modal.translatedCount })}</p>
                  <p className="text-[11px] text-on-surface-variant">{t('translate.studio.exportOnlyTranslatedDesc')}</p>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {modal.message}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-outline-variant/30 text-on-surface hover:bg-surface-container font-semibold text-xs transition-colors cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]">file_download</span>
            <span>{modal.confirmText || t('translate.studio.exportProceedBtn')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

