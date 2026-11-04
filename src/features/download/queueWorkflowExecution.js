import { loadSavedWorkflows } from '../workflow/utils/workflowStorage.mjs';
import { prepareQueueWorkflowGraph } from './queueWorkflowAdapter.js';

export const DEFAULT_QUEUE_WORKFLOW_STORAGE_KEY = 'mangaCrawlerQueueDefaultWorkflowId';

/**
 * Checks whether a group is eligible for automatic post-download workflow execution.
 * Only returns true when 100% of chapters have been successfully downloaded without errors.
 *
 * @param {Object} group
 * @returns {boolean}
 */
export function shouldRunGroupWorkflow(group) {
  if (!group || !Array.isArray(group.chapters) || group.chapters.length === 0) {
    return false;
  }
  if (group.workflowState === 'running' || group.workflowState === 'completed') {
    return false;
  }
  const allSuccess = group.chapters.every(
    (c) => c && c.status === 'done' && !c.downloadError
  );
  return allSuccess;
}

/**
 * Resolves the effective workflow ID for a group, taking group override or default setting into account.
 *
 * @param {Object} group
 * @param {string|null} defaultWorkflowId
 * @returns {string|null} Workflow ID or null if none
 */
export function resolveGroupWorkflowId(group, defaultWorkflowId) {
  if (!group) return null;
  // Explicit "do not run" for this group
  if (group.workflowId === 'none') {
    return null;
  }
  // Explicit custom workflow override for this group
  if (group.workflowId && group.workflowId !== 'inherit') {
    return String(group.workflowId).trim();
  }
  // Inherit toolbar default
  if (!defaultWorkflowId || defaultWorkflowId === 'none' || defaultWorkflowId === 'inherit') {
    return null;
  }
  return String(defaultWorkflowId).trim() || null;
}

/**
 * Executes a workflow on the downloaded manga group sequentially.
 *
 * @param {Object} params
 * @param {Object} params.group - The QueueGroup
 * @param {string} params.savePath - Base save directory
 * @param {string|null} [params.defaultWorkflowId] - Default workflow ID if not set on group
 * @param {Object} [params.electronAPI] - window.electronAPI
 * @param {Function} [params.onUpdateGroup] - Callback (groupId, updates) to update queue state
 * @param {Function} [params.appendLog] - Logging callback
 * @param {Function} [params.t] - Translation function
 * @param {Function} [params.isAborted] - Callback returning boolean if execution should abort
 * @param {Function|Array} [params.workflowsProvider] - Loader for saved workflows
 * @returns {Promise<Object>} Execution result { executed, success, ... }
 */
