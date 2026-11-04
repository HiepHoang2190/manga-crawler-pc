import { useCallback } from 'react';
import { useI18n } from '../context/I18nContext';

const MEMBER_REGISTER_FORM_URL = 'https://forms.gle/iYg23GyeV5fE6pYt7';

export default function FreeUserTokenExhaustedModal({ open, onClose }) {
  const { t } = useI18n();

  const openRegisterForm = useCallback(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (api?.openExternal) {
      api.openExternal(MEMBER_REGISTER_FORM_URL);
    } else {
      window.open(MEMBER_REGISTER_FORM_URL, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-user-token-exhausted-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-xl">
        <div className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id="free-user-token-exhausted-title" className="text-lg font-bold text-on-surface tracking-tight">
              {t('freeUserToken.modalTitle')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
              aria-label={t('freeUserToken.modalClose')}
            >
              <span className="material-symbols-outlined text-[22px] leading-none">close</span>
            </button>
          </div>

          <p className="text-sm leading-relaxed text-on-surface-variant">
            {t('freeUserToken.modalBody')}
          </p>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                onClose?.();
                openRegisterForm();
              }}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 font-semibold text-on-primary hover:opacity-95 cursor-pointer"
            >
              {t('freeUserToken.register')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
