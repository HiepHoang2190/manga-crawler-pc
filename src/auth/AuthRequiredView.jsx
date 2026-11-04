import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { AdminContactLinks } from '../shared';

/** Biểu mẫu đăng ký whitelist — [Đăng ký tham gia tool](https://forms.gle/iYg23GyeV5fE6pYt7) */
const WHITELIST_REGISTER_FORM_URL = 'https://forms.gle/iYg23GyeV5fE6pYt7';

export default function AuthRequiredView({ blockedReason, onLoggedIn }) {
  const { t, locale, setLocale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!blockedReason || blockedReason === 'UNKNOWN') {
      setMsg('');
      return;
    }
    if (blockedReason === 'NOT_IN_WHITELIST') {
      setMsg(t('settings.account.sessionInvalidNotInSheet'));
    } else if (blockedReason === 'NOT_MEMBER') {
      setMsg(t('settings.account.sessionInvalidNotMember'));
    } else {
      setMsg(t('settings.account.sessionInvalidGeneric'));
    }
  }, [blockedReason, t]);

  const openRegisterForm = useCallback(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (api?.openExternal) {
      api.openExternal(WHITELIST_REGISTER_FORM_URL);
    } else {
      window.open(WHITELIST_REGISTER_FORM_URL, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const runLogin = async () => {
    setMsg('');
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.loginGoogle) {
      setMsg(t('auth.gate.noElectron'));
      return;
    }
    setBusy(true);
    try {
      const r = await api.loginGoogle();
      if (r?.ok) {
        const s = await api.getAuthSession();
        if (s?.refreshToken) {
          onLoggedIn?.();
          return;
        }
        setMsg(t('auth.gate.sessionMissing'));
      } else if (r?.error === 'NOT_WHITELISTED') {
        setMsg(t('settings.account.notWhitelisted'));
      } else if (r?.error === 'NOT_MEMBER') {
        setMsg(t('settings.account.notMember'));
      } else {
        setMsg(r?.message || r?.error || t('auth.gate.loginFailed'));
      }
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 min-h-0 overflow-auto bg-surface-container-lowest">
      <div className="absolute top-4 right-4 z-50">
        <div role="group" className="flex h-6 shrink-0 rounded-full bg-surface-variant p-0.5 w-[5rem]">
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={`flex-1 min-w-0 rounded-full text-[10px] font-bold leading-none transition-colors cursor-pointer ${
              locale === 'en'
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale('vi')}
            className={`flex-1 min-w-0 rounded-full text-[10px] font-bold leading-none transition-colors cursor-pointer ${
              locale === 'vi'
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            VI
          </button>
        </div>
      </div>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shadow-lg">
          <span className="material-symbols-outlined text-[40px] leading-none">lock</span>
        </div>
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={runLogin}
            className="w-full sm:w-auto min-w-[14rem] inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-on-primary font-semibold px-6 py-3.5 hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50 disabled:pointer-events-none shadow-lg mb-6"
          >
            <span className="material-symbols-outlined text-[22px] leading-none">login</span>
            {busy ? t('settings.account.busy') : t('auth.gate.signIn')}
          </button>
          
          <p className="mt-3 text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">{t('auth.gate.body')}</p>
          <div className="mt-4 text-sm text-on-surface-variant leading-relaxed flex flex-col items-center gap-1">
            <span>{t('auth.gate.registerLine')}</span>
            <button
              type="button"
              onClick={openRegisterForm}
              className="text-primary underline font-medium hover:opacity-90 cursor-pointer text-center"
            >
              {t('auth.gate.registerLinkLabel')}
            </button>
          </div>
        </div>
        {msg ? (
          <p className="text-sm text-error whitespace-pre-wrap leading-relaxed px-2">{msg}</p>
        ) : null}

        {msg ? (
          <p className="text-sm text-error leading-relaxed px-2">
            {t('auth.gate.clearCacheHint')}
          </p>
        ) : null}

        <div className="pt-4">
          <AdminContactLinks className="w-full text-left" hideRegisterLink={true} />
        </div>
      </div>
    </div>
  );
}
