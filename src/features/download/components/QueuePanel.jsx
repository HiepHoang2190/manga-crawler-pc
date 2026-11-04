import { useMemo, useRef, useState, Fragment } from 'react';
import { useI18n } from '../../../context/I18nContext';
import {
  groupProgress,
  groupProgressPercent,
} from '../../../utils/queueProgress';
import ProgressPanel from './ProgressPanel';
import QueueCoverThumb from './QueueCoverThumb.jsx';
import QueueWorkflowSelector from './QueueWorkflowSelector';
import { useDownload } from '../DownloadProvider';
import { SearchableSelect, EmptyState, StudioTable } from '../../../shared';

function useDownloadSafe() {
  try {
    return useDownload();
  } catch {
    return {};
  }
}


const QUEUE_DRAG_MIME = 'application/x-manga-queue-index';

function readQueueDragFromIndex(dataTransfer, dragFromIndexRef) {
  const fromRef = dragFromIndexRef.current;
  if (fromRef != null && Number.isFinite(fromRef)) return fromRef;
  const raw =
    dataTransfer?.getData?.(QUEUE_DRAG_MIME) ||
    dataTransfer?.getData?.('text/plain') ||
    '';
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function DownloadOrderIcon({ order = 'asc', className = 'w-[18px] h-[18px]' }) {
  if (order === 'desc') {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m3 16 4 4 4-4" />
        <path d="M7 20V4" />
        <path d="M15 4h5l-5 6h5" />
        <path d="M15 20v-3.5a2.5 2.5 0 0 1 5 0V20" />
        <path d="M20 18h-5" />
      </svg>
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="M20 8h-5" />
      <path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10" />
      <path d="M15 14h5l-5 6h5" />
    </svg>
  );
}

function resolveWorkflowRunningTitle(progress, t) {
  if (!progress) return t('queue.workflowRunning') || 'Đang chạy quy trình...';
  if (progress.activeNodeCustomTitle) return progress.activeNodeCustomTitle;

  const candidate = progress.activeNodeType || progress.activeNodeTitle;
  if (candidate) {
    const key = `workflow.nodeDef.${candidate}.title`;
    const translated = t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }

  return progress.activeNodeTitle || t('queue.workflowRunning') || 'Đang chạy quy trình...';
}

function QueueDragHandle({ index, dragFromIndexRef, setDragOverIndex, t }) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        dragFromIndexRef.current = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(QUEUE_DRAG_MIME, String(index));
        e.dataTransfer.setData('text/plain', String(index));
      }}
      onDragEnd={(e) => {
        e.stopPropagation();
        dragFromIndexRef.current = null;
        setDragOverIndex(null);
      }}
      className="inline-flex rounded p-1 text-on-surface-variant hover:bg-surface-container-high cursor-grab active:cursor-grabbing select-none touch-none"
      data-tooltip={t('queue.dragTitle')}
      aria-label={t('queue.dragTitle')}
    >
      <span className="material-symbols-outlined text-[18px] leading-none pointer-events-none">
        drag_indicator
      </span>
    </div>
  );
}

function handleQueueRowDragOver(e, index, setDragOverIndex) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  setDragOverIndex(index);
}

function handleQueueRowDrop(e, index, dragFromIndexRef, setDragOverIndex, onReorderQueue) {
  e.preventDefault();
  e.stopPropagation();
  setDragOverIndex(null);
  const from = readQueueDragFromIndex(e.dataTransfer, dragFromIndexRef);
  dragFromIndexRef.current = null;
  if (from == null || from === index || !onReorderQueue) return;
  onReorderQueue(from, index);
}

function groupStatusKey(g, p) {
  const paused = Boolean(g.paused);
  if (paused && !p.hasDl) return 'paused';
  if (p.hasDl) return 'downloading';
  if (p.allWaiting) return 'waiting';
  if (p.allDone) return 'completed';
  // tất cả đã done (kể cả lỗi) nhưng có lỗi
  if (p.done === p.total && p.err > 0) return 'doneWithErrors';
  if (p.err > 0) return 'pausedWithErrors';
  return 'empty';
}

