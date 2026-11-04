/**
 * Whether Latest-updates row actions (open chapter list / add to queue) should be enabled
 * before a full loadManga — mirrors mobile latestListingItemChapterActionsEnabled.
 */
export function latestListingItemChapterActionsEnabled(_item, _siteId = '') {
  return true;
}
