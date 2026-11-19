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

function resolveTranslation(dict, fallbackDict, key, paramsOrFallback, maybeParams) {
  let s = dict?.[key] ?? fallbackDict?.[key];
  const params =
    maybeParams && typeof maybeParams === 'object'
      ? maybeParams
      : paramsOrFallback && typeof paramsOrFallback === 'object'
        ? paramsOrFallback
        : null;

  if (s === undefined) {
    if (typeof paramsOrFallback === 'string') {
      return params ? interpolate(paramsOrFallback, params) : paramsOrFallback;
    }
    return key;
  }
  if (params) {
    return interpolate(s, params);
  }
  return s;
}

function initialLocale() {
  if (typeof window === 'undefined') return 'vi';
  const s = localStorage.getItem(LOCALE_KEY);
  if (s === 'en' || s === 'vi') return s;
  return 'vi';
}

export const I18nContext = createContext(null);

const defaultFallbackT = (key, paramsOrFallback, maybeParams) => {
  return resolveTranslation(DICTS.vi || DICTS.en, DICTS.en, key, paramsOrFallback, maybeParams);
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
    (key, paramsOrFallback, maybeParams) => {
      return resolveTranslation(DICTS[locale] || DICTS.en, DICTS.en, key, paramsOrFallback, maybeParams);
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
