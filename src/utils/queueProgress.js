/** Khớp tiến độ trang (IPC) với đúng hàng trong queue. */
export function downloadProgressMatchesGroup(g, dp) {
  if (!dp || !dp.chapterUrl || dp.total == null || dp.total <= 0) return false;
  return (
    dp.mangaTitle === g.mangaTitle && g.chapters.some((c) => c.chapterUrl === dp.chapterUrl)
  );
}

export function groupProgress(g) {
  const total = g.chapters.length;
  // chapters lỗi: status 'done' nhưng có downloadError (tải không đầy đủ)
  const err = g.chapters.filter((c) => c.status === 'done' && c.downloadError).length;
  const done = g.chapters.filter((c) => c.status === 'done').length;
  // chapters thành công thực sự (done nhưng không có lỗi)
  const success = g.chapters.filter((c) => c.status === 'done' && !c.downloadError).length;
  const hasDl = g.chapters.some((c) => c.status === 'downloading');
  const allWaiting = g.chapters.length > 0 && g.chapters.every((c) => c.status === 'waiting');
  // allDone: tất cả done VÀ không có lỗi
  const allDone = g.chapters.length > 0 && g.chapters.every((c) => c.status === 'done') && err === 0;
  const downloading = g.chapters.find((c) => c.status === 'downloading');
  return { total, done, success, err, hasDl, allWaiting, allDone, downloading };
}

/** % thanh tiến trình từng truyện: chương đã xong + phần trang chương hiện tại. */
export function groupProgressPercent(g, p, downloadProgress) {
  const ct = g.chapters.length;
  if (!ct) return 0;
  const dp = downloadProgress;
  if (downloadProgressMatchesGroup(g, dp)) {
    const frac = Math.min(1, Math.max(0, Number(dp.current) / Number(dp.total)));
    return Math.min(100, Math.round(((p.done + frac) / ct) * 100));
  }
  return Math.min(100, Math.round((p.done / ct) * 100));
}

/**
 * Tiến độ tổng toàn hàng đợi: mỗi chương = 1 (đã xong) hoặc phần trang nếu đang khớp IPC.
 */
export function overallQueueProgress(queue, downloadProgress) {
  let totalChapters = 0;
  let weighted = 0;
  let doneChapters = 0;
  for (const g of queue) {
    for (const c of g.chapters) {
      totalChapters += 1;
      if (c.status === 'done') {
        weighted += 1;
        doneChapters += 1;
      } else if (
        downloadProgress &&
        downloadProgress.mangaTitle === g.mangaTitle &&
        downloadProgress.chapterUrl === c.chapterUrl &&
        Number(downloadProgress.total) > 0
      ) {
        const frac = Math.min(
          1,
          Math.max(0, Number(downloadProgress.current) / Number(downloadProgress.total))
        );
        weighted += frac;
      }
    }
  }
  if (totalChapters === 0) {
    return { percent: 0, doneChapters: 0, totalChapters: 0 };
  }
  const percent = Math.min(100, Math.round((weighted / totalChapters) * 100));
  return { percent, doneChapters, totalChapters };
}
