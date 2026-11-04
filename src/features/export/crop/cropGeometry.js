/**
 * Geometry and bounding box calculation utilities for interactive image crop.
 */

export const DEFAULT_CROP_DPI = 300;

/**
 * Converts millimeters to pixels based on DPI.
 * 1 inch = 25.4 mm => pixels = Math.round((mm * dpi) / 25.4)
 */
export function mmToPx(mm, dpi = DEFAULT_CROP_DPI) {
  const val = typeof mm === 'string' ? parseFloat(mm) : mm;
  if (!Number.isFinite(val) || val <= 0) return 0;
  const d = typeof dpi === 'string' ? parseFloat(dpi) : dpi;
  const safeDpi = Number.isFinite(d) && d > 0 ? d : DEFAULT_CROP_DPI;
  return Math.round((val * safeDpi) / 25.4);
}

/**
 * Converts pixels to millimeters based on DPI.
 * mm = (pixels * 25.4) / dpi
 */
export function pxToMm(px, dpi = DEFAULT_CROP_DPI, decimals = 1) {
  const val = typeof px === 'string' ? parseFloat(px) : px;
  if (!Number.isFinite(val) || val <= 0) return 0;
  const d = typeof dpi === 'string' ? parseFloat(dpi) : dpi;
  const safeDpi = Number.isFinite(d) && d > 0 ? d : DEFAULT_CROP_DPI;
  const mm = (val * 25.4) / safeDpi;
  return Number(mm.toFixed(decimals));
}

/**
 * Clamps box coordinates so it stays strictly within [0, 0, maxWidth, maxHeight]
 * and maintains at least minSize dimensions.
 */
export function clampBox(box, maxWidth, maxHeight, minSize = 1) {
  const maxW = Math.max(minSize, Math.round(maxWidth || 1));
  const maxH = Math.max(minSize, Math.round(maxHeight || 1));

  let left = Math.max(0, Math.min(maxW - minSize, Math.round(box?.left || 0)));
  let top = Math.max(0, Math.min(maxH - minSize, Math.round(box?.top || 0)));

  let width = Math.max(minSize, Math.round(box?.width || maxW));
  let height = Math.max(minSize, Math.round(box?.height || maxH));

  if (left + width > maxW) {
    width = maxW - left;
  }
  if (top + height > maxH) {
    height = maxH - top;
  }

  return { left, top, width, height };
}

/**
 * Moves box by deltaX, deltaY while keeping dimensions constant and bounded.
 */
export function moveBox(initialBox, deltaX, deltaY, maxWidth, maxHeight) {
  const w = initialBox.width;
  const h = initialBox.height;

  const maxLeft = Math.max(0, maxWidth - w);
  const maxTop = Math.max(0, maxHeight - h);

  const left = Math.max(0, Math.min(maxLeft, Math.round(initialBox.left + deltaX)));
  const top = Math.max(0, Math.min(maxTop, Math.round(initialBox.top + deltaY)));

  return { left, top, width: w, height: h };
}

/**
 * Resizes box based on dragged handle and delta movements.
 * Handles: 'nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'.
 */
export function resizeBox(initialBox, handle, deltaX, deltaY, maxWidth, maxHeight, minSize = 10) {
  let { left, top, width, height } = initialBox;
  const right = left + width;
  const bottom = top + height;

  const dX = Math.round(deltaX);
  const dY = Math.round(deltaY);

  switch (handle) {
    case 'nw': {
      let newLeft = Math.max(0, Math.min(right - minSize, left + dX));
      let newTop = Math.max(0, Math.min(bottom - minSize, top + dY));
      left = newLeft;
      top = newTop;
      width = right - newLeft;
      height = bottom - newTop;
      break;
    }
    case 'ne': {
      let newRight = Math.min(maxWidth, Math.max(left + minSize, right + dX));
      let newTop = Math.max(0, Math.min(bottom - minSize, top + dY));
      top = newTop;
      width = newRight - left;
      height = bottom - newTop;
      break;
    }
    case 'se': {
      let newRight = Math.min(maxWidth, Math.max(left + minSize, right + dX));
      let newBottom = Math.min(maxHeight, Math.max(top + minSize, bottom + dY));
      width = newRight - left;
      height = newBottom - top;
      break;
    }
    case 'sw': {
      let newLeft = Math.max(0, Math.min(right - minSize, left + dX));
      let newBottom = Math.min(maxHeight, Math.max(top + minSize, bottom + dY));
      left = newLeft;
      width = right - newLeft;
      height = newBottom - top;
      break;
    }
    case 'n': {
      let newTop = Math.max(0, Math.min(bottom - minSize, top + dY));
      top = newTop;
      height = bottom - newTop;
      break;
    }
    case 's': {
      let newBottom = Math.min(maxHeight, Math.max(top + minSize, bottom + dY));
      height = newBottom - top;
      break;
    }
    case 'w': {
      let newLeft = Math.max(0, Math.min(right - minSize, left + dX));
      left = newLeft;
      width = right - newLeft;
      break;
    }
    case 'e': {
      let newRight = Math.min(maxWidth, Math.max(left + minSize, right + dX));
      width = newRight - left;
      break;
    }
    default:
      break;
  }

  return { left, top, width, height };
}
