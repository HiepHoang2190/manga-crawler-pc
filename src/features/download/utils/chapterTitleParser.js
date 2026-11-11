/**
 * Module phân tích & làm sạch tiêu đề chapter MangaDex
 * Hỗ trợ bóc tách:
 * - chapterLabel: Số chương (e.g. "Chapter 7", "Ch. 5", "Oneshot")
 * - cleanTitle: Tiêu đề chương sạch sau khi loại bỏ (Vol X) trùng lặp và tag
 * - groupName: Nhóm dịch nếu có trong {Tên nhóm}
 * - language: Mã ngôn ngữ nếu có trong [vi], [en]
 */

/**
 * @param {string} rawTitle - Tiêu đề gốc của chương
 * @param {string|number|null} [currentVolume] - Số volume hiện tại (để lọc bỏ Vol X trùng lặp)
 * @returns {{ chapterLabel: string, cleanTitle: string, groupName: string|null, language: string|null, rawTitle: string }}
 */
export function parseChapterTitleMetadata(rawTitle, currentVolume = null) {
  const raw = String(rawTitle ?? '').trim();
  if (!raw) {
    return {
      chapterLabel: '',
      cleanTitle: '',
      groupName: null,
      language: null,
      rawTitle: '',
    };
  }

  let working = raw;
  let groupName = null;
  let language = null;

  // 1. Trích xuất nhóm dịch ở cuối: {Tên Nhóm}
  const groupMatch = working.match(/\s*\{([^}]+)\}\s*$/);
  if (groupMatch) {
    groupName = groupMatch[1].trim();
    working = working.replace(/\s*\{([^}]+)\}\s*$/, '').trim();
  }

  // 2. Trích xuất mã ngôn ngữ: [vi], [en], [ja], etc.
  const langMatch = working.match(/\s*\[([a-zA-Z_-]{2,8})\]\s*$/);
  if (langMatch) {
    language = langMatch[1].trim();
    working = working.replace(/\s*\[([a-zA-Z_-]{2,8})\]\s*$/, '').trim();
  }

  // 3. Khử volume trùng lặp: (Vol X) hoặc (Vol. X)
  if (currentVolume !== null && currentVolume !== undefined) {
    const volStr = String(currentVolume).trim();
    if (volStr) {
      const safeVol = volStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const volRegex = new RegExp(`\\s*\\(Vol\\.?\\s*${safeVol}\\)\\s*`, 'gi');
      working = working.replace(volRegex, ' ').trim();
    }
  } else {
    // Nếu không truyền volume cụ thể, loại bỏ (Vol \d+) nếu có
    working = working.replace(/\s*\(Vol\.?\s*[0-9.]+\)\s*/gi, ' ').trim();
  }

  // 4. Bóc tách số chương / chapter label:
  // Hỗ trợ "Chapter 7", "Ch. 7", "Chương 10", "Tập 1", "Oneshot"...
  const prefixMatch = working.match(
    /^(Chapter\s+[\d.]+|Ch\.\s*[\d.]+|Chương\s+[\d.]+|Tập\s+[\d.]+|Hồi\s+[\d.]+|Oneshot)\b(?:\s*[-:–—]\s*)?/i
  );

  let chapterLabel = '';
  let cleanTitle = working;

  if (prefixMatch) {
    chapterLabel = prefixMatch[1].trim();
    const remaining = working.slice(prefixMatch[0].length).trim();
    cleanTitle = remaining || chapterLabel;
  }

  return {
    chapterLabel,
    cleanTitle,
    groupName,
    language,
    rawTitle: raw,
  };
}

