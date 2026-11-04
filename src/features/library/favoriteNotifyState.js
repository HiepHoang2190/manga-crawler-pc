/** Tránh thông báo lặp: lưu remoteHighestChapterNumber đã "biết" sau lần thông báo / đồng bộ thủ công. */

const KEY = 'mangaFavoriteLastNotifiedRemoteById';

export function loadLastNotifiedRemoteMap() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLastNotifiedRemoteMap(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * Cập nhật map sau khi đồng bộ yêu thích; trả về tiêu đề truyện cần hiện thông báo trong app (chỉ luồng nền).
 * Khớp mobile FavoriteWatchService._computeNotifyTitlesAfterSync (dùng remoteHighestChapterNumber).
 */
export function computeFavoriteNotifyAfterSync(sync, favorites, opts) {
  const { manual = false, fromBackground = false } = opts;
  const titleById = new Map(favorites.map((f) => [f.id, String(f.title || '').trim() || String(f.id)]));

  const last = loadLastNotifiedRemoteMap();

  if (manual) {
    const next = { ...last };
    for (const [id, row] of Object.entries(sync)) {
      if (row && !row.error && typeof row.remoteHighestChapterNumber === 'number') {
        next[id] = row.remoteHighestChapterNumber;
      }
    }
    saveLastNotifiedRemoteMap(next);
    return { notifyTitles: [] };
  }

  if (!fromBackground) {
    return { notifyTitles: [] };
  }

  const notifyTitles = [];
  for (const [id, row] of Object.entries(sync)) {
    if (!row || row.error) continue;
    const rh = row.remoteHighestChapterNumber;
    if (typeof rh !== 'number') continue;
    const prev = last[id] ?? -1;
    const stalePrev = typeof prev === 'number' && rh >= 0 && prev > rh;
    if (row.hasNew && (rh > prev || stalePrev)) {
      notifyTitles.push(titleById.get(id) || String(id));
    }
  }

  const next = { ...last };
  for (const [id, row] of Object.entries(sync)) {
    if (!row || row.error) continue;
    const rh = row.remoteHighestChapterNumber;
    if (typeof rh !== 'number') continue;
    if (!row.hasNew) {
      next[id] = rh;
    } else {
      const prev = last[id] ?? -1;
      const stalePrev = typeof prev === 'number' && rh >= 0 && prev > rh;
      if (rh > prev || stalePrev) {
        next[id] = rh;
      }
    }
  }
  saveLastNotifiedRemoteMap(next);

  return { notifyTitles };
}
