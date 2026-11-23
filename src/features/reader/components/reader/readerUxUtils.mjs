export const AUTO_SCROLL_SPEEDS = [0, 45, 95, 170];

export function getNextAutoScrollLevel(level = 0) {
  const num = Number(level);
  if (!Number.isFinite(num) || num < 0 || num >= AUTO_SCROLL_SPEEDS.length - 1) {
    if (num >= AUTO_SCROLL_SPEEDS.length - 1) return 0;
    return 1;
  }
  return Math.floor(num) + 1;
}

export function computeReadingProgressPercent(visiblePageIndex = 0, totalPages = 0) {
  const total = Number(totalPages);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const page = Math.max(0, Math.min(total - 1, Math.floor(Number(visiblePageIndex) || 0)));
  return Math.min(100, Math.max(1, Math.round(((page + 1) / total) * 100)));
}
