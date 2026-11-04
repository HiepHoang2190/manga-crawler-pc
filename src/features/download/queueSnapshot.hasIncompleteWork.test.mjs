import { hasIncompleteWork } from './queueSnapshot.js';

describe('hasIncompleteWork', () => {
  test('false for null, non-array, empty', () => {
    expect(hasIncompleteWork(null)).toBe(false);
    expect(hasIncompleteWork([])).toBe(false);
  });

  test('true if any chapter status is not done', () => {
    expect(
      hasIncompleteWork([
        { chapters: [{ status: 'done' }, { status: 'waiting' }] },
      ])
    ).toBe(true);
  });

  test('false if every chapter is done', () => {
    expect(hasIncompleteWork([{ chapters: [{ status: 'done' }] }])).toBe(false);
  });
});
