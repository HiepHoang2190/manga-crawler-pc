/**
 * Busy state for sub-tabs inside the Crawler screen.
 * Queue downloads are shown on the parent Crawler menu tab only.
 */
export function isHomePrimaryTabBusy(tabId, state = {}) {
  if (tabId === 'queue') return false;
  if (tabId === 'favorites') return Boolean(state.fetchAllFavoritesBusy);
  return Boolean(state.tabBusyMap && state.tabBusyMap[tabId]);
}
