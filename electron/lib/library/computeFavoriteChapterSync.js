const { listCompletedLocalChapterTitles } = require('./listCompletedLocalChapterTitles');
const { countCompletedChaptersOnDisk } = require('./localChapterCount');
const {
  highestChapterNumberFromList,
  pendingNewChapterCount,
  remoteChaptersAfterLatestLocalDownload,
} = require('./chapterFrontier');

/**
 * Đồng bộ chương mới Yêu thích — khớp mobile FavoriteWatchService._syncOne.
 * @param {string} baseSaveDir
 * @param {string} mangaTitle
 * @param {Array<{ url: string, title: string }>} remoteChapters
 */
function computeFavoriteChapterSync(baseSaveDir, mangaTitle, remoteChapters) {
  const remote = Array.isArray(remoteChapters) ? remoteChapters : [];
  const localTitles = listCompletedLocalChapterTitles(baseSaveDir, mangaTitle);
  const localCount = countCompletedChaptersOnDisk(baseSaveDir, mangaTitle);
  const pending = pendingNewChapterCount(localTitles, remote);
  const remoteHighestChapterNumber = highestChapterNumberFromList(remote) ?? -1;

  return {
    localCount,
    pendingNewCount: pending,
    hasNew: pending > 0,
    remoteHighestChapterNumber,
    totalRemoteCount: remote.length,
    pendingChapters: remoteChaptersAfterLatestLocalDownload(localTitles, remote),
  };
}

module.exports = { computeFavoriteChapterSync };
