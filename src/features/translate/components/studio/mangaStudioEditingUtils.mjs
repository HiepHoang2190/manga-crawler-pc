/**
 * Pure utilities for Manga Studio Undo/Redo snapshots, batch style apply, layer nudging, and Find & Replace.
 */

export const MAX_HISTORY_ENTRIES = 40;

export const DEFAULT_JAPANESE_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/;

export const TYPOGRAPHY_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'color',
  'align',
  'direction',
  'strokeColor',
  'strokeWidth',
  'textTransform',
];

function cloneLayer(layer) {
  if (!layer || typeof layer !== 'object') return layer;
  return {
    ...layer,
    bbox: Array.isArray(layer.bbox) ? [...layer.bbox] : layer.bbox,
    textBbox: Array.isArray(layer.textBbox) ? [...layer.textBbox] : layer.textBbox,
  };
}

export function extractLayersSnapshot(pages) {
  const list = Array.isArray(pages) ? pages : [];
  return list.map((p) => ({
    id: p?.id,
    imagePath: p?.imagePath || '',
    layers: Array.isArray(p?.layers) ? p.layers.map(cloneLayer) : [],
  }));
}

export function applyLayersSnapshot(pages, snapshot) {
  const list = Array.isArray(pages) ? pages : [];
  const snap = Array.isArray(snapshot) ? snapshot : [];
  return list.map((p, idx) => {
    const matched =
      (p?.imagePath && snap.find((s) => s?.imagePath && s.imagePath === p.imagePath)) ||
      snap[idx];
    if (!matched || !Array.isArray(matched.layers)) return p;
    return {
      ...p,
      layers: matched.layers.map(cloneLayer),
    };
  });
}

export function pushHistoryStack(stack, snapshot, maxEntries = MAX_HISTORY_ENTRIES) {
  const list = Array.isArray(stack) ? stack : [];
  const next = [...list, snapshot];
  if (next.length > maxEntries) {
    return next.slice(next.length - maxEntries);
  }
  return next;
}

export function applyTypographyStyleToPages(pages, sourceLayer, { scope = 'page', activePageIndex = 0 } = {}) {
  const list = Array.isArray(pages) ? pages : [];
  if (!sourceLayer || typeof sourceLayer !== 'object') {
    return { nextPages: list, affectedLayers: 0, changedLayers: 0, affectedPages: 0 };
  }

  const stylePatch = {};
  for (const key of TYPOGRAPHY_STYLE_KEYS) {
    if (key in sourceLayer && sourceLayer[key] !== undefined) {
      stylePatch[key] = sourceLayer[key];
    }
  }
  const styleKeys = Object.keys(stylePatch);

  let affectedLayers = 0;
  let changedLayers = 0;
  let affectedPages = 0;

  const nextPages = list.map((p, pIdx) => {
    if (scope !== 'all' && pIdx !== activePageIndex) return p;
    const pageLayers = Array.isArray(p?.layers) ? p.layers : [];
    if (pageLayers.length === 0) return p;
    affectedPages += 1;
    affectedLayers += pageLayers.length;
    let pageChanged = false;
    const nextLayers = pageLayers.map((l) => {
      const differs = styleKeys.some((k) => l?.[k] !== stylePatch[k]);
      if (!differs) return l;
      pageChanged = true;
      changedLayers += 1;
      return {
        ...l,
        ...stylePatch,
      };
    });
    return pageChanged ? { ...p, layers: nextLayers } : p;
  });

  return { nextPages, affectedLayers, changedLayers, affectedPages };
}

export function nudgeLayerBbox(layer, dx, dy, bounds = null) {
  if (!layer || typeof layer !== 'object') return layer;
  const maxW = Number(bounds?.width) > 0 ? Number(bounds.width) : Infinity;
  const maxH = Number(bounds?.height) > 0 ? Number(bounds.height) : Infinity;

  const primaryBox =
    layer.isCustomTextBox && Array.isArray(layer.textBbox) && layer.textBbox.length === 4
      ? layer.textBbox
      : Array.isArray(layer.bbox) && layer.bbox.length === 4
        ? layer.bbox
        : Array.isArray(layer.textBbox) && layer.textBbox.length === 4
          ? layer.textBbox
          : null;

  if (!primaryBox) return layer;

  const [px, py, pw, ph] = primaryBox;
  const clampedX = Math.max(0, Math.min(Math.max(0, maxW - pw), Math.round(px + dx)));
  const clampedY = Math.max(0, Math.min(Math.max(0, maxH - ph), Math.round(py + dy)));
  const actualDx = clampedX - px;
  const actualDy = clampedY - py;

  const applyDelta = (box) => {
    if (!Array.isArray(box) || box.length !== 4) return box;
    const [x, y, w, h] = box;
    const nextX = Math.max(0, Math.min(Math.max(0, maxW - w), Math.round(x + actualDx)));
    const nextY = Math.max(0, Math.min(Math.max(0, maxH - h), Math.round(y + actualDy)));
    return [nextX, nextY, w, h];
  };

  return {
    ...layer,
    bbox: applyDelta(layer.bbox),
    textBbox: Array.isArray(layer.textBbox) ? applyDelta(layer.textBbox) : layer.textBbox,
  };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFindRegex(findText, caseSensitive) {
  const needle = String(findText || '');
  if (!needle) return null;
  return new RegExp(escapeRegExp(needle), caseSensitive ? 'g' : 'gi');
}

export function countBatchFindMatches(pages, { findText, scope = 'current', activePageIndex = 0, caseSensitive = false } = {}) {
  const regex = buildFindRegex(findText, caseSensitive);
  if (!regex) return { totalMatches: 0, matchedLayers: 0 };

  const list = Array.isArray(pages) ? pages : [];
  let totalMatches = 0;
  let matchedLayers = 0;

  list.forEach((p, pIdx) => {
    if (scope !== 'all' && pIdx !== activePageIndex) return;
    const pageLayers = Array.isArray(p?.layers) ? p.layers : [];
    for (const l of pageLayers) {
      const text = String(l?.text || '');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        totalMatches += matches.length;
        matchedLayers += 1;
      }
    }
  });

  return { totalMatches, matchedLayers };
}

export function batchReplaceLayerTexts(
  pages,
  {
    findText,
    replaceText = '',
    scope = 'current',
    activePageIndex = 0,
    caseSensitive = false,
    japaneseRegex = DEFAULT_JAPANESE_REGEX,
  } = {}
) {
  const list = Array.isArray(pages) ? pages : [];
  const regex = buildFindRegex(findText, caseSensitive);
  if (!regex) return { nextPages: list, totalMatches: 0, replacedLayers: 0 };

  let totalMatches = 0;
  let replacedLayers = 0;
  const replacement = String(replaceText ?? '');

  const nextPages = list.map((p, pIdx) => {
    if (scope !== 'all' && pIdx !== activePageIndex) return p;
    const pageLayers = Array.isArray(p?.layers) ? p.layers : [];
    let pageChanged = false;
    const nextLayers = pageLayers.map((l) => {
      const text = String(l?.text || '');
      const matches = text.match(regex);
      if (!matches || matches.length === 0) return l;
      pageChanged = true;
      totalMatches += matches.length;
      replacedLayers += 1;
      const updatedText = text.replace(regex, () => replacement);
      return {
        ...l,
        text: updatedText,
        translatedText: updatedText,
        isTranslated: true,
        hasResidualJapanese: japaneseRegex ? japaneseRegex.test(updatedText) : false,
      };
    });
    return pageChanged ? { ...p, layers: nextLayers } : p;
  });

  return { nextPages, totalMatches, replacedLayers };
}
