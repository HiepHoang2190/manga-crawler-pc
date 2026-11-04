// src/features/tools-studio/image-pipeline/overrides.js
function withFileMap(overrides, filePath, fileMap) {
  const next = { ...overrides };
  if (!fileMap || Object.keys(fileMap).length === 0) delete next[filePath];
  else next[filePath] = fileMap;
  return next;
}

export function setOverride(overrides, filePath, actionId, patch = {}) {
  const fileMap = { ...(overrides[filePath] || {}) };
  const prev = fileMap[actionId] || {};
  const entry = { ...prev, stale: false, updatedAt: Date.now() };
  if (typeof patch.enabled === 'boolean') entry.enabled = patch.enabled;
  if (patch.params) entry.params = { ...(prev.params || {}), ...patch.params };
  fileMap[actionId] = entry;
  return withFileMap(overrides, filePath, fileMap);
}

export function clearOverride(overrides, filePath, actionId) {
  const fileMap = overrides[filePath];
  if (!fileMap || !fileMap[actionId]) return overrides;
  const next = { ...fileMap };
  delete next[actionId];
  return withFileMap(overrides, filePath, next);
}

export function clearOverrideParam(overrides, filePath, actionId, key) {
  const entry = overrides[filePath]?.[actionId];
  if (!entry?.params || !(key in entry.params)) return overrides;
  const params = { ...entry.params };
  delete params[key];
  return withFileMap(overrides, filePath, { ...overrides[filePath], [actionId]: { ...entry, params, updatedAt: Date.now() } });
}

export function confirmOverride(overrides, filePath, actionId) {
  const entry = overrides[filePath]?.[actionId];
  if (!entry || !entry.stale) return overrides;
  return withFileMap(overrides, filePath, { ...overrides[filePath], [actionId]: { ...entry, stale: false } });
}

function markStale(fileMap, ids) {
  let changed = false;
  const next = { ...fileMap };
  for (const id of ids) {
    if (next[id] && !next[id].stale) {
      next[id] = { ...next[id], stale: true };
      changed = true;
    }
  }
  return changed ? next : fileMap;
}

export function markDownstreamStale(overrides, filePath, actions, changedActionId) {
  const index = actions.findIndex((a) => a.id === changedActionId);
  const fileMap = overrides[filePath];
  if (index < 0 || !fileMap) return overrides;
  const next = markStale(fileMap, actions.slice(index + 1).map((a) => a.id));
  return next === fileMap ? overrides : { ...overrides, [filePath]: next };
}

export function markDownstreamStaleAll(overrides, actions, changedActionId) {
  return Object.keys(overrides).reduce((acc, filePath) => markDownstreamStale(acc, filePath, actions, changedActionId), overrides);
}

export function markReorderStale(overrides, prevActions, nextActions) {
  const moved = nextActions.filter((a, i) => prevActions[i]?.id !== a.id).map((a) => a.id);
  if (moved.length === 0) return overrides;
  let result = overrides;
  for (const filePath of Object.keys(overrides)) {
    const next = markStale(overrides[filePath], moved);
    if (next !== overrides[filePath]) result = { ...result, [filePath]: next };
  }
  return result;
}

export function removeActionOverrides(overrides, actionId) {
  return Object.keys(overrides).reduce((acc, filePath) => clearOverride(acc, filePath, actionId), overrides);
}

export function removeFileOverrides(overrides, filePath) {
  if (!overrides[filePath]) return overrides;
  const next = { ...overrides };
  delete next[filePath];
  return next;
}

export function toBackendOverrides(fileMap = {}) {
  const out = {};
  for (const [actionId, entry] of Object.entries(fileMap || {})) {
    const item = {};
    if (typeof entry.enabled === 'boolean') item.enabled = entry.enabled;
    if (entry.params && Object.keys(entry.params).length) item.params = entry.params;
    if (Object.keys(item).length) out[actionId] = item;
  }
  return out;
}

export function toBackendOverridesAll(overrides) {
  const out = {};
  for (const [filePath, fileMap] of Object.entries(overrides)) {
    const mapped = toBackendOverrides(fileMap);
    if (Object.keys(mapped).length) out[filePath] = mapped;
  }
  return out;
}

export function hasManual(overrides, filePath) {
  return Object.keys(toBackendOverrides(overrides[filePath])).length > 0;
}

export function hasStale(overrides, filePath) {
  return Object.values(overrides[filePath] || {}).some((e) => e.stale);
}

const round4 = (n) => Math.round(n * 10000) / 10000;

export function pxBoxToRatio(box, width, height) {
  return {
    left: round4(box.left / width),
    top: round4(box.top / height),
    width: round4(box.width / width),
    height: round4(box.height / height),
  };
}

export function ratioBoxToPx(ratio, width, height) {
  return {
    left: Math.round(ratio.left * width),
    top: Math.round(ratio.top * height),
    width: Math.round(ratio.width * width),
    height: Math.round(ratio.height * height),
  };
}
