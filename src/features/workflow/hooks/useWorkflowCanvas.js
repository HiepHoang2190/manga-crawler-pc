import { useState, useCallback, useRef } from 'react';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';
import { isPortCompatible, topologicalSort, autoConnectAllNodes, autoConnectOnAddNode, getNodeOutputs } from '../engine/workflowGraph';

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

  // Add new node from palette
  const addNode = useCallback((type, dropPosition = null, defaultDataOverride = {}) => {
    const def = NODE_DEFINITIONS[type];
    if (!def) return;

    let x = 60;
    let y = 100;
    if (dropPosition) {
      x = Math.round((dropPosition.x - pan.x) / zoom);
      y = Math.round((dropPosition.y - pan.y) / zoom);
    } else {
      setNodes((prev) => {
        const lastNode = prev[prev.length - 1];
        if (lastNode) {
          x = lastNode.x + 300;
          y = prev.length % 2 === 0 ? 100 : 260;
        } else {
          x = 60;
          y = 100;
        }
        return prev;
      });
    }

    const newNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type,
      x,
      y,
      data: { ...(def.defaultData || {}), ...defaultDataOverride },
    };

    setNodes((prev) => [...prev, newNode]);

    // Auto-connect the new node to the best source
    const result = autoConnectOnAddNode(newNode, nodes, edges, selectedNodeId);
    if (result.newEdges.length > 0) {
      const newEdges = result.newEdges.map((e) => ({
        ...e,
        id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      }));
      setEdges((prevEdges) => [...prevEdges, ...newEdges]);
    }

    setSelectedNodeId(newNode.id);
  }, [pan, zoom, selectedNodeId, nodes, edges]);

  // Auto-arrange all nodes into staggered zigzag layout
  const autoLayout = useCallback(() => {
    setNodes((prevNodes) => {
      if (!prevNodes || prevNodes.length === 0) return prevNodes;

      let orderedIds = [];
      try {
        const topo = topologicalSort(prevNodes, edges);
        orderedIds = topo.sortedNodeIds || [];
      } catch {
        orderedIds = [];
      }

      const remaining = prevNodes.filter((n) => !orderedIds.includes(n.id)).map((n) => n.id);
      const allOrdered = [...orderedIds, ...remaining];

      const posMap = new Map();
      allOrdered.forEach((id, index) => {
        posMap.set(id, {
          x: 60 + index * 300,
          y: index % 2 === 0 ? 100 : 260,
        });
      });

      return prevNodes.map((node) => {
        const pos = posMap.get(node.id);
        return pos ? { ...node, x: pos.x, y: pos.y } : node;
      });
    });
  }, [edges]);

  // Auto-connect all disconnected compatible ports between nodes
  const autoConnectAll = useCallback(() => {
    const result = autoConnectAllNodes(nodes, edges);
    if (result.newEdges.length > 0) {
      const stamped = result.newEdges.map((e) => ({
        ...e,
        id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      }));
      setEdges((prev) => [...prev, ...stamped]);
      return { addedCount: result.newEdges.length };
    }
    return { addedCount: 0 };
  }, [nodes, edges]);

  // Remove node and connected edges
  const removeNode = useCallback((nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  // Update node parameters
  const updateNodeData = useCallback((nodeId, patch) => {
    setNodes((prevNodes) => {
      const updatedNodes = prevNodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
      const changedNode = updatedNodes.find((n) => n.id === nodeId);
      if (changedNode) {
        const activeOutputs = new Set(getNodeOutputs(changedNode).map((p) => p.id));
        setEdges((prevEdges) =>
          prevEdges.filter((e) => {
            if (e.source !== nodeId) return true;
            return activeOutputs.has(e.sourceHandle);
          })
        );
      }
      return updatedNodes;
    });
  }, []);

  // Update node position during dragging
  const updateNodePosition = useCallback((nodeId, dx, dy) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, x: n.x + dx, y: n.y + dy } : n))
    );
  }, []);

  // Set absolute node position directly
  const setNodePosition = useCallback((nodeId, x, y) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, x, y } : n))
    );
  }, []);

  // Cancel connecting wire
  const cancelConnecting = useCallback(() => {
    setConnecting(null);
  }, []);

  // Add or replace edge
  const addEdge = useCallback((edge) => {
    setEdges((prev) => {
      // Remove any existing edge connecting to this same target & targetHandle
      const filtered = prev.filter(
        (e) => !(e.target === edge.target && e.targetHandle === edge.targetHandle)
      );
      return [...filtered, { ...edge, id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` }];
    });
  }, []);

  const removeEdge = useCallback((edgeId) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId((prev) => (prev === edgeId ? null : prev));
  }, []);

  // Disconnect any edge connected to this port
  const disconnectPort = useCallback((nodeId, portId, isOutput) => {
    setEdges((prev) =>
      prev.filter((e) =>
        isOutput
          ? !(e.source === nodeId && e.sourceHandle === portId)
          : !(e.target === nodeId && e.targetHandle === portId)
      )
    );
  }, []);

  // Set whole workflow
  const setWorkflow = useCallback((wf) => {
    if (!wf) return;
    setNodes(wf.nodes || []);
    setEdges(wf.edges || []);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setPan({ x: 100, y: 100 });
    setZoom(1);
  }, []);

  // Canvas pan & zoom handlers
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    newZoom = Math.min(2.0, Math.max(0.25, newZoom));
    setZoom(newZoom);
  }, [zoom]);

  const startCanvasDrag = useCallback((e) => {
    // Only drag with left mouse button on canvas background or middle button
    if (e.button === 0 || e.button === 1) {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }, [pan]);

  const onCanvasMouseMove = useCallback((e) => {
    if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    }

    if (connecting) {
      setConnecting((prev) => (prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null));
    }
  }, [connecting]);

  const onCanvasMouseUp = useCallback(() => {
    isDraggingCanvasRef.current = false;
    if (connecting) {
      setConnecting(null);
    }
  }, [connecting]);

  const resetView = useCallback(() => {
    setPan({ x: 100, y: 100 });
    setZoom(1);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(2.0, z * 1.2));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, z / 1.2));
  }, []);

  return {
    nodes,
    edges,
    pan,
    zoom,
    selectedNodeId,
    selectedEdgeId,
    connecting,
    canvasRef,
    setSelectedNodeId,
    setSelectedEdgeId,
    setConnecting,
    addNode,
    removeNode,
    updateNodeData,
    updateNodePosition,
    setNodePosition,
    cancelConnecting,
    addEdge,
    removeEdge,
    disconnectPort,
    setWorkflow,
    handleWheel,
    startCanvasDrag,
    onCanvasMouseMove,
    onCanvasMouseUp,
    resetView,
    zoomIn,
    zoomOut,
    autoLayout,
    autoConnectAll,
  };
}
