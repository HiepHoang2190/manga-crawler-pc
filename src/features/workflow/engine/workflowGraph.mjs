import { NODE_DEFINITIONS } from './nodeDefinitions.mjs';

export function isPortCompatible(sourceType, targetType) {
  if (!sourceType || !targetType) return false;
  if (sourceType === 'any' || targetType === 'any') return true;
  return sourceType === targetType;
}

/**
 * Returns the active output ports for a given node.
 * Dynamically filters ports for conditional nodes (e.g. convert_book: targetFormat === 'folder' -> images_dir, else book_file).
 */
export function getNodeOutputs(node, def = NODE_DEFINITIONS[node?.type]) {
  if (!def?.outputs) return [];
  if (node?.type === 'convert_book') {
    const targetFormat = node.data?.targetFormat || 'epub';
    if (targetFormat === 'folder' || targetFormat === 'images') {
      return def.outputs.filter((p) => p.id === 'images_dir');
    }
    return def.outputs.filter((p) => p.id === 'book_file');
  }
  return def.outputs;
}

/** Tier 1 data ports are prioritized over Tier 2 signal ports */
const TIER1_TYPES = new Set(['url', 'chapter_list', 'images_dir', 'book_file']);

function getPortTier(portType) {
  return TIER1_TYPES.has(portType) ? 1 : 2;
}

/**
 * Check if adding edge source→target would create a cycle in the graph.
 * Uses BFS reachability: if target can already reach source, adding source→target creates a cycle.
 */
