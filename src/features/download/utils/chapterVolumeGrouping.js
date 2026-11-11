/**
 * Utility to group chapters by volume for MangaDex and other volume-aware sources.
 */

/**
 * Checks whether any chapter in the list has valid volume information.
 * @param {Array<object>} [chapters]
 * @returns {boolean}
 */
export function hasVolumeData(chapters) {
  if (!Array.isArray(chapters) || chapters.length === 0) return false;
  return chapters.some((ch) => {
    if (!ch || ch.volume == null) return false;
    const s = String(ch.volume).trim();
    return s !== '' && s.toLowerCase() !== 'none';
  });
}

/**
 * Group chapters by volume.
 *
 * @param {Array<object>} chapters
 * @param {object} [options]
 * @param {'asc'|'desc'} [options.sortDirection='asc']
 * @returns {Array<{ key: string, volume: string|null, label: string, chapters: Array<object>, totalCount: number }>}
 */
export function groupChaptersByVolume(chapters, options = {}) {
  const { sortDirection = 'asc' } = options;
  if (!Array.isArray(chapters) || chapters.length === 0) return [];

  const volMap = new Map();
  const noVolList = [];

  for (const ch of chapters) {
    if (!ch) continue;
    const rawVol = ch.volume != null ? String(ch.volume).trim() : '';
    if (rawVol && rawVol.toLowerCase() !== 'none') {
      if (!volMap.has(rawVol)) {
        volMap.set(rawVol, []);
      }
      volMap.get(rawVol).push(ch);
    } else {
      noVolList.push(ch);
    }
  }

  // Sort volume keys numerically
  const volKeys = Array.from(volMap.keys());
  volKeys.sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) {
      return sortDirection === 'desc' ? nb - na : na - nb;
    }
    return sortDirection === 'desc'
      ? b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
      : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const groups = [];

  for (const vol of volKeys) {
    const list = volMap.get(vol);
    groups.push({
      key: `vol_${vol}`,
      volume: vol,
      label: `Vol. ${vol}`,
      chapters: list,
      totalCount: list.length,
    });
  }

  if (noVolList.length > 0) {
    groups.push({
      key: 'no_volume',
      volume: null,
      label: 'Chương lẻ / Chưa phân tập',
      chapters: noVolList,
      totalCount: noVolList.length,
    });
  }

  return groups;
}
