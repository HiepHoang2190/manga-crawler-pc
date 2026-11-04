import { jest } from '@jest/globals';
import {
  shouldRunGroupWorkflow,
  resolveGroupWorkflowId,
  executeQueueGroupWorkflow,
  DEFAULT_QUEUE_WORKFLOW_STORAGE_KEY,
} from './queueWorkflowExecution.js';
import {
  setGroupWorkflow,
  setAllGroupsWorkflow,
  updateGroupWorkflowState,
} from './queueMutations.js';

describe('queueWorkflowExecution', () => {
  const sampleWorkflow = {
    id: 'wf_cbz_upload',
    name: 'Export CBZ and Upload',
    nodes: [
      { id: 'node_1', type: 'folder_trigger', data: { folderPath: '' } },
      { id: 'node_2', type: 'export_cbz', data: {} },
    ],
    edges: [{ source: 'node_1', target: 'node_2' }],
  };

  describe('shouldRunGroupWorkflow', () => {
    test('returns true when all chapters are done and 0 errors', () => {
      const group = {
        id: 'g1',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'done' },
        ],
      };
      expect(shouldRunGroupWorkflow(group)).toBe(true);
    });

    test('returns false when chapters have errors or downloadError', () => {
      const groupWithErrorStatus = {
        id: 'g1',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'error' },
        ],
      };
      expect(shouldRunGroupWorkflow(groupWithErrorStatus)).toBe(false);

      const groupWithDownloadError = {
        id: 'g2',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'done', downloadError: 'Failed page 3' },
        ],
      };
      expect(shouldRunGroupWorkflow(groupWithDownloadError)).toBe(false);
    });

    test('returns false when chapters are waiting or downloading', () => {
      const groupWaiting = {
        id: 'g1',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'waiting' },
        ],
      };
      expect(shouldRunGroupWorkflow(groupWaiting)).toBe(false);

      const groupDownloading = {
        id: 'g2',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'downloading' },
        ],
      };
      expect(shouldRunGroupWorkflow(groupDownloading)).toBe(false);
    });

    test('returns false when workflowState is already completed or running', () => {
      const groupCompleted = {
        id: 'g1',
        workflowState: 'completed',
        chapters: [{ id: 'c1', status: 'done' }],
      };
      expect(shouldRunGroupWorkflow(groupCompleted)).toBe(false);

      const groupRunning = {
        id: 'g2',
        workflowState: 'running',
        chapters: [{ id: 'c1', status: 'done' }],
      };
      expect(shouldRunGroupWorkflow(groupRunning)).toBe(false);
    });

    test('returns false for empty chapters array', () => {
      expect(shouldRunGroupWorkflow({ id: 'g1', chapters: [] })).toBe(false);
      expect(shouldRunGroupWorkflow(null)).toBe(false);
    });
  });

  describe('resolveGroupWorkflowId', () => {
    test('uses group workflowId when explicitly set', () => {
      expect(resolveGroupWorkflowId({ workflowId: 'wf_custom' }, 'wf_default')).toBe('wf_custom');
    });

    test('normalizes "none" on group to null (do not run)', () => {
      expect(resolveGroupWorkflowId({ workflowId: 'none' }, 'wf_default')).toBeNull();
    });

    test('falls back to defaultQueueWorkflowId when group workflowId is null, undefined, or inherit', () => {
      expect(resolveGroupWorkflowId({ workflowId: undefined }, 'wf_default')).toBe('wf_default');
      expect(resolveGroupWorkflowId({ workflowId: null }, 'wf_default')).toBe('wf_default');
      expect(resolveGroupWorkflowId({ workflowId: 'inherit' }, 'wf_default')).toBe('wf_default');
      expect(resolveGroupWorkflowId({}, 'wf_default')).toBe('wf_default');
    });

    test('returns null when default is "none" or empty', () => {
      expect(resolveGroupWorkflowId({}, 'none')).toBeNull();
      expect(resolveGroupWorkflowId({}, '')).toBeNull();
      expect(resolveGroupWorkflowId({}, null)).toBeNull();
    });
  });

  describe('executeQueueGroupWorkflow', () => {
    test('when all chapters done without errors, workflow runs with prepared graph and blocking behavior', async () => {
      let eventCallback = null;
      const mockElectronAPI = {
        resolveMangaDir: jest.fn().mockResolvedValue({ ok: true, path: '/downloads/One Piece' }),
        workflowRun: jest.fn().mockImplementation(async ({ runId, graph }) => {
          // Verify prepared graph contains injected mangaDir
          expect(graph.nodes[0].data.folderPath).toBe('/downloads/One Piece');
          expect(graph.nodes[0].data.mangaTitle).toBe('One Piece');

          // Simulate asynchronous progress and completion
          setTimeout(() => {
            if (eventCallback) {
              eventCallback({
                runId,
                nodeId: 'node_2',
                event: 'progress',
                data: { percent: 50, message: 'Creating CBZ archive...' },
              });
              eventCallback({
                runId,
                event: 'all_completed',
                targetPath: '/downloads/One Piece.cbz',
              });
            }
          }, 10);

          return { ok: true, runId };
        }),
        onWorkflowEvent: jest.fn().mockImplementation((cb) => {
          eventCallback = cb;
          return () => {
            eventCallback = null;
          };
        }),
      };

      const groupUpdates = [];
      const onUpdateGroup = (groupId, updates) => {
        groupUpdates.push({ groupId, ...updates });
      };

      const group = {
        id: 'g1',
        mangaTitle: 'One Piece',
        workflowId: 'wf_cbz_upload',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'done' },
        ],
      };

      const result = await executeQueueGroupWorkflow({
        group,
        savePath: '/downloads',
        defaultWorkflowId: 'none',
        electronAPI: mockElectronAPI,
        onUpdateGroup,
        workflowsProvider: () => [sampleWorkflow],
      });

      expect(result.executed).toBe(true);
      expect(result.success).toBe(true);
      expect(mockElectronAPI.resolveMangaDir).toHaveBeenCalledWith('/downloads', 'One Piece');
      expect(mockElectronAPI.workflowRun).toHaveBeenCalledTimes(1);

      // Verify state transitions: running -> progress -> completed
      expect(groupUpdates.some((u) => u.workflowState === 'running')).toBe(true);
      const lastUpdate = groupUpdates[groupUpdates.length - 1];
      expect(lastUpdate.workflowState).toBe('completed');
      expect(lastUpdate.workflowProgress.percent).toBe(100);
    });

    test('when chapters have errors, workflow is skipped and workflowRun is NOT called', async () => {
      const mockElectronAPI = {
        workflowRun: jest.fn(),
        onWorkflowEvent: jest.fn(),
      };

      const groupUpdates = [];
      const groupWithErrors = {
        id: 'g1',
        mangaTitle: 'Naruto',
        workflowId: 'wf_cbz_upload',
        workflowState: 'idle',
        chapters: [
          { id: 'c1', status: 'done' },
          { id: 'c2', status: 'error', downloadError: 'Network error' },
        ],
      };

      const result = await executeQueueGroupWorkflow({
        group: groupWithErrors,
        savePath: '/downloads',
        defaultWorkflowId: 'none',
        electronAPI: mockElectronAPI,
        onUpdateGroup: (groupId, updates) => groupUpdates.push({ groupId, ...updates }),
        workflowsProvider: () => [sampleWorkflow],
      });

      expect(result.executed).toBe(false);
      expect(result.reason).toBe('chapters_have_errors');
      expect(mockElectronAPI.workflowRun).not.toHaveBeenCalled();
      expect(groupUpdates).toContainEqual({ groupId: 'g1', workflowState: 'skipped' });
    });

    test('workflow state transitions from running to failed when workflowRun fails or emits run_error', async () => {
      let eventCallback = null;
      const mockElectronAPI = {
        resolveMangaDir: jest.fn().mockResolvedValue({ path: '/downloads/Bleach' }),
        workflowRun: jest.fn().mockImplementation(async ({ runId }) => {
          setTimeout(() => {
            if (eventCallback) {
              eventCallback({
                runId,
                event: 'run_error',
                error: 'Disk full error',
              });
            }
          }, 10);
          return { ok: true, runId };
        }),
        onWorkflowEvent: jest.fn().mockImplementation((cb) => {
          eventCallback = cb;
          return () => {
            eventCallback = null;
          };
        }),
      };

      const groupUpdates = [];
      const group = {
        id: 'g_bleach',
        mangaTitle: 'Bleach',
        workflowId: 'wf_cbz_upload',
        workflowState: 'idle',
        chapters: [{ id: 'c1', status: 'done' }],
      };

      const result = await executeQueueGroupWorkflow({
        group,
        savePath: '/downloads',
        defaultWorkflowId: 'none',
        electronAPI: mockElectronAPI,
        onUpdateGroup: (groupId, updates) => groupUpdates.push({ groupId, ...updates }),
        workflowsProvider: () => [sampleWorkflow],
      });

      expect(result.executed).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full error');

      const lastUpdate = groupUpdates[groupUpdates.length - 1];
      expect(lastUpdate.workflowState).toBe('failed');
      expect(lastUpdate.workflowProgress.error).toBe('Disk full error');
    });

    test('localizes node title during execution (e.g. upload_google_drive -> Tải Lên Google Drive)', async () => {
      let eventCallback = null;
      const gdriveWorkflow = {
        id: 'wf_gdrive',
        name: 'Upload GDrive',
        nodes: [
          { id: 'node_f', type: 'folder_trigger', data: {} },
          { id: 'node_gd', type: 'upload_google_drive', data: {} },
        ],
        edges: [{ source: 'node_f', target: 'node_gd' }],
      };

      const mockElectronAPI = {
        resolveMangaDir: jest.fn().mockResolvedValue({ path: '/downloads/One Piece' }),
        workflowRun: jest.fn().mockImplementation(async ({ runId }) => {
          setTimeout(() => {
            if (eventCallback) {
              eventCallback({
                runId,
                nodeId: 'node_gd',
                event: 'progress',
                data: { percent: 100 },
              });
              eventCallback({
                runId,
                event: 'all_completed',
              });
            }
          }, 10);
          return { ok: true, runId };
        }),
        onWorkflowEvent: jest.fn().mockImplementation((cb) => {
          eventCallback = cb;
          return () => {
            eventCallback = null;
          };
        }),
      };

      const groupUpdates = [];
      const onUpdateGroup = (groupId, updates) => {
        groupUpdates.push({ groupId, ...updates });
      };

      const mockT = jest.fn((key, fallback) => {
        if (key === 'workflow.nodeDef.upload_google_drive.title') {
          return 'Tải Lên Google Drive';
        }
        return fallback || key;
      });

      const group = {
        id: 'g1',
        mangaTitle: 'One Piece',
        workflowId: 'wf_gdrive',
        workflowState: 'idle',
        chapters: [{ id: 'c1', status: 'done' }],
      };

      const result = await executeQueueGroupWorkflow({
        group,
        savePath: '/downloads',
        electronAPI: mockElectronAPI,
        onUpdateGroup,
        workflowsProvider: () => [gdriveWorkflow],
        t: mockT,
      });

      expect(result.executed).toBe(true);
      expect(result.success).toBe(true);

      const progressUpdate = groupUpdates.find(
        (u) => u.workflowProgress?.activeNodeId === 'node_gd'
      );
      expect(progressUpdate).toBeDefined();
      expect(progressUpdate.workflowProgress.activeNodeType).toBe('upload_google_drive');
      expect(progressUpdate.workflowProgress.activeNodeTitle).toBe('Tải Lên Google Drive');
    });

    test('handles missing workflow by marking state as failed', async () => {
      const groupUpdates = [];
      const group = {
        id: 'g_unknown',
        mangaTitle: 'Unknown Manga',
        workflowId: 'non_existent_wf',
        workflowState: 'idle',
        chapters: [{ id: 'c1', status: 'done' }],
      };

      const result = await executeQueueGroupWorkflow({
        group,
        savePath: '/downloads',
        defaultWorkflowId: 'none',
        electronAPI: { workflowRun: jest.fn() },
        onUpdateGroup: (groupId, updates) => groupUpdates.push({ groupId, ...updates }),
        workflowsProvider: () => [],
      });

      expect(result.executed).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('workflow_not_found');
      expect(groupUpdates[0].workflowState).toBe('failed');
    });
  });

  describe('workflow queue mutations & retry integration', () => {
    test('defaultQueueWorkflowId key is defined as expected', () => {
      expect(DEFAULT_QUEUE_WORKFLOW_STORAGE_KEY).toBe('mangaCrawlerQueueDefaultWorkflowId');
    });

    test('setGroupWorkflow updates workflowId for a specific group', () => {
      const queue = [
        { id: 'g1', workflowId: null },
        { id: 'g2', workflowId: null },
      ];
      const updated = setGroupWorkflow(queue, 'g1', 'template_cbz');
      expect(updated[0].workflowId).toBe('template_cbz');
      expect(updated[1].workflowId).toBeNull();
    });

    test('setAllGroupsWorkflow updates workflowId for all groups in queue', () => {
      const queue = [
        { id: 'g1', workflowId: null },
        { id: 'g2', workflowId: 'old_wf' },
      ];
      const updated = setAllGroupsWorkflow(queue, 'new_wf');
      expect(updated[0].workflowId).toBe('new_wf');
      expect(updated[1].workflowId).toBe('new_wf');

      const cleared = setAllGroupsWorkflow(queue, 'none');
      expect(cleared[0].workflowId).toBe('none');
      expect(cleared[1].workflowId).toBe('none');

      const inherited = setAllGroupsWorkflow(queue, 'inherit');
      expect(inherited[0].workflowId).toBeNull();
      expect(inherited[1].workflowId).toBeNull();
    });

    test('retryGroupWorkflow triggers execution when group is completed without errors', async () => {
      let eventCallback = null;
      const mockElectronAPI = {
        resolveMangaDir: jest.fn().mockResolvedValue({ path: '/downloads/One Piece' }),
        workflowRun: jest.fn().mockImplementation(async ({ runId }) => {
          setTimeout(() => {
            if (eventCallback) {
              eventCallback({ runId, event: 'all_completed' });
            }
          }, 10);
          return { ok: true, runId };
        }),
        onWorkflowEvent: jest.fn().mockImplementation((cb) => {
          eventCallback = cb;
          return () => {
            eventCallback = null;
          };
        }),
      };

      let currentQueue = [
        {
          id: 'g_retry',
          mangaTitle: 'One Piece',
          workflowId: 'wf_cbz_upload',
          workflowState: 'failed',
          chapters: [
            { id: 'c1', status: 'done' },
            { id: 'c2', status: 'done' },
          ],
        },
      ];

      const onUpdateGroup = (groupId, updates) => {
        currentQueue = updateGroupWorkflowState(currentQueue, groupId, updates);
      };

      const targetGroup = currentQueue[0];
      const result = await executeQueueGroupWorkflow({
        group: targetGroup,
        savePath: '/downloads',
        defaultWorkflowId: 'none',
        electronAPI: mockElectronAPI,
        onUpdateGroup,
        workflowsProvider: () => [sampleWorkflow],
      });

      expect(result.success).toBe(true);
      expect(currentQueue[0].workflowState).toBe('completed');
    });
  });
});
