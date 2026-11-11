import { useCallback } from 'react';
import { useI18n } from '../context/I18nContext';

/** Biểu mẫu đăng ký whitelist */
const WHITELIST_REGISTER_FORM_URL = 'https://forms.gle/iYg23GyeV5fE6pYt7';

export default function GuestCreditExhaustedModal({ open, onClose, onSignIn }) {
  const { t } = useI18n();

  const openRegisterForm = useCallback(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (api?.openExternal) {
      api.openExternal(WHITELIST_REGISTER_FORM_URL);
    } else {
      window.open(WHITELIST_REGISTER_FORM_URL, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-credit-modal-title"
    >
      <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-xl">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="guest-credit-modal-title" className="text-lg font-bold text-on-surface tracking-tight">
              {t('guestCredit.modalTitle')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
              aria-label={t('guestCredit.modalClose')}
            >
              <span className="material-symbols-outlined text-[22px] leading-none">close</span>
            </button>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">{t('guestCredit.modalBody')}</p>
          <ul className="text-sm text-on-surface space-y-2">
            <li className="flex gap-2">
              <span className="text-primary shrink-0">✓</span>
              <span>{t('guestCredit.benefit1')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">✓</span>
              <span>{t('guestCredit.benefit2')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">✓</span>
              <span>{t('guestCredit.benefit3')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">✓</span>
              <span>{t('guestCredit.benefit4')}</span>
            </li>
          </ul>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onSignIn?.();
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary font-semibold px-4 py-3 hover:opacity-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">login</span>
              {t('guestCredit.signIn')}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose?.();
                openRegisterForm();
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-outline-variant/40 bg-surface-container-high text-on-surface font-medium px-4 py-3 hover:bg-surface-bright cursor-pointer"
            >
              {t('guestCredit.register')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-center text-xs text-on-surface-variant hover:text-on-surface hover:opacity-80 transition-all pt-1 cursor-pointer"
            >
              {t('guestCredit.continueTrial')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
