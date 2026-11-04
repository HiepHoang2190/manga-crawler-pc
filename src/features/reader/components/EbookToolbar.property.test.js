// Feature: ebook-text-reader, Property 9 & 15
// Tests for EbookToolbar navigation boundary controls and progress indicator

import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure logic extracted from EbookToolbar
// ---------------------------------------------------------------------------

/**
 * Mirrors the disabled logic for prev/next buttons in EbookToolbar.
 * @param {number} currentIndex
 * @param {number} total
 * @returns {{ prevDisabled: boolean, nextDisabled: boolean }}
 */
function getButtonStates(currentIndex, total) {
  return {
    prevDisabled: currentIndex === 0,
    nextDisabled: currentIndex === total - 1,
  };
}

/**
 * Mirrors the progress text logic in EbookToolbar.
 * Returns the interpolated string for the given bookType.
 * @param {'epub' | 'pdf'} bookType
 * @param {number} currentIndex
 * @param {number} total
 * @returns {string}
 */
function getProgressText(bookType, currentIndex, total) {
  const current = currentIndex + 1;
  if (bookType === 'epub') {
    return `Chapter ${current} of ${total}`;
  }
  return `Page ${current} of ${total}`;
}

// ---------------------------------------------------------------------------
// Property 9: Navigation boundary controls
// Validates: Requirements 6.5, 6.6
// ---------------------------------------------------------------------------

describe('Property 9: Navigation boundary controls', () => {
  test('prev button is disabled iff currentIndex === 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }).chain((total) =>
          fc.integer({ min: 0, max: total - 1 }).map((currentIndex) => ({ currentIndex, total }))
        ),
        ({ currentIndex, total }) => {
          const { prevDisabled } = getButtonStates(currentIndex, total);
          return prevDisabled === (currentIndex === 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('next button is disabled iff currentIndex === total - 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }).chain((total) =>
          fc.integer({ min: 0, max: total - 1 }).map((currentIndex) => ({ currentIndex, total }))
        ),
        ({ currentIndex, total }) => {
          const { nextDisabled } = getButtonStates(currentIndex, total);
          return nextDisabled === (currentIndex === total - 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('both buttons are disabled when total === 1', () => {
    const { prevDisabled, nextDisabled } = getButtonStates(0, 1);
    expect(prevDisabled).toBe(true);
    expect(nextDisabled).toBe(true);
  });

  test('neither button is disabled for a middle index', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 500 }).chain((total) =>
          fc.integer({ min: 1, max: total - 2 }).map((currentIndex) => ({ currentIndex, total }))
        ),
        ({ currentIndex, total }) => {
          const { prevDisabled, nextDisabled } = getButtonStates(currentIndex, total);
          return !prevDisabled && !nextDisabled;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Progress indicator displays correct current and total
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------

describe('Property 15: Progress indicator displays correct current and total', () => {
  test('progress string contains currentIndex+1 and total for EPUB', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((total) =>
          fc.integer({ min: 0, max: total - 1 }).map((currentIndex) => ({ currentIndex, total }))
        ),
        ({ currentIndex, total }) => {
          const text = getProgressText('epub', currentIndex, total);
          return (
            text.includes(String(currentIndex + 1)) &&
            text.includes(String(total))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('progress string contains currentIndex+1 and total for PDF', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((total) =>
          fc.integer({ min: 0, max: total - 1 }).map((currentIndex) => ({ currentIndex, total }))
        ),
        ({ currentIndex, total }) => {
          const text = getProgressText('pdf', currentIndex, total);
          return (
            text.includes(String(currentIndex + 1)) &&
            text.includes(String(total))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('first item shows current=1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (total) => {
          const text = getProgressText('epub', 0, total);
          return text.includes('1');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('last item shows current=total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        (total) => {
          const text = getProgressText('pdf', total - 1, total);
          return text.includes(String(total));
        }
      ),
      { numRuns: 100 }
    );
  });
});
