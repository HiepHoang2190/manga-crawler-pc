import {
  createChapterEntry,
  countNewChaptersForManga,
  mergeChaptersIntoQueue,
  removeQueueGroup,
  clearCompletedQueueGroups,
  pauseQueueGroups,
  retryQueueChapter,
  retryFailedChapters,
  mergeHistoryRowsIntoQueue,
  countNewHistoryChapters,
  listQueuedChapterUrlsAhead,
  unpauseQueueGroupsWithWaiting,
  setGroupWorkflow,
  setAllGroupsWorkflow,
  updateGroupWorkflowState,
  applyQueueRowSelection,
} from './queueMutations.js';

const make_id = (() => {
  let n = 0;
  return () => `id-${++n}`;
})();

beforeEach(() => {
  let n = 0;
  make_id.reset = () => {
    n = 0;
  };
});

describe('mergeChaptersIntoQueue', () => {
  const sequential_id = () => {
    sequential_id.n = (sequential_id.n || 0) + 1;
    return `id-${sequential_id.n}`;
  };

  beforeEach(() => {
    sequential_id.n = 0;
  });

  test('creates a new group for unseen mangaUrl', () => {
    const next = mergeChaptersIntoQueue(
      [],
      { mangaTitle: 'M', mangaUrl: 'u', site: 's', coverUrl: 'c' },
      [{ url: 'ch1', title: '1' }],
      sequential_id
    );
    expect(next).toHaveLength(1);
    expect(next[0].mangaUrl).toBe('u');
    expect(next[0].chapters[0]).toEqual({
      id: 'id-2',
      chapterUrl: 'ch1',
      chapterTitle: '1',
      status: 'waiting',
    });
  });

  test('merges only new chapter urls into an existing group', () => {
    const prev = [
      {
        id: 'g',
        mangaUrl: 'u',
        chapters: [{ id: 'old', chapterUrl: 'ch1', chapterTitle: '1', status: 'waiting' }],
      },
    ];
    const next = mergeChaptersIntoQueue(
      prev,
      { mangaTitle: 'M', mangaUrl: 'u', site: 's' },
      [
        { url: 'ch1', title: '1' },
        { url: 'ch2', title: '2' },
      ],
      sequential_id
    );
    expect(next[0].chapters.map((c) => c.chapterUrl)).toEqual(['ch1', 'ch2']);
  });

  test('returns same array when every chapter is already queued', () => {
    const prev = [
      {
        id: 'g',
        mangaUrl: 'u',
        chapters: [{ id: 'old', chapterUrl: 'ch1', chapterTitle: '1', status: 'waiting' }],
      },
    ];
    const next = mergeChaptersIntoQueue(prev, { mangaUrl: 'u' }, [{ url: 'ch1', title: '1' }], sequential_id);
    expect(next).toBe(prev);
  });

  test('sets initialWorkflowId on newly created group', () => {
    const next = mergeChaptersIntoQueue(
      [],
      { mangaTitle: 'M', mangaUrl: 'u', site: 's', initialWorkflowId: 'wf_cbz' },
      [{ url: 'ch1', title: '1' }],
      sequential_id
    );
    expect(next[0].workflowId).toBe('wf_cbz');
    expect(next[0].workflowState).toBe('idle');
  });

  test('preserves existing workflowId when merging into existing group even if initialWorkflowId passed', () => {
    const prev = [
      {
        id: 'g',
        mangaUrl: 'u',
        workflowId: 'wf_orig',
        workflowState: 'idle',
        chapters: [{ id: 'old', chapterUrl: 'ch1', chapterTitle: '1', status: 'waiting' }],
      },
    ];
    const next = mergeChaptersIntoQueue(
      prev,
      { mangaUrl: 'u', initialWorkflowId: 'wf_new' },
      [{ url: 'ch2', title: '2' }],
      sequential_id
    );
    expect(next[0].workflowId).toBe('wf_orig');
    expect(next[0].chapters).toHaveLength(2);
  });
});

describe('countNewChaptersForManga', () => {
  test('counts full list when manga is new', () => {
    expect(countNewChaptersForManga([], 'u', [{ url: 'a' }, { url: 'b' }])).toBe(2);
  });

  test('skips urls already in the group', () => {
    const queue = [{ mangaUrl: 'u', chapters: [{ chapterUrl: 'a' }] }];
    expect(countNewChaptersForManga(queue, 'u', [{ url: 'a' }, { url: 'b' }])).toBe(1);
  });
});

