import {
  createChapterEntry,
  countNewChaptersForManga,
  mergeChaptersIntoQueue,
  removeQueueGroup,
  pauseQueueGroups,
  mergeHistoryRowsIntoQueue,
  countNewHistoryChapters,
  listQueuedChapterUrlsAhead,
  setGroupWorkflow,
  setAllGroupsWorkflow,
  updateGroupWorkflowState,
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
});

