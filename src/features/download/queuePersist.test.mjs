import {
  QUEUE_SNAPSHOT_KEY,
  loadQueueSnapshotFromStorage,
  shouldPersistQueue,
  persistQueueSnapshot,
  persistQueueIfHydrated,
  clearQueueSnapshot,
} from './queuePersist.js';

describe('shouldPersistQueue', () => {
  test('false when queueHydrated is false', () => {
    expect(shouldPersistQueue(false)).toBe(false);
  });

  test('true when queueHydrated is true', () => {
    expect(shouldPersistQueue(true)).toBe(true);
  });
});

describe('persistQueueSnapshot / clearQueueSnapshot', () => {
  const memory_store = new Map();
  const original_local_storage = global.localStorage;

  beforeEach(() => {
    memory_store.clear();
    global.localStorage = {
      getItem: (key) => (memory_store.has(key) ? memory_store.get(key) : null),
      setItem: (key, value) => {
        memory_store.set(key, String(value));
      },
      removeItem: (key) => {
        memory_store.delete(key);
      },
    };
  });

  afterEach(() => {
    global.localStorage = original_local_storage;
  });

  test('key stays mangaQueueSnapshot', () => {
    expect(QUEUE_SNAPSHOT_KEY).toBe('mangaQueueSnapshot');
  });

  test('queueHydrated false does not write localStorage', () => {
    const wrote = persistQueueIfHydrated(false, [{ id: 'g1', chapters: [] }]);
    expect(wrote).toBe(false);
    expect(localStorage.getItem(QUEUE_SNAPSHOT_KEY)).toBe(null);
  });

  test('queueHydrated true writes JSON snapshot', () => {
    const queue = [{ id: 'g1', chapters: [{ id: 'c1', status: 'waiting' }] }];
    const wrote = persistQueueIfHydrated(true, queue);
    expect(wrote).toBe(true);
    expect(JSON.parse(localStorage.getItem(QUEUE_SNAPSHOT_KEY))).toEqual(queue);
  });

  test('persistQueueSnapshot writes even when called directly', () => {
    persistQueueSnapshot([{ id: 'direct' }]);
    expect(JSON.parse(localStorage.getItem(QUEUE_SNAPSHOT_KEY))).toEqual([{ id: 'direct' }]);
  });

  test('dismiss restore removes the snapshot key', () => {
    persistQueueSnapshot([{ id: 'g1' }]);
    clearQueueSnapshot();
    expect(localStorage.getItem(QUEUE_SNAPSHOT_KEY)).toBe(null);
  });

  test('preserves workflowId and workflowState when restoring snapshot', () => {
    const queue = [
      {
        id: 'g1',
        mangaTitle: 'Manga A',
        workflowId: 'template_cbz_google_drive',
        workflowState: 'completed',
        workflowProgress: { percent: 100, message: 'Done' },
        chapters: [{ id: 'c1', status: 'done' }],
      },
    ];
    persistQueueIfHydrated(true, queue);
    const restored = loadQueueSnapshotFromStorage();
    expect(restored).not.toBeNull();
    expect(restored[0].workflowId).toBe('template_cbz_google_drive');
    expect(restored[0].workflowState).toBe('completed');
    expect(restored[0].workflowProgress).toEqual({ percent: 100, message: 'Done' });
  });

  test('resets running workflowState to idle on snapshot restore', () => {
    const queue = [
      {
        id: 'g1',
        workflowId: 'template_cbz',
        workflowState: 'running',
        chapters: [{ id: 'c1', status: 'waiting' }],
      },
    ];
    persistQueueIfHydrated(true, queue);
    const restored = loadQueueSnapshotFromStorage();
    expect(restored[0].workflowState).toBe('idle');
    expect(restored[0].workflowId).toBe('template_cbz');
  });
});