/** Hàng đợi — thẻ cho màn hẹp (không cần scroll ngang). */
function QueueQueueMobileCard({
  item,
  index: i,
  p,
  statusText,
  statusPulse,
  pct,
  isPaused,
  isDragOver,
  selectedIds,
  queueProcessing,
  onReorderQueue,
  dragFromIndexRef,
  setDragOverIndex,
  toggleRow,
  onFetchQueueGroup,
  onOpenMangaFolder,
  onRetryFailedChapters,
  onRemoveChapter,
  onSkipChapter,
  onRetryChapter,
  onClearCompletedInGroup,
  isExpanded,
  toggleExpand,
  chapterDragOverInfo,
  handleChapterDragOver,
  chapterDragFromInfoRef,
  setChapterDragOverInfo,
  handleChapterDrop,
  t,
  setGroupWorkflow,
  retryGroupWorkflow,
}) {
  return (
    <div
      className={`rounded-xl border border-outline-variant/10 bg-surface p-3 shadow-sm transition-colors ${
        isPaused ? 'opacity-70' : ''
      } ${isDragOver ? 'ring-2 ring-inset ring-primary/50 bg-primary/5' : ''}`}
      onDragOver={(e) => handleQueueRowDragOver(e, i, setDragOverIndex)}
      onDragLeave={() => setDragOverIndex((x) => (x === i ? null : x))}
      onDrop={(e) => handleQueueRowDrop(e, i, dragFromIndexRef, setDragOverIndex, onReorderQueue)}
    >
      <div className="flex min-w-0 gap-2">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <QueueDragHandle
            index={i}
            dragFromIndexRef={dragFromIndexRef}
            setDragOverIndex={setDragOverIndex}
            t={t}
          />
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleRow(item.id)}
            className="rounded border-outline-variant/30 bg-surface-container-highest"
            aria-label={t('queue.checkboxTitle')}
          />
        </div>
        <div className="w-12 shrink-0">
          <QueueCoverThumb
            coverUrl={item.coverUrl || ''}
            onFetch={onFetchQueueGroup ? () => onFetchQueueGroup(item) : undefined}
            fetchTitle={t('favorites.fetchTitle')}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium leading-snug break-words">
            {item.mangaTitle}
          </p>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {p.err > 0 
                  ? t('queue.chaptersProgressWithErrors', { success: p.success, error: p.err, total: p.total })
                  : t('queue.chaptersProgress', { done: p.done, total: p.total })
                }
              </span>
              {p.err > 0 ? (
                <button
                  type="button"
                  onClick={() => onRetryFailedChapters?.(item.id)}
                  disabled={p.hasDl}
                  className="text-[10px] text-error hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  data-tooltip={t('queue.retryFailed', { n: p.err })}
                >
                  {t('queue.retryFailed', { n: p.err })}
                </button>
              ) : null}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full border border-outline-variant/10 bg-surface-container-lowest">
              {p.err > 0 ? (
                <>
                  <div 
                    className="h-full bg-green-500 transition-[width] duration-300 float-left" 
                    style={{ width: `${Math.round((p.success / p.total) * 100)}%` }} 
                  />
                  <div 
                    className="h-full bg-error transition-[width] duration-300 float-left" 
                    style={{ width: `${Math.round((p.err / p.total) * 100)}%` }} 
                  />
                </>
              ) : (
                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
              )}
            </div>
            {p.downloading ? (
              <p className="text-[11px] text-on-surface-variant break-words">
                {t('queue.downloading')} {p.downloading.chapterTitle}
                {p.downloading.retryCount > 0 ? (
                  <span className="text-[10px] text-amber-500 ml-1">
                    ({t('queue.retryBadge', { n: p.downloading.retryCount })})
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/10 pt-2">
            <div className="flex shrink-0">
              <button
                type="button"
                onClick={toggleExpand}
                className="cursor-pointer rounded p-1 text-on-surface-variant hover:bg-surface-container-high transition-transform"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                data-tooltip={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
                aria-label={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">expand_more</span>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {item.workflowState === 'running' ? (
                <span className="flex min-w-0 items-center gap-1.5 text-primary">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                  <span className="min-w-0 truncate text-xs font-medium">
                    {resolveWorkflowRunningTitle(item.workflowProgress, t)}
                    {item.workflowProgress?.percent != null && Number.isFinite(item.workflowProgress.percent)
                      ? ` (${Math.round(item.workflowProgress.percent)}%)`
                      : ''}
                  </span>
                </span>
              ) : item.workflowState === 'completed' ? (
                <span className="flex min-w-0 items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-medium">
                  <span className="material-symbols-outlined text-[15px] leading-none shrink-0">task_alt</span>
                  <span className="min-w-0 truncate">{t('queue.workflowCompleted') || 'Hoàn tất quy trình'}</span>
                </span>
              ) : item.workflowState === 'failed' ? (
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="flex min-w-0 items-center gap-1 text-error text-xs font-medium">
                    <span className="material-symbols-outlined text-[15px] leading-none shrink-0">error</span>
                    <span className="min-w-0 truncate" title={item.workflowProgress?.error}>
                      {item.workflowProgress?.error || t('queue.workflowFailedState') || 'Lỗi quy trình'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      retryGroupWorkflow?.(item.id);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-error hover:opacity-80 transition-opacity cursor-pointer self-start"
                    data-tooltip={t('queue.retryWorkflow') || 'Thử lại quy trình'}
                    aria-label={t('queue.retryWorkflow') || 'Thử lại quy trình'}
                  >
                    <span className="material-symbols-outlined text-[13px] leading-none">refresh</span>
                    <span>{t('queue.retryWorkflow') || 'Thử lại'}</span>
                  </button>
                </div>
              ) : statusPulse ? (
                <span className="flex items-center gap-2 text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  <span className="text-xs">{statusText}</span>
                </span>
              ) : (
                <span
                  className={`text-xs flex items-center gap-1 ${
                    p.err > 0
                      ? 'text-error'
                      : p.allDone
                        ? 'text-green-600 dark:text-green-400'
                        : isPaused
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-on-surface-variant'
                  }`}
                >
                  {p.err > 0 && (
                    <span className="material-symbols-outlined text-[14px] leading-none">error</span>
                  )}
                  {statusText}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleGroupDownloadOrder?.(item.id)}
                disabled={p.hasDl}
                className="cursor-pointer rounded p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40 transition-colors"
                data-tooltip={t(item.downloadOrder === 'desc' ? 'queue.downloadOrderDesc' : 'queue.downloadOrderAsc')}
                aria-label={t(item.downloadOrder === 'desc' ? 'queue.downloadOrderDesc' : 'queue.downloadOrderAsc')}
              >
                <DownloadOrderIcon order={item.downloadOrder} />
              </button>
              <QueueWorkflowSelector
                groupId={item.id}
                value={item.workflowId}
                onChange={(newWfId) => setGroupWorkflow?.(item.id, newWfId)}
                compact={true}
              />
              <button
                type="button"
                onClick={() => onOpenMangaFolder?.(item.mangaTitle)}
                className="cursor-pointer rounded p-1.5 text-primary hover:bg-surface-container-high"
                data-tooltip={t('queue.openTitle')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
              </button>
              <button
                type="button"
                disabled={p.hasDl}
                onClick={() => onRemoveItem(item.id)}
                className="cursor-pointer rounded p-1 text-error hover:bg-surface-container-high disabled:opacity-40"
                data-tooltip={t('queue.removeTitle')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
              </button>
            </div>
          </div>
          {isExpanded && (
            <div className="mt-3 -mx-1 border-t border-outline-variant/10 pt-3">
              {item.chapters.some(c => c.status === 'done' && !c.downloadError) && (
                <div className="flex items-center justify-end px-2 mb-2">
                  <button
                    type="button"
                    onClick={() => onClearCompletedInGroup?.(item.id)}
                    className="flex items-center gap-1 text-[11px] font-medium text-on-surface-variant hover:text-error transition-colors px-2 py-1 rounded bg-surface-container hover:bg-error/10"
                    aria-label={t('queue.clearCompletedInGroup') || 'Clear completed'}
                  >
                    <span className="material-symbols-outlined !text-[14px]">clear_all</span>
                    {t('queue.clearCompletedInGroup') || 'Clear completed'}
                  </button>
                </div>
              )}
              <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 px-1">
                {item.chapters.map((c, idx) => {
                  const isDone = c.status === 'done' && !c.downloadError;
                  const isErr = c.status === 'error' || c.status === 'failed' || (c.status === 'done' && !!c.downloadError);
                  const isDl = c.status === 'downloading';
                  const isWait = c.status === 'waiting';
                  const badgeText = isDone ? 'text-green-600 dark:text-green-400' : isErr ? 'text-error' : isDl ? 'text-blue-600 dark:text-blue-400' : 'text-on-surface-variant';
                  const borderColor = isDone ? 'border-green-500/40' : isErr ? 'border-red-500/40' : isDl ? 'border-blue-500/40' : 'border-outline-variant/30';
                  
                  const isDragOver = chapterDragOverInfo?.groupId === item.id && chapterDragOverInfo?.index === idx;

                  return (
                    <div 
                      key={c.id}
                      draggable={true}
                      onDragStart={(e) => {
                        chapterDragFromInfoRef.current = { groupId: item.id, index: idx };
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => handleChapterDragOver(e, item.id, idx)}
                      onDragLeave={() => setChapterDragOverInfo(null)}
                      onDrop={(e) => handleChapterDrop(e, item.id, idx)}
                      className={`flex items-center justify-between py-1.5 px-2.5 border-l-2 ${borderColor} rounded-r-md rounded-l-sm bg-surface-container-lowest hover:bg-surface-container-high transition-colors shadow-sm cursor-move ${isDragOver ? 'ring-2 ring-inset ring-primary/50' : ''}`}
                    >
                      <div className="flex flex-col min-w-0 pr-2 flex-1">
                        <span className="text-[12px] truncate text-on-surface font-medium">
                          {c.chapterTitle}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${badgeText}`}>
                          {isErr ? (t('queue.status.error') || 'Error') : (t(`queue.status.${c.status}`) || c.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(isDl || isWait) && (
                          <button
                            type="button"
                            onClick={() => onSkipChapter && onSkipChapter(item.id, c.id, isDl)}
                            className="text-on-surface-variant hover:text-amber-500 hover:bg-amber-500/10 rounded-full p-1.5 transition-colors"
                            data-tooltip={t('queue.skipChapterTitle') || 'Skip'}
                          >
                            <span className="material-symbols-outlined !text-[16px]">skip_next</span>
                          </button>
                        )}
                        {isErr && (
                          <button
                            type="button"
                            onClick={() => onRetryChapter && onRetryChapter(item.id, c.id)}
                            className="text-on-surface-variant hover:text-green-500 hover:bg-green-500/10 rounded-full p-1.5 transition-colors"
                            data-tooltip={t('queue.retryChapterTitle') || 'Retry'}
                          >
                            <span className="material-symbols-outlined !text-[16px]">refresh</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveChapter && onRemoveChapter(item.id, c.id)}
                          className="text-on-surface-variant hover:text-error hover:bg-error/10 rounded-full p-1.5 transition-colors"
                          data-tooltip={t('queue.removeChapterTitle') || 'Remove'}
                        >
                          <span className="material-symbols-outlined !text-[16px]">close</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QueuePanel({
  queue,
  queueSelectedIds,
  setQueueSelectedIds,
  onReorderQueue,
  queueProcessing,
  onStartQueue,
  onStopQueue,
  onClearCompleted,
  onRemoveItem,
  onSetGroupsPaused,
  downloadProgress,
  activeChapterLabel,
  onOpenMangaFolder,
  onFetchQueueGroup,
  onToggleGroupDownloadOrder,
  onRetryFailedChapters,
  onRemoveChapter,
  onSkipChapter,
  onRetryChapter,
  onReorderChapter,
  onClearCompletedInGroup,
  defaultQueueWorkflowId: propDefaultQueueWorkflowId,
  setDefaultQueueWorkflowId: propSetDefaultQueueWorkflowId,
  onSetGroupWorkflow: propOnSetGroupWorkflow,
  onSetAllGroupsWorkflow: propOnSetAllGroupsWorkflow,
  onRetryGroupWorkflow: propOnRetryGroupWorkflow,
}) {
  const { t } = useI18n();
  const downloadCtx = useDownloadSafe();
  const defaultQueueWorkflowId = propDefaultQueueWorkflowId ?? downloadCtx.defaultQueueWorkflowId ?? 'none';
  const setDefaultQueueWorkflowId = propSetDefaultQueueWorkflowId ?? downloadCtx.setDefaultQueueWorkflowId;
  const setGroupWorkflow = propOnSetGroupWorkflow ?? downloadCtx.setGroupWorkflow;
  const setAllGroupsWorkflow = propOnSetAllGroupsWorkflow ?? downloadCtx.setAllGroupsWorkflow;
  const retryGroupWorkflow = propOnRetryGroupWorkflow ?? downloadCtx.retryGroupWorkflow;

  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragFromIndexRef = useRef(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const toggleGroupExpand = (id) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [chapterDragOverInfo, setChapterDragOverInfo] = useState(null);
  const chapterDragFromInfoRef = useRef(null);

  const handleChapterDragOver = (e, groupId, index) => {
    e.preventDefault();
    setChapterDragOverInfo({ groupId, index });
  };

  const handleChapterDrop = (e, groupId, toIndex) => {
    e.preventDefault();
    setChapterDragOverInfo(null);
    const fromInfo = chapterDragFromInfoRef.current;
    if (!fromInfo || fromInfo.groupId !== groupId) return;
    const fromIndex = fromInfo.index;
    if (fromIndex !== toIndex && onReorderChapter) {
      onReorderChapter(groupId, fromIndex, toIndex);
    }
  };

  const selectedIds = queueSelectedIds instanceof Set ? queueSelectedIds : new Set();

  const hasWaiting = queue.some(
    (g) =>
      selectedIds.has(g.id) &&
      !g.paused &&
      g.chapters.some((c) => c.status === 'waiting')
  );
  const hasClearable = queue.some(
    (g) => g.chapters.length > 0 && g.chapters.every((c) => c.status === 'done') && !g.chapters.some((c) => c.downloadError)
  );

  const allSelected = queue.length > 0 && selectedIds.size === queue.length;
  const someSelected = selectedIds.size > 0;

  const hasActiveDownload = queue.some((g) =>
    g.chapters.some((c) => c.status === 'downloading')
  );

  /** Chọn có truyện chưa pause → hiện Tạm dừng (dừng tải ngay + pause); toàn bộ đã pause → Tiếp tục. */
  const selectedPauseMode = useMemo(() => {
    if (selectedIds.size === 0) return 'none';
    const groups = [...selectedIds].map((id) => queue.find((g) => g.id === id)).filter(Boolean);
    if (!groups.length) return 'none';
    return groups.every((g) => g.paused) ? 'resume' : 'pause';
  }, [queue, selectedIds]);

  /** Tạm dừng khi đang xử lý hoặc còn chương treo ở trạng thái downloading. */
  const pauseResumeDisabled =
    selectedPauseMode === 'resume'
      ? !someSelected
      : !queueProcessing && !hasActiveDownload;

  const pauseResumeTitle =
    selectedPauseMode === 'resume'
      ? t('queue.resumeTitle')
      : queueProcessing && !someSelected
        ? t('queue.pauseStopActiveTitle')
        : !queueProcessing && someSelected
          ? t('queue.pauseNeedActiveDownload')
          : t('queue.pauseTitle');

  const toggleRow = (id) => {
    setQueueSelectedIds((prev) => {
      const base = prev instanceof Set ? prev : new Set();
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setQueueSelectedIds(new Set());
    else setQueueSelectedIds(new Set(queue.map((g) => g.id)));
  };

  const selectedList = () => [...selectedIds];

  const handlePauseToggle = () => {
    const ids = selectedList();
    if (!ids.length) {
      if (queueProcessing || hasActiveDownload) onStopQueue?.();
      return;
    }
    const groups = ids.map((id) => queue.find((g) => g.id === id)).filter(Boolean);
    if (!groups.length) return;
    const anyUnpaused = groups.some((g) => !g.paused);
    if (anyUnpaused) {
      onStopQueue?.(ids);
    } else {
      onSetGroupsPaused(ids, false);
      if (!queueProcessing) {
        window.setTimeout(() => onStartQueue?.(), 0);
      }
    }
  };

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredQueue = useMemo(() => {
    let list = queue;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((item) =>
        String(item.mangaTitle || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter && statusFilter !== 'all') {
      list = list.filter((item) => {
        const p = groupProgress(item);
        const k = groupStatusKey(item, p);
        if (statusFilter === 'downloading') return k === 'downloading';
        if (statusFilter === 'paused') return k === 'paused' || k === 'pausedWithErrors';
        if (statusFilter === 'waiting') return k === 'waiting';
        if (statusFilter === 'completed') return k === 'completed';
        if (statusFilter === 'error') return k === 'doneWithErrors' || k === 'pausedWithErrors' || p.err > 0;
        return true;
      });
    }
    return list;
  }, [queue, query, statusFilter]);

  const queueStatusFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('queue.filterStatusAll'), materialIcon: 'filter_alt' },
      { value: 'downloading', label: t('queue.filterStatusDownloading'), materialIcon: 'downloading' },
      { value: 'paused', label: t('queue.filterStatusPaused'), materialIcon: 'pause_circle' },
      { value: 'waiting', label: t('queue.filterStatusWaiting'), materialIcon: 'hourglass_empty' },
      { value: 'completed', label: t('queue.filterStatusCompleted'), materialIcon: 'check_circle' },
      { value: 'error', label: t('queue.filterStatusError'), materialIcon: 'error' },
    ],
    [t]
  );
  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 gap-4 sm:px-8 overflow-hidden min-h-0">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="start-queue-btn"
              disabled={queueProcessing || !hasWaiting || !someSelected}
              data-tooltip={!someSelected ? t('queue.startNeedSelection') : undefined}
              onClick={onStartQueue}
              className="flex items-center justify-center gap-1.5 bg-primary text-on-primary h-11 px-4 rounded-xl text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined !text-[18px]">play_arrow</span>
              <span>{t('queue.start')}</span>
            </button>
            <button
              type="button"
              disabled={pauseResumeDisabled}
              onClick={handlePauseToggle}
              className="flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl border border-outline-variant/25 bg-surface-container-highest text-on-surface text-xs font-medium hover:border-outline-variant/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
              data-tooltip={pauseResumeTitle}
            >
              <span className="material-symbols-outlined !text-[18px]">
                {selectedPauseMode === 'resume' ? 'play_circle' : 'pause'}
              </span>
              <span>{selectedPauseMode === 'resume' ? t('queue.resume') : t('queue.pause')}</span>
            </button>
            <div className="h-6 w-px bg-outline-variant/30 mx-0.5 self-center" aria-hidden />
            <button
              type="button"
              disabled={!hasClearable}
              onClick={onClearCompleted}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-highest text-error/80 hover:text-error hover:border-error/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              data-tooltip={t('queue.clearCompletedTooltip') || t('queue.clearCompleted')}
              aria-label={t('queue.clearCompletedTooltip') || t('queue.clearCompleted')}
            >
              <span className="material-symbols-outlined text-[20px] leading-none">delete_sweep</span>
            </button>
          </div>

          <div className="flex-1 flex h-11 items-center bg-surface-container-highest rounded-lg px-3 sm:px-4 max-w-xl border border-outline-variant/10 min-w-[200px]">
            <span className="material-symbols-outlined text-outline mr-2 sm:mr-3 shrink-0 text-[20px] leading-none">
              filter_list
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('queue.searchPlaceholder')}
              className="min-h-0 h-8 bg-transparent border-none text-sm leading-normal focus:ring-0 p-0 w-full text-on-surface outline-none placeholder:text-outline"
            />
          </div>
          <div className="shrink-0">
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={queueStatusFilterOptions}
              placeholder=""
              className="min-w-[10.5rem]"
            />
          </div>
          <div className="shrink-0">
            <QueueWorkflowSelector
              value={defaultQueueWorkflowId}
              onChange={(newWfId) => {
                setDefaultQueueWorkflowId?.(newWfId);
                setAllGroupsWorkflow?.(newWfId);
              }}
            />
          </div>
        </div>

        <StudioTable
          columns={[
            {
              key: 'drag',
              width: 'w-8',
              header: '',
              ariaLabel: '',
              align: 'center',
              headerClassName: 'w-8 border-none p-2 text-center align-middle',
            },
            {
              key: 'checkbox',
              width: 'w-9',
              align: 'center',
              header: (
                <input
                  type="checkbox"
                  aria-label={t('queue.checkboxTitle')}
                  checked={allSelected}
                  onChange={() => toggleSelectAll()}
                  className="rounded border-outline-variant/30 bg-surface-container-highest cursor-pointer"
                />
              ),
              headerClassName: 'w-9 border-none p-2 text-center align-middle',
            },
            {
              key: 'cover',
              width: 'w-14',
              header: '',
              ariaLabel: t('queue.col.cover'),
              headerClassName: 'w-14 border-none p-3',
            },
            {
              key: 'manga',
              width: 'w-[26%]',
              header: t('queue.col.manga'),
              headerClassName: 'w-[26%] border-none p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
            },
            {
              key: 'progress',
              width: 'w-[28%]',
              header: t('queue.col.progress'),
              headerClassName: 'w-[28%] border-none p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
            },
            {
              key: 'state',
              width: 'w-[18%]',
              header: t('queue.col.state'),
              headerClassName: 'w-[18%] border-none p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
            },
            {
              key: 'actions',
              width: 'w-44 min-w-[170px]',
              header: '',
              ariaLabel: t('queue.col.actionsHeader'),
              align: 'right',
              headerClassName: 'w-44 min-w-[170px] border-none p-3 pr-4 sm:pr-5 text-right',
            },
          ]}
          data={filteredQueue}
          keyExtractor={(item) => item.id}
          emptyState={
            queue.length === 0 ? (
              <EmptyState
                icon="download"
                title={t('queue.empty')}
              />
            ) : (
              <EmptyState
                icon="search_off"
                title={t('queue.emptyFiltered')}
              />
            )
          }
          rowClassName={(item, i) =>
            `cursor-pointer transition-colors ${
              selectedIds.has(item.id)
                ? 'bg-primary/10 hover:bg-primary/15'
                : i % 2 === 0
                  ? 'bg-surface hover:bg-surface-container-high'
                  : 'bg-surface-container-low/30 hover:bg-surface-container-high'
            } ${item.paused ? 'opacity-70' : ''} ${
              dragOverIndex === i ? 'ring-2 ring-inset ring-primary/50 bg-primary/5' : ''
            }`
          }
          onRowClick={(item) => toggleRow(item.id)}
          getRowProps={(_item, i) => ({
            onDragOver: (e) => handleQueueRowDragOver(e, i, setDragOverIndex),
            onDragLeave: () => setDragOverIndex((x) => (x === i ? null : x)),
            onDrop: (e) =>
              handleQueueRowDrop(e, i, dragFromIndexRef, setDragOverIndex, onReorderQueue),
          })}
          renderRow={(item, i) => {
            const p = groupProgress(item);
            const statusKey = groupStatusKey(item, p);
            const statusText = t(`queue.status.${statusKey}`);
            const statusPulse = statusKey === 'downloading';
            const pct = groupProgressPercent(item, p, downloadProgress);
            const isPaused = Boolean(item.paused);
            const isExpanded = expandedGroups.has(item.id);

            return (
              <>
                <td className="p-1 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                  <QueueDragHandle
                    index={i}
                    dragFromIndexRef={dragFromIndexRef}
                    setDragOverIndex={setDragOverIndex}
                    t={t}
                  />
                </td>
                <td className="p-2 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleRow(item.id)}
                    className="rounded bg-surface-container-highest border-outline-variant/30 cursor-pointer"
                    aria-label={t('queue.checkboxTitle')}
                  />
                </td>
                <td className="p-2 sm:p-3 align-middle">
                  <QueueCoverThumb
                    coverUrl={item.coverUrl || ''}
                    onFetch={onFetchQueueGroup ? () => onFetchQueueGroup(item) : undefined}
                    fetchTitle={t('favorites.fetchTitle')}
                    frameClassName="w-10 h-13 shrink-0 rounded overflow-hidden bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center"
                  />
                </td>
                <td className="min-w-0 p-2 font-medium sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="block truncate">{item.mangaTitle}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupExpand(item.id);
                      }}
                      className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded p-1 shrink-0 transition-transform cursor-pointer"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      data-tooltip={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
                      aria-label={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">expand_more</span>
                    </button>
                  </div>
                </td>
                <td className="min-w-0 p-2 sm:p-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {p.err > 0 
                          ? t('queue.chaptersProgressWithErrors', { success: p.success, error: p.err, total: p.total })
                          : t('queue.chaptersProgress', { done: p.done, total: p.total })
                        }
                      </span>
                      {p.err > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryFailedChapters?.(item.id);
                          }}
                          disabled={p.hasDl}
                          className="text-[10px] text-error hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          data-tooltip={t('queue.retryFailed', { n: p.err })}
                        >
                          {t('queue.retryFailed', { n: p.err })}
                        </button>
                      ) : null}
                    </div>
                    <div className="h-1.5 w-full bg-surface-container-lowest rounded-full overflow-hidden border border-outline-variant/10">
                      {p.err > 0 ? (
                        <>
                          <div 
                            className="h-full bg-green-500 transition-[width] duration-300 float-left" 
                            style={{ width: `${Math.round((p.success / p.total) * 100)}%` }} 
                          />
                          <div 
                            className="h-full bg-error transition-[width] duration-300 float-left" 
                            style={{ width: `${Math.round((p.err / p.total) * 100)}%` }} 
                          />
                        </>
                      ) : (
                        <div
                          className="h-full bg-primary transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </div>
                    {p.downloading ? (
                      <p className="text-[11px] text-on-surface-variant truncate">
                        {t('queue.downloading')} {p.downloading.chapterTitle}
                        {p.downloading.retryCount > 0 ? (
                          <span className="text-[10px] text-amber-500 ml-1">
                            ({t('queue.retryBadge', { n: p.downloading.retryCount })})
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="min-w-0 p-2 sm:p-3">
                  {item.workflowState === 'running' ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-primary sm:gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                      <span className="min-w-0 truncate text-[11px] sm:text-sm font-medium">
                        {resolveWorkflowRunningTitle(item.workflowProgress, t)}
                        {item.workflowProgress?.percent != null && Number.isFinite(item.workflowProgress.percent)
                          ? ` (${Math.round(item.workflowProgress.percent)}%)`
                          : ''}
                      </span>
                    </span>
                  ) : item.workflowState === 'completed' ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-green-600 dark:text-green-400 text-[11px] sm:text-sm font-medium">
                      <span className="material-symbols-outlined text-[16px] leading-none shrink-0">task_alt</span>
                      <span className="min-w-0 truncate">{t('queue.workflowCompleted') || 'Hoàn tất quy trình'}</span>
                    </span>
                  ) : item.workflowState === 'failed' ? (
                    <div className="flex flex-col min-w-0 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1 text-error text-[11px] sm:text-sm font-medium">
                        <span className="material-symbols-outlined text-[16px] leading-none shrink-0">error</span>
                        <span className="min-w-0 truncate" title={item.workflowProgress?.error}>
                          {item.workflowProgress?.error || t('queue.workflowFailedState') || 'Lỗi quy trình'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          retryGroupWorkflow?.(item.id);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-error hover:opacity-80 transition-opacity cursor-pointer self-start"
                        data-tooltip={t('queue.retryWorkflow') || 'Thử lại quy trình'}
                        aria-label={t('queue.retryWorkflow') || 'Thử lại quy trình'}
                      >
                        <span className="material-symbols-outlined text-[14px] leading-none">refresh</span>
                        <span>{t('queue.retryWorkflow') || 'Thử lại'}</span>
                      </button>
                    </div>
                  ) : statusPulse ? (
                    <span className="flex min-w-0 items-center gap-1 text-primary sm:gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                      <span className="min-w-0 truncate text-[11px] sm:text-sm">{statusText}</span>
                    </span>
                  ) : (
                    <span
                      className={`block min-w-0 truncate text-[11px] sm:text-sm flex items-center gap-1 ${
                        p.err > 0
                          ? 'text-error'
                          : p.allDone
                            ? 'text-green-600 dark:text-green-400'
                            : isPaused
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-on-surface-variant'
                      }`}
                    >
                      {p.err > 0 && (
                        <span className="material-symbols-outlined text-[14px] leading-none shrink-0">error</span>
                      )}
                      <span className="min-w-0 truncate">{statusText}</span>
                    </span>
                  )}
                </td>
                <td className="p-2 sm:p-3 pr-4 sm:pr-5 w-44 min-w-[170px] align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(item.id)}
                      className="cursor-pointer rounded p-1.5 text-on-surface-variant hover:bg-surface-container-high md:hidden transition-transform"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">expand_more</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleGroupDownloadOrder?.(item.id)}
                      disabled={p.hasDl}
                      className="cursor-pointer rounded p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40 transition-colors"
                      data-tooltip={t(item.downloadOrder === 'desc' ? 'queue.downloadOrderDesc' : 'queue.downloadOrderAsc')}
                      aria-label={t(item.downloadOrder === 'desc' ? 'queue.downloadOrderDesc' : 'queue.downloadOrderAsc')}
                    >
                      <DownloadOrderIcon order={item.downloadOrder} />
                    </button>
                    <QueueWorkflowSelector
                      groupId={item.id}
                      value={item.workflowId}
                      onChange={(newWfId) => setGroupWorkflow?.(item.id, newWfId)}
                      compact={true}
                    />
                    <button
                      type="button"
                      onClick={() => onOpenMangaFolder?.(item.mangaTitle)}
                      className="cursor-pointer rounded p-1.5 text-primary hover:bg-surface-container-high"
                      aria-label={t('queue.openTitle')}
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
                    </button>
                    <button
                      type="button"
                      disabled={p.hasDl}
                      onClick={() => onRemoveItem(item.id)}
                      className="cursor-pointer rounded p-1 text-error hover:bg-surface-container-high disabled:opacity-40"
                      aria-label={t('queue.removeTitle')}
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                    </button>
                  </div>
                </td>
              </>
            );
          }}
          renderSubRow={(item) => {
            if (!expandedGroups.has(item.id)) return null;
            return (
              <tr key={`${item.id}-expanded`} className="bg-surface-container-lowest">
                <td colSpan={7} className="p-0 border-b border-outline-variant/10">
                  <div className="bg-surface-container/30 px-3 py-3 shadow-inner border-y border-outline-variant/5">
                    {item.chapters.some(c => c.status === 'done' && !c.downloadError) && (
                      <div className="flex items-center justify-end mb-2">
                        <button
                          type="button"
                          onClick={() => onClearCompletedInGroup?.(item.id)}
                          className="flex items-center gap-1 text-[12px] font-medium text-on-surface-variant hover:text-error transition-colors px-2 py-1 rounded bg-surface hover:bg-error/10 border border-outline-variant/20 shadow-sm"
                          aria-label={t('queue.clearCompletedInGroup') || 'Clear completed'}
                        >
                          <span className="material-symbols-outlined !text-[16px]">clear_all</span>
                          {t('queue.clearCompletedInGroup') || 'Clear completed'}
                        </button>
                      </div>
                    )}
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col gap-1.5 pr-2">
                      {item.chapters.map((c, idx) => {
                        const isDone = c.status === 'done' && !c.downloadError;
                        const isErr = c.status === 'error' || c.status === 'failed' || (c.status === 'done' && !!c.downloadError);
                        const isDl = c.status === 'downloading';
                        const isWait = c.status === 'waiting';
                        const badgeBg = isDone ? 'bg-green-500/10 dark:bg-green-500/20' : isErr ? 'bg-red-500/10 dark:bg-red-500/20' : isDl ? 'bg-blue-500/10 dark:bg-blue-500/20' : 'bg-surface-container-high';
                        const badgeText = isDone ? 'text-green-600 dark:text-green-400' : isErr ? 'text-error' : isDl ? 'text-blue-600 dark:text-blue-400' : 'text-on-surface-variant';
                        const borderColor = isDone ? 'border-green-500/40' : isErr ? 'border-red-500/40' : isDl ? 'border-blue-500/40' : 'border-outline-variant/30';
                        
                        const isDragOver = chapterDragOverInfo?.groupId === item.id && chapterDragOverInfo?.index === idx;
                          
                        return (
                          <div 
                            key={c.id}
                            draggable={true}
                            onDragStart={(e) => {
                              chapterDragFromInfoRef.current = { groupId: item.id, index: idx };
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => handleChapterDragOver(e, item.id, idx)}
                            onDragLeave={() => setChapterDragOverInfo(null)}
                            onDrop={(e) => handleChapterDrop(e, item.id, idx)}
                            className={`group flex items-center justify-between py-2 px-3 border-l-2 ${borderColor} rounded-r-md rounded-l-sm bg-surface hover:bg-surface-container-high transition-all duration-200 shadow-sm cursor-move ${isDragOver ? 'ring-2 ring-inset ring-primary/50' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[13px] truncate text-on-surface font-medium">
                                  {c.chapterTitle}
                                </span>
                              </div>
                              <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeBg} ${badgeText} shrink-0`}>
                                {isErr ? (t('queue.status.error') || 'Error') : (t(`queue.status.${c.status}`) || c.status)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-3">
                              {(isDl || isWait) && (
                                <button
                                  type="button"
                                  onClick={() => onSkipChapter && onSkipChapter(item.id, c.id, isDl)}
                                  className="text-on-surface-variant hover:text-amber-500 hover:bg-amber-500/10 rounded-full w-7 h-7 flex items-center justify-center transition-all focus:opacity-100"
                                  data-tooltip={t('queue.skipChapterTitle') || 'Skip'}
                                >
                                  <span className="material-symbols-outlined !text-[16px]">skip_next</span>
                                </button>
                              )}
                              {isErr && (
                                <button
                                  type="button"
                                  onClick={() => onRetryChapter && onRetryChapter(item.id, c.id)}
                                  className="text-on-surface-variant hover:text-green-500 hover:bg-green-500/10 rounded-full w-7 h-7 flex items-center justify-center transition-all focus:opacity-100"
                                  data-tooltip={t('queue.retryChapterTitle') || 'Retry'}
                                >
                                  <span className="material-symbols-outlined !text-[16px]">refresh</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onRemoveChapter && onRemoveChapter(item.id, c.id)}
                                className="text-on-surface-variant hover:text-error hover:bg-error/10 rounded-full w-7 h-7 flex items-center justify-center transition-all focus:opacity-100"
                                data-tooltip={t('queue.removeChapterTitle') || 'Remove'}
                              >
                                <span className="material-symbols-outlined !text-[16px]">close</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </td>
              </tr>
            );
          }}
        />

            <ProgressPanel
              queue={queue}
              downloadProgress={downloadProgress}
              queueProcessing={queueProcessing}
              activeChapterLabel={activeChapterLabel}
            />
          </div>
        </div>
    );
  }