function wouldCreateCycle(sourceId, targetId, existingEdges) {
  // Build adjacency list from existing edges
  const adj = new Map();
  for (const e of existingEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }

  // BFS from targetId to see if sourceId is reachable
  const visited = new Set();
  const queue = [targetId];
  visited.add(targetId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === sourceId) return true;
    for (const neighbor of adj.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

/**
 * Auto-connect all disconnected compatible ports between nodes.
 * Scans nodes left-to-right (by X coordinate) and greedily matches
 * source outputs to target inputs with Tier 1 priority.
 *
 * @param {Array} nodes - Array of { id, type, x, y, data }
 * @param {Array} edges - Array of existing { source, target, sourceHandle, targetHandle }
 * @returns {{ newEdges: Array }} - The newly created edges (excluding existing ones)
 */
export function autoConnectAllNodes(nodes, edges) {
  if (!nodes || nodes.length < 2) return { newEdges: [] };

  // Sort nodes by X coordinate (left to right)
  const sorted = [...nodes].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

  // Track which input ports are already occupied
  const occupiedInputs = new Set();
  for (const e of edges) {
    occupiedInputs.add(`${e.target}::${e.targetHandle}`);
  }

  const newEdges = [];
  const allEdges = [...edges]; // Running list for cycle detection

  // For each pair of nodes (left to right), try to connect outputs → inputs
  for (let i = 0; i < sorted.length; i++) {
    const srcNode = sorted[i];
    const srcDef = NODE_DEFINITIONS[srcNode.type];
    const srcOutputs = getNodeOutputs(srcNode, srcDef);
    if (!srcOutputs.length) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const tgtNode = sorted[j];
      const tgtDef = NODE_DEFINITIONS[tgtNode.type];
      if (!tgtDef?.inputs?.length) continue;

      // Build candidate pairs sorted by tier priority
      const candidates = [];
      for (const srcPort of srcOutputs) {
        for (const tgtPort of tgtDef.inputs) {
          if (isPortCompatible(srcPort.type, tgtPort.type)) {
            candidates.push({
              srcPort,
              tgtPort,
              tier: Math.min(getPortTier(srcPort.type), getPortTier(tgtPort.type)),
            });
          }
        }
      }
      // Sort: Tier 1 first (lower number = higher priority)
      candidates.sort((a, b) => a.tier - b.tier);

      for (const { srcPort, tgtPort } of candidates) {
        const inputKey = `${tgtNode.id}::${tgtPort.id}`;
        if (occupiedInputs.has(inputKey)) continue;

        // Cycle safety check
        if (wouldCreateCycle(srcNode.id, tgtNode.id, allEdges)) continue;

        const edge = {
          id: `auto_${srcNode.id}_${tgtNode.id}_${srcPort.id}_${tgtPort.id}`,
          source: srcNode.id,
          target: tgtNode.id,
          sourceHandle: srcPort.id,
          targetHandle: tgtPort.id,
        };

        newEdges.push(edge);
        allEdges.push(edge);
        occupiedInputs.add(inputKey);
      }
    }
  }

  return { newEdges };
}

/**
 * Auto-connect a newly added node to the best available source node.
 * Prefers the currently selected node, falls back to the rightmost node.
 *
 * @param {Object} newNode - The newly added node { id, type, x, y, data }
 * @param {Array} existingNodes - All nodes BEFORE this new one was added
 * @param {Array} edges - All existing edges
 * @param {string|null} selectedNodeId - Currently selected node, if any
 * @returns {{ newEdges: Array }} - The newly created edges
 */
export function autoConnectOnAddNode(newNode, existingNodes, edges, selectedNodeId) {
  if (!existingNodes || existingNodes.length === 0) return { newEdges: [] };

  const newDef = NODE_DEFINITIONS[newNode.type];
  if (!newDef?.inputs?.length) return { newEdges: [] };

  // Determine source node: selected → rightmost
  let sourceNode = null;
  if (selectedNodeId) {
    sourceNode = existingNodes.find((n) => n.id === selectedNodeId);
  }
  if (!sourceNode) {
    // Pick the rightmost node by X coordinate
    sourceNode = existingNodes.reduce((best, n) =>
      (n.x ?? 0) > (best.x ?? 0) ? n : best
    , existingNodes[0]);
  }

  const srcDef = NODE_DEFINITIONS[sourceNode.type];
  const srcOutputs = getNodeOutputs(sourceNode, srcDef);
  if (!srcOutputs.length) return { newEdges: [] };

  // Track occupied inputs
  const occupiedInputs = new Set();
  for (const e of edges) {
    occupiedInputs.add(`${e.target}::${e.targetHandle}`);
  }

  const newEdges = [];
  const allEdges = [...edges];

  // Build candidates sorted by tier
  const candidates = [];
  for (const srcPort of srcOutputs) {
    for (const tgtPort of newDef.inputs) {
      if (isPortCompatible(srcPort.type, tgtPort.type)) {
        candidates.push({
          srcPort,
          tgtPort,
          tier: Math.min(getPortTier(srcPort.type), getPortTier(tgtPort.type)),
        });
      }
    }
  }
  candidates.sort((a, b) => a.tier - b.tier);

  for (const { srcPort, tgtPort } of candidates) {
    const inputKey = `${newNode.id}::${tgtPort.id}`;
    if (occupiedInputs.has(inputKey)) continue;

    if (wouldCreateCycle(sourceNode.id, newNode.id, allEdges)) continue;

    const edge = {
      id: `auto_${sourceNode.id}_${newNode.id}_${srcPort.id}_${tgtPort.id}`,
      source: sourceNode.id,
      target: newNode.id,
      sourceHandle: srcPort.id,
      targetHandle: tgtPort.id,
    };

    newEdges.push(edge);
    allEdges.push(edge);
    occupiedInputs.add(inputKey);
  }

  return { newEdges };
}

export function validateGraph(nodes, edges) {
  const errors = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Check edge endpoints
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      errors.push(`Edge nguồn không tồn tại: ${edge.source}`);
    }
    if (!nodeMap.has(edge.target)) {
      errors.push(`Edge đích không tồn tại: ${edge.target}`);
    }
  }

  // Cycle detection via DFS
  const adj = new Map();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    if (adj.has(e.source) && nodeMap.has(e.target)) {
      adj.get(e.source).push(e.target);
    }
  });

  const visited = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
  let hasCycle = false;

  function dfs(u) {
    visited.set(u, 1);
    for (const v of adj.get(u) || []) {
      if (visited.get(v) === 1) {
        hasCycle = true;
        return;
      }
      if (visited.get(v) === 0) {
        dfs(v);
        if (hasCycle) return;
      }
    }
    visited.set(u, 2);
  }

  nodes.forEach((n) => visited.set(n.id, 0));
  for (const node of nodes) {
    if (visited.get(node.id) === 0) {
      dfs(node.id);
      if (hasCycle) break;
    }
  }

  if (hasCycle) {
    errors.push('Đồ thị chứa chu trình lặp (cycle) không hợp lệ');
  }

  return { valid: errors.length === 0, errors };
}

export function topologicalSort(nodes, edges) {
  const inDegree = new Map();
  const adj = new Map();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  });

  edges.forEach((e) => {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, inDegree.get(e.target) + 1);
    }
    if (adj.has(e.source)) {
      adj.get(e.source).push(e.target);
    }
  });

  const queue = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  const sortedNodeIds = [];
  const batches = [];

  let currentBatch = [...queue];
  while (currentBatch.length > 0) {
    batches.push(currentBatch);
    const nextBatch = [];
    for (const u of currentBatch) {
      sortedNodeIds.push(u);
      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) {
          nextBatch.push(v);
        }
      }
    }
    currentBatch = nextBatch;
  }

  return { sortedNodeIds, batches };
}

/**
 * Returns nodes sorted in topological execution order according to graph edges.
 * Unconnected or remaining nodes are appended sorted left-to-right by their X coordinate.
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Array} Sorted nodes
 */
