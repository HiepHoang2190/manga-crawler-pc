/**
 * Pure utilities for summarizing download queue progress for OS taskbar/dock and notifications.
 */

export function summarizeQueueCompletion(queue) {
  const groups = Array.isArray(queue) ? queue : [];
  let total = 0;
  let done = 0;
  let errors = 0;
  let skipped = 0;
  let downloading = 0;
  let waiting = 0;
  let mangaWithChapters = 0;

  for (const g of groups) {
    const chs = Array.isArray(g?.chapters) ? g.chapters : [];
    if (chs.length > 0) mangaWithChapters += 1;
    for (const ch of chs) {
      total += 1;
      if (ch?.status === 'done') done += 1;
      else if (ch?.status === 'error') errors += 1;
      else if (ch?.status === 'skipped') skipped += 1;
      else if (ch?.status === 'downloading') downloading += 1;
      else if (ch?.status === 'waiting') waiting += 1;
    }
  }

  return {
    mangaCount: mangaWithChapters,
    total,
    done,
    errors,
    skipped,
    downloading,
    waiting,
  };
}

export function shouldNotifyQueueCompletion(prevSnapshot, currentSummary) {
  const curr = currentSummary || {};
  const prev = prevSnapshot || { done: 0, errors: 0 };
  const deltaDone = Math.max(0, Number(curr.done || 0) - Number(prev.done || 0));
  const deltaErrors = Math.max(0, Number(curr.errors || 0) - Number(prev.errors || 0));

  const finishedAll = Number(curr.waiting || 0) === 0 && Number(curr.downloading || 0) === 0;
  const hasNewResults = deltaDone > 0 || deltaErrors > 0;

  return {
    notify: Boolean(finishedAll && hasNewResults),
    deltaDone,
    deltaErrors,
  };
}

export function computeQueueTaskbarProgress(queue, downloadProgress, queueProcessing) {
  const summary = summarizeQueueCompletion(queue);
  const completedChapters = summary.done + summary.skipped + summary.errors;

  if (!queueProcessing || summary.total === 0) {
    return {
      active: false,
      ratio: -1,
      mode: 'none',
      doneChapters: summary.done,
      completedChapters,
      totalChapters: summary.total,
      errorChapters: summary.errors,
      percent: 0,
    };
  }

  let pageFraction = 0;
  if (
    completedChapters < summary.total &&
    downloadProgress &&
    Number(downloadProgress.total) > 0
  ) {
    pageFraction = Math.min(1, Math.max(0, Number(downloadProgress.current || 0) / Number(downloadProgress.total)));
  }

  const rawRatio = Math.min(1, Math.max(0.02, (completedChapters + pageFraction) / summary.total));
  const ratio = Math.round(rawRatio * 100) / 100;
  return {
    active: true,
    ratio,
    mode: summary.errors > 0 ? 'error' : 'normal',
    doneChapters: summary.done,
    completedChapters,
    totalChapters: summary.total,
    errorChapters: summary.errors,
    percent: Math.round(ratio * 100),
  };
}