describe('removeQueueGroup / pauseQueueGroups', () => {
  test('removeQueueGroup drops the matching id', () => {
    expect(removeQueueGroup([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }]);
  });

  test('pauseQueueGroups sets paused on listed ids', () => {
    const next = pauseQueueGroups(
      [
        { id: 'a', paused: false },
        { id: 'b', paused: false },
      ],
      ['b'],
      true
    );
    expect(next.map((g) => g.paused)).toEqual([false, true]);
  });
});

describe('createChapterEntry', () => {
  test('maps url/title onto waiting chapter', () => {
    expect(createChapterEntry({ url: 'u', title: 't' }, () => 'x')).toEqual({
      id: 'x',
      chapterUrl: 'u',
      chapterTitle: 't',
      status: 'waiting',
    });
  });
});

describe('history enqueue helpers', () => {
  test('countNewHistoryChapters ignores rows already queued', () => {
    const queue = [{ mangaUrl: 'm', chapters: [{ chapterUrl: 'c1' }] }];
    expect(
      countNewHistoryChapters(queue, [
        { mangaUrl: 'm', chapterUrl: 'c1' },
        { mangaUrl: 'm', chapterUrl: 'c2' },
      ])
    ).toEqual({ addedCount: 1, affectedManga: 1 });
  });

  test('mergeHistoryRowsIntoQueue appends missing chapters', () => {
    const prev = [{ id: 'g', mangaUrl: 'm', chapters: [{ id: 'old', chapterUrl: 'c1' }] }];
    const next = mergeHistoryRowsIntoQueue(
      prev,
      [{ mangaUrl: 'm', chapterUrl: 'c2', chapterTitle: '2' }],
      () => 'new'
    );
    expect(next[0].chapters.map((c) => c.chapterUrl)).toEqual(['c1', 'c2']);
  });
});

describe('listQueuedChapterUrlsAhead', () => {
  test('returns waiting chapter urls after the chapter being downloaded', () => {
    const chapters = [
      { id: 'a', status: 'done', chapterUrl: 'https://comix.to/a' },
      { id: 'b', status: 'waiting', chapterUrl: 'https://comix.to/b' },
      { id: 'c', status: 'waiting', chapterUrl: 'https://comix.to/c' },
      { id: 'd', status: 'error', chapterUrl: 'https://comix.to/d' },
      { id: 'e', status: 'waiting', chapterUrl: '  https://comix.to/e  ' },
    ];
    expect(listQueuedChapterUrlsAhead(chapters, 'b', 8)).toEqual([
      'https://comix.to/c',
      'https://comix.to/e',
    ]);
  });
});

