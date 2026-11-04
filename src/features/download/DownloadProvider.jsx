import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyQueueStopState, normalizeQueueForRestore } from './queueSnapshot';
import { evaluateFreeUserChapterGate } from '../../utils/freeUserCreditGate.mjs';
import { pushRecentDownload } from '../../utils/recentDownloadsLog';
import { useI18n } from '../../context/I18nContext';
import { useAppLog } from '../../shared';
import { useAuth } from '../../auth';
import { useSettings } from '../settings';
import {
  shouldPersistQueue,
  persistQueueIfHydrated,
  clearQueueSnapshot,
  loadQueueSnapshotFromStorage,
  hasIncompleteWork,
} from './queuePersist';
import {
  countNewChaptersForManga,
  mergeChaptersIntoQueue,
  removeQueueGroup as removeQueueGroupState,
  removeQueueChapter as removeQueueChapterState,
  skipQueueChapter as skipQueueChapterState,
  retryQueueChapter as retryQueueChapterState,
  reorderQueueChapter as reorderQueueChapterState,
  clearCompletedQueueGroups,
  clearCompletedChaptersInGroup as clearCompletedChaptersInGroupState,
  pauseQueueGroups,
  toggleGroupDownloadOrder as toggleGroupDownloadOrderState,
  retryFailedChapters as retryFailedChaptersState,
  reorderQueueGroups,
  mergeHistoryRowsIntoQueue,
  countNewHistoryChapters,
  listQueuedChapterUrlsAhead,
  setGroupWorkflow as setGroupWorkflowMutation,
  setAllGroupsWorkflow as setAllGroupsWorkflowMutation,
  updateGroupWorkflowState as updateGroupWorkflowStateMutation,
} from './queueMutations';
import {
  DEFAULT_QUEUE_WORKFLOW_STORAGE_KEY,
  shouldRunGroupWorkflow,
  resolveGroupWorkflowId,
  executeQueueGroupWorkflow,
} from './queueWorkflowExecution';
import { useCurrentMangaSession } from './useCurrentMangaSession';
import { applyChapterResult, buildRetryLogMessage } from './applyChapterResult';
import { loadDownloadHistory, writeDownloadHistory, prependHistory } from './historyStorage';
import { nextQueueTabFocusNonce } from './queueTabFocus.js';
import { savePanelUi } from '../../utils/panelUiPrefs';

