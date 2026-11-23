import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { useWorkflowCanvas } from '../hooks/useWorkflowCanvas';
import WorkflowToolbar from './WorkflowToolbar';
import WorkflowPalette from './WorkflowPalette';
import WorkflowCanvas from './WorkflowCanvas';
import WorkflowInspector from './WorkflowInspector';
import WorkflowLogConsole from './WorkflowLogConsole';
import WorkflowManagerModal from './WorkflowManagerModal';
import { DEFAULT_TEMPLATES } from '../templates/defaultTemplates';
import {
  getOrInitWorkflows,
  loadSavedWorkflows,
  getActiveWorkflowId,
  setActiveWorkflowId,
  saveWorkflow,
  createWorkflow,
  duplicateWorkflow,
  renameWorkflow,
  deleteWorkflow,
  exportWorkflowJson,
  importWorkflowJson,
} from '../utils/workflowStorage';
import { validateGraph, validateWorkflowPreflight, getDownloadsFolder } from '../engine/workflowGraph';
import { useSettings } from '../../settings';
import { SaveDirErrorModal } from '../../../shared';

export default function WorkflowStudio() {
  const { t } = useI18n();
  const [workflowsList, setWorkflowsList] = useState(() => getOrInitWorkflows());
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [saveDirErrorModal, setSaveDirErrorModal] = useState(null);

  const initialWfRef = useRef(null);
  if (!initialWfRef.current) {
    const activeId = getActiveWorkflowId();
    initialWfRef.current = workflowsList.find((w) => w.id === activeId) || workflowsList[0] || DEFAULT_TEMPLATES[0] || {
      id: `wf_${Date.now()}`,
      name: t('workflow.studio.defaultWorkflowName', 'Workflow Mới'),
      nodes: [],
      edges: [],
    };
  }

  const [currentWfId, setCurrentWfId] = useState(() => initialWfRef.current?.id || `wf_${Date.now()}`);
  const [workflowName, setWorkflowName] = useState(() => initialWfRef.current?.name || t('workflow.studio.defaultWorkflowName'));
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastOutputDir, setLastOutputDir] = useState(null);
  const lastOutputDirRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [nodeStates, setNodeStates] = useState({});
  const [toastMessage, setToastMessage] = useState(null);
  const studioRootRef = useRef(null);
  const canvasViewportRef = useRef(null);

  // If built-in templates are removed and active workflow is a legacy template, auto-switch to clean workflow
  useEffect(() => {
    if (DEFAULT_TEMPLATES.length === 0 && currentWfId?.startsWith('template_')) {
      const list = getOrInitWorkflows();
      const nextWf = list[0];
      if (nextWf) {
        setCurrentWfId(nextWf.id);
        setWorkflowName(nextWf.name);
        setActiveWorkflowId(nextWf.id);
        canvas.setWorkflow(nextWf);
      }
    }
  }, [currentWfId]);

  const showToast = (msg, type = 'info') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  let savePath = '';
  try {
    const settings = useSettings();
    savePath = settings?.savePath || '';
  } catch {
    savePath = '';
  }

  const [systemDownloadsDir, setSystemDownloadsDir] = useState(() => getDownloadsFolder(savePath));

  useEffect(() => {
    if (savePath) {
      setSystemDownloadsDir(getDownloadsFolder(savePath));
      return;
    }
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;
    if (api?.getDefaultDownloadPath) {
      api.getDefaultDownloadPath().then((p) => {
        if (p) setSystemDownloadsDir(getDownloadsFolder(p));
      }).catch(() => {});
    }
  }, [savePath]);

  const canvas = useWorkflowCanvas(initialWfRef.current);

  // Auto-default folder_trigger with empty folderPath to systemDownloadsDir
  useEffect(() => {
    if (!systemDownloadsDir) return;
    canvas.nodes.forEach((n) => {
      if (n.type === 'folder_trigger' && !n.data?.folderPath) {
        canvas.updateNodeData(n.id, { folderPath: systemDownloadsDir }, { skipHistory: true });
      }
    });
  }, [systemDownloadsDir, canvas.nodes, canvas.updateNodeData]);

  const handleAddNode = useCallback((type, dropPos = null) => {
    let override = {};
    if (type === 'folder_trigger' && systemDownloadsDir) {
      override = { folderPath: systemDownloadsDir };
    }
    canvas.addNode(type, dropPos, override);
  }, [canvas.addNode, systemDownloadsDir]);

  // Amazon Kindle authentication status for pre-flight validation
  const [isKindleLoggedIn, setIsKindleLoggedIn] = useState(true);

  const checkKindleAuth = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;
    if (api?.sendToKindleIsLoggedIn) {
      try {
        const r = await api.sendToKindleIsLoggedIn();
        setIsKindleLoggedIn(Boolean(r?.ok && r?.loggedIn));
      } catch {
        setIsKindleLoggedIn(false);
      }
    }
  }, []);

  useEffect(() => {
    checkKindleAuth();
  }, [checkKindleAuth]);

  // Google Drive connection status for preflight validation
  const [isGoogleDriveConnected, setIsGoogleDriveConnected] = useState(true);

  const checkGoogleDriveStatus = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.electron) : null;
    if (api?.workflowDetectGoogleDrive) {
      try {
        const r = await api.workflowDetectGoogleDrive();
        setIsGoogleDriveConnected(Boolean(r?.ok && r?.detectedPath));
      } catch {
        setIsGoogleDriveConnected(false);
      }
    }
  }, []);

  useEffect(() => {
    checkGoogleDriveStatus();
  }, [checkGoogleDriveStatus]);

  // Pre-flight validation to detect broken or invalid workflows
  const preflight = useMemo(() => {
    return validateWorkflowPreflight(canvas.nodes, canvas.edges, {
      isKindleLoggedIn,
      isGoogleDriveConnected,
    });
  }, [canvas.nodes, canvas.edges, isKindleLoggedIn, isGoogleDriveConnected]);

  // --- Left & Right Sidebars Resize State (Manga Studio Style) ---
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);

  // Left sidebar (Palette) width & resizing
  const LEFT_SIDEBAR_STORAGE_KEY = 'workflow_studio_left_sidebar_width_v1';
  const clampLeftSidebarWidth = useCallback((w) => {
    const min = 200;
    const max = typeof window !== 'undefined' ? Math.max(min, Math.min(520, Math.floor(window.innerWidth * 0.42))) : 480;
    return Math.max(min, Math.min(w, max));
  }, []);

  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 180 && num <= 600) {
          return num;
        }
      }
    } catch { }
    return 260;
  });

  const leftSidebarWidthRef = useRef(leftSidebarWidth);
  useEffect(() => {
    leftSidebarWidthRef.current = leftSidebarWidth;
  }, [leftSidebarWidth]);

  const handleLeftSidebarResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftSidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const next = clampLeftSidebarWidth(startW + delta);
      lastW = next;
      setLeftSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, String(lastW));
      } catch { }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [clampLeftSidebarWidth]);

  // Right sidebar (Inspector) width & resizing
  const RIGHT_SIDEBAR_STORAGE_KEY = 'workflow_studio_right_sidebar_width_v1';
  const clampRightSidebarWidth = useCallback((w) => {
    const min = 260;
    const max = typeof window !== 'undefined' ? Math.max(min, Math.min(650, Math.floor(window.innerWidth * 0.45))) : 560;
    return Math.max(min, Math.min(w, max));
  }, []);

  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(RIGHT_SIDEBAR_STORAGE_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num) && num >= 240 && num <= 700) {
          return num;
        }
      }
    } catch { }
    return 340;
  });

  const rightSidebarWidthRef = useRef(rightSidebarWidth);
  useEffect(() => {
    rightSidebarWidthRef.current = rightSidebarWidth;
  }, [rightSidebarWidth]);

  const handleRightSidebarResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightSidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      const next = clampRightSidebarWidth(startW + delta);
      lastW = next;
      setRightSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(RIGHT_SIDEBAR_STORAGE_KEY, String(lastW));
      } catch { }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [clampRightSidebarWidth]);

  const handleSelectNode = useCallback((nodeId) => {
    canvas.setSelectedNodeId(nodeId);
    if (nodeId) {
      setShowRightSidebar(true);
    }
  }, [canvas]);

  // Debounced auto-save when canvas nodes/edges or workflow name change
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (!currentWfId) return;

    const timer = setTimeout(() => {
      saveWorkflow({
        id: currentWfId,
        name: workflowName,
        nodes: canvas.nodes,
        edges: canvas.edges,
      });
      setWorkflowsList(loadSavedWorkflows());
    }, 1200);

    return () => clearTimeout(timer);
  }, [currentWfId, workflowName, canvas.nodes, canvas.edges]);

  // Listen to workflow execution events from Electron IPC
  useEffect(() => {
    const api = window.electronAPI || window.electron;
    if (!api?.subscribeWorkflowEvent) return;

    const unsubscribe = api.subscribeWorkflowEvent((evt) => {
      if (!evt) return;

      const now = new Date();
      const timeStr = now.toLocaleTimeString();

      if (evt.nodeId) {
        setNodeStates((prev) => {
          const prevState = prev[evt.nodeId] || {};
          const evtTs = evt.timestamp || Date.now();
          let startedAt = prevState.startedAt || null;
          let durationMs = prevState.durationMs ?? null;
          if (evt.event === 'running') {
            startedAt = evtTs;
            durationMs = null;
          } else if (evt.event === 'completed' || evt.event === 'failed' || evt.event === 'skipped') {
            durationMs = startedAt ? Math.max(0, evtTs - startedAt) : 0;
          }

          return {
            ...prev,
            [evt.nodeId]: {
              status: evt.event === 'progress' ? (prevState.status || 'running') : evt.event,
              outputData: evt.data,
              error: evt.error,
              progressData: evt.event === 'progress' ? evt.data : prevState.progressData,
              startedAt,
              durationMs,
            },
          };
        });

        if (evt.event === 'failed') {
          const targetNode = canvas.nodes.find((n) => n.id === evt.nodeId);
          if (!targetNode?.data?.continueOnError) {
            setIsRunning(false);
            setIsError(true);
            setErrorMessage(evt.error || 'Lỗi xử lý khối');
          }
        }

        if (evt.data?.message || evt.error) {
          const targetNode = canvas.nodes.find((n) => n.id === evt.nodeId);
          const nodeTitle = targetNode?.data?.mangaTitle || targetNode?.type || evt.nodeId;
          const isErr = evt.event === 'failed' || evt.data?.type === 'error';
          const isSuccess = evt.event === 'completed' || evt.data?.type === 'success';

          setLogs((prev) => [
            ...prev,
            {
              id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              time: timeStr,
              nodeId: evt.nodeId,
              step: evt.data?.step || targetNode?.type || 'node',
              type: isErr ? 'error' : isSuccess ? 'success' : evt.data?.type || 'info',
              message: evt.data?.message || (isErr ? `Lỗi: ${evt.error}` : `Khối "${nodeTitle}" đã xử lý xong`),
            },
          ]);
        }
      }

      if (evt.event === 'completed' && evt.data) {
        const target = evt.data.book_file?.path || evt.data.images_dir;
        if (target) {
          setLastOutputDir(target);
          lastOutputDirRef.current = target;
        }
      }

      if (evt.event === 'all_completed') {
        setIsRunning(false);
        setIsCompleted(true);
        setIsError(false);
        showToast(t('workflow.studio.completedToast'), 'success');
        setLogs((prev) => [
          ...prev,
          {
            id: `log_${Date.now()}`,
            time: timeStr,
            step: 'system',
            type: 'success',
            message: `🎉 ${t('workflow.studio.completedToast')}`,
          },
        ]);

        // Auto open output folder or file in Finder / Explorer
        const targetToOpen = evt.targetPath || lastOutputDirRef.current;
        if (targetToOpen) {
          const electronApi = window.electronAPI || window.electron;
          if (electronApi) {
            try {
              if (electronApi.showItemInFolder && (targetToOpen.endsWith('.cbz') || targetToOpen.endsWith('.pdf') || targetToOpen.endsWith('.epub') || targetToOpen.endsWith('.zip'))) {
                electronApi.showItemInFolder(targetToOpen);
              } else if (electronApi.openPath) {
                electronApi.openPath(targetToOpen);
              }
              setLogs((prev) => [
                ...prev,
                {
                  id: `log_${Date.now()}_open`,
                  time: timeStr,
                  step: 'system',
                  type: 'info',
                  message: `📂 Đã tự động mở thư mục/tệp đích: ${targetToOpen}`,
                },
              ]);
            } catch (err) {
              console.warn('Không thể tự động mở thư mục/tệp đích:', err);
            }
          }
        }
      } else if (evt.event === 'run_error') {
        setIsRunning(false);
        setIsError(true);
        setErrorMessage(evt.error || 'Lỗi không xác định');
        showToast(t('workflow.studio.execErrorToast', { error: evt.error }), 'error');
        setLogs((prev) => [
          ...prev,
          {
            id: `log_${Date.now()}`,
            time: timeStr,
            step: 'system',
            type: 'error',
            message: `⚠️ Quy trình dừng do lỗi: ${evt.error}`,
          },
        ]);
      } else if (evt.event === 'stopped') {
        setIsRunning(false);
      }
    });

    return () => unsubscribe();
  }, [canvas.nodes, t]);

  // Run Workflow
  const handleRun = async () => {
    if (!preflight.isValid) {
      showToast(preflight.blockingReason || t('workflow.studio.emptyCanvasToast'), 'warning');
      return;
    }

    const api = window.electronAPI || window.electron;
    if (api?.validateSaveDir) {
      for (const node of canvas.nodes) {
        if (node.data?.disabled) continue;
        const outDir = String(node.data?.outputDir || '').trim();
        if (outDir) {
          try {
            const valRes = await api.validateSaveDir(outDir);
            if (valRes && !valRes.ok && !valRes.canCreate) {
              const errMsg = valRes.error || t('sidebar.warning.invalidSavePath') || 'Thư mục không tồn tại hoặc ổ đĩa chưa kết nối';
              setSaveDirErrorModal({ path: outDir, message: errMsg });
              return;
            }
          } catch {
            /* proceed if unexpected validation error */
          }
        }
      }
    }

    const runId = `run_${Date.now()}`;
    setCurrentRunId(runId);
    setIsRunning(true);
    setIsCompleted(false);
    setIsError(false);
    setErrorMessage('');
    setIsConsoleOpen(true);
    setLastOutputDir(null);

    setLogs([
      {
        id: `log_${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        step: 'system',
        type: 'info',
        message: `🚀 Khởi động quy trình "${workflowName}" (${canvas.nodes.length} khối, ${canvas.edges.length} liên kết)...`,
      },
    ]);

    // Reset node states
    const initialStates = {};
    canvas.nodes.forEach((n) => {
      initialStates[n.id] = { status: 'idle', outputData: null, error: null };
    });
    setNodeStates(initialStates);

    try {
      const api = window.electronAPI || window.electron;
      if (api?.workflowRun) {
        const res = await api.workflowRun({
          runId,
          graph: { nodes: canvas.nodes, edges: canvas.edges },
        });
        if (!res.ok) {
          setIsRunning(false);
          setIsError(true);
          setErrorMessage(res.error || 'Lỗi khởi động');
          showToast(t('workflow.studio.errorToast', { error: res.error }), 'error');
          setLogs((prev) => [
            ...prev,
            {
              id: `log_${Date.now()}`,
              time: new Date().toLocaleTimeString(),
              step: 'system',
              type: 'error',
              message: `❌ Không thể khởi động: ${res.error}`,
            },
          ]);
        }
      } else {
        // Mock fallback for browser dev environment
        showToast(t('workflow.studio.simulatingToast'), 'info');
        let delay = 600;
        for (const node of canvas.nodes) {
          setTimeout(() => {
            setNodeStates((prev) => ({
              ...prev,
              [node.id]: { status: 'running' },
            }));
            setLogs((prev) => [
              ...prev,
              {
                id: `log_${Date.now()}_${node.id}`,
                time: new Date().toLocaleTimeString(),
                step: node.type,
                type: 'info',
                message: `Đang xử lý khối "${node.data?.mangaTitle || node.type}"...`,
              },
            ]);
          }, delay);
          delay += 1200;
          setTimeout(() => {
            setNodeStates((prev) => ({
              ...prev,
              [node.id]: { status: 'completed' },
            }));
            setLogs((prev) => [
              ...prev,
              {
                id: `log_${Date.now()}_${node.id}_done`,
                time: new Date().toLocaleTimeString(),
                step: node.type,
                type: 'success',
                message: `Khối "${node.data?.mangaTitle || node.type}" hoàn tất.`,
              },
            ]);
          }, delay);
        }
        setTimeout(() => {
          setIsRunning(false);
          setIsCompleted(true);
          showToast(t('workflow.studio.simCompletedToast'), 'success');
        }, delay + 400);
      }
    } catch (err) {
      setIsRunning(false);
      setIsError(true);
      setErrorMessage(err.message || String(err));
      showToast(err.message || String(err), 'error');
    }
  };

  // Stop Workflow
  const handleStop = async () => {
    if (!currentRunId) return;
    const api = window.electronAPI || window.electron;
    if (api?.workflowStop) {
      await api.workflowStop({ runId: currentRunId });
    }
    setIsRunning(false);
    showToast(t('workflow.studio.stoppedToast'), 'warning');
    setLogs((prev) => [
      ...prev,
      {
        id: `log_${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        step: 'system',
        type: 'warn',
        message: '⏹️ Người dùng đã yêu cầu dừng quy trình Workflow.',
      },
    ]);
  };

  // Retry from failed node
  const handleRetryNode = async (nodeId) => {
    if (!currentRunId) return;
    setIsRunning(true);
    setIsCompleted(false);
    setIsError(false);
    setIsConsoleOpen(true);
    setNodeStates((prev) => ({
      ...prev,
      [nodeId]: { status: 'running', error: null },
    }));
    setLogs((prev) => [
      ...prev,
      {
        id: `log_${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        step: 'system',
        type: 'info',
        message: `🔄 Đang thử lại từ khối: ${nodeId}...`,
      },
    ]);

    try {
      const api = window.electronAPI || window.electron;
      if (api?.workflowResume) {
        const res = await api.workflowResume({
          runId: currentRunId,
          graph: { nodes: canvas.nodes, edges: canvas.edges },
          fromNodeId: nodeId,
        });
        if (!res.ok) {
          setIsRunning(false);
          showToast(t('workflow.studio.retryErrorToast', { error: res.error }), 'error');
        }
      }
    } catch (err) {
      setIsRunning(false);
      showToast(err.message || String(err), 'error');
    }
  };

  // Switch Workflow
  const handleSelectWorkflow = (targetId) => {
    if (currentWfId) {
      saveWorkflow({
        id: currentWfId,
        name: workflowName,
        nodes: canvas.nodes,
        edges: canvas.edges,
      });
    }

    const target = workflowsList.find((w) => w.id === targetId) || loadSavedWorkflows().find((w) => w.id === targetId);
    if (!target) return;

    setCurrentWfId(target.id);
    setWorkflowName(target.name);
    setActiveWorkflowId(target.id);
    canvas.setWorkflow(target);

    setIsRunning(false);
    setIsCompleted(false);
    setIsError(false);
    setErrorMessage('');
    setNodeStates({});
    setLogs([]);
    setIsManagerModalOpen(false);

    showToast(t('workflow.studio.switchedToast', { name: target.name }), 'info');
  };

  // Create new Workflow
  const handleCreateWorkflow = ({ name, templateId }) => {
    if (currentWfId) {
      saveWorkflow({
        id: currentWfId,
        name: workflowName,
        nodes: canvas.nodes,
        edges: canvas.edges,
      });
    }

    const newWf = createWorkflow({ name, templateId });
    const updatedList = loadSavedWorkflows();
    setWorkflowsList(updatedList);
    setCurrentWfId(newWf.id);
    setWorkflowName(newWf.name);
    setActiveWorkflowId(newWf.id);
    canvas.setWorkflow(newWf);

    setIsRunning(false);
    setIsCompleted(false);
    setIsError(false);
    setErrorMessage('');
    setNodeStates({});
    setLogs([]);
    setIsManagerModalOpen(false);

    showToast(t('workflow.studio.createdToast', { name: newWf.name }), 'success');
  };

  const handleQuickNewWorkflow = () => {
    const list = getOrInitWorkflows();
    const newName = `${t('workflow.studio.defaultWorkflowName')} ${list.length + 1}`;
    handleCreateWorkflow({ name: newName });
  };

  // Duplicate Workflow
  const handleDuplicateWorkflow = (wfId) => {
    const clone = duplicateWorkflow(wfId);
    if (clone) {
      const updatedList = loadSavedWorkflows();
      setWorkflowsList(updatedList);
      setCurrentWfId(clone.id);
      setWorkflowName(clone.name);
      setActiveWorkflowId(clone.id);
      canvas.setWorkflow(clone);
      setIsManagerModalOpen(false);
      showToast(t('workflow.studio.duplicatedToast', { name: clone.name }), 'success');
    }
  };

  // Rename Workflow
  const handleRenameWorkflow = (wfId, newName) => {
    renameWorkflow(wfId, newName);
    setWorkflowsList(loadSavedWorkflows());
    if (wfId === currentWfId) {
      setWorkflowName(newName);
    }
  };

  // Delete Workflow
  const handleDeleteWorkflow = (wfId) => {
    const remaining = deleteWorkflow(wfId);
    setWorkflowsList(remaining);
    if (wfId === currentWfId) {
      const nextWf = remaining[0] || null;
      if (nextWf) {
        setCurrentWfId(nextWf.id);
        setWorkflowName(nextWf.name);
        setActiveWorkflowId(nextWf.id);
        canvas.setWorkflow(nextWf);
      } else {
        const fallback = createWorkflow({ name: t('workflow.studio.defaultWorkflowName') });
        setWorkflowsList(loadSavedWorkflows());
        setCurrentWfId(fallback.id);
        setWorkflowName(fallback.name);
        setActiveWorkflowId(fallback.id);
        canvas.setWorkflow(fallback);
      }
    }
    showToast(t('workflow.studio.deletedToast'), 'info');
  };

  // Save workflow manually
  const handleSave = () => {
    if (!currentWfId) return;
    saveWorkflow({
      id: currentWfId,
      name: workflowName,
      nodes: canvas.nodes,
      edges: canvas.edges,
    });
    setWorkflowsList(loadSavedWorkflows());
    showToast(t('workflow.studio.savedToast', { name: workflowName }), 'success');
  };

  // Export JSON
  const handleExportJson = () => {
    const wf = {
      id: currentWfId,
      name: workflowName,
      nodes: canvas.nodes,
      edges: canvas.edges,
    };
    const jsonStr = exportWorkflowJson(wf);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('workflow.studio.exportSuccessToast'), 'success');
  };

  // Import JSON
  const handleImportJson = (content) => {
    try {
      const imported = importWorkflowJson(content);
      saveWorkflow(imported);
      setWorkflowsList(loadSavedWorkflows());
      canvas.setWorkflow(imported);
      setWorkflowName(imported.name || 'Workflow Đã Nhập');
      setCurrentWfId(imported.id || `wf_${Date.now()}`);
      setActiveWorkflowId(imported.id);
      setNodeStates({});
      showToast(t('workflow.studio.importSuccessToast'), 'success');
    } catch (err) {
      showToast(err.message || t('workflow.studio.importErrorToast'), 'error');
    }
  };

  // Clear Canvas
  const handleClear = () => {
    canvas.clearCanvas();
    setNodeStates({});
    showToast(t('workflow.studio.clearedCanvasToast'), 'info');
  };

  // Auto-Connect compatible ports across nodes
  const handleAutoConnect = () => {
    const res = canvas.autoConnectAll();
    if (res && res.addedCount > 0) {
      showToast(t('workflow.toast.autoConnected', { count: res.addedCount }), 'info');
    } else {
      showToast(t('workflow.toast.autoConnectNone'), 'info');
    }
  };

  const handleFitView = useCallback(() => {
    const el = canvasViewportRef.current;
    canvas.fitView(el?.clientWidth || 1000, el?.clientHeight || 600);
  }, [canvas.fitView]);

  const handleFocusNode = useCallback(
    (nodeId) => {
      if (!nodeId) return;
      canvas.setSelectedNodeId(nodeId);
      setShowRightSidebar(true);
      const el = canvasViewportRef.current;
      canvas.focusNode(nodeId, el?.clientWidth || 1000, el?.clientHeight || 600);
    },
    [canvas.setSelectedNodeId, canvas.focusNode]
  );

  const handleFocusFirstError = useCallback(() => {
    const firstId = Object.keys(preflight.nodeErrors || {})[0];
    if (firstId) {
      handleFocusNode(firstId);
    }
  }, [preflight.nodeErrors, handleFocusNode]);

  const handleDuplicateNode = useCallback(
    (nodeId) => {
      if (!nodeId) return;
      const dup = canvas.duplicateNode(nodeId);
      if (dup) {
        showToast(t('workflow.studio.duplicatedNodeToast'), 'success');
      }
    },
    [canvas.duplicateNode, t]
  );

  const handleToggleNodeDisabled = useCallback(
    (nodeId) => {
      if (!nodeId) return;
      const nextDisabled = canvas.toggleNodeDisabled(nodeId);
      if (nextDisabled !== null) {
        showToast(
          t(nextDisabled ? 'workflow.studio.nodeBypassedToast' : 'workflow.studio.nodeEnabledToast'),
          'info'
        );
      }
    },
    [canvas.toggleNodeDisabled, t]
  );

  const handleSaveRef = useRef(null);
  handleSaveRef.current = handleSave;

  // Global keyboard shortcuts when Workflow tab is visible and no modal/input is focused
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!studioRootRef.current || studioRootRef.current.offsetParent === null) return;
      if (isManagerModalOpen || saveDirErrorModal) return;
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;

      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const lowerKey = typeof e.key === 'string' ? e.key.toLowerCase() : '';

      if (mod && lowerKey === 's') {
        e.preventDefault();
        handleSaveRef.current?.();
        return;
      }

      if (!mod && !e.altKey && lowerKey === 'f') {
        e.preventDefault();
        handleFitView();
        return;
      }

      // Block graph-mutating shortcuts while workflow execution is running
      if (isRunning) return;

      if (mod && lowerKey === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          canvas.redo();
        } else {
          canvas.undo();
        }
        return;
      }

      if (e.ctrlKey && !e.metaKey && lowerKey === 'y') {
        e.preventDefault();
        canvas.redo();
        return;
      }

      if (mod && lowerKey === 'd') {
        if (canvas.selectedNodeId) {
          e.preventDefault();
          handleDuplicateNode(canvas.selectedNodeId);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (canvas.selectedNodeId) {
          e.preventDefault();
          canvas.removeNode(canvas.selectedNodeId);
        } else if (canvas.selectedEdgeId) {
          e.preventDefault();
          canvas.removeEdge(canvas.selectedEdgeId);
        }
        return;
      }

      if (!mod && !e.altKey && lowerKey === 'b' && canvas.selectedNodeId) {
        e.preventDefault();
        handleToggleNodeDisabled(canvas.selectedNodeId);
        return;
      }

      if (!mod && !e.altKey && canvas.selectedNodeId) {
        const step = e.shiftKey ? 40 : 10;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          canvas.nudgeNode(canvas.selectedNodeId, -step, 0);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          canvas.nudgeNode(canvas.selectedNodeId, step, 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          canvas.nudgeNode(canvas.selectedNodeId, 0, -step);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          canvas.nudgeNode(canvas.selectedNodeId, 0, step);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isRunning,
    isManagerModalOpen,
    saveDirErrorModal,
    canvas,
    handleDuplicateNode,
    handleToggleNodeDisabled,
    handleFitView,
  ]);

  const selectedNode = canvas.nodes.find((n) => n.id === canvas.selectedNodeId);
  const errorCount = Object.keys(preflight.nodeErrors || {}).length;

  return (
    <div ref={studioRootRef} className="flex flex-col h-full w-full bg-surface text-on-surface overflow-hidden select-none font-sans">
      {/* Top Toolbar */}
      <WorkflowToolbar
        workflowName={workflowName}
        onChangeWorkflowName={setWorkflowName}
        isRunning={isRunning}
        canRun={preflight.isValid}
        blockingReason={preflight.blockingReason}
        errorCount={errorCount}
        onFocusFirstError={handleFocusFirstError}
        onRun={handleRun}
        onStop={handleStop}
        onOpenWorkflowManager={() => {
          setWorkflowsList(getOrInitWorkflows());
          setIsManagerModalOpen(true);
        }}
        onNewWorkflow={handleQuickNewWorkflow}
        onAutoConnect={handleAutoConnect}
        onSave={handleSave}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onClear={handleClear}
        nodeCount={canvas.nodes.length}
        isConsoleOpen={isConsoleOpen}
        onToggleConsole={() => setIsConsoleOpen((prev) => !prev)}
        logCount={logs.length}
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={() => setShowLeftSidebar((prev) => !prev)}
        showRightSidebar={showRightSidebar}
        onToggleRightSidebar={() => setShowRightSidebar((prev) => !prev)}
      />

      {/* Main Studio Body: Palette + Canvas + Inspector */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left: Palette */}
        {showLeftSidebar && (
          <WorkflowPalette
            onAddNode={handleAddNode}
            width={leftSidebarWidth}
            onResizeStart={handleLeftSidebarResizeStart}
            onClose={() => setShowLeftSidebar(false)}
          />
        )}

        {/* Center: Infinite Canvas */}
        <main className="flex-1 relative h-full overflow-hidden">
          <WorkflowCanvas
            nodes={canvas.nodes}
            edges={canvas.edges}
            pan={canvas.pan}
            zoom={canvas.zoom}
            selectedNodeId={canvas.selectedNodeId}
            selectedEdgeId={canvas.selectedEdgeId}
            connecting={canvas.connecting}
            nodeStates={nodeStates}
            nodeErrors={preflight.nodeErrors}
            isRunning={isRunning}
            canUndo={canvas.canUndo}
            canRedo={canvas.canRedo}
            onUndo={canvas.undo}
            onRedo={canvas.redo}
            onSelectNode={handleSelectNode}
            onSelectEdge={canvas.setSelectedEdgeId}
            onRemoveNode={canvas.removeNode}
            onDuplicateNode={handleDuplicateNode}
            onToggleNodeDisabled={handleToggleNodeDisabled}
            onRemoveEdge={canvas.removeEdge}
            onUpdateNodePosition={canvas.updateNodePosition}
            onSetNodePosition={canvas.setNodePosition}
            onCommitNodeDrag={(snap) => canvas.commitHistorySnapshot(snap)}
            onAddEdge={canvas.addEdge}
            onStartConnect={canvas.setConnecting}
            onCompleteConnect={(edge) => {
              canvas.addEdge(edge);
              canvas.setConnecting(null);
            }}
            onCancelConnect={canvas.cancelConnecting}
            onDisconnectPort={canvas.disconnectPort}
            onConnectError={(msg) => showToast(msg, 'warning')}
            onRetryNode={handleRetryNode}
            startCanvasDrag={canvas.startCanvasDrag}
            onCanvasMouseMove={canvas.onCanvasMouseMove}
            onCanvasMouseUp={canvas.onCanvasMouseUp}
            onSetPan={canvas.setPan}
            handleWheel={canvas.handleWheel}
            zoomIn={canvas.zoomIn}
            zoomOut={canvas.zoomOut}
            resetView={canvas.resetView}
            onFitView={canvas.fitView}
            onAutoLayout={canvas.autoLayout}
            onAutoConnect={handleAutoConnect}
            onDropNewNode={handleAddNode}
            viewportRef={canvasViewportRef}
          />

          {/* Floating Manga Translate-style HUD & Log Console */}
          {isConsoleOpen && (
            <WorkflowLogConsole
              workflowName={workflowName}
              nodes={canvas.nodes}
              edges={canvas.edges}
              nodeStates={nodeStates}
              logs={logs}
              isRunning={isRunning}
              isCompleted={isCompleted}
              isError={isError}
              errorMessage={errorMessage}
              lastOutputDir={lastOutputDir}
              onClearLogs={() => setLogs([])}
              onStop={handleStop}
              onClose={() => setIsConsoleOpen(false)}
              onSelectStep={handleFocusNode}
            />
          )}

          {/* Floating Toast Notification */}
          {toastMessage && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-surface-container-highest/95 border border-outline-variant/40 shadow-2xl text-xs font-semibold text-on-surface flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  toastMessage.type === 'error'
                    ? 'bg-error'
                    : toastMessage.type === 'success'
                    ? 'bg-emerald-500'
                    : 'bg-primary'
                }`}
              />
              <span>{toastMessage.text}</span>
            </div>
          )}
        </main>

        {/* Right: Inspector */}
        {showRightSidebar && (
          <WorkflowInspector
            selectedNode={selectedNode}
            nodes={canvas.nodes}
            edges={canvas.edges}
            workflowName={workflowName}
            onChangeWorkflowName={setWorkflowName}
            nodeCount={canvas.nodes.length}
            edgeCount={canvas.edges.length}
            width={rightSidebarWidth}
            onResizeStart={handleRightSidebarResizeStart}
            onClose={() => setShowRightSidebar(false)}
            onUpdateData={canvas.updateNodeData}
            onRemoveNode={canvas.removeNode}
            defaultDownloadsDir={systemDownloadsDir}
            onKindleAuthChange={setIsKindleLoggedIn}
            onGoogleDriveChange={checkGoogleDriveStatus}
          />
        )}
      </div>

      {/* Workflow Projects Manager Modal (Manga Studio style) */}
      <WorkflowManagerModal
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        workflows={workflowsList}
        currentWfId={currentWfId}
        onSelectWorkflow={handleSelectWorkflow}
        onCreateWorkflow={handleCreateWorkflow}
        onRenameWorkflow={handleRenameWorkflow}
        onDuplicateWorkflow={handleDuplicateWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
      />

      {/* Modal cảnh báo thư mục lưu không hợp lệ */}
      <SaveDirErrorModal
        open={Boolean(saveDirErrorModal)}
        error={saveDirErrorModal?.message}
        path={saveDirErrorModal?.path}
        onClose={() => setSaveDirErrorModal(null)}
        onSelectNewDir={() => setSaveDirErrorModal(null)}
      />
    </div>
  );
}
