/**
 * Pure utilities for smart clipboard manga URL detection.
 */

export function extractCandidateHttpUrl(rawText) {
  if (typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.length > 2048 || /[\s\r\n]/.test(trimmed)) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    return null;
  }
  const hasMeaningfulPath = Boolean(parsed.pathname && parsed.pathname !== '/');
  const hasQuery = Boolean(parsed.search && parsed.search.length > 1);
  if (!hasMeaningfulPath && !hasQuery) {
    return null;
  }
  return parsed.toString();
}

export function shouldOfferClipboardUrl({ url, siteId, currentSourceUrl, dismissedUrls }) {
  const cleanUrl = String(url || '').trim();
  const cleanSite = String(siteId || '').trim();
  if (!cleanUrl || !cleanSite) return false;
  if (cleanUrl === String(currentSourceUrl || '').trim()) return false;
  if (dismissedUrls && typeof dismissedUrls.has === 'function' && dismissedUrls.has(cleanUrl)) {
    return false;
  }
  return true;
}
