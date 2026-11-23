import { useState, useCallback, useRef } from 'react';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';
import {
  isPortCompatible,
  topologicalSort,
  getTopologicallyOrderedNodes,
  autoConnectAllNodes,
  autoConnectOnAddNode,
  getNodeOutputs,
} from '../engine/workflowGraph';
import {
  clampZoom,
  createGraphSnapshot,
  createWorkflowHistory,
  pushWorkflowHistory,
  undoWorkflowHistory,
  redoWorkflowHistory,
  computeZoomAtPoint,
  computeFitViewTransform,
  computeCenterOnNodeTransform,
  computeNextNodePosition,
  createDuplicatedNode,
  nudgeWorkflowNodePosition,
} from '../engine/workflowEditingUtils';

export function useWorkflowCanvas(initialWorkflow = null) {
  const [nodes, setNodes] = useState(() => initialWorkflow?.nodes || []);
  const [edges, setEdges] = useState(() => initialWorkflow?.edges || []);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  // Connecting wire state
  const [connecting, setConnecting] = useState(null);

  const canvasRef = useRef(null);
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Refs synced immediately so actions & hotkeys never suffer from stale closures
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const historyRef = useRef(createWorkflowHistory());
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });

  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    });
  }, []);

  const recordHistory = useCallback(
    (previousSnapshot, options = {}) => {
      const nextHistory = pushWorkflowHistory(historyRef.current, previousSnapshot, options);
      if (nextHistory !== historyRef.current) {
        historyRef.current = nextHistory;
        syncHistoryCounts();
      }
    },
    [syncHistoryCounts]
  );

  const resetHistory = useCallback(() => {
    historyRef.current = createWorkflowHistory();
    syncHistoryCounts();
  }, [syncHistoryCounts]);

  const commitHistorySnapshot = useCallback(
    (beforeSnapshot, coalesceKey = null) => {
      if (!beforeSnapshot) return;
      recordHistory(beforeSnapshot, {
        coalesceKey,
        nextSnapshot: { nodes: nodesRef.current, edges: edgesRef.current },
      });
    },
    [recordHistory]
  );

  // Add new node from palette
  const addNode = useCallback(
    (type, dropPosition = null, defaultDataOverride = {}) => {
      const def = NODE_DEFINITIONS[type];
      if (!def) return null;

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const beforeSnapshot = createGraphSnapshot(currentNodes, currentEdges);

      let x;
      let y;
      if (dropPosition) {
        x = Math.round((dropPosition.x - panRef.current.x) / zoomRef.current);
        y = Math.round((dropPosition.y - panRef.current.y) / zoomRef.current);
      } else {
        const nextPos = computeNextNodePosition(currentNodes);
        x = nextPos.x;
        y = nextPos.y;
      }

      const newNode = {
        id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        type,
        x,
        y,
        data: { ...(def.defaultData || {}), ...defaultDataOverride },
      };

      const nextNodes = [...currentNodes, newNode];
      const result = autoConnectOnAddNode(newNode, currentNodes, currentEdges, selectedNodeId);
      const stampedEdges =
        result.newEdges.length > 0
          ? result.newEdges.map((e) => ({
              ...e,
              id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            }))
          : [];
      const nextEdges = stampedEdges.length > 0 ? [...currentEdges, ...stampedEdges] : currentEdges;

      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: nextNodes, edges: nextEdges } });

      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      if (stampedEdges.length > 0) {
        setEdges(nextEdges);
      }
      setSelectedNodeId(newNode.id);
      setSelectedEdgeId(null);
      return newNode;
    },
    [selectedNodeId, recordHistory]
  );

  // Duplicate existing node with cloned config and offset position
  const duplicateNode = useCallback(
    (nodeId) => {
      const source = nodesRef.current.find((n) => n.id === nodeId);
      const dup = createDuplicatedNode(source);
      if (!dup) return null;

      const beforeSnapshot = createGraphSnapshot(nodesRef.current, edgesRef.current);
      const nextNodes = [...nodesRef.current, dup];

      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: nextNodes, edges: edgesRef.current } });
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      setSelectedNodeId(dup.id);
      setSelectedEdgeId(null);
      return dup;
    },
    [recordHistory]
  );

  // Toggle bypass / disabled state for a node
  const toggleNodeDisabled = useCallback(
    (nodeId) => {
      const target = nodesRef.current.find((n) => n.id === nodeId);
      if (!target) return null;

      const nextDisabled = !target.data?.disabled;
      const beforeSnapshot = createGraphSnapshot(nodesRef.current, edgesRef.current);
      const nextNodes = nodesRef.current.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, disabled: nextDisabled } } : n
      );

      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: nextNodes, edges: edgesRef.current } });
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      return nextDisabled;
    },
    [recordHistory]
  );

  // Nudge node by pixel delta with coalesced history
  const nudgeNode = useCallback(
    (nodeId, dx, dy) => {
      const target = nodesRef.current.find((n) => n.id === nodeId);
      if (!target || (!dx && !dy)) return;

      const beforeSnapshot = createGraphSnapshot(nodesRef.current, edgesRef.current);
      const pos = nudgeWorkflowNodePosition(target, dx, dy);
      const nextNodes = nodesRef.current.map((n) =>
        n.id === nodeId ? { ...n, x: pos.x, y: pos.y } : n
      );

      recordHistory(beforeSnapshot, {
        coalesceKey: `nudge:${nodeId}`,
        nextSnapshot: { nodes: nextNodes, edges: edgesRef.current },
      });
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
    },
    [recordHistory]
  );

  // Auto-arrange all nodes into staggered zigzag layout
  const autoLayout = useCallback(() => {
    const prevNodes = nodesRef.current;
    if (!prevNodes || prevNodes.length === 0) return;

    const currentEdges = edgesRef.current;
    const beforeSnapshot = createGraphSnapshot(prevNodes, currentEdges);
    const orderedNodes = getTopologicallyOrderedNodes(prevNodes, edges);

    const arranged = orderedNodes.map((node, index) => ({
      ...node,
      x: 60 + index * 300,
      y: index % 2 === 0 ? 100 : 260,
    }));

    recordHistory(beforeSnapshot, { nextSnapshot: { nodes: arranged, edges: currentEdges } });
    nodesRef.current = arranged;
    setNodes(arranged);
  }, [edges, recordHistory]);

  // Auto-connect all disconnected compatible ports between nodes
  const autoConnectAll = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const result = autoConnectAllNodes(currentNodes, currentEdges);
    if (result.newEdges.length > 0) {
      const beforeSnapshot = createGraphSnapshot(currentNodes, currentEdges);
      const stamped = result.newEdges.map((e) => ({
        ...e,
        id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      }));
      const nextEdges = [...currentEdges, ...stamped];
      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: currentNodes, edges: nextEdges } });
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
      return { addedCount: result.newEdges.length };
    }
    return { addedCount: 0 };
  }, [recordHistory]);

  // Remove node and connected edges
  const removeNode = useCallback(
    (nodeId) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      if (!currentNodes.some((n) => n.id === nodeId)) return;

      const beforeSnapshot = createGraphSnapshot(currentNodes, currentEdges);
      const nextNodes = currentNodes.filter((n) => n.id !== nodeId);
      const nextEdges = currentEdges.filter((e) => e.source !== nodeId && e.target !== nodeId);

      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: nextNodes, edges: nextEdges } });
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
    },
    [recordHistory]
  );

  // Update node parameters
  const updateNodeData = useCallback(
    (nodeId, patch, options = {}) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const beforeSnapshot = createGraphSnapshot(currentNodes, currentEdges);

      const nextNodes = currentNodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
      );
      const changedNode = nextNodes.find((n) => n.id === nodeId);
      let nextEdges = currentEdges;
      if (changedNode) {
        const activeOutputs = new Set(getNodeOutputs(changedNode).map((p) => p.id));
        const filteredEdges = currentEdges.filter((e) => {
          if (e.source !== nodeId) return true;
          return activeOutputs.has(e.sourceHandle);
        });
        if (filteredEdges.length !== currentEdges.length) {
          nextEdges = filteredEdges;
        }
      }

      if (!options?.skipHistory) {
        recordHistory(beforeSnapshot, {
          coalesceKey: `data:${nodeId}`,
          nextSnapshot: { nodes: nextNodes, edges: nextEdges },
        });
      }

      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      if (nextEdges !== currentEdges) {
        edgesRef.current = nextEdges;
        setEdges(nextEdges);
      }
    },
    [recordHistory]
  );

  // Update node position during dragging
  const updateNodePosition = useCallback((nodeId, dx, dy) => {
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === nodeId ? { ...n, x: n.x + dx, y: n.y + dy } : n));
      nodesRef.current = next;
      return next;
    });
  }, []);

  // Set absolute node position directly
  const setNodePosition = useCallback((nodeId, x, y) => {
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === nodeId ? { ...n, x, y } : n));
      nodesRef.current = next;
      return next;
    });
  }, []);

  // Cancel connecting wire
  const cancelConnecting = useCallback(() => {
    setConnecting(null);
  }, []);

  // Add or replace edge
  const addEdge = useCallback(
    (edge) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const beforeSnapshot = createGraphSnapshot(currentNodes, currentEdges);

      // Remove any existing edge connecting to this same target & targetHandle
      const filtered = currentEdges.filter(
        (e) => !(e.target === edge.target && e.targetHandle === edge.targetHandle)
      );
      const nextEdges = [
        ...filtered,
        { ...edge, id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` },
      ];

      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: currentNodes, edges: nextEdges } });
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
    },
    [recordHistory]
  );

  const removeEdge = useCallback(
    (edgeId) => {
      const currentEdges = edgesRef.current;
      if (!currentEdges.some((e) => e.id === edgeId)) return;

      const beforeSnapshot = createGraphSnapshot(nodesRef.current, currentEdges);
      const nextEdges = currentEdges.filter((e) => e.id !== edgeId);

      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: nodesRef.current, edges: nextEdges } });
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
      setSelectedEdgeId((prev) => (prev === edgeId ? null : prev));
    },
    [recordHistory]
  );

  // Disconnect any edge connected to this port
  const disconnectPort = useCallback(
    (nodeId, portId, isOutput) => {
      const currentEdges = edgesRef.current;
      const nextEdges = currentEdges.filter((e) =>
        isOutput
          ? !(e.source === nodeId && e.sourceHandle === portId)
          : !(e.target === nodeId && e.targetHandle === portId)
      );
      if (nextEdges.length === currentEdges.length) return;

      const beforeSnapshot = createGraphSnapshot(nodesRef.current, currentEdges);
      recordHistory(beforeSnapshot, { nextSnapshot: { nodes: nodesRef.current, edges: nextEdges } });
      edgesRef.current = nextEdges;
      setEdges(nextEdges);
    },
    [recordHistory]
  );

  // Clear canvas (undoable)
  const clearCanvas = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (currentNodes.length === 0 && currentEdges.length === 0) return;

    const beforeSnapshot = createGraphSnapshot(currentNodes, currentEdges);
    recordHistory(beforeSnapshot, { nextSnapshot: { nodes: [], edges: [] } });
    nodesRef.current = [];
    edgesRef.current = [];
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnecting(null);
  }, [recordHistory]);

  // Set whole workflow (resets history for newly loaded workflow)
  const setWorkflow = useCallback(
    (wf) => {
      if (!wf) return;
      const nextNodes = wf.nodes || [];
      const nextEdges = wf.edges || [];
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnecting(null);
      const defaultPan = { x: 100, y: 100 };
      panRef.current = defaultPan;
      zoomRef.current = 1;
      setPan(defaultPan);
      setZoom(1);
      resetHistory();
    },
    [resetHistory]
  );

  // Undo & Redo
  const undo = useCallback(() => {
    const currentSnapshot = createGraphSnapshot(nodesRef.current, edgesRef.current);
    const { history: nextHistory, snapshot } = undoWorkflowHistory(historyRef.current, currentSnapshot);
    if (!snapshot) return false;

    historyRef.current = nextHistory;
    nodesRef.current = snapshot.nodes;
    edgesRef.current = snapshot.edges;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setConnecting(null);
    setSelectedNodeId((prev) => (prev && snapshot.nodes.some((n) => n.id === prev) ? prev : null));
    setSelectedEdgeId((prev) => (prev && snapshot.edges.some((e) => e.id === prev) ? prev : null));
    syncHistoryCounts();
    return true;
  }, [syncHistoryCounts]);

  const redo = useCallback(() => {
    const currentSnapshot = createGraphSnapshot(nodesRef.current, edgesRef.current);
    const { history: nextHistory, snapshot } = redoWorkflowHistory(historyRef.current, currentSnapshot);
    if (!snapshot) return false;

    historyRef.current = nextHistory;
    nodesRef.current = snapshot.nodes;
    edgesRef.current = snapshot.edges;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setConnecting(null);
    setSelectedNodeId((prev) => (prev && snapshot.nodes.some((n) => n.id === prev) ? prev : null));
    setSelectedEdgeId((prev) => (prev && snapshot.edges.some((e) => e.id === prev) ? prev : null));
    syncHistoryCounts();
    return true;
  }, [syncHistoryCounts]);

  // Canvas pan & cursor-anchored zoom handlers
  const handleWheel = useCallback((e, containerRect = null) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const currentZoom = zoomRef.current;
    const targetZoom = clampZoom(e.deltaY < 0 ? currentZoom * zoomFactor : currentZoom / zoomFactor);

    if (containerRect) {
      const cursorX = e.clientX - containerRect.left;
      const cursorY = e.clientY - containerRect.top;
      const next = computeZoomAtPoint({
        pan: panRef.current,
        zoom: currentZoom,
        nextZoom: targetZoom,
        cursorX,
        cursorY,
      });
      zoomRef.current = next.zoom;
      panRef.current = next.pan;
      setZoom(next.zoom);
      setPan(next.pan);
    } else {
      zoomRef.current = targetZoom;
      setZoom(targetZoom);
    }
  }, []);

  const startCanvasDrag = useCallback((e) => {
    // Only drag with left mouse button on canvas background or middle button
    if (e.button === 0 || e.button === 1) {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    }
  }, []);

  const onCanvasMouseMove = useCallback(
    (e) => {
      if (isDraggingCanvasRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const nextPan = {
          x: dragStartRef.current.panX + dx,
          y: dragStartRef.current.panY + dy,
        };
        panRef.current = nextPan;
        setPan(nextPan);
      }

      if (connecting) {
        setConnecting((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null));
      }
    },
    [connecting]
  );

  const onCanvasMouseUp = useCallback(() => {
    isDraggingCanvasRef.current = false;
    if (connecting) {
      setConnecting(null);
    }
  }, [connecting]);

  const resetView = useCallback(() => {
    const defaultPan = { x: 100, y: 100 };
    panRef.current = defaultPan;
    zoomRef.current = 1;
    setPan(defaultPan);
    setZoom(1);
  }, []);

  const fitView = useCallback((viewportWidth = 1000, viewportHeight = 600) => {
    const next = computeFitViewTransform(nodesRef.current, viewportWidth, viewportHeight);
    panRef.current = next.pan;
    zoomRef.current = next.zoom;
    setPan(next.pan);
    setZoom(next.zoom);
  }, []);

  const focusNode = useCallback((nodeId, viewportWidth = 1000, viewportHeight = 600) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const next = computeCenterOnNodeTransform(node, viewportWidth, viewportHeight, zoomRef.current);
    panRef.current = next.pan;
    zoomRef.current = next.zoom;
    setPan(next.pan);
    setZoom(next.zoom);
  }, []);

  const setPanSafe = useCallback((nextPanOrUpdater) => {
    const nextPan =
      typeof nextPanOrUpdater === 'function' ? nextPanOrUpdater(panRef.current) : nextPanOrUpdater;
    panRef.current = nextPan;
    setPan(nextPan);
  }, []);

  const zoomIn = useCallback(() => {
    const next = clampZoom(zoomRef.current * 1.2);
    zoomRef.current = next;
    setZoom(next);
  }, []);

  const zoomOut = useCallback(() => {
    const next = clampZoom(zoomRef.current / 1.2);
    zoomRef.current = next;
    setZoom(next);
  }, []);

  return {
    nodes,
    edges,
    pan,
    zoom,
    setPan: setPanSafe,
    selectedNodeId,
    selectedEdgeId,
    connecting,
    canvasRef,
    canUndo: historyCounts.past > 0,
    canRedo: historyCounts.future > 0,
    setSelectedNodeId,
    setSelectedEdgeId,
    setConnecting,
    addNode,
    duplicateNode,
    toggleNodeDisabled,
    nudgeNode,
    removeNode,
    updateNodeData,
    updateNodePosition,
    setNodePosition,
    cancelConnecting,
    addEdge,
    removeEdge,
    disconnectPort,
    clearCanvas,
    setWorkflow,
    undo,
    redo,
    commitHistorySnapshot,
    handleWheel,
    startCanvasDrag,
    onCanvasMouseMove,
    onCanvasMouseUp,
    resetView,
    fitView,
    focusNode,
    zoomIn,
    zoomOut,
    autoLayout,
    autoConnectAll,
  };
}
