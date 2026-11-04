/** Đường dẫn tuyệt đối thư mục truyện trong Save To — ẩn khỏi tab Thư viện offline (không xóa file). */
export const HIDDEN_SAVE_PATHS_KEY = 'offlineLibraryHiddenSavePaths_v1';

export function loadHiddenSavePaths() {
  try {
    const raw = localStorage.getItem(HIDDEN_SAVE_PATHS_KEY);
    if (!raw) return new Set();
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return new Set();
    return new Set(a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()));
  } catch {
    return new Set();
  }
}

export function saveHiddenSavePaths(set) {
  try {
    localStorage.setItem(HIDDEN_SAVE_PATHS_KEY, JSON.stringify([...set]));
    try {
      window.dispatchEvent(new CustomEvent('crawler:hidden-save-paths-changed'));
    } catch {
      /* non-browser */
    }
  } catch {
    /* quota */
  }
}

export function clearHiddenSavePaths() {
  try {
    localStorage.removeItem(HIDDEN_SAVE_PATHS_KEY);
  } catch {
    /* */
  }
}

/** @param {string} absolutePath @param {Set<string>} hiddenSet */
export function isHiddenSavePath(absolutePath, hiddenSet) {
  const p = String(absolutePath || '').trim();
  if (!p) return false;
  return hiddenSet instanceof Set && hiddenSet.has(p);
}

/**
 * @param {Array<{ absolutePath?: string }>} items
 * @param {Set<string>} hiddenSet
 */
export function filterVisibleLocalMangaItems(items, hiddenSet) {
  if (!(hiddenSet instanceof Set) || hiddenSet.size === 0) {
    return Array.isArray(items) ? items : [];
  }
  return (Array.isArray(items) ? items : []).filter(
    (x) => !isHiddenSavePath(x?.absolutePath, hiddenSet),
  );
}

/**
 * Kiểm tra xem child có nằm trong parent hoặc trùng với parent không (chuẩn hóa dấu gạch chéo).
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
export function isInsideDirectory(child, parent) {
  if (!child || !parent) return false;
  const c = String(child).trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const p = String(parent).trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (c === p) return true;
  return c.startsWith(p + '/');
}

/**
 * Bỏ ẩn tất cả đường dẫn trong hiddenSavePaths nếu trùng hoặc nằm trong targetDir,
 * hoặc có trong danh sách explicitPaths.
 * @param {string} targetDir
 * @param {string[]} [explicitPaths]
 * @returns {number} Số lượng đường dẫn đã bỏ ẩn thành công
 */
export function unhidePathsForDirectory(targetDir, explicitPaths = []) {
  const hidden = loadHiddenSavePaths();
  let unhiddenCount = 0;
  const normTarget = String(targetDir || '').trim();

  if (normTarget) {
    for (const hp of [...hidden]) {
      if (isInsideDirectory(hp, normTarget)) {
        hidden.delete(hp);
        unhiddenCount++;
      }
    }
  }

  if (Array.isArray(explicitPaths)) {
    for (const p of explicitPaths) {
      const normP = String(p || '').trim();
      if (normP && hidden.has(normP)) {
        hidden.delete(normP);
        unhiddenCount++;
      }
    }
  }

  if (unhiddenCount > 0) {
    saveHiddenSavePaths(hidden);
  }
  return unhiddenCount;
}

