import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';

/**
 * ResetDefaultsConfirmModal — Modal xác nhận khôi phục cài đặt về mặc định
 * Cho phép giữ lại các API keys hiện có để tránh phải nhập lại.
 */
export function ResetDefaultsConfirmModal({ isOpen, onClose, onConfirm, busy }) {
  const { t } = useI18n();
  const [keepApiKeys, setKeepApiKeys] = useState(true);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-5 space-y-4 text-on-surface">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <span className="material-symbols-outlined text-[24px]">restart_alt</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-on-surface">{t('translate.settings.resetModalTitle')}</h3>
            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
              {t('translate.settings.resetModalDesc')}
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={keepApiKeys}
              onChange={(e) => setKeepApiKeys(e.target.checked)}
              disabled={busy}
              className="accent-primary w-4 h-4 rounded cursor-pointer"
            />
            <span className="text-xs font-semibold text-on-surface select-none">
              {t('translate.settings.keepKeysCheckbox')}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40"
          >
            {t('translate.settings.cancelReset')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(keepApiKeys)}
            disabled={busy}
            className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-xs font-bold text-on-primary transition-all shadow-xs disabled:opacity-40"
          >
            {busy ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>{t('translate.settings.testingConnection')}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">check</span>
                <span>{t('translate.settings.confirmReset')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ResetDefaultsConfirmModal;

