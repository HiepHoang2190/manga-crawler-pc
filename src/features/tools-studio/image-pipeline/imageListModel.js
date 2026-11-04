import { hasManual, hasStale } from './overrides.js';

const EMPTY_BADGES = { skewAngle: null, hasBorder: false, isDoublePage: false };

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function getImageStatus(image, { analysis = {}, overrides = {}, runErrors = {} } = {}) {
  const result = analysis[image.absolutePath];
  const badges = result?.ok ? { ...EMPTY_BADGES, ...result.badges } : EMPTY_BADGES;
  const errorMessage = runErrors[image.absolutePath] || image.error || (result && !result.ok ? result.error : null);
  return {
    needsWork: badges.skewAngle !== null || badges.hasBorder || badges.isDoublePage,
    manual: hasManual(overrides, image.absolutePath),
    stale: hasStale(overrides, image.absolutePath),
    error: Boolean(errorMessage),
    errorMessage: errorMessage || null,
    badges,
    outputCount: result?.ok ? result.outputCount : null,
    outputWidth: result?.ok ? result.outputWidth : null,
    outputHeight: result?.ok ? result.outputHeight : null,
  };
}

function matchesFilter(status, filter) {
  if (filter === 'needsWork') return status.needsWork;
  if (filter === 'manual') return status.manual;
  if (filter === 'stale') return status.stale;
  if (filter === 'error') return status.error;
  return true;
}

const naturalCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function filterAndSortImages(images, { filter = 'all', search = '', sort = 'nameAsc', ...ctx } = {}) {
  const query = search.trim().toLowerCase();
  const list = images.filter((img) => {
    if (query && !img.relativePath.toLowerCase().includes(query)) return false;
    return matchesFilter(getImageStatus(img, ctx), filter);
  });
  if (sort === 'sizeDesc') return list.sort((a, b) => (b.size || 0) - (a.size || 0));
  if (sort === 'nameDesc') return list.sort((a, b) => naturalCompare(b.relativePath, a.relativePath));
  return list.sort((a, b) => naturalCompare(a.relativePath, b.relativePath));
}

export function countByFilter(images, ctx = {}) {
  const counts = { all: images.length, needsWork: 0, manual: 0, stale: 0, error: 0 };
  for (const img of images) {
    const s = getImageStatus(img, ctx);
    if (s.needsWork) counts.needsWork += 1;
    if (s.manual) counts.manual += 1;
    if (s.stale) counts.stale += 1;
    if (s.error) counts.error += 1;
  }
  return counts;
}
