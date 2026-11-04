/** Mirror src/features/library/favoriteTabBadge.js for node tests. */
function isStaleStoredFrontier(stored, rh) {
  return typeof stored === 'number' && typeof rh === 'number' && rh >= 0 && stored > rh;
}

function isFavoriteBellUnread(itemId, sync, bellReadById = {}) {
  if (!sync?.hasNew) return false;
  const rh = sync.remoteHighestChapterNumber;
  if (typeof rh !== 'number' || rh < 0) {
    return !Object.prototype.hasOwnProperty.call(bellReadById, itemId);
  }
  const lastRead = bellReadById[itemId];
  if (isStaleStoredFrontier(lastRead, rh)) return true;
  if (typeof lastRead !== 'number') return true;
  return rh > lastRead;
}

function isFavoriteBellPanelVisible(itemId, sync, panelRemovedById = {}) {
  if (!sync?.hasNew) return false;
  const rh = sync.remoteHighestChapterNumber;
  const hid = panelRemovedById[itemId];
  if (typeof hid !== 'number') return true;
  if (typeof rh !== 'number' || rh < 0) return false;
  if (isStaleStoredFrontier(hid, rh)) return true;
  return rh > hid;
}

describe('favorite bell stale count migration', () => {
  const sync = {
    hasNew: true,
    remoteCount: 3,
    remoteHighestChapterNumber: 101,
  };

  test('stale read marker (old remoteCount) shows bell unread', () => {
    expect(isFavoriteBellUnread('f1', sync, { f1: 450 })).toBe(true);
  });

  test('stale panel-removed marker shows item in bell panel', () => {
    expect(isFavoriteBellPanelVisible('f1', sync, { f1: 450 })).toBe(true);
  });

  test('current chapter frontier marks read correctly', () => {
    expect(isFavoriteBellUnread('f1', sync, { f1: 101 })).toBe(false);
    expect(isFavoriteBellUnread('f1', sync, { f1: 100 })).toBe(true);
  });
});
