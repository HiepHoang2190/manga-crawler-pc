export const MAX_WORKFLOW_HISTORY = 40;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.0;
export const NODE_CARD_WIDTH = 256;
export const NODE_CARD_ESTIMATED_HEIGHT = 160;

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback for non-cloneable edge cases
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export function clampZoom(zoom) {
  const num = Number(zoom);
  if (!Number.isFinite(num)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, num));
}

export function createGraphSnapshot(nodes = [], edges = []) {
  return {
    nodes: deepClone(Array.isArray(nodes) ? nodes : []),
    edges: deepClone(Array.isArray(edges) ? edges : []),
  };
}

export function graphsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return (
      JSON.stringify({ nodes: a.nodes || [], edges: a.edges || [] }) ===
      JSON.stringify({ nodes: b.nodes || [], edges: b.edges || [] })
    );
  } catch {
    return false;
  }
}

export function createWorkflowHistory() {
  return {
    past: [],
    future: [],
    lastCoalesceKey: null,
  };
}

export function pushWorkflowHistory(history, previousSnapshot, options = {}) {
  const base = history || createWorkflowHistory();
  const { coalesceKey = null, nextSnapshot = null, maxEntries = MAX_WORKFLOW_HISTORY } = options;

  const clonedPrev = createGraphSnapshot(previousSnapshot?.nodes, previousSnapshot?.edges);
  if (nextSnapshot && graphsEqual(clonedPrev, nextSnapshot)) {
    return base;
  }

  // Coalesce consecutive edits with the same key (keeps initial snapshot before burst edits)
  if (coalesceKey && base.lastCoalesceKey === coalesceKey && base.past.length > 0) {
    return {
      past: base.past,
      future: [],
      lastCoalesceKey: coalesceKey,
    };
  }

  const nextPast = [...base.past, clonedPrev];
  const trimmedPast =
    nextPast.length > maxEntries ? nextPast.slice(nextPast.length - maxEntries) : nextPast;

  return {
    past: trimmedPast,
    future: [],
    lastCoalesceKey: coalesceKey,
  };
}

export function undoWorkflowHistory(history, currentSnapshot) {
  const base = history || createWorkflowHistory();
  if (!base.past.length) {
    return { history: base, snapshot: null };
  }

  const target = createGraphSnapshot(
    base.past[base.past.length - 1]?.nodes,
    base.past[base.past.length - 1]?.edges
  );
  const nextPast = base.past.slice(0, -1);
  const currentCloned = createGraphSnapshot(currentSnapshot?.nodes, currentSnapshot?.edges);

  return {
    history: {
      past: nextPast,
      future: [currentCloned, ...base.future],
      lastCoalesceKey: null,
    },
    snapshot: target,
  };
}

export function redoWorkflowHistory(history, currentSnapshot) {
  const base = history || createWorkflowHistory();
  if (!base.future.length) {
    return { history: base, snapshot: null };
  }

  const [targetRaw, ...restFuture] = base.future;
  const target = createGraphSnapshot(targetRaw?.nodes, targetRaw?.edges);
  const currentCloned = createGraphSnapshot(currentSnapshot?.nodes, currentSnapshot?.edges);
  const nextPast = [...base.past, currentCloned];
  const trimmedPast =
    nextPast.length > MAX_WORKFLOW_HISTORY
      ? nextPast.slice(nextPast.length - MAX_WORKFLOW_HISTORY)
      : nextPast;

  return {
    history: {
      past: trimmedPast,
      future: restFuture,
      lastCoalesceKey: null,
    },
    snapshot: target,
  };
}

export function computeZoomAtPoint({
  pan = { x: 0, y: 0 },
  zoom = 1,
  nextZoom = 1,
  cursorX = 0,
  cursorY = 0,
}) {
  const safeCurrentZoom = clampZoom(zoom);
  const clampedNextZoom = clampZoom(nextZoom);
  const worldX = (cursorX - (pan?.x || 0)) / safeCurrentZoom;
  const worldY = (cursorY - (pan?.y || 0)) / safeCurrentZoom;

  return {
    zoom: clampedNextZoom,
    pan: {
      x: Math.round(cursorX - worldX * clampedNextZoom),
      y: Math.round(cursorY - worldY * clampedNextZoom),
    },
  };
}

export function computeGraphBounds(nodes = []) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const nx = Number(node?.x) || 0;
    const ny = Number(node?.y) || 0;
    minX = Math.min(minX, nx);
    minY = Math.min(minY, ny);
    maxX = Math.max(maxX, nx + NODE_CARD_WIDTH);
    maxY = Math.max(maxY, ny + NODE_CARD_ESTIMATED_HEIGHT);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function computeFitViewTransform(
  nodes = [],
  viewportWidth = 1000,
  viewportHeight = 600,
  padding = 64,
  maxFitZoom = 1
) {
  const bounds = computeGraphBounds(nodes);
  if (!bounds) {
    return { pan: { x: 100, y: 100 }, zoom: 1 };
  }

  const vw = Math.max(200, Number(viewportWidth) || 1000);
  const vh = Math.max(160, Number(viewportHeight) || 600);
  const availW = Math.max(80, vw - padding * 2);
  const availH = Math.max(80, vh - padding * 2);

  const scaleX = availW / bounds.width;
  const scaleY = availH / bounds.height;
  const rawZoom = Math.min(scaleX, scaleY, maxFitZoom);
  const zoom = clampZoom(rawZoom);

  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return {
    zoom,
    pan: {
      x: Math.round(vw / 2 - centerX * zoom),
      y: Math.round(vh / 2 - centerY * zoom),
    },
  };
}

