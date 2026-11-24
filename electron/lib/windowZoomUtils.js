const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2.0;
const DEFAULT_ZOOM_FACTOR = 1.0;
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];
const ZOOM_EPSILON = 0.005;

function clampZoomFactor(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return DEFAULT_ZOOM_FACTOR;
  const clamped = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, num));
  return Math.round(clamped * 100) / 100;
}

function isDefaultZoom(value) {
  return Math.abs(clampZoomFactor(value) - DEFAULT_ZOOM_FACTOR) < ZOOM_EPSILON;
}

function stepZoomFactor(current, direction) {
  const cur = clampZoomFactor(current);
  if (direction === 'in') {
    for (const s of ZOOM_STEPS) {
      if (s > cur + ZOOM_EPSILON) return s;
    }
    return MAX_ZOOM_FACTOR;
  }
  if (direction === 'out') {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) {
      if (ZOOM_STEPS[i] < cur - ZOOM_EPSILON) return ZOOM_STEPS[i];
    }
    return MIN_ZOOM_FACTOR;
  }
  return cur;
}

module.exports = {
  MIN_ZOOM_FACTOR,
  MAX_ZOOM_FACTOR,
  DEFAULT_ZOOM_FACTOR,
  ZOOM_STEPS,
  clampZoomFactor,
  stepZoomFactor,
  isDefaultZoom,
};
