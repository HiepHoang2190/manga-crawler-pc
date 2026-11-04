/**
 * Pure reducers for the current manga session owned by DownloadProvider.
 * applyClearSession copies the App.jsx CBZ-close reset set exactly (does not clear site).
 */

export function emptySession() {
  return { manga: null, chapters: [], sourceUrl: '', site: '', fetchError: '', chapterListNoticeKey: '' };
}

export function applyHydrateSession(current_session, payload = {}) {
  const next_session = { ...current_session };
  for (const field_key of Object.keys(payload)) {
    const field_value = payload[field_key];
    next_session[field_key] = typeof field_value === 'function'
      ? field_value(current_session[field_key])
      : field_value;
  }
  return next_session;
}

export function applyClearSession(current_session = {}) {
  return {
    ...current_session,
    manga: null,
    chapters: [],
    sourceUrl: '',
    selectedUrls: new Set(),
    fetchError: '',
    chapterListNoticeKey: '',
  };
}
