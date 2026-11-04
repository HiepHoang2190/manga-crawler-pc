/**
 * Badge / viền vàng tab Yêu thích + chuông — khớp mobile isFavoriteTabBadgeUnread.
 * Tách khỏi hasNew: chữ «+N chương mới» vẫn hiện sau khi đánh dấu đã xem thông báo.
 *
 * Stored values migrated from total remoteCount (e.g. 500) are invalid chapter frontiers;
 * when stored > current remoteHighestChapterNumber but hasNew, treat as stale → show again.
 */

function chapterFrontier(sync) {
  const rh = sync?.remoteHighestChapterNumber;
  return typeof rh === 'number' ? rh : null;
}

function isStaleStoredFrontier(stored, rh) {
  return typeof stored === 'number' && typeof rh === 'number' && rh >= 0 && stored > rh;
}

/** Tab Yêu thích: viền vàng chưa «đã xem». */
export function isFavoriteTabBadgeUnread(itemId, sync, tabBadgeReadById = {}) {
  if (!sync?.hasNew) return false;
  const rh = chapterFrontier(sync);
  if (rh == null || rh < 0) {
    return !Object.prototype.hasOwnProperty.call(tabBadgeReadById, itemId);
  }
  const readUpTo = tabBadgeReadById[itemId] ?? -1;
  if (isStaleStoredFrontier(readUpTo, rh)) return true;
  return rh > readUpTo;
}

/** Chuông: badge đỏ / mục chưa đọc. */
export function isFavoriteBellUnread(itemId, sync, bellReadById = {}) {
  if (!sync?.hasNew) return false;
  const rh = chapterFrontier(sync);
  if (rh == null || rh < 0) {
    return !Object.prototype.hasOwnProperty.call(bellReadById, itemId);
  }
  const lastRead = bellReadById[itemId];
  if (isStaleStoredFrontier(lastRead, rh)) return true;
  if (typeof lastRead !== 'number') return true;
  return rh > lastRead;
}

/** Chuông: mục còn trong panel (chưa «xóa» tại frontier hiện tại). */
export function isFavoriteBellPanelVisible(itemId, sync, panelRemovedById = {}) {
  if (!sync?.hasNew) return false;
  const rh = chapterFrontier(sync);
  const hid = panelRemovedById[itemId];
  if (typeof hid !== 'number') return true;
  if (rh == null || rh < 0) return false;
  if (isStaleStoredFrontier(hid, rh)) return true;
  return rh > hid;
}
