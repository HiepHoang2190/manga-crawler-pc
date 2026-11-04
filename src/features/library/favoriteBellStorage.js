/** One-time wipe of count-based bell state after chapter-number frontier migration. */
export const FAVORITE_CHAPTER_FRONTIER_MIGRATION_KEY = 'mangaFavoriteChapterFrontierV1';

const LEGACY_BELL_KEYS = [
  'mangaFavoriteBellDismissedRemoteById',
  'mangaFavoriteBellPanelRemovedRemoteById',
  'mangaFavoriteLastNotifiedRemoteById',
];

/** @returns {boolean} true if migration ran this call */
export function runFavoriteChapterFrontierMigration() {
  try {
    if (localStorage.getItem(FAVORITE_CHAPTER_FRONTIER_MIGRATION_KEY)) return false;
    for (const key of LEGACY_BELL_KEYS) {
      localStorage.removeItem(key);
    }
    localStorage.setItem(FAVORITE_CHAPTER_FRONTIER_MIGRATION_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
