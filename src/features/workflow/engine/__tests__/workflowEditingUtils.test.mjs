import {
  MAX_WORKFLOW_HISTORY,
  MIN_ZOOM,
  MAX_ZOOM,
  NODE_CARD_WIDTH,
  NODE_CARD_ESTIMATED_HEIGHT,
  createGraphSnapshot,
  graphsEqual,
  createWorkflowHistory,
  pushWorkflowHistory,
  undoWorkflowHistory,
  redoWorkflowHistory,
  computeZoomAtPoint,
  computeGraphBounds,
  computeFitViewTransform,
  computeCenterOnNodeTransform,
  computeMinimapLayout,
  minimapPointToPan,
  computeNextNodePosition,
  createDuplicatedNode,
  nudgeWorkflowNodePosition,
  formatDurationMs,
} from '../workflowEditingUtils.mjs';

describe('workflowEditingUtils', () => {
  describe('snapshot & history stack', () => {
    const sampleA = {
      nodes: [{ id: 'n1', type: 'folder_trigger', x: 60, y: 100, data: { folderPath: '/a' } }],
      edges: [],
    };
    const sampleB = {
      nodes: [
        { id: 'n1', type: 'folder_trigger', x: 60, y: 100, data: { folderPath: '/a' } },
        { id: 'n2', type: 'export_cbz', x: 360, y: 260, data: { packMode: 'singleVolume' } },
      ],
      edges: [{ id: 'e1', source: 'n1', sourceHandle: 'images_dir', target: 'n2', targetHandle: 'images_dir' }],
    };

    test('createGraphSnapshot deep clones nodes and edges', () => {
      const snap = createGraphSnapshot(sampleA.nodes, sampleA.edges);
      expect(snap).toEqual(sampleA);
      snap.nodes[0].data.folderPath = '/mutated';
      expect(sampleA.nodes[0].data.folderPath).toBe('/a');
    });

    test('graphsEqual detects equal and unequal snapshots', () => {
      expect(graphsEqual(sampleA, createGraphSnapshot(sampleA.nodes, sampleA.edges))).toBe(true);
      expect(graphsEqual(sampleA, sampleB)).toBe(false);
    });

    test('pushWorkflowHistory skips no-op when nextSnapshot equals currentSnapshot', () => {
      const h0 = createWorkflowHistory();
      const h1 = pushWorkflowHistory(h0, sampleA, {
        nextSnapshot: createGraphSnapshot(sampleA.nodes, sampleA.edges),
      });
      expect(h1.past).toHaveLength(0);
    });

    test('pushWorkflowHistory coalesces consecutive edits with the same coalesceKey', () => {
      let history = createWorkflowHistory();
      history = pushWorkflowHistory(history, sampleA, { coalesceKey: 'data:n1' });
      history = pushWorkflowHistory(history, sampleB, { coalesceKey: 'data:n1' });
      expect(history.past).toHaveLength(1);
      expect(history.past[0]).toEqual(sampleA);

      history = pushWorkflowHistory(history, sampleB, { coalesceKey: 'data:n2' });
      expect(history.past).toHaveLength(2);
    });

    test('pushWorkflowHistory caps stack at MAX_WORKFLOW_HISTORY (40) entries', () => {
      let history = createWorkflowHistory();
      for (let i = 0; i < MAX_WORKFLOW_HISTORY + 10; i++) {
        history = pushWorkflowHistory(history, {
          nodes: [{ id: `n_${i}`, type: 'folder_trigger', x: i * 10, y: 100, data: {} }],
          edges: [],
        });
      }
      expect(history.past).toHaveLength(MAX_WORKFLOW_HISTORY);
      expect(history.past[0].nodes[0].id).toBe('n_10');
    });

    test('undoWorkflowHistory and redoWorkflowHistory round-trip cleanly and clear lastCoalesceKey', () => {
      let history = createWorkflowHistory();
      history = pushWorkflowHistory(history, sampleA, { coalesceKey: 'nudge:n1' });
      expect(history.lastCoalesceKey).toBe('nudge:n1');

      const undoRes = undoWorkflowHistory(history, sampleB);
      expect(undoRes.snapshot).toEqual(sampleA);
      expect(undoRes.history.past).toHaveLength(0);
      expect(undoRes.history.future).toHaveLength(1);
      expect(undoRes.history.lastCoalesceKey).toBeNull();

      const redoRes = redoWorkflowHistory(undoRes.history, sampleA);
      expect(redoRes.snapshot).toEqual(sampleB);
      expect(redoRes.history.past).toHaveLength(1);
      expect(redoRes.history.future).toHaveLength(0);
      expect(redoRes.history.lastCoalesceKey).toBeNull();
    });
  });

  describe('viewport & zoom math', () => {
    test('computeZoomAtPoint preserves world coordinate under cursor and clamps zoom', () => {
      const pan = { x: 100, y: 50 };
      const zoom = 1;
      const cursorX = 350;
      const cursorY = 250;
      const worldX = (cursorX - pan.x) / zoom;
      const worldY = (cursorY - pan.y) / zoom;

      const res = computeZoomAtPoint({ pan, zoom, nextZoom: 1.5, cursorX, cursorY });
      expect(res.zoom).toBe(1.5);
      expect(res.pan.x + worldX * res.zoom).toBeCloseTo(cursorX, 5);
      expect(res.pan.y + worldY * res.zoom).toBeCloseTo(cursorY, 5);

      const clampedMin = computeZoomAtPoint({ pan, zoom, nextZoom: 0.05, cursorX, cursorY });
      expect(clampedMin.zoom).toBe(MIN_ZOOM);

      const clampedMax = computeZoomAtPoint({ pan, zoom, nextZoom: 5.0, cursorX, cursorY });
      expect(clampedMax.zoom).toBe(MAX_ZOOM);
    });

    test('computeGraphBounds calculates bounding box from nodes', () => {
      expect(computeGraphBounds([])).toBeNull();
      const bounds = computeGraphBounds([
        { id: 'n1', x: 60, y: 100 },
        { id: 'n2', x: 660, y: 260 },
      ]);
      expect(bounds).toEqual({
        minX: 60,
        minY: 100,
        maxX: 660 + NODE_CARD_WIDTH,
        maxY: 260 + NODE_CARD_ESTIMATED_HEIGHT,
        width: 600 + NODE_CARD_WIDTH,
        height: 160 + NODE_CARD_ESTIMATED_HEIGHT,
      });
    });

    test('computeFitViewTransform returns default view when empty and fits wide pipelines', () => {
      expect(computeFitViewTransform([], 1000, 600)).toEqual({ pan: { x: 100, y: 100 }, zoom: 1 });

      const wideNodes = [
        { id: 'n1', x: 0, y: 100 },
        { id: 'n2', x: 1500, y: 260 },
      ];
      const fit = computeFitViewTransform(wideNodes, 900, 500);
      expect(fit.zoom).toBeLessThan(1);
      expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(fit.pan.x).toBeGreaterThan(0);

      // Small single node stays capped at zoom <= 1 default maxZoom
      const singleFit = computeFitViewTransform([{ id: 'n1', x: 100, y: 100 }], 1000, 700);
      expect(singleFit.zoom).toBeLessThanOrEqual(1);
    });

    test('computeCenterOnNodeTransform centers target node in viewport', () => {
      const node = { id: 'n1', x: 500, y: 300 };
      const { pan, zoom } = computeCenterOnNodeTransform(node, 1000, 600, 1);
      expect(zoom).toBe(1);
      expect(pan.x + (node.x + NODE_CARD_WIDTH / 2) * zoom).toBeCloseTo(500, 5);
      expect(pan.y + (node.y + NODE_CARD_ESTIMATED_HEIGHT / 2) * zoom).toBeCloseTo(300, 5);
    });
  });

  describe('minimap layout math', () => {
    test('computeMinimapLayout and minimapPointToPan map coordinates accurately', () => {
      const nodes = [
        { id: 'n1', x: 0, y: 0 },
        { id: 'n2', x: 600, y: 200 },
      ];
      const layout = computeMinimapLayout({
        nodes,
        pan: { x: 100, y: 100 },
        zoom: 1,
        viewportWidth: 1000,
        viewportHeight: 600,
        minimapWidth: 180,
        minimapHeight: 112,
      });

      expect(layout).not.toBeNull();
      expect(layout.nodeRects).toHaveLength(2);
      expect(layout.viewportRect.width).toBeGreaterThan(0);

      // Clicking center of first node rect should return pan that puts node center at viewport center
      const firstRect = layout.nodeRects[0];
      const nextPan = minimapPointToPan({
        miniX: firstRect.x + firstRect.width / 2,
        miniY: firstRect.y + firstRect.height / 2,
        layout,
        zoom: 1,
        viewportWidth: 1000,
        viewportHeight: 600,
      });

      expect(nextPan.x + NODE_CARD_WIDTH / 2).toBeCloseTo(500, 1);
      expect(nextPan.y + NODE_CARD_ESTIMATED_HEIGHT / 2).toBeCloseTo(300, 1);
    });
  });

  describe('node positioning, duplication, nudging, and duration formatting', () => {
    test('computeNextNodePosition places staggered nodes cleanly', () => {
      expect(computeNextNodePosition([])).toEqual({ x: 60, y: 100 });
      expect(computeNextNodePosition([{ id: 'n1', x: 60, y: 100 }])).toEqual({ x: 360, y: 260 });
      expect(
        computeNextNodePosition([
          { id: 'n1', x: 60, y: 100 },
          { id: 'n2', x: 360, y: 260 },
        ])
      ).toEqual({ x: 660, y: 100 });
    });

    test('createDuplicatedNode clones data, offsets coordinates, and assigns new id', () => {
      expect(createDuplicatedNode(null)).toBeNull();
      const orig = {
        id: 'node_orig',
        type: 'export_cbz',
        x: 300,
        y: 120,
        data: { packMode: 'singleVolume', nested: { flag: true } },
      };
      const dup = createDuplicatedNode(orig);
      expect(dup.id).not.toBe(orig.id);
      expect(dup.type).toBe('export_cbz');
      expect(dup.x).toBe(340);
      expect(dup.y).toBe(160);
      dup.data.nested.flag = false;
      expect(orig.data.nested.flag).toBe(true);
    });

    test('nudgeWorkflowNodePosition rounds coordinates', () => {
      expect(nudgeWorkflowNodePosition({ x: 100.4, y: 200.6 }, 10, -40)).toEqual({ x: 110, y: 161 });
    });

    test('formatDurationMs formats sub-second, seconds, and minutes cleanly', () => {
      expect(formatDurationMs(-5)).toBe('');
      expect(formatDurationMs(null)).toBe('');
      expect(formatDurationMs(450)).toBe('450ms');
      expect(formatDurationMs(1250)).toBe('1.3s');
      expect(formatDurationMs(65000)).toBe('1m 05s');
    });
  });
});
