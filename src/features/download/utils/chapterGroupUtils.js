/**
 * Utility bóc tách nhóm dịch (scanlation group), lọc và khử trùng lặp chapter
 */
import { parseChapterTitleMetadata } from './chapterTitleParser.js';
import { extractChapterNumberString } from '../../../utils/chapterFolderFormat.js';

export const NO_GROUP_ID = '__no_group__';

/**
 * Trích xuất tên nhóm dịch từ chapter
 * @param {object} chapter
 * @returns {string|null}
 */
export function getChapterGroupName(chapter) {
  if (!chapter) return null;
  if (typeof chapter.groupName === 'string' && chapter.groupName.trim()) {
    return chapter.groupName.trim();
  }
  const meta = parseChapterTitleMetadata(chapter.title, chapter.volume);
  return meta.groupName ? meta.groupName.trim() : null;
}

/**
 * Lấy khóa định danh số chương để phát hiện trùng lặp
 * @param {object} chapter
 * @returns {string}
 */
export function getChapterIdentityKey(chapter) {
  if (!chapter) return '';
  const volStr = chapter.volume != null && String(chapter.volume).trim() !== ''
    ? String(chapter.volume).trim().toLowerCase()
    : null;
  const volPrefix = volStr && volStr !== 'none' ? `vol:${volStr}_` : '';

  const numStr = extractChapterNumberString(chapter.title);
  if (numStr != null && numStr !== '') {
    const num = parseFloat(numStr);
    return !Number.isNaN(num)
      ? `${volPrefix}num:${num}`
      : `${volPrefix}str:${numStr.toLowerCase().trim()}`;
  }
  const meta = parseChapterTitleMetadata(chapter.title, chapter.volume);
  const clean = (meta.cleanTitle || meta.chapterLabel || chapter.title || '').toLowerCase().trim();
  return `${volPrefix}clean:${clean}`;
}

/**
 * Trích xuất danh sách tất cả các nhóm dịch trong danh sách chapter
 * @param {Array<object>} chapters
 * @param {object} [options]
 * @param {string} [options.allLabel='Tất cả nhóm dịch']
 * @param {string} [options.noGroupLabel='Không rõ nhóm dịch']
 * @returns {Array<{ id: string, label: string, count: number }>}
 */
export function extractScanlationGroups(chapters, options = {}) {
  if (!Array.isArray(chapters) || chapters.length === 0) return [];

  const allLabel = options.allLabel || 'Tất cả nhóm dịch';
  const noGroupLabel = options.noGroupLabel || 'Không rõ nhóm dịch';

  const groupCounts = new Map();
  let noGroupCount = 0;

  for (const ch of chapters) {
    const group = getChapterGroupName(ch);
    if (group) {
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    } else {
      noGroupCount += 1;
    }
  }

  // Danh sách các nhóm cụ thể, sắp xếp theo số chương giảm dần
  const sortedGroups = Array.from(groupCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([groupName, count]) => ({
      id: groupName,
      label: groupName,
      count,
    }));

  if (noGroupCount > 0) {
    sortedGroups.push({
      id: NO_GROUP_ID,
      label: noGroupLabel,
      count: noGroupCount,
    });
  }

  // Luôn có mục 'all' ở đầu
  return [
    {
      id: 'all',
      label: allLabel,
      count: chapters.length,
    },
    ...sortedGroups,
  ];
}

/**
 * Lọc danh sách chapter theo nhóm dịch được chọn
 * @param {Array<object>} chapters
 * @param {string|null} selectedGroupId
 * @returns {Array<object>}
 */
export function filterChaptersByGroup(chapters, selectedGroupId) {
  if (!Array.isArray(chapters)) return [];
  if (!selectedGroupId || selectedGroupId === 'all') {
    return chapters;
  }
  if (selectedGroupId === NO_GROUP_ID) {
    return chapters.filter((ch) => !getChapterGroupName(ch));
  }
  return chapters.filter((ch) => getChapterGroupName(ch) === selectedGroupId);
}

/**
 * Khử trùng lặp các chapter có cùng số chương
 * @param {Array<object>} chapters
 * @param {string|null} preferredGroupId
 * @returns {Array<object>}
 */
export function dedupeChaptersByNumber(chapters, preferredGroupId = null) {
  if (!Array.isArray(chapters) || chapters.length <= 1) {
    return Array.isArray(chapters) ? [...chapters] : [];
  }

  // Tính số lượng chương theo từng nhóm để biết nhóm nào là nhóm đa số (majority)
  const groupCounts = new Map();
  for (const ch of chapters) {
    const g = getChapterGroupName(ch);
    if (g) {
      groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
    }
  }

  // Gom các chapter theo key số chương
  const buckets = new Map();
  const keyOrder = [];

  for (const ch of chapters) {
    const key = getChapterIdentityKey(ch);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      keyOrder.push(key);
    }
    buckets.get(key).push(ch);
  }

  const result = [];

  for (const key of keyOrder) {
    const candidates = buckets.get(key);
    if (candidates.length === 1) {
      result.push(candidates[0]);
      continue;
    }

    // Nếu có nhiều bản dịch cho cùng 1 số chương:
    // 1. Ưu tiên preferredGroupId nếu ứng viên thuộc nhóm này
    if (preferredGroupId && preferredGroupId !== 'all') {
      const preferredCandidate = candidates.find((ch) => {
        const g = getChapterGroupName(ch);
        return preferredGroupId === NO_GROUP_ID ? !g : g === preferredGroupId;
      });
      if (preferredCandidate) {
        result.push(preferredCandidate);
        continue;
      }
    }

    // 2. Ưu tiên ứng viên thuộc nhóm dịch có số chương nhiều nhất (majority group)
    let bestCandidate = candidates[0];
    let maxGroupCount = -1;

    for (const cand of candidates) {
      const g = getChapterGroupName(cand);
      const count = g ? groupCounts.get(g) || 0 : 0;
      if (count > maxGroupCount) {
        maxGroupCount = count;
        bestCandidate = cand;
      }
    }

    result.push(bestCandidate);
  }

  return result;
}
