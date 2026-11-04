import { isHomePrimaryTabBusy } from './homePrimaryTabBusy.js';

test('queue download does not mark the queue sub-tab busy', () => {
  expect(
    isHomePrimaryTabBusy('queue', {
      queueProcessing: true,
      tabBusyMap: { queue: true },
    }),
  ).toBe(false);
});

test('favorites sync still marks the favorites sub-tab busy', () => {
  expect(isHomePrimaryTabBusy('favorites', { fetchAllFavoritesBusy: true })).toBe(true);
  expect(isHomePrimaryTabBusy('favorites', { fetchAllFavoritesBusy: false })).toBe(false);
});

test('other sub-tabs follow their own busy map', () => {
  expect(isHomePrimaryTabBusy('history', { tabBusyMap: { history: true } })).toBe(true);
  expect(isHomePrimaryTabBusy('history', { tabBusyMap: {} })).toBe(false);
});
