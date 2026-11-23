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

  test('skips disabled node, emits skipped event, and passes upstream inputs downstream', async () => {
    let middleCalled = false;
    const mockAdapters = {
      step1: async () => ({ images_dir: '/tmp/manga/chap1', mangaTitle: 'Test Manga' }),
      step2: async () => {
        middleCalled = true;
        return { images_dir: '/tmp/mutated' };
      },
      step3: async (node, inputs) => ({
        book_file: { path: `${inputs.images_dir}/out.cbz` },
        titleSeen: inputs.mangaTitle,
      }),
    };

    const engine = new WorkflowEngine({ adapters: mockAdapters });
    const events = [];
    const graph = {
      nodes: [
        { id: 'n1', type: 'step1', data: {} },
        { id: 'n2', type: 'step2', data: { disabled: true } },
        { id: 'n3', type: 'step3', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'images_dir', target: 'n2', targetHandle: 'images_dir' },
        { id: 'e2', source: 'n2', sourceHandle: 'images_dir', target: 'n3', targetHandle: 'images_dir' },
      ],
    };

    const res = await engine.run('run_skip_test', graph, (evt) => events.push(evt));
    expect(middleCalled).toBe(false);
    expect(res.status).toBe('completed');
    expect(res.nodeStates.n2.status).toBe('skipped');
    expect(res.nodeStates.n3.status).toBe('completed');
    expect(res.nodeStates.n3.outputData.book_file.path).toBe('/tmp/manga/chap1/out.cbz');
    expect(res.nodeStates.n3.outputData.titleSeen).toBe('Test Manga');
    expect(events.some((e) => e.event === 'skipped' && e.nodeId === 'n2')).toBe(true);
  });

  test('does not re-execute already skipped upstream node when resuming downstream node', async () => {
    let failStep3 = true;
    let skippedNodeCalls = 0;
    const mockAdapters = {
      step1: async () => ({ images_dir: '/tmp/manga/chap1' }),
      step2: async () => {
        skippedNodeCalls += 1;
        return { images_dir: '/tmp/unexpected' };
      },
      step3: async (node, inputs) => {
        if (failStep3) throw new Error('Transient error');
        return { done: true, dir: inputs.images_dir };
      },
    };

    const engine = new WorkflowEngine({ adapters: mockAdapters });
    const graph = {
      nodes: [
        { id: 'n1', type: 'step1', data: {} },
        { id: 'n2', type: 'step2', data: { disabled: true } },
        { id: 'n3', type: 'step3', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'images_dir', target: 'n2', targetHandle: 'images_dir' },
        { id: 'e2', source: 'n2', sourceHandle: 'images_dir', target: 'n3', targetHandle: 'images_dir' },
      ],
    };

    const res1 = await engine.run('run_skip_resume', graph, () => {});
    expect(res1.status).toBe('failed');
    expect(res1.nodeStates.n2.status).toBe('skipped');

    failStep3 = false;
    const res2 = await engine.resume('run_skip_resume', graph, 'n3', () => {});
    expect(skippedNodeCalls).toBe(0);
    expect(res2.status).toBe('completed');
    expect(res2.nodeStates.n2.status).toBe('skipped');
    expect(res2.nodeStates.n3.outputData.dir).toBe('/tmp/manga/chap1');
  });
});
