/** localStorage key — đồng bộ với App.jsx */
export const QUEUE_SNAPSHOT_KEY = 'mangaQueueSnapshot';

function resetDownloadingChapter(c) {
  if (c.status !== 'downloading') return c;
  const { downloadError, ...rest } = c;
  return { ...rest, status: 'waiting' };
}

/**
 * Dừng/tạm dừng hàng đợi: chương `downloading` → `waiting`, đánh dấu truyện paused.
 * @param {Array} queue
 * @param {{ pauseGroupIds?: string[] }} [options]
 */
export function applyQueueStopState(queue, { pauseGroupIds } = {}) {
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
      chapters: chapters.map(resetDownloadingChapter),
    };
  });
}

/**
 * Sau khi đóng app giữa chừng: chương đang `downloading` coi như chưa xong → `waiting`.
 */
export function normalizeQueueForRestore(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.map((g) => {
    let workflowState = g.workflowState;
    if (workflowState === 'running') workflowState = 'idle';
    return {
      ...g,
      id: String(g.id || ''),
      mangaTitle: String(g.mangaTitle || ''),
      mangaUrl: String(g.mangaUrl || ''),
      site: String(g.site || ''),
      coverUrl: g.coverUrl ?? '',
      paused: Boolean(g.paused),
      downloadOrder: g.downloadOrder === 'desc' ? 'desc' : 'asc',
      workflowId: g.workflowId === 'none' ? 'none' : (g.workflowId ? String(g.workflowId).trim() : null),
      workflowState: workflowState || 'idle',
      workflowProgress: g.workflowProgress || null,
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
    };
  });
}

/** Còn chương chưa done → có thể hiện popup khôi phục. */
export function hasIncompleteWork(queue) {
  if (!Array.isArray(queue) || !queue.length) return false;
  return queue.some(
    (g) => Array.isArray(g.chapters) && g.chapters.some((c) => c.status !== 'done')
  );
}

export function loadQueueSnapshotFromStorage() {
  try {
    const raw = localStorage.getItem(QUEUE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return normalizeQueueForRestore(parsed);
  } catch {
    return null;
  }
}

export function snapshotStats(queue) {
  let mangaWithPending = 0;
  let pendingChapters = 0;
  for (const g of queue) {
    if (!Array.isArray(g.chapters)) continue;
    const pend = g.chapters.filter((c) => c.status !== 'done');
    if (pend.length) {
      mangaWithPending += 1;
      pendingChapters += pend.length;
    }
  }
  return { mangaWithPending, pendingChapters };
}