export function getTopologicallyOrderedNodes(nodes = [], edges = []) {
  if (!Array.isArray(nodes) || nodes.length <= 1) return nodes || [];
  try {
    const connectedNodeIds = new Set();
    for (const e of edges || []) {
      if (e?.source) connectedNodeIds.add(e.source);
      if (e?.target) connectedNodeIds.add(e.target);
    }

    const connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
    const disconnectedNodes = nodes
      .filter((n) => !connectedNodeIds.has(n.id))
      .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

    let sortedConnected = [];
    if (connectedNodes.length > 0) {
      const { sortedNodeIds = [] } = topologicalSort(connectedNodes, edges || []);
      const nodeMap = new Map(connectedNodes.map((n) => [n.id, n]));
      sortedConnected = sortedNodeIds.map((id) => nodeMap.get(id)).filter(Boolean);
      // In case of any cycles or unreached connected nodes
      const sortedSet = new Set(sortedNodeIds);
      const remainingConnected = connectedNodes
        .filter((n) => !sortedSet.has(n.id))
        .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
      sortedConnected.push(...remainingConnected);
    }

    return [...sortedConnected, ...disconnectedNodes];
  } catch {
    return nodes;
  }
}

/**
 * Pre-flight validation for workflow execution.
 * Checks for missing required configurations, unconnected required inputs, and cycle errors.
 * Returns an object with:
 * - isValid: boolean (true if workflow can run safely)
 * - nodeErrors: Record<nodeId, string> (specific error per node)
 * - blockingReason: string | null (user-facing message for the Run button)
 */
export function validateWorkflowPreflight(nodes = [], edges = [], options = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return {
      isValid: false,
      nodeErrors: {},
      blockingReason: 'Bảng vẽ chưa có khối nào',
    };
  }

  const nodeErrors = {};
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build incoming edges map per node
  const incomingEdges = new Map();
  nodes.forEach((n) => incomingEdges.set(n.id, []));
  edges.forEach((e) => {
    if (incomingEdges.has(e.target)) {
      incomingEdges.get(e.target).push(e);
    }
  });

  // 1. Check graph structural validity (dangling edges & cycles)
  const graphValidation = validateGraph(nodes, edges);
  if (!graphValidation.valid) {
    const cycleOrEdgeErr = graphValidation.errors[0];
    return {
      isValid: false,
      nodeErrors: {},
      blockingReason: cycleOrEdgeErr,
    };
  }

  // 2. Validate each node's required configuration and required incoming connections
  for (const node of nodes) {
    const def = NODE_DEFINITIONS[node.type] || {};
    const inEdges = incomingEdges.get(node.id) || [];

    // Trigger nodes: check required config
    if (node.type === 'manga_crawler' || node.type === 'manual_trigger') {
      const url = node.data?.defaultUrl?.trim();
      if (!url) {
        nodeErrors[node.id] = 'Chưa nhập URL truyện đầu vào';
      }
    } else if (node.type === 'folder_trigger') {
      const folder = node.data?.folderPath?.trim();
      if (!folder) {
        nodeErrors[node.id] = 'Chưa chọn thư mục truyện nguồn';
      }
    } else {
      // Downstream processing/export nodes: must have required incoming connections
      const requiredInputs = (def.inputs || []).filter((p) => p.type !== 'signal');
      if (requiredInputs.length > 0 && inEdges.length === 0) {
        nodeErrors[node.id] = 'Chưa được kết nối dây đầu vào';
      } else if (node.type === 'send_to_kindle' && options?.isKindleLoggedIn === false) {
        nodeErrors[node.id] = 'Chưa kết nối tài khoản Amazon Send to Kindle';
      } else if (node.type === 'upload_google_drive') {
        const mode = node.data?.uploadMode || 'desktop_sync';
        if (mode === 'desktop_sync') {
          const syncFolder = node.data?.syncFolderPath?.trim();
          if (options?.isGoogleDriveConnected === false && !syncFolder) {
            nodeErrors[node.id] = 'Chưa kết nối thư mục Google Drive trên máy';
          }
        } else if (mode === 'api_token') {
          const token = node.data?.accessToken?.trim();
          if (!token) {
            nodeErrors[node.id] = 'Chưa nhập Access Token Google Drive';
          }
        }
      }
    }
  }

  const errorNodeIds = Object.keys(nodeErrors);
  const isValid = errorNodeIds.length === 0;

  let blockingReason = null;
  if (!isValid) {
    const firstId = errorNodeIds[0];
    const firstNode = nodeMap.get(firstId);
    const firstDef = NODE_DEFINITIONS[firstNode?.type] || {};
    const nodeName = firstNode?.data?.mangaTitle || firstDef.title || firstNode?.type || 'Khối';
    blockingReason = `Khối "${nodeName}": ${nodeErrors[firstId]}`;
  }

  return {
    isValid,
    nodeErrors,
    blockingReason,
  };
}

/**
 * Resolves the system Downloads folder directory from savePath (which may point to <Downloads>/Manga).
 */
export function getDownloadsFolder(savePath = '') {
  if (savePath && typeof savePath === 'string') {
    const clean = savePath.trim().replace(/[/\\]+$/, '');
    if (/[/\\]Manga$/i.test(clean)) {
      return clean.replace(/[/\\]Manga$/i, '');
    }
    return clean;
  }
  return '';
}