export async function executeQueueGroupWorkflow({
  group,
  savePath,
  defaultWorkflowId = 'none',
  electronAPI = typeof window !== 'undefined' ? window.electronAPI : null,
  onUpdateGroup,
  appendLog = () => {},
  t = (k, fallback) => (typeof fallback === 'string' ? fallback : k),
  isAborted = () => false,
  workflowsProvider = loadSavedWorkflows,
  onRunStarted = () => {},
  onRunEnded = () => {},
} = {}) {
  const targetWfId = resolveGroupWorkflowId(group, defaultWorkflowId);
  if (!targetWfId) {
    return { executed: false, reason: 'no_workflow' };
  }

  const chapters = group?.chapters || [];
  const hasErrors = chapters.some((c) => c.status === 'error' || Boolean(c.downloadError));
  const allDone = chapters.length > 0 && chapters.every((c) => c.status === 'done');

  if (!allDone || hasErrors) {
    if (onUpdateGroup) {
      onUpdateGroup(group.id, { workflowState: 'skipped' });
    }
    return { executed: false, reason: 'chapters_have_errors' };
  }

  const workflows =
    typeof workflowsProvider === 'function' ? workflowsProvider() : workflowsProvider || [];
  const workflow = workflows.find((w) => w && w.id === targetWfId);

  if (!workflow) {
    const errorMsg =
      t('queue.workflowNotFound', { id: targetWfId }) || `Workflow "${targetWfId}" không tìm thấy`;
    appendLog(errorMsg, 'warn');
    if (onUpdateGroup) {
      onUpdateGroup(group.id, {
        workflowState: 'failed',
        workflowProgress: { error: errorMsg },
      });
    }
    return { executed: true, success: false, error: 'workflow_not_found' };
  }

  // 1. Resolve manga directory
  let mangaDir = '';
  try {
    if (typeof electronAPI?.resolveMangaDir === 'function') {
      const res = await electronAPI.resolveMangaDir(savePath, group.mangaTitle);
      mangaDir = res?.path || (typeof res === 'string' ? res : '');
    }
  } catch (err) {
    // Non-fatal, prepareQueueWorkflowGraph handles empty string
  }

  // 2. Prepare graph
  let graph;
  try {
    graph = prepareQueueWorkflowGraph(workflow, {
      mangaDir,
      mangaTitle: group.mangaTitle,
      baseSaveDir: savePath,
    });
  } catch (err) {
    const errorMsg = err?.message || String(err);
    appendLog(
      t('queue.workflowPrepareError', { error: errorMsg }) || `Lỗi chuẩn bị workflow: ${errorMsg}`,
      'error'
    );
    if (onUpdateGroup) {
      onUpdateGroup(group.id, {
        workflowState: 'failed',
        workflowProgress: { error: errorMsg },
      });
    }
    return { executed: true, success: false, error: errorMsg };
  }

  const runId = `wf_queue_${group.id}_${Date.now()}`;
  if (typeof onRunStarted === 'function') {
    onRunStarted(runId);
  }

  // 3. Set state to running
  if (onUpdateGroup) {
    onUpdateGroup(group.id, {
      workflowState: 'running',
      workflowProgress: {
        runId,
        percent: 0,
        activeNodeTitle: t('queue.workflowStarting') || 'Bắt đầu quy trình...',
      },
    });
  }

  // 4. Set up event listener and Promise
  let unsubscribe = null;
  const executionPromise = new Promise((resolve) => {
    const subscribe = electronAPI?.onWorkflowEvent || electronAPI?.subscribeWorkflowEvent;
    if (typeof subscribe === 'function') {
      unsubscribe = subscribe((evt) => {
        if (!evt || evt.runId !== runId) return;

        if (isAborted()) {
          try {
            electronAPI?.workflowStop?.({ runId });
          } catch {}
          resolve({ ok: false, stopped: true, error: 'Aborted' });
          return;
        }

        if (evt.event === 'running' || evt.event === 'progress') {
          const node = graph?.nodes?.find((n) => n.id === evt.nodeId);
          const nodeType = node?.type || evt.nodeId || '';
          const customTitle = node?.data?.label || node?.data?.title || null;
          const translatedTitle =
            customTitle ||
            (nodeType && typeof t === 'function' ? t(`workflow.nodeDef.${nodeType}.title`, nodeType) : nodeType);
          const nodeTitle = translatedTitle || nodeType || evt.nodeId || '';
          if (onUpdateGroup) {
            onUpdateGroup(group.id, {
              workflowState: 'running',
              workflowProgress: {
                runId,
                activeNodeId: evt.nodeId,
                activeNodeType: nodeType,
                activeNodeTitle: nodeTitle,
                activeNodeCustomTitle: customTitle,
                percent: Number.isFinite(evt.data?.percent)
                  ? evt.data.percent
                  : Number.isFinite(evt.data?.progress)
                  ? evt.data.progress
                  : undefined,
                message: evt.data?.message || '',
              },
            });
          }
        } else if (evt.event === 'all_completed' || evt.event === 'run_completed') {
          resolve({ ok: true, targetPath: evt.targetPath });
        } else if (evt.event === 'run_error') {
          resolve({ ok: false, error: evt.error || t('queue.workflowFailedState') || 'Lỗi quy trình' });
        } else if (evt.event === 'stopped') {
          resolve({ ok: false, stopped: true, error: t('queue.workflowStopped') || 'Quy trình đã dừng' });
        }
      });
    } else {
      resolve({ ok: false, error: 'Workflow event subscription unavailable' });
    }
  });

  try {
    // 5. Trigger workflow run via electron API
    const runRes = await electronAPI?.workflowRun?.({ runId, graph });
    if (!runRes?.ok) {
      const errorMsg =
        runRes?.error ||
        t('queue.workflowCannotStart', { error: runRes?.error || '' }) ||
        'Không thể khởi chạy quy trình';
      if (typeof unsubscribe === 'function') unsubscribe();
      if (onUpdateGroup) {
        onUpdateGroup(group.id, {
          workflowState: 'failed',
          workflowProgress: { runId, error: errorMsg },
        });
      }
      appendLog(
        t('queue.workflowFailed', { error: errorMsg }) || `Lỗi quy trình: ${errorMsg}`,
        'error'
      );
      return { executed: true, success: false, error: errorMsg };
    }

    // 6. Wait for execution promise to resolve
    const outcome = await executionPromise;
    if (typeof unsubscribe === 'function') unsubscribe();

    if (outcome.ok) {
      if (onUpdateGroup) {
        onUpdateGroup(group.id, {
          workflowState: 'completed',
          workflowProgress: {
            runId,
            percent: 100,
            message: t('queue.workflowCompleted') || 'Hoàn tất quy trình',
          },
        });
      }
      appendLog(
        t('queue.workflowCompletedLog', { mangaTitle: group.mangaTitle }) ||
          `Quy trình cho ${group.mangaTitle} đã hoàn tất thành công!`,
        'success'
      );
      return { executed: true, success: true, targetPath: outcome.targetPath };
    } else {
      const errorMsg = outcome.error || 'Quy trình thất bại';
      if (onUpdateGroup) {
        onUpdateGroup(group.id, {
          workflowState: outcome.stopped ? 'idle' : 'failed',
          workflowProgress: { runId, error: errorMsg },
        });
      }
      if (!outcome.stopped) {
        appendLog(
          t('queue.workflowFailedLog', { mangaTitle: group.mangaTitle, error: errorMsg }) ||
            `Quy trình cho ${group.mangaTitle} thất bại: ${errorMsg}`,
          'warn'
        );
      }
      return { executed: true, success: false, error: errorMsg, stopped: outcome.stopped };
    }
  } catch (err) {
    if (typeof unsubscribe === 'function') unsubscribe();
    const errorMsg = err?.message || String(err);
    if (onUpdateGroup) {
      onUpdateGroup(group.id, {
        workflowState: 'failed',
        workflowProgress: { runId, error: errorMsg },
      });
    }
    appendLog(errorMsg, 'error');
    return { executed: true, success: false, error: errorMsg };
  } finally {
    if (typeof onRunEnded === 'function') {
      onRunEnded(runId);
    }
  }
}
