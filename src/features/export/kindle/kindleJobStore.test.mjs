import { jest } from '@jest/globals';
import {
  getKindleJob,
  startKindleSend,
  clearKindleJob,
  subscribeKindleJob,
  requestOpenKindleModal,
  consumeOpenKindleModalRequest,
  addKindleFileItems,
  startPendingKindleFiles,
  removeKindleQueueItem,
} from './kindleJobStore.mjs';

describe('kindleJobStore', () => {
  beforeEach(() => {
    clearKindleJob();
  });

  test('startKindleSend tracks running → done and notifies subscribers', async () => {
    const seen = [];
    const unsub = subscribeKindleJob((s) => seen.push(s.status));

    const api = {
      subscribeSendToKindleProgress: (cb) => {
        cb({ phase: 'upload', pct: 40 });
        return () => {};
      },
      sendToKindleSend: jest.fn().mockResolvedValue({
        ok: true,
        results: [{ name: 'a.epub', ok: true }],
        amazonLibraryUrl:
          'https://www.amazon.com/hz/mycd/digital-console/contentlist/pdocs/dateDsc/',
        deletedLocal: true,
      }),
    };

    const p = startKindleSend({
      api,
      row: { mangaTitle: 'T', absolutePath: '/m/T' },
      payload: { format: 'epub' },
    });
    // pump is async — allow microtasks
    await Promise.resolve();
    await p;

    // Wait until queue drains
    for (let i = 0; i < 20 && getKindleJob().status === 'running'; i += 1) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(getKindleJob().status).toBe('done');
    expect(getKindleJob().deletedLocal).toBe(true);
    expect(seen).toContain('running');
    expect(seen).toContain('done');
    unsub();
  });

  test('second start while running enqueues instead of busy', async () => {
    let resolveSend;
    const api = {
      sendToKindleSend: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveSend = resolve;
          })
      ),
      sendToKindleSendFile: jest.fn(),
    };

    const first = startKindleSend({
      api,
      row: { mangaTitle: 'T', absolutePath: '/m/T' },
      payload: {},
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 10));

    const second = await startKindleSend({
      api,
      row: { mangaTitle: 'T2', absolutePath: '/m/T2' },
      payload: {},
    });
    expect(second.busy).toBeUndefined();
    expect(second.ok).toBe(true);
    expect(second.queued).toBe(true);
    expect(getKindleJob().queue.length).toBeGreaterThanOrEqual(2);

    resolveSend({ ok: true, results: [] });
    await first;
    await new Promise((r) => setTimeout(r, 20));
    // Second should have been started (send called twice) or still pending until first resolve triggers pump
    resolveSend?.({ ok: true, results: [] });
    await new Promise((r) => setTimeout(r, 30));
    expect(api.sendToKindleSend.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('file queue pumps sequentially via startPendingKindleFiles', async () => {
    const order = [];
    const api = {
      sendToKindleSendFile: jest.fn(async ({ filePath }) => {
        order.push(filePath);
        return { ok: true, results: [{ name: filePath, ok: true, sizeBytes: 10 }] };
      }),
    };
    addKindleFileItems([
      { filePath: '/a.pdf', name: 'a.pdf', title: 'A', sizeBytes: 10 },
      { filePath: '/b.pdf', name: 'b.pdf', title: 'B', sizeBytes: 20 },
    ]);
    expect(getKindleJob().queue).toHaveLength(2);
    await startPendingKindleFiles(api);
    await new Promise((r) => setTimeout(r, 40));
    expect(order).toEqual(['/a.pdf', '/b.pdf']);
    expect(getKindleJob().queue.every((q) => q.status === 'done')).toBe(true);
  });

  test('removeKindleQueueItem cannot remove running job', async () => {
    let resolveSend;
    const api = {
      sendToKindleSendFile: () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    };
    addKindleFileItems([{ filePath: '/a.pdf', name: 'a.pdf', title: 'A', sizeBytes: 1 }]);
    const id = getKindleJob().queue[0].id;
    startPendingKindleFiles(api);
    await new Promise((r) => setTimeout(r, 10));
    expect(getKindleJob().queue[0].status).toBe('running');
    expect(removeKindleQueueItem(id)).toBe(false);
    resolveSend({ ok: true, results: [] });
    await new Promise((r) => setTimeout(r, 20));
  });

  test('request/consume open modal flag', () => {
    expect(consumeOpenKindleModalRequest()).toBe(false);
    requestOpenKindleModal();
    expect(getKindleJob().openModalRequested).toBe(true);
    expect(consumeOpenKindleModalRequest()).toBe(true);
    expect(getKindleJob().openModalRequested).toBe(false);
  });
});