describe('workflow mutations', () => {
  describe('setGroupWorkflow', () => {
    test('updates workflowId for specific group', () => {
      const q = [
        { id: 'g1', workflowId: null },
        { id: 'g2', workflowId: null },
      ];
      const next = setGroupWorkflow(q, 'g1', 'template_cbz_google_drive');
      expect(next[0].workflowId).toBe('template_cbz_google_drive');
      expect(next[1].workflowId).toBeNull();
    });

    test('stores "none" explicitly to disable workflow for group', () => {
      const q = [{ id: 'g1', workflowId: 'template_cbz_google_drive' }];
      const next = setGroupWorkflow(q, 'g1', 'none');
      expect(next[0].workflowId).toBe('none');
    });

    test('stores null when inheriting default', () => {
      const q = [{ id: 'g1', workflowId: 'template_cbz_google_drive' }];
      const next = setGroupWorkflow(q, 'g1', 'inherit');
      expect(next[0].workflowId).toBeNull();
    });
  });

  describe('setAllGroupsWorkflow', () => {
    test('updates workflowId for all groups', () => {
      const q = [
        { id: 'g1', workflowId: null },
        { id: 'g2', workflowId: 'custom_1' },
      ];
      const next = setAllGroupsWorkflow(q, 'template_cbz_google_drive');
      expect(next[0].workflowId).toBe('template_cbz_google_drive');
      expect(next[1].workflowId).toBe('template_cbz_google_drive');
    });

    test('sets "none" for all groups', () => {
      const q = [
        { id: 'g1', workflowId: 'wf1' },
        { id: 'g2', workflowId: 'wf2' },
      ];
      const next = setAllGroupsWorkflow(q, 'none');
      expect(next[0].workflowId).toBe('none');
      expect(next[1].workflowId).toBe('none');
    });

    test('updates waiting groups and preserves already completed groups', () => {
      const q = [
        {
          id: 'g1',
          workflowId: 'old_wf',
          chapters: [{ id: 'c1', status: 'waiting' }],
        },
        {
          id: 'g2',
          workflowId: 'completed_wf',
          chapters: [{ id: 'c2', status: 'done' }],
        },
      ];
      const next = setAllGroupsWorkflow(q, 'new_wf');
      expect(next[0].workflowId).toBe('new_wf');
      expect(next[1].workflowId).toBe('completed_wf');
    });
  });

  describe('updateGroupWorkflowState', () => {
    test('updates workflowState and progress for specific group', () => {
      const q = [
        { id: 'g1', workflowState: 'idle' },
        { id: 'g2', workflowState: 'idle' },
      ];
      const next = updateGroupWorkflowState(q, 'g1', {
        workflowState: 'running',
        workflowProgress: { percent: 50, message: 'Exporting CBZ' },
      });
      expect(next[0].workflowState).toBe('running');
      expect(next[0].workflowProgress).toEqual({ percent: 50, message: 'Exporting CBZ' });
      expect(next[1].workflowState).toBe('idle');
      expect(next[1].workflowProgress).toBeUndefined();
    });

    test('preserves existing progress when updating only state', () => {
      const q = [
        {
          id: 'g1',
          workflowState: 'running',
          workflowProgress: { percent: 100, message: 'Done' },
        },
      ];
      const next = updateGroupWorkflowState(q, 'g1', {
        workflowState: 'completed',
      });
      expect(next[0].workflowState).toBe('completed');
      expect(next[0].workflowProgress).toEqual({ percent: 100, message: 'Done' });
    });
  });

  describe('unpauseQueueGroupsWithWaiting', () => {
    test('unpauses all paused groups with waiting chapters when groupIds is null', () => {
      const queue = [
        {
          id: 'g1',
          paused: true,
          chapters: [{ id: 'c1', status: 'waiting' }],
        },
        {
          id: 'g2',
          paused: true,
          chapters: [{ id: 'c2', status: 'done' }],
        },
        {
          id: 'g3',
          paused: false,
          chapters: [{ id: 'c3', status: 'waiting' }],
        },
      ];

      const next = unpauseQueueGroupsWithWaiting(queue);
      expect(next[0].paused).toBe(false);
      expect(next[1].paused).toBe(true); // no waiting chapters, stays paused
      expect(next[2].paused).toBe(false);
    });

    test('unpauses only targeted groupIds with waiting chapters', () => {
      const queue = [
        {
          id: 'g1',
          paused: true,
          chapters: [{ id: 'c1', status: 'waiting' }],
        },
        {
          id: 'g2',
          paused: true,
          chapters: [{ id: 'c2', status: 'waiting' }],
        },
      ];

      const next = unpauseQueueGroupsWithWaiting(queue, ['g1']);
      expect(next[0].paused).toBe(false);
      expect(next[1].paused).toBe(true);
    });

    test('returns exact same queue reference when no group needs unpausing', () => {
      const queue = [
        {
          id: 'g1',
          paused: false,
          chapters: [{ id: 'c1', status: 'waiting' }],
        },
      ];

      const next = unpauseQueueGroupsWithWaiting(queue);
      expect(next).toBe(queue);
    });
  });

  describe('clearCompletedQueueGroups', () => {
    test('removes only cleanly completed groups and preserves groups with downloadError chapters', () => {
      const queue = [
        {
          id: 'done-clean',
          chapters: [{ id: 'c1', status: 'done' }],
        },
        {
          id: 'done-with-error',
          chapters: [{ id: 'c2', status: 'done', downloadError: 'timeout' }],
        },
        {
          id: 'still-waiting',
          chapters: [{ id: 'c3', status: 'waiting' }],
        },
      ];

      const next = clearCompletedQueueGroups(queue);
      expect(next.map((g) => g.id)).toEqual(['done-with-error', 'still-waiting']);
    });
  });

  describe('retryQueueChapter / retryFailedChapters metadata cleanup', () => {
    test('retryQueueChapter clears downloadError and extended failure metadata', () => {
      const queue = [
        {
          id: 'g1',
          chapters: [
            {
              id: 'c1',
              status: 'done',
              retryCount: 2,
              downloadError: 'net err',
              errorAt: '2026-11-24T10:00:00.000Z',
              successCount: 4,
              totalPages: 10,
              failedPageIndices: [5, 6],
            },
          ],
        },
      ];
      const next = retryQueueChapter(queue, 'g1', 'c1');
      expect(next[0].chapters[0]).toEqual({
        id: 'c1',
        status: 'waiting',
        retryCount: 0,
        downloadError: null,
      });
    });

    test('retryFailedChapters clears downloadError and extended failure metadata across group', () => {
      const queue = [
        {
          id: 'g1',
          chapters: [
            {
              id: 'c1',
              status: 'done',
              retryCount: 2,
              downloadError: 'net err',
              errorAt: '2026-11-24T10:00:00.000Z',
              successCount: 4,
              totalPages: 10,
              failedPageIndices: [5, 6],
            },
            { id: 'c_err', status: 'error', retryCount: 1, downloadError: 'Skipped' },
            { id: 'c2', status: 'done', retryCount: 0 },
          ],
        },
      ];
      const next = retryFailedChapters(queue, 'g1');
      expect(next[0].chapters[0]).toEqual({
        id: 'c1',
        status: 'waiting',
        retryCount: 0,
      });
      expect(next[0].chapters[1]).toEqual({
        id: 'c_err',
        status: 'waiting',
        retryCount: 0,
      });
      expect(next[0].chapters[2]).toEqual({
        id: 'c2',
        status: 'done',
        retryCount: 0,
      });
    });
  });

  describe('applyQueueRowSelection', () => {
    const visibleIds = ['g0', 'g1', 'g2', 'g3', 'g4'];

    test('normal click selects an unselected row and sets anchor', () => {
      const res = applyQueueRowSelection({
        prevSelectedIds: new Set(['g0']),
        visibleIds,
        clickedIndex: 2,
        anchorIndex: null,
        anchorTargetSelected: true,
        shiftKey: false,
      });
      expect([...res.nextSelectedIds].sort()).toEqual(['g0', 'g2']);
      expect(res.nextAnchorIndex).toBe(2);
      expect(res.nextAnchorTargetSelected).toBe(true);
    });

    test('normal click deselects an already-selected row and updates anchor target state', () => {
      const res = applyQueueRowSelection({
        prevSelectedIds: new Set(['g0', 'g2', 'g3']),
        visibleIds,
        clickedIndex: 2,
        anchorIndex: 0,
        anchorTargetSelected: true,
        shiftKey: false,
      });
      expect([...res.nextSelectedIds].sort()).toEqual(['g0', 'g3']);
      expect(res.nextAnchorIndex).toBe(2);
      expect(res.nextAnchorTargetSelected).toBe(false);
    });

    test('Shift+click forward selects inclusive range while preserving outside selections', () => {
      const res = applyQueueRowSelection({
        prevSelectedIds: new Set(['g0', 'g1']),
        visibleIds,
        clickedIndex: 3,
        anchorIndex: 1,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...res.nextSelectedIds].sort()).toEqual(['g0', 'g1', 'g2', 'g3']);
      expect(res.nextAnchorIndex).toBe(1);
      expect(res.nextAnchorTargetSelected).toBe(true);
    });

    test('Shift+click backward selects inclusive range', () => {
      const res = applyQueueRowSelection({
        prevSelectedIds: new Set(['g4']),
        visibleIds,
        clickedIndex: 1,
        anchorIndex: 4,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...res.nextSelectedIds].sort()).toEqual(['g1', 'g2', 'g3', 'g4']);
      expect(res.nextAnchorIndex).toBe(4);
      expect(res.nextAnchorTargetSelected).toBe(true);
    });

    test('Shift+click after deselecting anchor deselects range while preserving outside selections', () => {
      const res = applyQueueRowSelection({
        prevSelectedIds: new Set(['g0', 'g1', 'g2', 'g3', 'g4']),
        visibleIds,
        clickedIndex: 3,
        anchorIndex: 1,
        anchorTargetSelected: false,
        shiftKey: true,
      });
      expect([...res.nextSelectedIds].sort()).toEqual(['g0', 'g4']);
      expect(res.nextAnchorIndex).toBe(1);
      expect(res.nextAnchorTargetSelected).toBe(false);
    });

    test('Shift+click with null or out-of-bounds anchor falls back to single row toggle', () => {
      const resNull = applyQueueRowSelection({
        prevSelectedIds: new Set(),
        visibleIds,
        clickedIndex: 2,
        anchorIndex: null,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...resNull.nextSelectedIds]).toEqual(['g2']);
      expect(resNull.nextAnchorIndex).toBe(2);
      expect(resNull.nextAnchorTargetSelected).toBe(true);

      const resOob = applyQueueRowSelection({
        prevSelectedIds: new Set(['g2']),
        visibleIds,
        clickedIndex: 2,
        anchorIndex: 99,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...resOob.nextSelectedIds]).toEqual([]);
      expect(resOob.nextAnchorIndex).toBe(2);
      expect(resOob.nextAnchorTargetSelected).toBe(false);
    });

    test('out-of-bounds clickedIndex returns cloned set without throwing', () => {
      const prev = new Set(['g0']);
      const res = applyQueueRowSelection({
        prevSelectedIds: prev,
        visibleIds,
        clickedIndex: -1,
        anchorIndex: 0,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect(res.nextSelectedIds).not.toBe(prev);
      expect([...res.nextSelectedIds]).toEqual(['g0']);
      expect(res.nextAnchorIndex).toBe(0);
    });
  });
});

