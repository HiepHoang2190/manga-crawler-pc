/**
 * remoteHighestChapterNumber đã "đọc" trên chuông (không còn highlight); vẫn hiện trong list nếu hasNew.
 * Key giữ tên cũ để tương thích localStorage.
 */
const KEY = 'mangaFavoriteBellDismissedRemoteById';

export function loadBellReadRemoteById() {
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

export function saveBellReadRemoteById(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/** @deprecated dùng loadBellReadRemoteById */
export const loadBellDismissedRemoteById = loadBellReadRemoteById;
/** @deprecated dùng saveBellReadRemoteById */
export const saveBellDismissedRemoteById = saveBellReadRemoteById;

const KEY_PANEL_REMOVED = 'mangaFavoriteBellPanelRemovedRemoteById';

function loadNumMap(key) {
  try {
    const raw = localStorage.getItem(key);
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

function saveNumMap(key, map) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/** Ẩn mục khỏi panel chuông tại remoteHighestChapterNumber; hiện lại khi có chương mới. */
export function loadBellPanelRemovedRemoteById() {
  return loadNumMap(KEY_PANEL_REMOVED);
}

export function saveBellPanelRemovedRemoteById(map) {
  saveNumMap(KEY_PANEL_REMOVED, map);
}
