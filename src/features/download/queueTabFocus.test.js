import { nextQueueTabFocusNonce } from './queueTabFocus.js';

test('nextQueueTabFocusNonce increments from 0 so a mounted HomeWorkspace can switch to Queue', () => {
  expect(nextQueueTabFocusNonce(0)).toBe(1);
  expect(nextQueueTabFocusNonce(1)).toBe(2);
});

test('nextQueueTabFocusNonce treats invalid current values as 0', () => {
  expect(nextQueueTabFocusNonce(undefined)).toBe(1);
  expect(nextQueueTabFocusNonce(null)).toBe(1);
  expect(nextQueueTabFocusNonce(NaN)).toBe(1);
});
