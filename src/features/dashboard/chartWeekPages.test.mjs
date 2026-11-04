import assert from 'node:assert/strict';
import { splitIntoWeekPages, WEEK_PAGE_SIZE } from './chartWeekPages.js';
import { getDownloadsPerDay } from './dashboardAggregator.js';

test('splitIntoWeekPages: empty → []', () => {
  assert.deepEqual(splitIntoWeekPages([]), []);
  assert.deepEqual(splitIntoWeekPages(null), []);
});

test('splitIntoWeekPages: ≤7 items → single page', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(splitIntoWeekPages(items), [items]);
});

test('splitIntoWeekPages: 30 items → 5 pages; last page has 7 days ending today', () => {
  const items = Array.from({ length: 30 }, (_, i) => i);
  const pages = splitIntoWeekPages(items);
  assert.equal(pages.length, 5);
  assert.equal(pages[0].length, 2);
  assert.equal(pages[4].length, WEEK_PAGE_SIZE);
  assert.deepEqual(pages[4], items.slice(23, 30));
  assert.deepEqual(pages.flat(), items);
});

test('30-day pages: last page ends with today dateISO', () => {
  const nowMs = new Date(2026, 6, 1, 12, 0, 0).getTime();
  const buckets = getDownloadsPerDay([], { days: 30, nowMs });
  const pages = splitIntoWeekPages(buckets);
  const lastPage = pages[pages.length - 1];
  assert.equal(lastPage.length, WEEK_PAGE_SIZE);
  assert.equal(lastPage[lastPage.length - 1].dateISO, '2026-07-01');
});