export function computeCenterOnNodeTransform(
  node,
  viewportWidth = 1000,
  viewportHeight = 600,
  currentZoom = 1
) {
  if (!node) return { pan: { x: 100, y: 100 }, zoom: clampZoom(currentZoom) };
  const vw = Math.max(200, Number(viewportWidth) || 1000);
  const vh = Math.max(160, Number(viewportHeight) || 600);
  const zoom = clampZoom(currentZoom);

  const nodeCenterX = (Number(node.x) || 0) + NODE_CARD_WIDTH / 2;
  const nodeCenterY = (Number(node.y) || 0) + NODE_CARD_ESTIMATED_HEIGHT / 2;

  return {
    zoom,
    pan: {
      x: Math.round(vw / 2 - nodeCenterX * zoom),
      y: Math.round(vh / 2 - nodeCenterY * zoom),
    },
  };
}

export function computeMinimapLayout({
  nodes = [],
  pan = { x: 0, y: 0 },
  zoom = 1,
  viewportWidth = 1000,
  viewportHeight = 600,
  minimapWidth = 176,
  minimapHeight = 112,
  padding = 10,
} = {}) {
  const bounds = computeGraphBounds(nodes);
  if (!bounds) return null;

  const safeZoom = clampZoom(zoom);
  const vw = Math.max(1, Number(viewportWidth) || 1000);
  const vh = Math.max(1, Number(viewportHeight) || 600);

  // World-space viewport rectangle
  const viewMinX = -(pan?.x || 0) / safeZoom;
  const viewMinY = -(pan?.y || 0) / safeZoom;
  const viewMaxX = viewMinX + vw / safeZoom;
  const viewMaxY = viewMinY + vh / safeZoom;

  const worldMinX = Math.min(bounds.minX, viewMinX) - 40;
  const worldMinY = Math.min(bounds.minY, viewMinY) - 40;
  const worldMaxX = Math.max(bounds.maxX, viewMaxX) + 40;
  const worldMaxY = Math.max(bounds.maxY, viewMaxY) + 40;

  const worldWidth = Math.max(1, worldMaxX - worldMinX);
  const worldHeight = Math.max(1, worldMaxY - worldMinY);

  const innerW = Math.max(10, minimapWidth - padding * 2);
  const innerH = Math.max(10, minimapHeight - padding * 2);
  const scale = Math.min(innerW / worldWidth, innerH / worldHeight);

  const offsetX = padding + (innerW - worldWidth * scale) / 2;
  const offsetY = padding + (innerH - worldHeight * scale) / 2;

  const toMiniX = (wx) => offsetX + (wx - worldMinX) * scale;
  const toMiniY = (wy) => offsetY + (wy - worldMinY) * scale;

  const nodeRects = nodes.map((node) => ({
    id: node.id,
    node,
    x: toMiniX(Number(node.x) || 0),
    y: toMiniY(Number(node.y) || 0),
    width: Math.max(4, NODE_CARD_WIDTH * scale),
    height: Math.max(3, NODE_CARD_ESTIMATED_HEIGHT * scale),
  }));

  const viewportRect = {
    x: toMiniX(viewMinX),
    y: toMiniY(viewMinY),
    width: Math.max(8, (vw / safeZoom) * scale),
    height: Math.max(6, (vh / safeZoom) * scale),
  };

  return {
    worldMinX,
    worldMinY,
    scale,
    offsetX,
    offsetY,
    minimapWidth,
    minimapHeight,
    nodeRects,
    viewportRect,
  };
}

export function minimapPointToPan({
  miniX,
  miniY,
  layout,
  zoom = 1,
  viewportWidth = 1000,
  viewportHeight = 600,
}) {
  if (!layout || !layout.scale) return { x: 100, y: 100 };
  const safeZoom = clampZoom(zoom);
  const vw = Math.max(1, Number(viewportWidth) || 1000);
  const vh = Math.max(1, Number(viewportHeight) || 600);

  const worldX = layout.worldMinX + (miniX - layout.offsetX) / layout.scale;
  const worldY = layout.worldMinY + (miniY - layout.offsetY) / layout.scale;

  return {
    x: Math.round(vw / 2 - worldX * safeZoom),
    y: Math.round(vh / 2 - worldY * safeZoom),
  };
}

export function computeNextNodePosition(existingNodes = []) {
  if (!Array.isArray(existingNodes) || existingNodes.length === 0) {
    return { x: 60, y: 100 };
  }
  const lastNode = existingNodes[existingNodes.length - 1];
  return {
    x: (Number(lastNode?.x) || 60) + 300,
    y: existingNodes.length % 2 === 0 ? 100 : 260,
  };
}

export function createDuplicatedNode(sourceNode, offset = { x: 40, y: 40 }) {
  if (!sourceNode) return null;
  const dx = Number(offset?.x) || 40;
  const dy = Number(offset?.y) || 40;
  return {
    ...deepClone(sourceNode),
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    x: Math.round((Number(sourceNode.x) || 0) + dx),
    y: Math.round((Number(sourceNode.y) || 0) + dy),
  };
}

export function nudgeWorkflowNodePosition(node, dx = 0, dy = 0) {
  return {
    x: Math.round((Number(node?.x) || 0) + dx),
    y: Math.round((Number(node?.y) || 0) + dy),
  };
}

export function formatDurationMs(durationMs) {
  if (durationMs === null || durationMs === undefined) return '';
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (secs === 60) return `${mins + 1}m 00s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}
