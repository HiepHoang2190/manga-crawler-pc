import { useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';

export const ADMIN_EMAIL = 'suutamebooktruyentranh@gmail.com';
export const ADMIN_TELEGRAM_ALEX = 'https://t.me/alexdandan';
export const ADMIN_TELEGRAM_CHANNEL = 'https://t.me/suutamebooktruyentranh';
export const ADMIN_TELEGRAM_REGISTER = 'https://t.me/suutamebooktruyentranhdangky';

function useOpenExternal() {
  return useCallback((url) => {
    const u = String(url || '').trim();
    if (!u) return;
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (api?.openExternal) {
      api.openExternal(u);
    } else {
      window.open(u, '_blank', 'noopener,noreferrer');
    }
  }, []);
}

/**
 * Liên hệ quản trị: email + Telegram (dùng chọn Auth gate / Cài đặt).
 */
export default function AdminContactLinks({ className = '', hideRegisterLink = false }) {
  const { t } = useI18n();
  const openExternal = useOpenExternal();
  const mailto = `mailto:${ADMIN_EMAIL}`;

  return (
    <div
      className={`rounded-xl border border-outline-variant/30 bg-surface-container-high/35 px-4 py-3 text-sm text-left ${className}`}
    >
      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">{t('contact.adminHeading')}</p>
      <ul className="space-y-2.5 text-on-surface">
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-on-surface-variant shrink-0 w-[4rem]">{t('contact.emailLabel')}</span>
          <button
            type="button"
            onClick={() => openExternal(mailto)}
            className="text-primary font-medium hover:opacity-80 transition-opacity cursor-pointer text-left break-all"
          >
            {ADMIN_EMAIL}
          </button>
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-on-surface-variant shrink-0 w-[4rem]">{t('contact.telegramLabel')}</span>
          <button
            type="button"
            onClick={() => openExternal(ADMIN_TELEGRAM_ALEX)}
            className="text-primary font-medium hover:opacity-80 transition-opacity cursor-pointer text-left"
          >
            {t('contact.telegramAlex')}
          </button>
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-on-surface-variant shrink-0 w-[4rem]">{t('contact.telegramLabel')}</span>
          <button
            type="button"
            onClick={() => openExternal(ADMIN_TELEGRAM_CHANNEL)}
            className="text-primary font-medium hover:opacity-80 transition-opacity cursor-pointer text-left"
          >
            {t('contact.telegramChannel')}
          </button>
        </li>
        {!hideRegisterLink && (
          <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-on-surface-variant shrink-0 w-[4rem]">{t('contact.telegramLabel')}</span>
            <button
              type="button"
              onClick={() => openExternal(ADMIN_TELEGRAM_REGISTER)}
              className="text-primary font-medium hover:opacity-80 transition-opacity cursor-pointer text-left"
            >
              {t('contact.telegramRegister')}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
