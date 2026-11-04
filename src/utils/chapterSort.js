/**
 * Sort tiêu đề chương trong UI.
 *
 * Tiêu đề kiểu "Chương 610" / "Chapter 5" — ưu tiên so sánh *số chương* (parse số),
 * vì Intl.Collator đôi khi không phân tách đúng (hoặc coi bằng nhau) → sort trông "không chạy"
 * và vẫn giữ thứ tự API (mũi tên asc nhưng list vẫn 610→0).
 */

function getCollator() {
  try {
    const loc =
      typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'vi';
    return new Intl.Collator(loc, { numeric: true, sensitivity: 'base' });
  } catch {
    return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  }
}

let collatorCache;

function collator() {
  if (!collatorCache) collatorCache = getCollator();
  return collatorCache;
}

/**
 * Lấy số chương từ tiêu đề (ưu tiên sau Chương/Chapter/Chap…).
 * Khớp layout phổ biến: "Chương 610", "Chapter 1", "Ch. 5".
 */
export function extractChapterNumberForSort(title) {
  const s = String(title ?? '').trim();
  if (!s) return null;
  const afterKw =
    /(?:^|[\s\-–—[(])(?:chương|chapter|chapters|chap(?:ter)?|ch\.|c\.)\s*[-#:]?\s*(\d+(?:\.\d+)?)/i;
  const m1 = s.match(afterKw);
  if (m1) {
    const n = parseFloat(m1[1]);
    return Number.isFinite(n) ? n : null;
  }
  const hash = /#\s*(\d+(?:\.\d+)?)/;
  const m2 = s.match(hash);
  if (m2) {
    const n = parseFloat(m2[1]);
    return Number.isFinite(n) ? n : null;
  }
  const tail = /(?:^|[\s/\-–—])(\d+(?:\.\d+)?)\s*$/;
  const m3 = s.match(tail);
  if (m3) {
    const n = parseFloat(m3[1]);
    return Number.isFinite(n) ? n : null;
  }
  const first = s.match(/(\d+(?:\.\d+)?)/);
  if (first) {
    const n = parseFloat(first[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Bỏ trùng URL (cùng URL hai lần trong fetch) — giữ bản đầu.
 */
export function dedupeChaptersByUrl(chapters) {
  if (!Array.isArray(chapters) || chapters.length < 2) return chapters;
  const seen = new Set();
  const out = [];
  for (const ch of chapters) {
    const u = String(ch?.url ?? '').trim();
    if (u) {
      if (seen.has(u)) continue;
      seen.add(u);
    }
    out.push(ch);
  }
  return out;
}

/**
 * @param {number} sourceIndexA — vị trí trong mảng chapters gốc (fetch)
 * @param {number} sourceIndexB
 */
export function compareChaptersForTitleSort(a, b, sourceIndexA, sourceIndexB) {
  const na = extractChapterNumberForSort(a?.title);
  const nb = extractChapterNumberForSort(b?.title);
  if (na != null && nb != null && na !== nb) {
    return na < nb ? -1 : 1;
  }
  const c = collator().compare(String(a?.title ?? ''), String(b?.title ?? ''));
  if (c !== 0) return c;
  return sourceIndexA - sourceIndexB;
}
