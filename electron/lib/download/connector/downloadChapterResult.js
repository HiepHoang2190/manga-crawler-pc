/**
 * Bổ sung chuỗi `error` khi tải chương thất bại một phần (có successCount/totalPages)
 * nhưng connector chưa gán message — để renderer / lịch sử hiển thị rõ.
 */
function enrichDownloadChapterResult(res) {
  if (!res || typeof res !== 'object') return res;
  if (res.aborted) return res;
  if (res.ok === true || res.skipped) return res;
  if (res.error && String(res.error).trim()) return res;

  const sc = res.successCount;
  const tp = res.totalPages;
  if (tp != null && sc != null) {
    const indices = Array.isArray(res.failedPageIndices) ? res.failedPageIndices : [];
    const sorted = [...indices].sort((a, b) => a - b);
    let error = `Tải không đầy đủ (${sc}/${tp} trang).`;
    if (sorted.length) {
      const max = 40;
      const shown = sorted.slice(0, max);
      const more = sorted.length > max ? ` (+${sorted.length - max} trang)` : '';
      error += ` Trang lỗi: ${shown.join(', ')}${more}.`;
    }
    return { ...res, error };
  }
  return { ...res, error: 'Tải không đầy đủ (thiếu file hoặc lỗi trang).' };
}

module.exports = { enrichDownloadChapterResult };
