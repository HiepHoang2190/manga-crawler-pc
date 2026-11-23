const DEFAULT_WINDOW_BOUNDS = {
  width: 1280,
  height: 800,
  minWidth: 1100,
  minHeight: 640,
};

function intersectionArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

/**
 * Validates and clamps saved window bounds against connected display workAreas.
 * Omits x/y if the window would appear off-screen (e.g. disconnected external monitor).
 */
function clampWindowBounds(saved, displays = [], defaults = DEFAULT_WINDOW_BOUNDS) {
  const minW = Number(defaults.minWidth) || DEFAULT_WINDOW_BOUNDS.minWidth;
  const minH = Number(defaults.minHeight) || DEFAULT_WINDOW_BOUNDS.minHeight;
  const defW = Math.max(minW, Number(defaults.width) || DEFAULT_WINDOW_BOUNDS.width);
  const defH = Math.max(minH, Number(defaults.height) || DEFAULT_WINDOW_BOUNDS.height);

  const validDisplays = (Array.isArray(displays) ? displays : [])
    .map((d) => d?.workArea || d?.bounds || null)
    .filter((wa) => wa && Number.isFinite(wa.width) && Number.isFinite(wa.height) && wa.width > 0 && wa.height > 0);

  const primary = validDisplays[0] || null;
  const rawW = Number(saved?.width);
  const rawH = Number(saved?.height);
  const baseWidth = Number.isFinite(rawW) && rawW > 0 ? Math.max(minW, Math.round(rawW)) : defW;
  const baseHeight = Number.isFinite(rawH) && rawH > 0 ? Math.max(minH, Math.round(rawH)) : defH;
  const isMaximized = Boolean(saved?.isMaximized);

  const rawX = saved?.x;
  const rawY = saved?.y;
  const hasCoords = typeof rawX === 'number' && Number.isFinite(rawX) && typeof rawY === 'number' && Number.isFinite(rawY);

  let matchedDisplay = null;
  if (hasCoords && validDisplays.length > 0) {
    const candidate = { x: Math.round(rawX), y: Math.round(rawY), width: baseWidth, height: baseHeight };
    let bestArea = 0;
    for (const wa of validDisplays) {
      const area = intersectionArea(candidate, wa);
      if (area >= 100 * 80 && area > bestArea) {
        bestArea = area;
        matchedDisplay = wa;
      }
    }
  }

  const targetDisplay = matchedDisplay || primary;
  const maxW = targetDisplay ? Math.max(minW, targetDisplay.width) : 16384;
  const maxH = targetDisplay ? Math.max(minH, targetDisplay.height) : 16384;
  const width = Math.min(maxW, baseWidth);
  const height = Math.min(maxH, baseHeight);

  if (hasCoords && (validDisplays.length === 0 || matchedDisplay)) {
    return { width, height, x: Math.round(rawX), y: Math.round(rawY), isMaximized };
  }

  return { width, height, isMaximized };
}

function sanitizeWindowBoundsForSave(bounds, isMaximized = false) {
  if (!bounds || typeof bounds !== 'object') return null;
  const width = Math.round(Number(bounds.width));
  const height = Math.round(Number(bounds.height));
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    width,
    height,
    x,
    y,
    isMaximized: Boolean(isMaximized),
  };
}

module.exports = {
  DEFAULT_WINDOW_BOUNDS,
  clampWindowBounds,
  sanitizeWindowBoundsForSave,
};
