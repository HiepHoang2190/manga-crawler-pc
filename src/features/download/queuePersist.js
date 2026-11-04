import {
  QUEUE_SNAPSHOT_KEY,
  loadQueueSnapshotFromStorage,
  hasIncompleteWork,
  normalizeQueueForRestore,
} from './queueSnapshot';

export {
  QUEUE_SNAPSHOT_KEY,
  loadQueueSnapshotFromStorage,
  hasIncompleteWork,
  normalizeQueueForRestore,
};

/** Only persist after hydrate so an empty initial queue cannot overwrite a snapshot. */
export function shouldPersistQueue(queueHydrated) {
  return queueHydrated === true;
}

export function persistQueueSnapshot(queue) {
  try {
    localStorage.setItem(QUEUE_SNAPSHOT_KEY, JSON.stringify(queue));
  } catch {
    /* quota */
  }
}

/** Persist only after hydrate so an empty initial queue cannot overwrite a snapshot. */
export function persistQueueIfHydrated(queueHydrated, queue) {
  if (!shouldPersistQueue(queueHydrated)) return false;
  persistQueueSnapshot(queue);
  return true;
}

export function clearQueueSnapshot() {
  try {
    localStorage.removeItem(QUEUE_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
