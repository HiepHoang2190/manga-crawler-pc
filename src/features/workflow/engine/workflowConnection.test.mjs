import { isPortCompatible } from './workflowGraph.mjs';

describe('Workflow Port Connection & Replacement Logic', () => {
  // Helper simulating addEdge behavior from useWorkflowCanvas
  function addEdge(prevEdges, newEdge) {
    const filtered = prevEdges.filter(
      (e) => !(e.target === newEdge.target && e.targetHandle === newEdge.targetHandle)
    );
    return [...filtered, { ...newEdge, id: `edge_${Date.now()}_test` }];
  }

  // Helper simulating disconnectPort behavior from useWorkflowCanvas
  function disconnectPort(prevEdges, nodeId, portId, isOutput) {
    return prevEdges.filter((e) =>
      isOutput
        ? !(e.source === nodeId && e.sourceHandle === portId)
        : !(e.target === nodeId && e.targetHandle === portId)
    );
  }

  // Helper simulating connection creation in both drag directions
  function createConnection({ fromType, startNodeId, startPortId, startPortType, dropNodeId, dropPortId, dropPortType, dropDirection }) {
    if (fromType === 'input' && dropDirection === 'output' && startNodeId !== dropNodeId) {
      if (isPortCompatible(dropPortType, startPortType)) {
        return {
          source: dropNodeId,
          sourceHandle: dropPortId,
          target: startNodeId,
          targetHandle: startPortId,
        };
      }
    } else if (fromType !== 'input' && dropDirection === 'input' && startNodeId !== dropNodeId) {
      if (isPortCompatible(startPortType, dropPortType)) {
        return {
          source: startNodeId,
          sourceHandle: startPortId,
          target: dropNodeId,
          targetHandle: dropPortId,
        };
      }
    }
    return null;
  }

  test('Holding and dragging from Target A (input) to Source C (output) creates valid connection C -> A', () => {
    const connection = createConnection({
      fromType: 'input',
      startNodeId: 'node_A',
      startPortId: 'input_A',
      startPortType: 'images_dir',
      dropNodeId: 'node_C',
      dropPortId: 'output_C',
      dropPortType: 'images_dir',
      dropDirection: 'output',
    });

    expect(connection).not.toBeNull();
    expect(connection.source).toBe('node_C');
    expect(connection.sourceHandle).toBe('output_C');
    expect(connection.target).toBe('node_A');
    expect(connection.targetHandle).toBe('input_A');
  });

  test('Connecting Target A to Source C automatically replaces old connection B -> A', () => {
    // Initial state: Node B is connected to Node A
    const initialEdges = [
      { id: 'edge_old', source: 'node_B', sourceHandle: 'output_B', target: 'node_A', targetHandle: 'input_A' },
      { id: 'edge_other', source: 'node_X', sourceHandle: 'out', target: 'node_Y', targetHandle: 'in' },
    ];

    // New connection from Node C to Node A
    const newEdge = {
      source: 'node_C',
      sourceHandle: 'output_C',
      target: 'node_A',
      targetHandle: 'input_A',
    };

    const updatedEdges = addEdge(initialEdges, newEdge);

    // Old edge_old (B -> A) should be removed
    expect(updatedEdges.some((e) => e.source === 'node_B' && e.target === 'node_A')).toBe(false);

    // New edge (C -> A) should be present
    expect(updatedEdges.some((e) => e.source === 'node_C' && e.target === 'node_A')).toBe(true);

    // Unrelated edge (X -> Y) should remain untouched
    expect(updatedEdges.some((e) => e.source === 'node_X' && e.target === 'node_Y')).toBe(true);
    expect(updatedEdges).toHaveLength(2);
  });

  test('Holding and dragging from Source C (output) to Target A (input) also creates valid connection C -> A', () => {
    const connection = createConnection({
      fromType: 'output',
      startNodeId: 'node_C',
      startPortId: 'output_C',
      startPortType: 'chapter_list',
      dropNodeId: 'node_A',
      dropPortId: 'input_A',
      dropPortType: 'chapter_list',
      dropDirection: 'input',
    });

    expect(connection).not.toBeNull();
    expect(connection.source).toBe('node_C');
    expect(connection.sourceHandle).toBe('output_C');
    expect(connection.target).toBe('node_A');
    expect(connection.targetHandle).toBe('input_A');
  });

  test('Prevents connection between incompatible port types', () => {
    const connection = createConnection({
      fromType: 'input',
      startNodeId: 'node_A',
      startPortId: 'input_A',
      startPortType: 'url',
      dropNodeId: 'node_C',
      dropPortId: 'output_C',
      dropPortType: 'images_dir',
      dropDirection: 'output',
    });

    expect(connection).toBeNull();
  });

  test('disconnectPort cleanly unplugs an input or output port', () => {
    const edges = [
      { id: 'e1', source: 'node_B', sourceHandle: 'output_B', target: 'node_A', targetHandle: 'input_A' },
      { id: 'e2', source: 'node_A', sourceHandle: 'output_A', target: 'node_C', targetHandle: 'input_C' },
    ];

    // Disconnect input_A on node_A
    const afterDisconnectInput = disconnectPort(edges, 'node_A', 'input_A', false);
    expect(afterDisconnectInput).toHaveLength(1);
    expect(afterDisconnectInput[0].id).toBe('e2');

    // Disconnect output_A on node_A
    const afterDisconnectOutput = disconnectPort(edges, 'node_A', 'output_A', true);
    expect(afterDisconnectOutput).toHaveLength(1);
    expect(afterDisconnectOutput[0].id).toBe('e1');
  });

  test('PORT_TYPE_LABELS maps all standard types to readable Vietnamese names', async () => {
    const { PORT_TYPE_LABELS } = await import('./nodeDefinitions.mjs');
    expect(PORT_TYPE_LABELS.url).toBe('URL Truyện');
    expect(PORT_TYPE_LABELS.chapter_list).toBe('Danh Sách Chapter');
    expect(PORT_TYPE_LABELS.images_dir).toBe('Thư Mục Ảnh');
    expect(PORT_TYPE_LABELS.book_file).toBe('Tệp Sách (CBZ/PDF)');
    expect(PORT_TYPE_LABELS.signal).toBe('Tín Hiệu Kích Hoạt');
    expect(PORT_TYPE_LABELS.any).toBe('Bất Kỳ');
  });
});
