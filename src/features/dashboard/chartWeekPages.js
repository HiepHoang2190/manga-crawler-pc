/** Days shown per page when the 30-day trend chart is paginated by week. */
export const WEEK_PAGE_SIZE = 7;

/**
 * Split daily buckets into week-sized pages anchored to the newest day.
 * The **last page always ends with today** (up to 7 bars); earlier pages
 * step back in 7-day chunks. The first page may be shorter.
 * @template T
 * @param {T[]} items oldest → newest
 * @returns {T[][]} pages oldest → newest
 */
export function splitIntoWeekPages(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (items.length <= WEEK_PAGE_SIZE) return [items];

  const pages = [];
  let end = items.length;
  while (end > 0) {
    const start = Math.max(0, end - WEEK_PAGE_SIZE);
    pages.unshift(items.slice(start, end));
    end = start;
  }
  return pages;
}
