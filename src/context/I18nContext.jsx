import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en } from '../i18n/locales/en';
import { vi } from '../i18n/locales/vi';

const LOCALE_KEY = 'manga-crawler-locale';

const DICTS = { en, vi };

function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] != null ? String(params[k]) : `{${k}}`
  );
}

function initialLocale() {
  if (typeof window === 'undefined') return 'vi';
  const s = localStorage.getItem(LOCALE_KEY);
  if (s === 'en' || s === 'vi') return s;
  return 'vi';
}

export const I18nContext = createContext(null);

const defaultFallbackT = (key, paramsOrFallback) => {
  const dict = DICTS.vi || DICTS.en;
  let s = dict[key] ?? DICTS.en[key];
  if (s === undefined) {
    if (typeof paramsOrFallback === 'string') return paramsOrFallback;
    return key;
  }
  if (paramsOrFallback && typeof paramsOrFallback === 'object') {
    return interpolate(s, paramsOrFallback);
  }
  return s;
};

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(initialLocale);

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'vi' ? 'vi' : 'en';
    }
  }, [locale]);

  const t = useCallback(
    (key, paramsOrFallback) => {
      const dict = DICTS[locale] || DICTS.en;
      const fallback = DICTS.en;
      let s = dict[key] ?? fallback[key];
      if (s === undefined) {
        if (typeof paramsOrFallback === 'string') return paramsOrFallback;
        return key;
      }
      if (paramsOrFallback && typeof paramsOrFallback === 'object') {
        return interpolate(s, paramsOrFallback);
      }
      return s;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, lang: locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function useSafeI18n() {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: 'vi',
    lang: 'vi',
    setLocale: () => {},
    t: defaultFallbackT,
  };
}
