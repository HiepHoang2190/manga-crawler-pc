import { jest } from '@jest/globals';
import {
  filterFavorites,
  computeFavoritesStats,
  runFavoriteCheckQueue,
} from '../services/favoriteChecker';

describe('favoriteChecker logic service', () => {
  const mockFavorites = [
    { id: 'cuutruyen::url1', siteId: 'cuutruyen', title: 'One Punch Man', chapterCount: 204 },
    { id: 'blogtruyen::url2', siteId: 'blogtruyen', title: 'Frieren', chapterCount: 129 },
    { id: 'nettruyen::url3', siteId: 'nettruyen', title: 'Doraemon', chapterCount: 6 },
    { id: 'cuutruyen::url4', siteId: 'cuutruyen', title: 'Jujutsu Kaisen', chapterCount: 271 },
  ];

  const mockSyncById = {
    'cuutruyen::url1': { hasNew: true, pendingNewCount: 2, remoteCount: 206 },
    'blogtruyen::url2': { hasNew: true, pendingNewCount: 1, remoteCount: 130 },
    'nettruyen::url3': { hasNew: false, pendingNewCount: 0, remoteCount: 6 },
    'cuutruyen::url4': { hasNew: false, pendingNewCount: 0, remoteCount: 271 },
  };

  describe('filterFavorites', () => {
    it('returns all when no filters applied', () => {
      const res = filterFavorites({ favorites: mockFavorites, favoriteSyncById: mockSyncById });
      expect(res.length).toBe(4);
    });

    it('filters by statusFilter hasNew', () => {
      const res = filterFavorites({
        favorites: mockFavorites,
        favoriteSyncById: mockSyncById,
        statusFilter: 'hasNew',
      });
      expect(res.map((f) => f.title)).toEqual(['One Punch Man', 'Frieren']);
    });

    it('filters by siteFilter', () => {
      const res = filterFavorites({
        favorites: mockFavorites,
        favoriteSyncById: mockSyncById,
        siteFilter: 'cuutruyen',
      });
      expect(res.map((f) => f.title)).toEqual(['One Punch Man', 'Jujutsu Kaisen']);
    });

    it('filters by search query', () => {
      const res = filterFavorites({
        favorites: mockFavorites,
        favoriteSyncById: mockSyncById,
        query: 'punch',
      });
      expect(res.map((f) => f.title)).toEqual(['One Punch Man']);
    });
  });

  describe('computeFavoritesStats', () => {
    it('computes total, hasNewCount, and siteBreakdown', () => {
      const stats = computeFavoritesStats({
        favorites: mockFavorites,
        favoriteSyncById: mockSyncById,
      });

      expect(stats.total).toBe(4);
      expect(stats.hasNewCount).toBe(2);
      expect(stats.siteBreakdown).toEqual([
        { siteId: 'blogtruyen', count: 1, hasNewCount: 1 },
        { siteId: 'cuutruyen', count: 2, hasNewCount: 1 },
        { siteId: 'nettruyen', count: 1, hasNewCount: 0 },
      ]);
    });
  });

  describe('runFavoriteCheckQueue', () => {
    it('processes items concurrently and calls callbacks', async () => {
      const processed = [];
      const progressSteps = [];
      const checkFn = async (item) => {
        processed.push(item.id);
        return { ok: true, remoteCount: item.chapterCount + 1 };
      };

      const results = await runFavoriteCheckQueue({
        list: mockFavorites.slice(0, 2),
        checkFn,
        concurrency: 2,
        onProgress: (p) => progressSteps.push(p),
      });

      expect(results.length).toBe(2);
      expect(processed).toEqual(['cuutruyen::url1', 'blogtruyen::url2']);
      expect(progressSteps.length).toBeGreaterThan(0);
    });

    it('aborts queue immediately if abortSignal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const checkFn = jest.fn();
      const results = await runFavoriteCheckQueue({
        list: mockFavorites,
        checkFn,
        abortSignal: controller.signal,
      });

      expect(results.length).toBe(0);
      expect(checkFn).not.toHaveBeenCalled();
    });

    it('resolves immediately on mid-flight abort, stops further items, and silences progress after abort', async () => {
      const controller = new AbortController();
      const started = [];
      const progressAfterAbort = [];
      let abortedSeen = false;

      const checkFn = jest.fn(
        (item) =>
          new Promise((resolve) => {
            started.push(item.id);
            if (item.id === mockFavorites[0].id) {
              // Trigger abort while first item is still pending
              queueMicrotask(() => {
                abortedSeen = true;
                controller.abort();
              });
            }
            // Never resolves quickly on its own (simulate slow network)
            setTimeout(() => resolve({ ok: true }), 5000).unref?.();
          }),
      );

      const results = await runFavoriteCheckQueue({
        list: mockFavorites,
        checkFn,
        concurrency: 1,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (abortedSeen) progressAfterAbort.push(p);
        },
      });

      expect(started).toEqual([mockFavorites[0].id]);
      expect(results).toEqual([]);
      expect(progressAfterAbort).toEqual([]);
    });

    it('forwards abortSignal to checkFn and reports monotonic completed count in onProgress', async () => {
      const controller = new AbortController();
      const receivedSignals = [];
      const progressEvents = [];

      const results = await runFavoriteCheckQueue({
        list: mockFavorites.slice(0, 2),
        abortSignal: controller.signal,
        concurrency: 1,
        checkFn: async (_item, signal) => {
          receivedSignals.push(signal);
          return { ok: true };
        },
        onProgress: (p) => progressEvents.push({ ...p }),
      });

      expect(results).toHaveLength(2);
      expect(receivedSignals).toEqual([controller.signal, controller.signal]);
      expect(progressEvents.map((p) => p.completed)).toEqual([0, 1, 1, 2]);
    });
  });
});
