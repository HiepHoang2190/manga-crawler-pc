import { validateGraph, topologicalSort, isPortCompatible, validateWorkflowPreflight, getDownloadsFolder, getNodeOutputs } from './workflowGraph.mjs';

describe('workflowGraph engine', () => {
  describe('isPortCompatible', () => {
    test('returns true when types match exactly', () => {
      expect(isPortCompatible('images_dir', 'images_dir')).toBe(true);
      expect(isPortCompatible('url', 'url')).toBe(true);
      expect(isPortCompatible('book_file', 'book_file')).toBe(true);
    });

    test('returns true when either side is any', () => {
      expect(isPortCompatible('any', 'images_dir')).toBe(true);
      expect(isPortCompatible('url', 'any')).toBe(true);
    });

    test('returns false when types are different and neither is any', () => {
      expect(isPortCompatible('url', 'images_dir')).toBe(false);
      expect(isPortCompatible('chapter_list', 'book_file')).toBe(false);
      expect(isPortCompatible(null, 'url')).toBe(false);
      expect(isPortCompatible('url', undefined)).toBe(false);
    });
  });

  describe('validateGraph', () => {
    test('validates an empty or valid linear graph', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ];
      const result = validateGraph(nodes, edges);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects dangling edges with non-existent nodes', () => {
      const nodes = [{ id: 'a' }];
      const edges = [{ source: 'a', target: 'non_existent' }];
      const result = validateGraph(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('non_existent');
    });

    test('detects direct 2-node cycle', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ];
      const result = validateGraph(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('chu trình') || e.toLowerCase().includes('cycle'))).toBe(true);
    });

    test('detects complex 3-node cycle', () => {
      const nodes = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const edges = [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
        { source: '3', target: '1' },
      ];
      const result = validateGraph(nodes, edges);
      expect(result.valid).toBe(false);
    });
  });

  describe('topologicalSort', () => {
    test('sorts linear pipeline in correct order', () => {
      const nodes = [{ id: 'download' }, { id: 'trigger' }, { id: 'export' }];
      const edges = [
        { source: 'trigger', target: 'download' },
        { source: 'download', target: 'export' },
      ];
      const { sortedNodeIds, batches } = topologicalSort(nodes, edges);
      expect(sortedNodeIds).toEqual(['trigger', 'download', 'export']);
      expect(batches).toEqual([['trigger'], ['download'], ['export']]);
    });

    test('handles branching graph with parallel nodes in the same batch', () => {
      const nodes = [{ id: 'trigger' }, { id: 'split' }, { id: 'deskew' }, { id: 'export' }];
      const edges = [
        { source: 'trigger', target: 'split' },
        { source: 'trigger', target: 'deskew' },
        { source: 'split', target: 'export' },
        { source: 'deskew', target: 'export' },
      ];
      const { sortedNodeIds, batches } = topologicalSort(nodes, edges);
      expect(batches[0]).toEqual(['trigger']);
      expect(batches[1].sort()).toEqual(['deskew', 'split']);
      expect(batches[2]).toEqual(['export']);
      expect(sortedNodeIds.indexOf('trigger')).toBeLessThan(sortedNodeIds.indexOf('split'));
      expect(sortedNodeIds.indexOf('trigger')).toBeLessThan(sortedNodeIds.indexOf('deskew'));
      expect(sortedNodeIds.indexOf('split')).toBeLessThan(sortedNodeIds.indexOf('export'));
      expect(sortedNodeIds.indexOf('deskew')).toBeLessThan(sortedNodeIds.indexOf('export'));
    });
  });

  describe('autoConnectAllNodes', () => {
    test('connects linear chain of compatible nodes left-to-right by X coordinate', async () => {
      const { autoConnectAllNodes } = await import('./workflowGraph.mjs');
      const { NODE_DEFINITIONS } = await import('./nodeDefinitions.mjs');

      // manual_trigger outputs url, chapter_selector takes url and outputs chapter_list,
      // downloader takes chapter_list and outputs images_dir, export_cbz takes images_dir
      const nodes = [
        { id: 'n1', type: 'manual_trigger', x: 0, y: 100, data: {} },
        { id: 'n2', type: 'chapter_selector', x: 300, y: 100, data: {} },
        { id: 'n3', type: 'downloader', x: 600, y: 100, data: {} },
        { id: 'n4', type: 'export_cbz', x: 900, y: 100, data: {} },
      ];
      const edges = [];

      const result = autoConnectAllNodes(nodes, edges);
      // Should create 3 edges: n1→n2 (url), n2→n3 (chapter_list), n3→n4 (images_dir)
      expect(result.newEdges).toHaveLength(3);

      // Verify edge types
      const e1 = result.newEdges.find((e) => e.source === 'n1' && e.target === 'n2');
      expect(e1).toBeDefined();
      expect(e1.sourceHandle).toBe('url');
      expect(e1.targetHandle).toBe('url');

      const e2 = result.newEdges.find((e) => e.source === 'n2' && e.target === 'n3');
      expect(e2).toBeDefined();
      expect(e2.sourceHandle).toBe('chapter_list');
      expect(e2.targetHandle).toBe('chapter_list');

      const e3 = result.newEdges.find((e) => e.source === 'n3' && e.target === 'n4');
      expect(e3).toBeDefined();
      expect(e3.sourceHandle).toBe('images_dir');
      expect(e3.targetHandle).toBe('images_dir');
    });

    test('respects port type compatibility (does not connect mismatched types)', async () => {
      const { autoConnectAllNodes } = await import('./workflowGraph.mjs');

      // manual_trigger outputs url, export_cbz takes images_dir — NOT compatible
      const nodes = [
        { id: 'n1', type: 'manual_trigger', x: 0, y: 100, data: {} },
        { id: 'n2', type: 'export_cbz', x: 300, y: 100, data: {} },
      ];
      const edges = [];

      const result = autoConnectAllNodes(nodes, edges);
      // url → images_dir is not compatible, so no data edges should be created
      expect(result.newEdges).toHaveLength(0);
    });

    test('does not overwrite existing edges on occupied input ports', async () => {
      const { autoConnectAllNodes } = await import('./workflowGraph.mjs');

      const nodes = [
        { id: 'n1', type: 'downloader', x: 0, y: 100, data: {} },
        { id: 'n2', type: 'downloader', x: 300, y: 100, data: {} },
        { id: 'n3', type: 'export_cbz', x: 600, y: 100, data: {} },
      ];
      // n1 is already connected to n3's images_dir input
      const edges = [
        { id: 'e1', source: 'n1', target: 'n3', sourceHandle: 'images_dir', targetHandle: 'images_dir' },
      ];

      const result = autoConnectAllNodes(nodes, edges);
      // n3's images_dir input is already occupied, so n2 should not connect to n3's images_dir
      const edgeToN3 = result.newEdges.filter((e) => e.target === 'n3' && e.targetHandle === 'images_dir');
      expect(edgeToN3).toHaveLength(0);
    });

    test('prevents cycles in the graph', async () => {
      const { autoConnectAllNodes, validateGraph } = await import('./workflowGraph.mjs');

      // Two nodes with same type that could form bidirectional connection
      const nodes = [
        { id: 'n1', type: 'deskew', x: 0, y: 100, data: {} },
        { id: 'n2', type: 'deskew', x: 300, y: 100, data: {} },
      ];
      const edges = [
        // Already an edge from n2 to n1 (reverse)
        { id: 'e1', source: 'n2', target: 'n1', sourceHandle: 'images_dir', targetHandle: 'images_dir' },
      ];

      const result = autoConnectAllNodes(nodes, edges);
      // Should not create n1→n2 because that would require n2→n1 already exists, creating a cycle
      // Actually n1→n2 would create: n2→n1 + n1→n2 = cycle
      const allEdges = [...edges, ...result.newEdges];
      const graphResult = validateGraph(nodes, allEdges);
      expect(graphResult.valid).toBe(true);
    });

    test('prioritizes Tier 1 data ports over Tier 2 signal ports', async () => {
      const { autoConnectAllNodes } = await import('./workflowGraph.mjs');
      const { NODE_DEFINITIONS } = await import('./nodeDefinitions.mjs');

      NODE_DEFINITIONS._test_multi_port = {
        type: '_test_multi_port',
        inputs: [],
        outputs: [
          { id: 'sig', type: 'signal', label: 'Signal' },
          { id: 'img', type: 'images_dir', label: 'Images' },
        ],
      };
      const nodes = [
        { id: 'n1', type: '_test_multi_port', x: 0, y: 100, data: {} },
        { id: 'n2', type: 'trash_cleanup', x: 300, y: 100, data: {} },
      ];
      const edges = [];

      const result = autoConnectAllNodes(nodes, edges);
      delete NODE_DEFINITIONS._test_multi_port;

      expect(result.newEdges.length).toBeGreaterThanOrEqual(1);
      const firstEdge = result.newEdges[0];
      expect(firstEdge.sourceHandle).toBe('img');
    });
  });

  describe('autoConnectOnAddNode', () => {
    test('connects new node to selected source node if compatible', async () => {
      const { autoConnectOnAddNode } = await import('./workflowGraph.mjs');

      const existingNodes = [
        { id: 'n1', type: 'downloader', x: 0, y: 100, data: {} },
      ];
      const newNode = { id: 'n2', type: 'export_cbz', x: 300, y: 100, data: {} };
      const edges = [];
      const selectedNodeId = 'n1';

      const result = autoConnectOnAddNode(newNode, existingNodes, edges, selectedNodeId);
      expect(result.newEdges.length).toBeGreaterThanOrEqual(1);
      // Should connect n1 (images_dir output) → n2 (images_dir input)
      const edge = result.newEdges.find((e) => e.source === 'n1' && e.target === 'n2');
      expect(edge).toBeDefined();
      expect(edge.sourceHandle).toBe('images_dir');
      expect(edge.targetHandle).toBe('images_dir');
    });

    test('falls back to rightmost node when no node is selected', async () => {
      const { autoConnectOnAddNode } = await import('./workflowGraph.mjs');

      const existingNodes = [
        { id: 'n1', type: 'manual_trigger', x: 0, y: 100, data: {} },
        { id: 'n2', type: 'chapter_selector', x: 300, y: 100, data: {} },
      ];
      const newNode = { id: 'n3', type: 'downloader', x: 600, y: 100, data: {} };
      const edges = [
        { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'url', targetHandle: 'url' },
      ];
      const selectedNodeId = null;

      const result = autoConnectOnAddNode(newNode, existingNodes, edges, selectedNodeId);
      // Should connect to rightmost node n2 (chapter_list output → chapter_list input)
      expect(result.newEdges.length).toBeGreaterThanOrEqual(1);
      const edge = result.newEdges.find((e) => e.source === 'n2' && e.target === 'n3');
      expect(edge).toBeDefined();
    });

    test('returns empty array if no compatible port exists', async () => {
      const { autoConnectOnAddNode } = await import('./workflowGraph.mjs');

      // manual_trigger outputs url, but send_to_kindle only accepts book_file
      const existingNodes = [
        { id: 'n1', type: 'manual_trigger', x: 0, y: 100, data: {} },
      ];
      const newNode = { id: 'n2', type: 'send_to_kindle', x: 300, y: 100, data: {} };
      const edges = [];
      const selectedNodeId = 'n1';

      const result = autoConnectOnAddNode(newNode, existingNodes, edges, selectedNodeId);
      expect(result.newEdges).toHaveLength(0);
    });
  });

  describe('NODE_DEFINITIONS upscale and compress nodes', () => {
    test('defines image_upscale node properly with category, inputs, outputs, and defaultData', async () => {
      const { NODE_DEFINITIONS } = await import('./nodeDefinitions.mjs');
      const def = NODE_DEFINITIONS.image_upscale;
      expect(def).toBeDefined();
      expect(def.type).toBe('image_upscale');
      expect(def.category).toBe('image');
      expect(def.inputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(def.outputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(def.outputs.length).toBe(1);
      expect(def.defaultData).toMatchObject({
        engine: 'mangajanai',
        model: 'mangajanai-2x-1600p',
        scale: 2,
        inPlace: true,
      });
    });

    test('defines image_compress node properly with category, inputs, outputs, and defaultData', async () => {
      const { NODE_DEFINITIONS } = await import('./nodeDefinitions.mjs');
      const def = NODE_DEFINITIONS.image_compress;
      expect(def).toBeDefined();
      expect(def.type).toBe('image_compress');
      expect(def.category).toBe('image');
      expect(def.inputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(def.outputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(def.outputs.length).toBe(1);
      expect(def.defaultData).toMatchObject({
        format: 'original',
        quality: 90,
        resizeEnabled: false,
        inPlace: true,
      });
    });

    test('defines convert_book node properly with inputs, outputs, and defaultData', async () => {
      const { NODE_DEFINITIONS } = await import('./nodeDefinitions.mjs');
      const def = NODE_DEFINITIONS.convert_book;
      expect(def).toBeDefined();
      expect(def.type).toBe('convert_book');
      expect(def.inputs.some((p) => p.type === 'book_file')).toBe(true);
      expect(def.outputs.some((p) => p.type === 'book_file')).toBe(true);
      expect(def.outputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(def.defaultData).toMatchObject({
        targetFormat: 'epub',
        outputDir: '',
        rotateDoublePage: false,
      });
    });

    test('defines manga_crawler trigger node properly with images_dir output and defaultData', async () => {
      const { NODE_DEFINITIONS } = await import('./nodeDefinitions.mjs');
      const def = NODE_DEFINITIONS.manga_crawler;
      expect(def).toBeDefined();
      expect(def.type).toBe('manga_crawler');
      expect(def.category).toBe('trigger');
      expect(def.inputs).toEqual([]);
      expect(def.outputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(def.defaultData).toMatchObject({
        defaultUrl: '',
        strategy: 'all',
        latestCount: 1,
        rangeValue: '',
        outputBaseDir: '',
        concurrency: 3,
        retryLimit: 3,
      });
    });
  });

  describe('getNodeOutputs', () => {
    test('filters convert_book outputs dynamically based on targetFormat', () => {
      const epubNode = { type: 'convert_book', data: { targetFormat: 'epub' } };
      const epubOutputs = getNodeOutputs(epubNode);
      expect(epubOutputs.length).toBe(1);
      expect(epubOutputs[0].id).toBe('book_file');
      expect(epubOutputs[0].type).toBe('book_file');

      const mobiNode = { type: 'convert_book', data: { targetFormat: 'mobi' } };
      const mobiOutputs = getNodeOutputs(mobiNode);
      expect(mobiOutputs.length).toBe(1);
      expect(mobiOutputs[0].id).toBe('book_file');

      const folderNode = { type: 'convert_book', data: { targetFormat: 'folder' } };
      const folderOutputs = getNodeOutputs(folderNode);
      expect(folderOutputs.length).toBe(1);
      expect(folderOutputs[0].id).toBe('images_dir');
      expect(folderOutputs[0].type).toBe('images_dir');
    });

    test('returns standard outputs for non-conditional nodes', () => {
      const upscaleNode = { type: 'image_upscale', data: {} };
      const outputs = getNodeOutputs(upscaleNode);
      expect(outputs.some((p) => p.type === 'images_dir')).toBe(true);
      expect(outputs.length).toBe(1);
    });
  });

  describe('validateWorkflowPreflight', () => {
    test('returns invalid when canvas has no nodes', () => {
      const result = validateWorkflowPreflight([], []);
      expect(result.isValid).toBe(false);
      expect(result.blockingReason).toBe('Bảng vẽ chưa có khối nào');
      expect(result.nodeErrors).toEqual({});
    });

    test('flags trigger manga_crawler when defaultUrl is missing or empty', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: '' } },
      ];
      const result = validateWorkflowPreflight(nodes, []);
      expect(result.isValid).toBe(false);
      expect(result.nodeErrors['mc_1']).toBe('Chưa nhập URL truyện đầu vào');
      expect(result.blockingReason).toContain('Chưa nhập URL truyện đầu vào');
    });

    test('flags folder_trigger when folderPath is missing or empty', () => {
      const nodes = [
        { id: 'ft_1', type: 'folder_trigger', data: { folderPath: '   ' } },
      ];
      const result = validateWorkflowPreflight(nodes, []);
      expect(result.isValid).toBe(false);
      expect(result.nodeErrors['ft_1']).toBe('Chưa chọn thư mục truyện nguồn');
    });

    test('flags downstream node without incoming connection', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
      ];
      // exp_1 is not connected to mc_1
      const result = validateWorkflowPreflight(nodes, []);
      expect(result.isValid).toBe(false);
      expect(result.nodeErrors['exp_1']).toBe('Chưa được kết nối dây đầu vào');
      expect(result.nodeErrors['mc_1']).toBeUndefined();
    });

    test('passes validation when trigger has URL and downstream nodes are connected', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
      ];
      const edges = [
        { source: 'mc_1', sourceHandle: 'images_dir', target: 'exp_1', targetHandle: 'images_dir' },
      ];
      const result = validateWorkflowPreflight(nodes, edges);
      expect(result.isValid).toBe(true);
      expect(result.nodeErrors).toEqual({});
      expect(result.blockingReason).toBeNull();
    });

    test('flags send_to_kindle when Amazon account is not connected', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
        { id: 'knd_1', type: 'send_to_kindle', data: {} },
      ];
      const edges = [
        { source: 'mc_1', target: 'exp_1' },
        { source: 'exp_1', target: 'knd_1' },
      ];
      const result = validateWorkflowPreflight(nodes, edges, { isKindleLoggedIn: false });
      expect(result.isValid).toBe(false);
      expect(result.nodeErrors['knd_1']).toBe('Chưa kết nối tài khoản Amazon Send to Kindle');
    });

    test('flags upload_google_drive (desktop_sync) when Google Drive folder is not connected', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
        { id: 'gd_1', type: 'upload_google_drive', data: { uploadMode: 'desktop_sync', syncFolderPath: '' } },
      ];
      const edges = [
        { source: 'mc_1', target: 'exp_1' },
        { source: 'exp_1', target: 'gd_1' },
      ];
      const result = validateWorkflowPreflight(nodes, edges, { isGoogleDriveConnected: false });
      expect(result.isValid).toBe(false);
      expect(result.nodeErrors['gd_1']).toBe('Chưa kết nối thư mục Google Drive trên máy');
    });

    test('passes upload_google_drive (desktop_sync) when connected via options or syncFolderPath', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
        { id: 'gd_1', type: 'upload_google_drive', data: { uploadMode: 'desktop_sync', syncFolderPath: '/mock/gdrive' } },
      ];
      const edges = [
        { source: 'mc_1', target: 'exp_1' },
        { source: 'exp_1', target: 'gd_1' },
      ];
      const result = validateWorkflowPreflight(nodes, edges, { isGoogleDriveConnected: true });
      expect(result.isValid).toBe(true);
      expect(result.nodeErrors['gd_1']).toBeUndefined();
    });

    test('flags upload_google_drive (api_token) when accessToken is missing', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
        { id: 'gd_1', type: 'upload_google_drive', data: { uploadMode: 'api_token', accessToken: '' } },
      ];
      const edges = [
        { source: 'mc_1', target: 'exp_1' },
        { source: 'exp_1', target: 'gd_1' },
      ];
      const result = validateWorkflowPreflight(nodes, edges);
      expect(result.isValid).toBe(false);
      expect(result.nodeErrors['gd_1']).toBe('Chưa nhập Access Token Google Drive');
    });

    test('passes upload_google_drive (api_token) when accessToken is present', () => {
      const nodes = [
        { id: 'mc_1', type: 'manga_crawler', data: { defaultUrl: 'https://example.com/manga' } },
        { id: 'exp_1', type: 'export_cbz', data: {} },
        { id: 'gd_1', type: 'upload_google_drive', data: { uploadMode: 'api_token', accessToken: 'ya29.sample_valid_token' } },
      ];
      const edges = [
        { source: 'mc_1', target: 'exp_1' },
        { source: 'exp_1', target: 'gd_1' },
      ];
      const result = validateWorkflowPreflight(nodes, edges);
      expect(result.isValid).toBe(true);
      expect(result.nodeErrors['gd_1']).toBeUndefined();
    });

    test('flags cycle error in graph', () => {
      const nodes = [
        { id: 'a', type: 'duplicate_cleaner', data: {} },
        { id: 'b', type: 'duplicate_cleaner', data: {} },
      ];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ];
      const result = validateWorkflowPreflight(nodes, edges);
      expect(result.isValid).toBe(false);
      expect(result.blockingReason).toMatch(/chu trình|cycle/i);
    });
  });

  describe('getDownloadsFolder', () => {
    test('extracts parent Downloads folder from Manga subpath', () => {
      expect(getDownloadsFolder('/Users/test/Downloads/Manga')).toBe('/Users/test/Downloads');
      expect(getDownloadsFolder('C:\\Users\\test\\Downloads\\Manga')).toBe('C:\\Users\\test\\Downloads');
      expect(getDownloadsFolder('/Users/test/Downloads/manga/')).toBe('/Users/test/Downloads');
    });

    test('returns direct Downloads folder as is', () => {
      expect(getDownloadsFolder('/Users/test/Downloads')).toBe('/Users/test/Downloads');
      expect(getDownloadsFolder('C:\\Downloads')).toBe('C:\\Downloads');
    });

    test('handles empty or non-string input safely', () => {
      expect(getDownloadsFolder('')).toBe('');
      expect(getDownloadsFolder(null)).toBe('');
      expect(getDownloadsFolder(undefined)).toBe('');
    });
  });

  describe('Workflow UI styling compliance (No Underline rule)', () => {
    test('WorkflowInspector obeys Modern Text Links & Action Buttons Standards (no underline/hover:underline)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve('src/features/workflow/components/WorkflowInspector.jsx');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(/\bhover:underline\b/);
      expect(content).not.toMatch(/\bunderline\b/);
    });
  });

  describe('WorkflowLogConsole display logic', () => {
    test('WorkflowStudio renders WorkflowLogConsole conditionally on isConsoleOpen alone', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const studioPath = path.resolve('src/features/workflow/components/WorkflowStudio.jsx');
      const content = fs.readFileSync(studioPath, 'utf8');
      expect(content).toContain('{isConsoleOpen && (\n            <WorkflowLogConsole');
      expect(content).not.toMatch(/isRunning\s*\|\|\s*isCompleted/);
    });
  });
});

