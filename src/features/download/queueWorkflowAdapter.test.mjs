import {
  isWorkflowCompatibleWithQueue,
  prepareQueueWorkflowGraph,
} from './queueWorkflowAdapter.js';

describe('queueWorkflowAdapter', () => {
  describe('isWorkflowCompatibleWithQueue', () => {
    test('returns false for null, undefined, empty object, or non-array nodes', () => {
      expect(isWorkflowCompatibleWithQueue(null)).toBe(false);
      expect(isWorkflowCompatibleWithQueue(undefined)).toBe(false);
      expect(isWorkflowCompatibleWithQueue({})).toBe(false);
      expect(isWorkflowCompatibleWithQueue({ nodes: null })).toBe(false);
      expect(isWorkflowCompatibleWithQueue({ nodes: 'invalid' })).toBe(false);
      expect(isWorkflowCompatibleWithQueue({ nodes: [] })).toBe(false);
    });

    test('returns true for workflow containing folder_trigger node', () => {
      const wf = {
        id: 'wf_folder',
        nodes: [
          { id: 'node_1', type: 'folder_trigger', data: { folderPath: '' } },
          { id: 'node_2', type: 'export_cbz', data: {} },
        ],
        edges: [{ source: 'node_1', target: 'node_2' }],
      };
      expect(isWorkflowCompatibleWithQueue(wf)).toBe(true);
    });

    test('returns false for workflow with only manual_trigger (URL input)', () => {
      const wf = {
        id: 'wf_manual',
        nodes: [
          { id: 'node_1', type: 'manual_trigger', category: 'trigger', data: { defaultUrl: '' } },
          { id: 'node_2', type: 'downloader', data: {} },
        ],
        edges: [{ source: 'node_1', target: 'node_2' }],
      };
      expect(isWorkflowCompatibleWithQueue(wf)).toBe(false);
    });

    test('returns true for workflow with compatible custom trigger node', () => {
      const wf = {
        id: 'wf_custom_trigger',
        nodes: [
          { id: 'node_1', type: 'local_batch_trigger', category: 'trigger', data: {} },
          { id: 'node_2', type: 'export_cbz', data: {} },
        ],
        edges: [{ source: 'node_1', target: 'node_2' }],
      };
      expect(isWorkflowCompatibleWithQueue(wf)).toBe(true);
    });

    test('returns true for workflow with entry node handling images_dir', () => {
      const wf = {
        id: 'wf_entry_cleaner',
        nodes: [
          { id: 'node_1', type: 'duplicate_cleaner', data: { folderPath: '' } },
          { id: 'node_2', type: 'export_cbz', data: {} },
        ],
        edges: [{ source: 'node_1', target: 'node_2' }],
      };
      expect(isWorkflowCompatibleWithQueue(wf)).toBe(true);
    });
  });

  describe('prepareQueueWorkflowGraph', () => {
    test('throws descriptive error if workflow is null, undefined, or missing nodes array', () => {
      expect(() => prepareQueueWorkflowGraph(null, { mangaDir: '/downloads/manga' })).toThrow(
        /Định nghĩa Workflow không hợp lệ/
      );
      expect(() => prepareQueueWorkflowGraph(undefined, { mangaDir: '/downloads/manga' })).toThrow(
        /Định nghĩa Workflow không hợp lệ/
      );
      expect(() => prepareQueueWorkflowGraph({}, { mangaDir: '/downloads/manga' })).toThrow(
        /Định nghĩa Workflow không hợp lệ/
      );
      expect(() => prepareQueueWorkflowGraph({ nodes: 'not-array' }, { mangaDir: '/downloads/manga' })).toThrow(
        /Định nghĩa Workflow không hợp lệ/
      );
    });

    test('injects folderPath and mangaTitle into single folder_trigger node', () => {
      const originalWf = {
        id: 'wf_cbz',
        name: 'CBZ Export',
        nodes: [
          {
            id: 'trigger_1',
            type: 'folder_trigger',
            data: { folderPath: '', customSetting: true },
          },
          {
            id: 'export_1',
            type: 'export_cbz',
            data: { compressionLevel: 6 },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger_1', target: 'export_1' }],
      };

      const prepared = prepareQueueWorkflowGraph(originalWf, {
        mangaDir: '  /downloads/One Piece  ',
        mangaTitle: '  One Piece  ',
        baseSaveDir: '  /downloads  ',
      });

      const trigger = prepared.nodes.find((n) => n.id === 'trigger_1');
      expect(trigger.data.folderPath).toBe('/downloads/One Piece');
      expect(trigger.data.mangaTitle).toBe('One Piece');
      expect(trigger.data.customSetting).toBe(true);
      expect(trigger.data.baseSaveDir).toBe('/downloads');
      expect(prepared.name).toBe('CBZ Export');
      expect(prepared.edges).toHaveLength(1);
    });

    test('injects into multiple folder_trigger nodes if present', () => {
      const multiTriggerWf = {
        id: 'multi_trigger',
        nodes: [
          { id: 't1', type: 'folder_trigger', data: { folderPath: 'old_1' } },
          { id: 't2', type: 'folder_trigger', data: { folderPath: 'old_2' } },
          { id: 'n3', type: 'export_cbz', data: {} },
        ],
        edges: [],
      };

      const prepared = prepareQueueWorkflowGraph(multiTriggerWf, {
        mangaDir: '/data/Naruto',
        mangaTitle: 'Naruto',
      });

      const t1 = prepared.nodes.find((n) => n.id === 't1');
      const t2 = prepared.nodes.find((n) => n.id === 't2');
      expect(t1.data.folderPath).toBe('/data/Naruto');
      expect(t1.data.mangaTitle).toBe('Naruto');
      expect(t2.data.folderPath).toBe('/data/Naruto');
      expect(t2.data.mangaTitle).toBe('Naruto');
    });

    test('falls back gracefully to first trigger node if no folder_trigger is present', () => {
      const customTriggerWf = {
        id: 'custom_trigger_wf',
        nodes: [
          {
            id: 'cust_t1',
            type: 'custom_batch_trigger',
            category: 'trigger',
            data: { existingKey: 'value' },
          },
          { id: 'cbz_1', type: 'export_cbz', data: {} },
        ],
        edges: [{ source: 'cust_t1', target: 'cbz_1' }],
      };

      const prepared = prepareQueueWorkflowGraph(customTriggerWf, {
        mangaDir: '/data/Bleach',
        mangaTitle: 'Bleach',
      });

      const trigger = prepared.nodes.find((n) => n.id === 'cust_t1');
      expect(trigger.data.folderPath).toBe('/data/Bleach');
      expect(trigger.data.mangaTitle).toBe('Bleach');
      expect(trigger.data.existingKey).toBe('value');
    });

    test('falls back to entry node (no incoming edges) when no trigger node exists', () => {
      const noTriggerWf = {
        id: 'no_trigger_wf',
        nodes: [
          { id: 'cleaner', type: 'duplicate_cleaner', data: { action: 'trash' } },
          { id: 'cbz', type: 'export_cbz', data: {} },
        ],
        edges: [{ source: 'cleaner', target: 'cbz' }],
      };

      const prepared = prepareQueueWorkflowGraph(noTriggerWf, {
        mangaDir: '/data/Berserk',
        mangaTitle: 'Berserk',
      });

      const entryNode = prepared.nodes.find((n) => n.id === 'cleaner');
      expect(entryNode.data.folderPath).toBe('/data/Berserk');
      expect(entryNode.data.mangaTitle).toBe('Berserk');
      expect(entryNode.data.action).toBe('trash');
    });

    test('preserves existing node mangaTitle if input mangaTitle is empty/null', () => {
      const wf = {
        id: 'wf_existing_title',
        nodes: [
          {
            id: 't1',
            type: 'folder_trigger',
            data: { folderPath: '', mangaTitle: 'Original Manga Title' },
          },
        ],
      };

      const prepared = prepareQueueWorkflowGraph(wf, {
        mangaDir: '/data/MyManga',
        mangaTitle: '',
      });

      expect(prepared.nodes[0].data.folderPath).toBe('/data/MyManga');
      expect(prepared.nodes[0].data.mangaTitle).toBe('Original Manga Title');
    });

    test('deep clones the graph and prevents mutating original workflow object in memory', () => {
      const originalWf = {
        id: 'wf_orig',
        meta: { author: 'Alice', nested: { tags: ['action'] } },
        nodes: [
          {
            id: 't1',
            type: 'folder_trigger',
            data: { folderPath: '/old/path', info: { deep: true } },
          },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'out' }],
      };

      const prepared = prepareQueueWorkflowGraph(originalWf, {
        mangaDir: '/new/path',
        mangaTitle: 'New Title',
      });

      // Verify independence
      expect(prepared).not.toBe(originalWf);
      expect(prepared.nodes).not.toBe(originalWf.nodes);
      expect(prepared.nodes[0]).not.toBe(originalWf.nodes[0]);
      expect(prepared.nodes[0].data).not.toBe(originalWf.nodes[0].data);
      expect(prepared.nodes[0].data.info).not.toBe(originalWf.nodes[0].data.info);
      expect(prepared.edges).not.toBe(originalWf.edges);

      // Verify original is untouched
      expect(originalWf.nodes[0].data.folderPath).toBe('/old/path');
      expect(originalWf.nodes[0].data.mangaTitle).toBeUndefined();

      // Mutating prepared doesn't affect original
      prepared.nodes[0].data.folderPath = '/mutated/path';
      expect(originalWf.nodes[0].data.folderPath).toBe('/old/path');

      // Mutating original doesn't affect prepared
      originalWf.nodes[0].data.info.deep = false;
      expect(prepared.nodes[0].data.info.deep).toBe(true);
    });
  });
});
