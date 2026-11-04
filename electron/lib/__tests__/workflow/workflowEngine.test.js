const { WorkflowEngine } = require('../../workflow/workflowEngine');

describe('WorkflowEngine', () => {
  test('executes a linear 2-node graph and passes data across edges', async () => {
    const mockAdapters = {
      manual_trigger: async (node) => ({ url: 'https://example.com/one-piece' }),
      chapter_selector: async (node, inputs) => ({
        chapter_list: [{ id: 'c1', title: 'Chapter 1', url: `${inputs.url}/c1` }],
      }),
    };

    const engine = new WorkflowEngine({ adapters: mockAdapters });
    const events = [];
    const graph = {
      nodes: [
        { id: 'n1', type: 'manual_trigger', data: {} },
        { id: 'n2', type: 'chapter_selector', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'url', target: 'n2', targetHandle: 'url' },
      ],
    };

    const result = await engine.run('run_test_1', graph, (evt) => events.push(evt));
    expect(result.status).toBe('completed');
    expect(result.nodeStates.n1.status).toBe('completed');
    expect(result.nodeStates.n2.status).toBe('completed');
    expect(result.nodeStates.n2.outputData.chapter_list[0].url).toBe('https://example.com/one-piece/c1');
    expect(events.some((e) => e.nodeId === 'n1' && e.event === 'completed')).toBe(true);
    expect(events.some((e) => e.nodeId === 'n2' && e.event === 'completed')).toBe(true);
  });

  test('records failed status on error and supports resuming from failed node with checkpoint', async () => {
    let failStep2 = true;
    const mockAdapters = {
      step1: async () => ({ value: 10 }),
      step2: async (node, inputs) => {
        if (failStep2) throw new Error('Simulated network failure');
        return { value: inputs.value * 2 };
      },
    };

    const engine = new WorkflowEngine({ adapters: mockAdapters });
    const graph = {
      nodes: [
        { id: 'n1', type: 'step1', data: {} },
        { id: 'n2', type: 'step2', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'value', target: 'n2', targetHandle: 'value' },
      ],
    };

    // First run: fails at step2
    const res1 = await engine.run('run_fail_test', graph, () => {});
    expect(res1.status).toBe('failed');
    expect(res1.nodeStates.n1.status).toBe('completed');
    expect(res1.nodeStates.n2.status).toBe('failed');
    expect(res1.nodeStates.n2.error).toContain('Simulated network failure');

    // Second run: resume from failed step2
    failStep2 = false;
    const res2 = await engine.resume('run_fail_test', graph, 'n2', () => {});
    expect(res2.status).toBe('completed');
    expect(res2.nodeStates.n1.status).toBe('completed');
    expect(res2.nodeStates.n2.status).toBe('completed');
    expect(res2.nodeStates.n2.outputData.value).toBe(20);
  });

  test('honors continueOnError flag on node', async () => {
    const mockAdapters = {
      step1: async () => { throw new Error('Non-fatal warning'); },
      step2: async () => ({ finished: true }),
    };

    const engine = new WorkflowEngine({ adapters: mockAdapters });
    const graph = {
      nodes: [
        { id: 'n1', type: 'step1', data: { continueOnError: true } },
        { id: 'n2', type: 'step2', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
      ],
    };

    const res = await engine.run('run_continue_test', graph, () => {});
    expect(res.status).toBe('completed');
    expect(res.nodeStates.n1.status).toBe('failed');
    expect(res.nodeStates.n2.status).toBe('completed');
    expect(res.nodeStates.n2.outputData.finished).toBe(true);
  });

  test('emits run_error event when a node fails without continueOnError', async () => {
    const mockAdapters = {
      step_fail: async () => {
        throw new Error('Chưa nhập URL truyện đầu vào');
      },
    };

    const engine = new WorkflowEngine({ adapters: mockAdapters });
    const events = [];
    const graph = {
      nodes: [{ id: 'n1', type: 'step_fail', data: {} }],
      edges: [],
    };

    const res = await engine.run('run_err_event_test', graph, (evt) => events.push(evt));
    expect(res.status).toBe('failed');
    expect(events.some((e) => e.event === 'failed' && e.nodeId === 'n1')).toBe(true);
    expect(events.some((e) => e.event === 'run_error' && e.nodeId === 'n1')).toBe(true);
  });
});