const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
  const { t } = useI18n();
  const { appendLog } = useAppLog();
  const { savePath, threads, autoRetryMax } = useSettings();
  const {
    authSession,
    isSignedIn,
    freeUserRemainingTokens,
    setFreeUserRemainingTokens,
    setFreeUserTokenExhaustedOpen,
    shouldConsumeFreeUserToken,
  } = useAuth();
  const manga_session = useCurrentMangaSession();
  const { mangadexLanguage, comickLanguage, mangaballLanguage } = manga_session;
  const [queue, setQueue] = useState([]);
  const [queueSelectedIds, setQueueSelectedIds] = useState(() => new Set());
  /** false until snapshot hydrate finishes (do not overwrite localStorage with []). */
  const [queueHydrated, setQueueHydrated] = useState(false);
  const [pendingRestoreQueue, setPendingRestoreQueue] = useState(null);
  const [queueProcessing, setQueueProcessing] = useState(false);
  /** Tiến độ trang từ main (IPC) khi đang tải chương. */
  const [downloadProgress, setDownloadProgress] = useState(null);
  /** Lịch sử từng chương (ok / lỗi) — xem tab History; lưu localStorage. */
  const [downloadHistory, setDownloadHistory] = useState(() => loadDownloadHistory());
  /** Incremented to switch a mounted HomeWorkspace to the Queue tab. */
  const [queueTabFocusNonce, setQueueTabFocusNonce] = useState(0);
  const [defaultQueueWorkflowId, setDefaultQueueWorkflowIdState] = useState(() => {
    try {
      return localStorage.getItem(DEFAULT_QUEUE_WORKFLOW_STORAGE_KEY) || 'none';
    } catch {
      return 'none';
    }
  });

  const queueRef = useRef(queue);
  const queueSelectedIdsRef = useRef(queueSelectedIds);
  const queueHydratedRef = useRef(false);
  const queueAbortRef = useRef(false);
  const queueProcessingRef = useRef(false);
  const activeWorkflowRunIdRef = useRef(null);
  /** Tăng khi stop — vòng processQueue cũ bỏ qua kết quả download trễ. */
  const queueRunGenerationRef = useRef(0);
  const defaultQueueWorkflowIdRef = useRef(defaultQueueWorkflowId);

  useEffect(() => {
    defaultQueueWorkflowIdRef.current = defaultQueueWorkflowId;
  }, [defaultQueueWorkflowId]);

  const setDefaultQueueWorkflowId = useCallback((id) => {
    const cleanId = String(id || 'none').trim() || 'none';
    setDefaultQueueWorkflowIdState(cleanId);
    try {
      localStorage.setItem(DEFAULT_QUEUE_WORKFLOW_STORAGE_KEY, cleanId);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    queueSelectedIdsRef.current = queueSelectedIds;
  }, [queueSelectedIds]);

  useEffect(() => {
    queueProcessingRef.current = queueProcessing;
  }, [queueProcessing]);

  /** Drop ids no longer in queue (after delete / clear) or already fully downloaded. */
  useEffect(() => {
    const valid = new Set(queue.map((g) => g.id));
    // Completed group: every chapter is 'done' (including failed), none still 'waiting'
    const completed = new Set(
      queue
        .filter((g) => g.chapters.length > 0 && g.chapters.every((c) => c.status === 'done'))
        .map((g) => g.id)
    );
    setQueueSelectedIds((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (valid.has(id) && !completed.has(id)) next.add(id);
      }
      return next;
    });
  }, [queue]);

  useEffect(() => {
    queueHydratedRef.current = queueHydrated;
  }, [queueHydrated]);

  useEffect(() => {
    const snap = loadQueueSnapshotFromStorage();
    if (snap && hasIncompleteWork(snap)) {
      setPendingRestoreQueue(snap);
    } else {
      setQueueHydrated(true);
    }
  }, []);

  useEffect(() => {
    persistQueueIfHydrated(queueHydrated, queue);
    return undefined;
  }, [queue, queueHydrated]);

  useEffect(() => {
    const flush = () => {
      if (!shouldPersistQueue(queueHydratedRef.current)) return;
      persistQueueIfHydrated(queueHydratedRef.current, queueRef.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.subscribeDownloadProgress) return undefined;
    const unsub = api.subscribeDownloadProgress((data) => {
      setDownloadProgress(data);
    });
    return () => unsub?.();
  }, []);

  const confirmRestoreQueue = useCallback(() => {
    if (!pendingRestoreQueue?.length) {
      setPendingRestoreQueue(null);
      setQueueHydrated(true);
      return;
    }
    setQueue(normalizeQueueForRestore(pendingRestoreQueue));
    setPendingRestoreQueue(null);
    setQueueHydrated(true);
  }, [pendingRestoreQueue]);

  const dismissRestoreQueue = useCallback(() => {
    clearQueueSnapshot();
    setPendingRestoreQueue(null);
    setQueueHydrated(true);
  }, []);

  const focusQueueTab = useCallback(() => {
    savePanelUi({ queueTab: 'queue' });
    setQueueTabFocusNonce((n) => nextQueueTabFocusNonce(n));
  }, []);

  const appendDownloadHistoryEntry = useCallback((entry) => {
    setDownloadHistory((prev) => {
      const next = prependHistory(prev, entry);
      writeDownloadHistory(next);
      return next;
    });
  }, []);

  const clearDownloadHistory = useCallback((filterStatus = 'all') => {
    setDownloadHistory((prev) => {
      const rowStatusKey = (row) => {
        if (row.skipped) return 'skipped';
        if (row.ok) return 'ok';
        return 'error';
      };
      
      const next = filterStatus === 'all' 
        ? [] 
        : prev.filter((row) => rowStatusKey(row) !== filterStatus);
      
      writeDownloadHistory(next);
      return next;
    });
  }, []);

  const removeDownloadHistoryEntry = useCallback((id) => {
    setDownloadHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeDownloadHistory(next);
      return next;
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (queueProcessingRef.current) {
      return;
    }
    const api = window.electronAPI;
    if (!api?.downloadChapter) {
      appendLog(t('app.log.electronDownload'), 'warn');
      return;
    }
    if (!savePath.trim()) {
      appendLog(t('app.log.needSavePathShort'), 'warn');
      return;
    }

    let selected = queueSelectedIdsRef.current;
    if (!selected.size) {
      const waitingGroupIds = queueRef.current
        .filter((g) => !g.paused && g.chapters.some((c) => c.status === 'waiting'))
        .map((g) => g.id);
      if (waitingGroupIds.length > 0) {
        selected = new Set(waitingGroupIds);
        queueSelectedIdsRef.current = selected;
        setQueueSelectedIds(selected);
      }
    }

    const hasWaiting = queueRef.current.some(
      (g) =>
        selected.has(g.id) &&
        !g.paused &&
        g.chapters.some((c) => c.status === 'waiting')
    );
    if (!selected.size) {
      appendLog(t('app.log.queueStartNeedManga'), 'warn');
      return;
    }
    if (!hasWaiting) {
      appendLog(t('app.log.queueNoWaitingChapters'), 'warn');
      return;
    }
    const runId = ++queueRunGenerationRef.current;
    queueAbortRef.current = false;
    queueProcessingRef.current = true;
    setQueueProcessing(true);
    try {
      while (!queueAbortRef.current && runId === queueRunGenerationRef.current) {
        const current = queueRef.current;
        let group = null;
        let chapter = null;
        const sel = queueSelectedIdsRef.current;
        for (const g of current) {
          if (!sel.has(g.id)) continue;
          if (g.paused) continue;
          const waiting = g.chapters.filter((c) => c.status === 'waiting');
          if (!waiting.length) continue;
          const w = waiting[0];
          if (w) {
            group = g;
            chapter = w;
            break;
          }
        }
        if (!chapter || !group) break;
        if (runId !== queueRunGenerationRef.current || queueAbortRef.current) break;

        if (shouldConsumeFreeUserToken) {
          const email = String(authSession?.email || '').trim();
          if (!email) {
            appendLog(t('app.log.noEmailForToken'), 'warn');
            break;
          }
          const ensureRes = await api.ensureFreeUserCreditsByEmail?.({
            email,
            userType: authSession?.userType,
            impliedSupabaseFree: authSession?.impliedSupabaseFree,
            entitlements: authSession?.entitlements,
            isAdmin: authSession?.isAdmin,
          });
          const credit_gate = evaluateFreeUserChapterGate({
            shouldConsume: true,
            ensureResult: ensureRes,
          });
          if (credit_gate.remaining != null) {
            setFreeUserRemainingTokens(credit_gate.remaining);
          }
          if (credit_gate.showExhaustedModal) {
            appendLog(t('freeUserToken.modalBody'), 'warn');
            setFreeUserTokenExhaustedOpen(true);
            break;
          }
          if (credit_gate.block) {
            appendLog(
              t('app.log.tokenCheckBeforeDownload', {
                error: credit_gate.error || t('app.log.fetchErrorUnknown'),
              }),
              'warn'
            );
            break;
          }
        }

        setQueue((prev) =>
          prev.map((gg) =>
            gg.id !== group.id
              ? gg
              : {
                  ...gg,
                  chapters: gg.chapters.map((c) =>
                    c.id === chapter.id ? { ...c, status: 'downloading' } : c
                  ),
                }
          )
        );

        appendLog(
          t('app.log.queueChapterStart', {
            mangaTitle: group.mangaTitle,
            chapterTitle: chapter.chapterTitle,
          }),
          'info'
        );
        try {
          const res = await api.downloadChapter({
            site: group.site,
            mangaTitle: group.mangaTitle,
            mangaUrl: group.mangaUrl,
            chapterUrl: chapter.chapterUrl,
            chapterTitle: chapter.chapterTitle,
            baseSaveDir: savePath.trim(),
            numberOfThreads: Math.max(1, Math.min(Number(threads) || 5, 5)),
            coverUrl: group.coverUrl,
            mangadexLanguage,
            comickLanguage,
            mangaballLanguage,
            prefetchChapterUrls:
              String(group.site || '').toLowerCase() === 'comix'
                ? listQueuedChapterUrlsAhead(group.chapters, chapter.id, 8)
                : undefined,
          });
          if (
            runId !== queueRunGenerationRef.current ||
            queueAbortRef.current ||
            res?.aborted
          ) {
            if (runId === queueRunGenerationRef.current) {
              setQueue((prev) => applyQueueStopState(prev, { pauseGroupIds: [group.id] }));
              appendLog(t('app.log.queueStoppedMidDownload'), 'info');
            }
            break;
          }
          const ok = Boolean(res?.ok || res?.skipped);
          const downloadedOk = Boolean(res?.ok);
          let tokenConsumeError = '';
          let tokenConsumeNeedLogin = false;
          if (downloadedOk && shouldConsumeFreeUserToken) {
            const email = String(authSession?.email || '').trim();
            if (!email) {
              tokenConsumeError = t('app.log.noEmailForTokenAuth');
            } else {
              const consumeRes = await api.consumeFreeUserDownloadCredit?.({
                email,
                userType: authSession?.userType,
                impliedSupabaseFree: authSession?.impliedSupabaseFree,
                mangaUrl: group.mangaUrl,
                chapterUrl: chapter.chapterUrl,
              });
              if (!consumeRes || consumeRes.ok !== true) {
                if (consumeRes?.needLogin) {
                  tokenConsumeNeedLogin = true;
                  tokenConsumeError = t('freeUserToken.modalBody');
                } else {
                  tokenConsumeError = t('app.log.tokenVerifyFailed', {
                    error: consumeRes?.error || t('app.log.fetchErrorUnknown'),
                  });
                }
              } else {
                setFreeUserRemainingTokens(
                  Number.isFinite(Number(consumeRes?.remainingTokens))
                    ? Math.max(0, Math.floor(Number(consumeRes.remainingTokens)))
                    : freeUserRemainingTokens
                );
              }
            }
          }
          if (runId !== queueRunGenerationRef.current || queueAbortRef.current) {
            break;
          }
          let latestGroup = null;
          setQueue((prev) => {
            const next = prev.map((gg) =>
              gg.id !== group.id
                ? gg
                : {
                    ...gg,
                    chapters: gg.chapters.map((c) => {
                      if (c.id !== chapter.id) return c;
                      if (ok) {
                        const { downloadError, ...rest } = c;
                        return { ...rest, status: 'done' };
                      }
                      const errorMsg = res?.aborted ? t('queue.status.skipped') : (res?.error || t('app.log.downloadIncompleteShort'));
                      const result = applyChapterResult(c, false, errorMsg, res?.aborted ? 0 : autoRetryMax);
                      if (result.status === 'waiting') {
                        appendLog(
                          buildRetryLogMessage(
                            t,
                            group.mangaTitle,
                            c.chapterTitle,
                            result.retryCount,
                            autoRetryMax
                          ),
                          'warn'
                        );
                      }
                      return result;
                    }),
                  }
            );
            queueRef.current = next;
            latestGroup = next.find((g) => g.id === group.id);
            return next;
          });
          appendDownloadHistoryEntry({
            id: `${Date.now()}-${chapter.id}`,
            at: new Date().toISOString(),
            mangaTitle: group.mangaTitle,
            chapterTitle: chapter.chapterTitle,
            chapterUrl: chapter.chapterUrl,
            mangaUrl: group.mangaUrl,
            siteId: group.site,
            coverUrl: group.coverUrl || '',
            baseSaveDir: savePath.trim(),
            ok,
            skipped: Boolean(res?.skipped),
            message: ok ? undefined : res?.error || t('app.log.downloadIncompleteShort'),
            successCount: res?.successCount,
            totalPages: res?.totalPages,
            failedPageIndices: Array.isArray(res?.failedPageIndices) ? res.failedPageIndices : undefined,
          });
          if (ok) {
            try {
              pushRecentDownload({
                mangaId: group.id,
                mangaTitle: group.mangaTitle,
                chapterTitle: chapter.chapterTitle,
                chapterUrl: chapter.chapterUrl,
                coverUrl: group.coverUrl || '',
                connectorId: group.site || '',
                completedAt: Date.now(),
              });
              window.dispatchEvent(new CustomEvent('crawler:download-completed'));
            } catch { /* localStorage quota / window missing — ignore */ }
          }
          if (!ok) {
            appendLog(
              t('app.log.downloadChapterWarn', {
                mangaTitle: group.mangaTitle,
                chapterTitle: chapter.chapterTitle,
                error: res?.error || t('app.log.downloadIncompleteFallback'),
              }),
              'warn'
            );
          }
          if (tokenConsumeError) {
            if (tokenConsumeNeedLogin) {
              setFreeUserRemainingTokens(0);
              setFreeUserTokenExhaustedOpen(true);
            }
            appendLog(tokenConsumeError, 'warn');
            appendLog(t('app.log.queuePausedAfterTokenError'), 'warn');
            break;
          }

          if (latestGroup && !queueAbortRef.current && runId === queueRunGenerationRef.current) {
            const grpChapters = latestGroup.chapters || [];
            const noWaiting = !grpChapters.some((c) => c.status === 'waiting' || c.status === 'downloading');
            if (noWaiting) {
              const hasGroupErrors = grpChapters.some((c) => c.status === 'error' || Boolean(c.downloadError));
              if (hasGroupErrors) {
                if (latestGroup.workflowState === 'idle') {
                  setQueue((prev) => {
                    const next = updateGroupWorkflowStateMutation(prev, group.id, { workflowState: 'skipped' });
                    queueRef.current = next;
                    return next;
                  });
                }
              } else if (shouldRunGroupWorkflow(latestGroup)) {
                await executeQueueGroupWorkflow({
                  group: latestGroup,
                  savePath: savePath.trim(),
                  defaultWorkflowId: defaultQueueWorkflowIdRef.current,
                  electronAPI: window.electronAPI,
                  onUpdateGroup: (gId, updates) => {
                    setQueue((prev) => {
                      const next = updateGroupWorkflowStateMutation(prev, gId, updates);
                      queueRef.current = next;
                      return next;
                    });
                  },
                  appendLog,
                  t,
                  isAborted: () => queueAbortRef.current || runId !== queueRunGenerationRef.current,
                  onRunStarted: (rId) => {
                    activeWorkflowRunIdRef.current = rId;
                  },
                  onRunEnded: () => {
                    activeWorkflowRunIdRef.current = null;
                  },
                });
              }
            }
          }
        } catch (e) {
          if (runId !== queueRunGenerationRef.current) {
            break;
          }
          const msg = String(e?.message || e);
          setQueue((prev) => {
            const next = prev.map((gg) =>
              gg.id !== group.id
                ? gg
                : {
                    ...gg,
                    chapters: gg.chapters.map((c) => {
                      if (c.id !== chapter.id) return c;
                      const result = applyChapterResult(c, false, msg, autoRetryMax);
                      if (result.status === 'waiting') {
                        appendLog(
                          buildRetryLogMessage(
                            t,
                            group.mangaTitle,
                            c.chapterTitle,
                            result.retryCount,
                            autoRetryMax
                          ),
                          'warn'
                        );
                      }
                      return result;
                    }),
                  }
            );
            queueRef.current = next;
            const updatedGrp = next.find((g) => g.id === group.id);
            if (updatedGrp) {
              const grpChapters = updatedGrp.chapters || [];
              const noWaiting = !grpChapters.some((c) => c.status === 'waiting' || c.status === 'downloading');
              if (noWaiting && grpChapters.some((c) => c.status === 'error' || Boolean(c.downloadError))) {
                if (updatedGrp.workflowState === 'idle') {
                  const marked = updateGroupWorkflowStateMutation(next, group.id, { workflowState: 'skipped' });
                  queueRef.current = marked;
                  return marked;
                }
              }
            }
            return next;
          });
          appendDownloadHistoryEntry({
            id: `${Date.now()}-${chapter.id}`,
            at: new Date().toISOString(),
            mangaTitle: group.mangaTitle,
            chapterTitle: chapter.chapterTitle,
            chapterUrl: chapter.chapterUrl,
            mangaUrl: group.mangaUrl,
            siteId: group.site,
            coverUrl: group.coverUrl || '',
            baseSaveDir: savePath.trim(),
            ok: false,
            message: msg,
          });
          appendLog(msg, 'error');
        } finally {
          setDownloadProgress(null);
        }
      }
      if (!queueAbortRef.current) {
        appendLog(t('app.log.queueProcessingDone'), 'success');
      }
    } finally {
      queueProcessingRef.current = false;
      setQueueProcessing(false);
      setDownloadProgress(null);
    }
  }, [
    savePath,
    threads,
    autoRetryMax,
    appendLog,
    appendDownloadHistoryEntry,
    mangadexLanguage,
    comickLanguage,
    mangaballLanguage,
    isSignedIn,
    shouldConsumeFreeUserToken,
    authSession,
    freeUserRemainingTokens,
    t,
  ]);

  const enqueueChapters = useCallback((group_meta, chapter_list) => {
    const list = Array.isArray(chapter_list) ? chapter_list : [];
    const manga_url = String(group_meta?.mangaUrl || '').trim();
    const added_count = countNewChaptersForManga(queueRef.current, manga_url, list);
    if (added_count === 0) return { addedCount: 0 };
    const metaWithWf = {
      initialWorkflowId: defaultQueueWorkflowIdRef.current,
      ...group_meta,
      mangaUrl: manga_url,
    };
    const next = mergeChaptersIntoQueue(queueRef.current, metaWithWf, list);
    queueRef.current = next;
    setQueue(next);

    const targetGroup = next.find((g) => g.mangaUrl === manga_url);
    if (targetGroup) {
      const nextSelected = new Set(queueSelectedIdsRef.current);
      nextSelected.add(targetGroup.id);
      queueSelectedIdsRef.current = nextSelected;
      setQueueSelectedIds(nextSelected);
    }

    return { addedCount: added_count };
  }, []);

  const enqueueHistoryRows = useCallback((rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const stats = countNewHistoryChapters(queueRef.current, list);
    if (stats.addedCount === 0) return stats;
    const next = mergeHistoryRowsIntoQueue(queueRef.current, list);
    queueRef.current = next;
    setQueue(next);

    const nextSelected = new Set(queueSelectedIdsRef.current);
    for (const g of next) {
      if (g.chapters.some((c) => c.status === 'waiting')) {
        nextSelected.add(g.id);
      }
    }
    queueSelectedIdsRef.current = nextSelected;
    setQueueSelectedIds(nextSelected);

    return stats;
  }, []);

  const removeQueueGroup = useCallback((group_id) => {
    setQueue((prev) => removeQueueGroupState(prev, group_id));
  }, []);

  const removeQueueChapter = useCallback((group_id, chapter_id) => {
    setQueue((prev) => removeQueueChapterState(prev, group_id, chapter_id));
  }, []);

  const skipQueueChapter = useCallback((group_id, chapter_id, is_downloading) => {
    setQueue((prev) => skipQueueChapterState(prev, group_id, chapter_id));
    if (is_downloading) window.electronAPI?.abortDownload?.();
  }, []);

  const retryQueueChapter = useCallback((group_id, chapter_id) => {
    setQueue((prev) => retryQueueChapterState(prev, group_id, chapter_id));
  }, []);

  const reorderQueueChapter = useCallback((group_id, from_idx, to_idx) => {
    setQueue((prev) => reorderQueueChapterState(prev, group_id, from_idx, to_idx));
  }, []);

  const clearCompletedFromQueue = useCallback(() => {
    setQueue((prev) => clearCompletedQueueGroups(prev));
  }, []);

  const clearCompletedChaptersInGroup = useCallback((group_id) => {
    setQueue((prev) => clearCompletedChaptersInGroupState(prev, group_id));
  }, []);

  const setQueueGroupsPaused = useCallback((group_ids, paused) => {
    setQueue((prev) => pauseQueueGroups(prev, group_ids, paused));
  }, []);

  const toggleGroupDownloadOrder = useCallback((group_id) => {
    setQueue((prev) => toggleGroupDownloadOrderState(prev, group_id));
  }, []);

  const retryFailedChapters = useCallback((group_id) => {
    setQueue((prev) => retryFailedChaptersState(prev, group_id));
  }, []);

  const reorderQueue = useCallback((from_index, to_index) => {
    setQueue((prev) => reorderQueueGroups(prev, from_index, to_index));
  }, []);

  const setGroupWorkflow = useCallback((groupId, workflowId) => {
    setQueue((prev) => {
      const next = setGroupWorkflowMutation(prev, groupId, workflowId);
      queueRef.current = next;
      return next;
    });
  }, []);

  const setAllGroupsWorkflow = useCallback((workflowId) => {
    setQueue((prev) => {
      const next = setAllGroupsWorkflowMutation(prev, workflowId);
      queueRef.current = next;
      return next;
    });
  }, []);

  const retryGroupWorkflow = useCallback(
    async (groupId) => {
      const group = queueRef.current.find((g) => g.id === groupId);
      if (!group) return;

      const chapters = group.chapters || [];
      const hasErrors = chapters.some((c) => c.status === 'error' || Boolean(c.downloadError));
      const allDone = chapters.length > 0 && chapters.every((c) => c.status === 'done');
      if (!allDone || hasErrors) {
        appendLog(
          t('queue.cannotRunWorkflowIncomplete') ||
            'Không thể chạy quy trình: Truyện chưa tải xong 100% hoặc có chapter lỗi',
          'warn'
        );
        return;
      }

      await executeQueueGroupWorkflow({
        group,
        savePath: savePath.trim(),
        defaultWorkflowId: defaultQueueWorkflowIdRef.current,
        electronAPI: window.electronAPI,
        onUpdateGroup: (gId, updates) => {
          setQueue((prev) => {
            const next = updateGroupWorkflowStateMutation(prev, gId, updates);
            queueRef.current = next;
            return next;
          });
        },
        appendLog,
        t,
        isAborted: () => queueAbortRef.current,
        onRunStarted: (rId) => {
          activeWorkflowRunIdRef.current = rId;
        },
        onRunEnded: () => {
          activeWorkflowRunIdRef.current = null;
        },
      });
    },
    [savePath, appendLog, t]
  );

  const stopQueue = useCallback(
    (pauseGroupIds = null) => {
      queueAbortRef.current = true;
      queueProcessingRef.current = false;
      queueRunGenerationRef.current += 1;
      window.electronAPI?.abortDownload?.();
      if (activeWorkflowRunIdRef.current) {
        window.electronAPI?.workflowStop?.({ runId: activeWorkflowRunIdRef.current });
        activeWorkflowRunIdRef.current = null;
      }
      setDownloadProgress(null);
      setQueueProcessing(false);
      setQueue((prev) =>
        applyQueueStopState(prev, {
          pauseGroupIds: Array.isArray(pauseGroupIds) ? pauseGroupIds : undefined,
        })
      );
      appendLog(t('app.log.stoppingDownload'), 'info');
    },
    [appendLog, t]
  );

  const value = useMemo(
    () => ({
      queue,
      queueSelectedIds,
      setQueueSelectedIds,
      queueHydrated,
      pendingRestoreQueue,
      confirmRestoreQueue,
      dismissRestoreQueue,
      queueRef,
      queueSelectedIdsRef,
      queueProcessing,
      startQueue: processQueue,
      stopQueue,
      downloadProgress,
      downloadHistory,
      appendDownloadHistoryEntry,
      clearDownloadHistory,
      removeDownloadHistoryEntry,
      queueTabFocusNonce,
      focusQueueTab,
      enqueueChapters,
      enqueueHistoryRows,
      removeQueueGroup,
      removeQueueChapter,
      skipQueueChapter,
      retryQueueChapter,
      reorderQueueChapter,
      clearCompletedFromQueue,
      clearCompletedChaptersInGroup,
      setQueueGroupsPaused,
      toggleGroupDownloadOrder,
      retryFailedChapters,
      reorderQueue,
      defaultQueueWorkflowId,
      setDefaultQueueWorkflowId,
      setGroupWorkflow,
      setAllGroupsWorkflow,
      retryGroupWorkflow,
      ...manga_session,
    }),
    [
      queue,
      queueSelectedIds,
      queueHydrated,
      pendingRestoreQueue,
      confirmRestoreQueue,
      dismissRestoreQueue,
      queueProcessing,
      processQueue,
      stopQueue,
      downloadProgress,
      downloadHistory,
      appendDownloadHistoryEntry,
      clearDownloadHistory,
      removeDownloadHistoryEntry,
      queueTabFocusNonce,
      focusQueueTab,
      enqueueChapters,
      enqueueHistoryRows,
      removeQueueGroup,
      removeQueueChapter,
      skipQueueChapter,
      retryQueueChapter,
      reorderQueueChapter,
      clearCompletedFromQueue,
      clearCompletedChaptersInGroup,
      setQueueGroupsPaused,
      toggleGroupDownloadOrder,
      retryFailedChapters,
      reorderQueue,
      defaultQueueWorkflowId,
      setDefaultQueueWorkflowId,
      setGroupWorkflow,
      setAllGroupsWorkflow,
      retryGroupWorkflow,
      manga_session,
    ]
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownload() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownload must be used within DownloadProvider');
  return ctx;
}
