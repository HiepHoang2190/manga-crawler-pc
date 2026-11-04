/**
 * Workflow DAG Execution Engine
 * Manages run contexts, topological execution, passing outputs, checkpoints, and resume.
 */

class WorkflowEngine {
  constructor({ adapters = {} } = {}) {
    this.adapters = adapters;
    this.runs = new Map(); // runId -> RunContext
    this.abortControllers = new Map(); // runId -> AbortController
  }

  getRun(runId) {
    return this.runs.get(runId) || null;
  }

  stop(runId) {
    if (!runId) {
      return false;
    }
    if (runId === 'all') {
      let stoppedAny = false;
      for (const [id, controller] of this.abortControllers.entries()) {
        controller.abort();
        const run = this.runs.get(id);
        if (run) {
          run.status = 'stopped';
        }
        stoppedAny = true;
      }
      return stoppedAny;
    }
    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
      const run = this.runs.get(runId);
      if (run) {
        run.status = 'stopped';
      }
      return true;
    }
    return false;
  }

  _computeTopologicalOrder(nodes, edges) {
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
    const sorted = [];

    while (queue.length > 0) {
      const u = queue.shift();
      sorted.push(u);
      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    return sorted;
  }

  async run(runId, graph, onEvent = () => {}) {
    const { nodes = [], edges = [] } = graph;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const sortedIds = this._computeTopologicalOrder(nodes, edges);

    const runContext = {
      runId,
      status: 'running',
      startTime: Date.now(),
      nodeStates: {},
    };

    nodes.forEach((n) => {
      runContext.nodeStates[n.id] = {
        status: 'idle',
        outputData: null,
        error: null,
      };
    });

    this.runs.set(runId, runContext);
    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    return this._executeNodes(runContext, sortedIds, nodeMap, edges, onEvent, abortController.signal);
  }

  async resume(runId, graph, fromNodeId, onEvent = () => {}) {
    let runContext = this.runs.get(runId);
    const { nodes = [], edges = [] } = graph;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const sortedIds = this._computeTopologicalOrder(nodes, edges);

    if (!runContext) {
      runContext = {
        runId,
        status: 'running',
        startTime: Date.now(),
        nodeStates: {},
      };
      nodes.forEach((n) => {
        runContext.nodeStates[n.id] = {
          status: 'idle',
          outputData: null,
          error: null,
        };
      });
      this.runs.set(runId, runContext);
    } else {
      runContext.status = 'running';
    }

    // Reset status for fromNodeId and all downstream dependent nodes
    const downstream = new Set();
    function collectDownstream(nodeId) {
      downstream.add(nodeId);
      edges.filter((e) => e.source === nodeId).forEach((e) => collectDownstream(e.target));
    }
    collectDownstream(fromNodeId);

    downstream.forEach((nid) => {
      if (runContext.nodeStates[nid]) {
        runContext.nodeStates[nid].status = 'idle';
        runContext.nodeStates[nid].error = null;
      }
    });

    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    return this._executeNodes(runContext, sortedIds, nodeMap, edges, onEvent, abortController.signal);
  }

  async _executeNodes(runContext, sortedIds, nodeMap, edges, onEvent, signal) {
    const incomingEdges = new Map();
    edges.forEach((e) => {
      if (!incomingEdges.has(e.target)) incomingEdges.set(e.target, []);
      incomingEdges.get(e.target).push(e);
    });

    for (const nodeId of sortedIds) {
      if (signal.aborted) {
        runContext.status = 'stopped';
        break;
      }

      const state = runContext.nodeStates[nodeId];
      if (state && state.status === 'completed') {
        // Node already completed in previous run / checkpoint
        continue;
      }

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // Gather inputs from incoming edges
      const inputs = {};
      const edgesIn = incomingEdges.get(nodeId) || [];
      for (const edge of edgesIn) {
        const parentState = runContext.nodeStates[edge.source];
        if (parentState && parentState.outputData) {
          const out = parentState.outputData;
          const val = (edge.sourceHandle && typeof out === 'object' && out !== null && edge.sourceHandle in out)
            ? out[edge.sourceHandle]
            : out;

          if (edge.targetHandle) {
            inputs[edge.targetHandle] = val;
          } else {
            Object.assign(inputs, typeof val === 'object' && val !== null ? val : { value: val });
          }

          if (typeof out === 'object' && out !== null) {
            if (!inputs.mangaTitle && out.mangaTitle) inputs.mangaTitle = out.mangaTitle;
            if (!inputs.coverUrl && out.coverUrl) inputs.coverUrl = out.coverUrl;
            if (!inputs.url && out.url) inputs.url = out.url;
            if (!inputs.chapter_list && out.chapter_list) inputs.chapter_list = out.chapter_list;
            if (!inputs.images_dir && out.images_dir) inputs.images_dir = out.images_dir;
            if (!inputs.baseSaveDir && out.baseSaveDir) inputs.baseSaveDir = out.baseSaveDir;
            if (!inputs.siteId && out.siteId) inputs.siteId = out.siteId;
            if (!inputs.mangaUrl && out.mangaUrl) inputs.mangaUrl = out.mangaUrl;
          }
        }
      }

      state.status = 'running';
      state.startedAt = Date.now();
      onEvent({ runId: runContext.runId, nodeId, event: 'running', timestamp: Date.now() });

      try {
        const adapter = this.adapters[node.type];
        if (!adapter) {
          throw new Error(`Không tìm thấy adapter cho loại node: ${node.type}`);
        }

        const outputData = await adapter(node, inputs, (progress) => {
          onEvent({ runId: runContext.runId, nodeId, event: 'progress', data: progress });
        }, signal);

        state.status = 'completed';
        state.outputData = outputData;
        state.completedAt = Date.now();
        onEvent({ runId: runContext.runId, nodeId, event: 'completed', data: outputData, timestamp: Date.now() });
      } catch (err) {
        state.error = err.message || String(err);
        state.status = 'failed';
        state.completedAt = Date.now();
        onEvent({ runId: runContext.runId, nodeId, event: 'failed', error: state.error, timestamp: Date.now() });

        if (!node.data?.continueOnError) {
          runContext.status = 'failed';
          runContext.endTime = Date.now();
          this.abortControllers.delete(runContext.runId);
          onEvent({
            runId: runContext.runId,
            event: 'run_error',
            nodeId,
            error: state.error,
            timestamp: Date.now(),
          });
          return runContext;
        }
      }
    }

    if (runContext.status === 'running') {
      runContext.status = 'completed';
      runContext.endTime = Date.now();

      let targetPath = null;
      for (const state of Object.values(runContext.nodeStates || {})) {
        if (state.outputData?.book_file?.path) {
          targetPath = state.outputData.book_file.path;
        } else if (state.outputData?.images_dir) {
          targetPath = state.outputData.images_dir;
        }
      }

      onEvent({
        runId: runContext.runId,
        event: 'all_completed',
        targetPath,
        timestamp: Date.now(),
      });
    } else if (runContext.status === 'stopped') {
      onEvent({
        runId: runContext.runId,
        event: 'stopped',
        timestamp: Date.now(),
      });
    }

    this.abortControllers.delete(runContext.runId);
    return runContext;
  }
}

module.exports = { WorkflowEngine };
