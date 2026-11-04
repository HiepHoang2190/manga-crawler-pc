const { extractChapterNumberString } = require('../shared/mangaUtils');

function chapterNumberFromTitle(title) {
  const raw = extractChapterNumberString(title);
  if (raw == null) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Highest parsed chapter number among locally downloaded chapter titles. */
function highestDownloadedChapterNumber(localTitles) {
  const list = Array.isArray(localTitles) ? localTitles : [];
  let max = null;
  for (const title of list) {
    const n = chapterNumberFromTitle(title);
    if (n == null) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

function highestChapterNumberFromList(chapters) {
  const list = Array.isArray(chapters) ? chapters : [];
  let max = null;
  for (const ch of list) {
    const n = chapterNumberFromTitle(ch?.title);
    if (n == null) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

function countChaptersNewerThan(frontier, chapters) {
  const list = Array.isArray(chapters) ? chapters : [];
  if (frontier == null) return list.length;
  let count = 0;
  for (const ch of list) {
    const n = chapterNumberFromTitle(ch?.title);
    if (n != null && n > frontier) count += 1;
  }
  return count;
}

function chaptersNewerThan(frontier, chapters) {
  const list = Array.isArray(chapters) ? chapters : [];
  if (frontier == null) return [...list];
  return list.filter((ch) => {
    const n = chapterNumberFromTitle(ch?.title);
    return n != null && n > frontier;
  });
}

function normalizeTitleKey(title) {
  return String(title ?? '')
    .trim()
    .toLowerCase();
}

function newestDownloadedChapterIndexInRemote(localTitles, remoteChapters) {
  const localKeys = new Set(
    (Array.isArray(localTitles) ? localTitles : [])
      .map((t) => normalizeTitleKey(t))
      .filter(Boolean),
  );
  if (localKeys.size === 0) return -1;
  let last = -1;
  const remote = Array.isArray(remoteChapters) ? remoteChapters : [];
  for (let i = 0; i < remote.length; i++) {
    const key = normalizeTitleKey(remote[i]?.title);
    if (key && localKeys.has(key)) last = i;
  }
  return last;
}

function remoteChaptersAfterLatestLocalDownload(localTitles, remoteChapters) {
  const remote = Array.isArray(remoteChapters) ? remoteChapters : [];
  const local = Array.isArray(localTitles) ? localTitles : [];
  const frontier = highestDownloadedChapterNumber(local);
  if (frontier != null) {
    return chaptersNewerThan(frontier, remote);
  }
  if (remote.length === 0) return [];
  let start = newestDownloadedChapterIndexInRemote(local, remote) + 1;
  if (start < 0) start = 0;
  if (start >= remote.length) return [];
  return remote.slice(start);
}

function pendingNewChapterCount(localTitles, remoteChapters) {
  const remote = Array.isArray(remoteChapters) ? remoteChapters : [];
  const local = Array.isArray(localTitles) ? localTitles : [];
  const frontier = highestDownloadedChapterNumber(local);
  if (frontier != null) {
    return countChaptersNewerThan(frontier, remote);
  }
  if (newestDownloadedChapterIndexInRemote(local, remote) < 0) {
    return remote.length;
  }
  const start = newestDownloadedChapterIndexInRemote(local, remote) + 1;
  if (start >= remote.length) return 0;
  return remote.length - start;
}

module.exports = {
  chapterNumberFromTitle,
  highestDownloadedChapterNumber,
  highestChapterNumberFromList,
  countChaptersNewerThan,
  chaptersNewerThan,
  newestDownloadedChapterIndexInRemote,
  remoteChaptersAfterLatestLocalDownload,
  pendingNewChapterCount,
};
