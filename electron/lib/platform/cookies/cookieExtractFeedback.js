'use strict';

/**
 * UI feedback after cookie popup extraction (Sidebar / SiteChecker).
 * CJS copy for Jest/main — keep in sync with src/utils/cookieExtractFeedback.js (ESM).
 */

function buildCookieExtractFeedback(input, t) {
  const translate = typeof t === 'function' ? t : (k) => k;
  const error = input?.error != null ? String(input.error).trim() : '';
  if (error) {
    return {
      title: translate('sidebar.cookie.extractErrorTitle'),
      message: error,
      type: 'error',
    };
  }

  const cookieCount = Math.max(0, Math.floor(Number(input?.cookieCount) || 0));
  if (cookieCount < 1) {
    return {
      title: translate('sidebar.cookie.extractEmptyTitle'),
      message: translate('sidebar.cookie.extractEmptyMessage'),
      type: 'error',
    };
  }

  if (input?.loginDetected === false) {
    return {
      title: translate('sidebar.cookie.extractGuestTitle'),
      message: translate('sidebar.cookie.extractGuestMessage', { n: cookieCount }),
      type: 'warning',
    };
  }

  return {
    title: translate('sidebar.cookie.extractSuccessTitle'),
    message: translate('sidebar.cookie.extractSuccessMessage', { n: cookieCount }),
    type: 'success',
  };
}

function resolveCookieExtractTargetUrl(sourceUrl, homepageUrl, hostIncludes) {
  const home = String(homepageUrl || '').trim();
  const raw = String(sourceUrl || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return home;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const needles = Array.isArray(hostIncludes) ? hostIncludes : [];
    const matches =
      needles.length === 0
        ? false
        : needles.some((n) => {
            const needle = String(n || '')
              .trim()
              .toLowerCase();
            return needle && (host === needle || host.includes(needle));
          });
    return matches ? raw : home;
  } catch {
    return home;
  }
}

module.exports = {
  buildCookieExtractFeedback,
  resolveCookieExtractTargetUrl,
};
