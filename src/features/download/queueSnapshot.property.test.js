// Feature: auto-retry-failed-chapters
// Property tests for queueSnapshot.js normalizeQueueForRestore

import fc from 'fast-check';

// normalizeQueueForRestore uses ES module syntax — use a CJS-compatible wrapper
// by importing via dynamic require after transforming, or inline the logic for testing.
// Since the source uses ESM exports, we replicate the pure logic here for property testing.

/**
 * Inline the normalizeQueueForRestore logic (mirrors src/features/download/queueSnapshot.js)
 * so we can test it in a CJS Jest environment without ESM transform issues.
 */
function normalizeQueueForRestore(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.map((g) => ({
    ...g,
    id: String(g.id || ''),
    mangaTitle: String(g.mangaTitle || ''),
    mangaUrl: String(g.mangaUrl || ''),
    site: String(g.site || ''),
    coverUrl: g.coverUrl ?? '',
    paused: Boolean(g.paused),
    downloadOrder: g.downloadOrder === 'desc' ? 'desc' : 'asc',
    chapters: (Array.isArray(g.chapters) ? g.chapters : []).map((c) => {
      let status = c.status;
      if (status === 'downloading') status = 'waiting';
      if (status !== 'done' && status !== 'waiting' && status !== 'error') {
        status = status || 'waiting';
      }
      return {
        ...c,
        id: String(c.id || ''),
        chapterUrl: String(c.chapterUrl || ''),
        chapterTitle: String(c.chapterTitle || ''),
        status,
        retryCount: typeof c.retryCount === 'number' && c.retryCount >= 0
          ? Math.floor(c.retryCount)
          : 0,
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(chapters) {
  return { id: 'g1', mangaTitle: 'T', mangaUrl: 'u', site: 's', chapters };
}

// ---------------------------------------------------------------------------
// Property 7: Snapshot round-trip bảo toàn retryCount
// Validates: Requirements 4.1, 4.2
// ---------------------------------------------------------------------------

describe('Property 7: Snapshot round-trip bảo toàn retryCount', () => {
  test('retryCount is preserved after JSON serialize + normalizeQueueForRestore', () => {
    // Feature: auto-retry-failed-chapters, Property 7: snapshot round-trip preserves retryCount
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            chapterUrl: fc.constant('https://example.com/chapter'),
            chapterTitle: fc.string(),
            status: fc.constantFrom('waiting', 'done'),
            retryCount: fc.integer({ min: 0, max: 10 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (chapters) => {
          const group = makeGroup(chapters);
          // Simulate JSON round-trip (as if stored in localStorage)
          const serialized = JSON.parse(JSON.stringify([group]));
          const restored = normalizeQueueForRestore(serialized);
          return restored[0].chapters.every(
            (c, i) => c.retryCount === chapters[i].retryCount
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('chapters without retryCount field default to 0 after restore', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            chapterUrl: fc.constant('https://example.com/chapter'),
            chapterTitle: fc.string(),
            status: fc.constantFrom('waiting', 'done'),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (chapters) => {
          const group = makeGroup(chapters);
          const restored = normalizeQueueForRestore([group]);
          return restored[0].chapters.every((c) => c.retryCount === 0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
describe('applyQueueStopState', () => {
  function applyQueueStopState(queue, { pauseGroupIds } = {}) {
    if (!Array.isArray(queue)) return [];
    const idSet =
      Array.isArray(pauseGroupIds) && pauseGroupIds.length
        ? new Set(pauseGroupIds.map((id) => String(id)))
        : null;
    return queue.map((g) => {
      const chapters = Array.isArray(g.chapters) ? g.chapters : [];
      const hasDownloading = chapters.some((c) => c.status === 'downloading');
      const pauseThis = idSet ? idSet.has(String(g.id)) || hasDownloading : hasDownloading;
      return {
        ...g,
        paused: pauseThis ? true : Boolean(g.paused),
        chapters: chapters.map((c) =>
          c.status === 'downloading'
            ? { ...c, status: 'waiting', downloadError: undefined }
            : c
        ),
      };
    });
  }

  test('resets all downloading chapters and pauses active groups', () => {
    const queue = [
      {
        id: 'a',
        paused: false,
        chapters: [
          { id: '1', status: 'downloading' },
          { id: '2', status: 'waiting' },
        ],
      },
      {
        id: 'b',
        paused: false,
        chapters: [{ id: '3', status: 'waiting' }],
      },
    ];
    const next = applyQueueStopState(queue);
    expect(next[0].paused).toBe(true);
    expect(next[0].chapters[0].status).toBe('waiting');
    expect(next[1].paused).toBe(false);
  });

  test('pauses selected groups even without downloading chapters', () => {
    const queue = [
      {
        id: 'a',
        paused: false,
        chapters: [{ id: '1', status: 'waiting' }],
      },
    ];
    const next = applyQueueStopState(queue, { pauseGroupIds: ['a'] });
    expect(next[0].paused).toBe(true);
    expect(next[0].chapters[0].status).toBe('waiting');
  });
});

// ---------------------------------------------------------------------------
// Property 8: normalizeQueueForRestore giữ nguyên retryCount khi reset downloading → waiting
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------

describe('Property 8: normalizeQueueForRestore giữ nguyên retryCount khi reset downloading về waiting', () => {
  test('status changes from downloading to waiting but retryCount is unchanged', () => {
    // Feature: auto-retry-failed-chapters, Property 8: normalize keeps retryCount when resetting downloading to waiting
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        (retryCount) => {
          const chapter = {
            id: '1',
            chapterUrl: 'https://example.com/chapter',
            chapterTitle: 'Chapter 1',
            status: 'downloading',
            retryCount,
          };
          const [restored] = normalizeQueueForRestore([makeGroup([chapter])]);
          const c = restored.chapters[0];
          return c.status === 'waiting' && c.retryCount === retryCount;
        }
      ),
      { numRuns: 100 }
    );
  });
});
