import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import {
  groupProgress,
  groupProgressPercent,
  isFailedQueueChapter,
} from '../../../utils/queueProgress';
import { formatChapterFolderName } from '../../../utils/chapterFolderFormat';
import { buildErrorDetailText, exportErrorRowsToCsv } from '../../../utils/historyCsv';
import ProgressPanel from './ProgressPanel';
import QueueCoverThumb from './QueueCoverThumb.jsx';
import QueueWorkflowSelector from './QueueWorkflowSelector';
import { useDownload } from '../DownloadProvider';
import {
  SearchableSelect,
  EmptyState,
  StudioTable,
  ConfirmModal,
  StudioPrimaryActionSlot,
  StudioRightToolbarSlot,
} from '../../../shared';

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

/** Trọng số ưu tiên trạng thái chapter: lỗi → đang tải → chờ → xong. */
function chapterStatusWeight(c) {
  const isErr = c.status === 'error' || c.status === 'failed' || (c.status === 'done' && !!c.downloadError);
  if (isErr) return 0;
  if (c.status === 'downloading') return 1;
  if (c.status === 'waiting') return 2;
  return 3;
}

/** Sắp xếp chapter theo ưu tiên trạng thái, giữ thứ tự gốc trong cùng nhóm (stable sort). */
function sortChaptersByStatusPriority(chapters) {
  return chapters
    .map((c, origIdx) => ({ c, origIdx }))
    .sort((a, b) => chapterStatusWeight(a.c) - chapterStatusWeight(b.c));
}

/** Trích xuất số chapter từ title (ví dụ: "Chapter 173 - Abc" → "173"). */
function extractChapterNumber(title) {
  if (!title) return null;
  const m = title.match(/(?:Ch(?:apter|\.)?|Chương)\s*(\d+(?:\.\d+)?)/i);
  return m ? m[1] : null;
}

/** Đếm tóm tắt trạng thái chapters. */
function chapterStatusSummary(chapters) {
  let err = 0, dl = 0, wait = 0, done = 0;
  for (const c of chapters) {
    if (c.status === 'error' || c.status === 'failed' || (c.status === 'done' && !!c.downloadError)) err++;
    else if (c.status === 'downloading') dl++;
    else if (c.status === 'waiting') wait++;
    else done++;
  }
  return { err, dl, wait, done, total: chapters.length };
}

/** Kiểm tra tất cả chapters có cùng status không (dùng để ẩn badge khi đồng nhất). */
function isAllSameStatus(chapters) {
  if (chapters.length <= 1) return true;
  const first = chapterStatusWeight(chapters[0]);
  return chapters.every(c => chapterStatusWeight(c) === first);
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
                >
                  {t('queue.retryFailed', { n: p.err })}
                </button>
              ) : null}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/25">
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
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high hover:border-outline-variant/40 transition-all active:scale-95 cursor-pointer shrink-0"
                data-tooltip={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
                aria-label={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
              >
                <span 
                  className="material-symbols-outlined text-[20px] leading-none transition-transform duration-200"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  expand_more
                </span>
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
                    <span className="min-w-0 truncate" data-tooltip={item.workflowProgress?.error}>
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
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleGroupDownloadOrder?.(item.id)}
                disabled={p.hasDl}
                className="cursor-pointer h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary/10 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                disabled={!(p.done > 0 || p.hasDl)}
                onClick={() => onOpenMangaFolder?.(item.mangaTitle)}
                className="cursor-pointer h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-primary hover:border-primary/40 hover:bg-primary/10 inline-flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                data-tooltip={p.done > 0 || p.hasDl ? t('queue.openTitle') : t('queue.folderNotReadyTooltip')}
                aria-label={p.done > 0 || p.hasDl ? t('queue.openTitle') : t('queue.folderNotReadyTooltip')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
              </button>
              <button
                type="button"
                disabled={p.hasDl}
                onClick={() => onRemoveItem(item.id)}
                className="cursor-pointer h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-error hover:border-error/30 hover:bg-error/10 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                data-tooltip={t('queue.removeTitle')}
                aria-label={t('queue.removeTitle')}
              >
                <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
              </button>
            </div>
          </div>
          {isExpanded && (() => {
            const summary = chapterStatusSummary(item.chapters);
            const allSame = isAllSameStatus(item.chapters);
            const searchQ = (chapterSearchQuery[item.id] || '').toLowerCase();
            const sorted = sortChaptersByStatusPriority(item.chapters);
            const filtered = searchQ ? sorted.filter(({ c }) => (c.chapterTitle || '').toLowerCase().includes(searchQ)) : sorted;
            return (
            <div className="mt-3 -mx-1 border-t border-outline-variant/10 pt-3">
              {/* Mini summary bar */}
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-2 text-[10px] text-on-surface-variant">
                  <span className="font-semibold text-on-surface">{summary.total}</span>
                  <span>{t('queue.chapterUnit') || 'chương'}</span>
                  {summary.err > 0 && <span className="text-error">· {summary.err} {t('queue.status.error') || 'lỗi'}</span>}
                  {summary.dl > 0 && <span className="text-blue-500">· {summary.dl} {t('queue.status.downloading') || 'đang tải'}</span>}
                  {summary.done > 0 && <span className="text-green-500">· {summary.done} {t('queue.status.done') || 'xong'}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {item.chapters.some(c => c.status === 'done' && !c.downloadError) && (
                    <button
                      type="button"
                      onClick={() => onClearCompletedInGroup?.(item.id)}
                      className="flex items-center gap-1 text-[11px] font-medium text-on-surface-variant hover:text-error transition-colors px-2 py-1 rounded bg-surface-container hover:bg-error/10"
                      aria-label={t('queue.clearCompletedInGroup') || 'Clear completed'}
                    >
                      <span className="material-symbols-outlined !text-[14px]">clear_all</span>
                      {t('queue.clearCompletedInGroup') || 'Clear completed'}
                    </button>
                  )}
                </div>
              </div>
              {/* Search bar - show when > 20 chapters */}
              {item.chapters.length > 20 && (
                <div className="px-2 mb-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                    <span className="material-symbols-outlined !text-[16px] text-on-surface-variant shrink-0">search</span>
                    <input
                      type="text"
                      value={chapterSearchQuery[item.id] || ''}
                      onChange={e => setChapterSearchQuery(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder={t('queue.searchChapter') || 'Tìm chapter...'}
                      className="flex-1 min-w-0 bg-transparent text-[12px] text-on-surface placeholder:text-on-surface-variant/50 outline-none"
                    />
                    {searchQ && (
                      <button
                        type="button"
                        onClick={() => setChapterSearchQuery(prev => ({ ...prev, [item.id]: '' }))}
                        className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                      >
                        <span className="material-symbols-outlined !text-[14px]">close</span>
                      </button>
                    )}
                  </div>
                  {searchQ && (
                    <div className="text-[10px] text-on-surface-variant mt-1 px-1">
                      {filtered.length}/{summary.total} {t('queue.chapterUnit') || 'chương'}
                    </div>
                  )}
                </div>
              )}
              <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 px-1">
                {filtered.map(({ c, origIdx }, visualIdx) => {
                  const isDone = c.status === 'done' && !c.downloadError;
                  const isErr = c.status === 'error' || c.status === 'failed' || (c.status === 'done' && !!c.downloadError);
                  const isDl = c.status === 'downloading';
                  const isWait = c.status === 'waiting';
                  const badgeText = isDone ? 'text-green-600 dark:text-green-400' : isErr ? 'text-error' : isDl ? 'text-blue-600 dark:text-blue-400' : 'text-on-surface-variant';
                  const borderColor = isDone ? 'border-green-500/40' : isErr ? 'border-red-500/40' : isDl ? 'border-blue-500/40' : 'border-outline-variant/20';
                  const chNum = extractChapterNumber(c.chapterTitle);
                  const stripeBg = visualIdx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container/40';
                  
                  const isDragOver = chapterDragOverInfo?.groupId === item.id && chapterDragOverInfo?.index === origIdx;

                  return (
                    <div 
                      key={c.id}
                      draggable={!searchQ}
                      onDragStart={(e) => {
                        chapterDragFromInfoRef.current = { groupId: item.id, index: origIdx };
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => handleChapterDragOver(e, item.id, origIdx)}
                      onDragLeave={() => setChapterDragOverInfo(null)}
                      onDrop={(e) => handleChapterDrop(e, item.id, origIdx)}
                      className={`group/row flex items-center justify-between py-1.5 px-2 border-l-2 ${borderColor} rounded-r-md rounded-l-sm ${stripeBg} hover:bg-surface-container-high transition-colors ${searchQ ? '' : 'cursor-move'} ${isDragOver ? 'ring-2 ring-inset ring-primary/50' : ''}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
                        {chNum && (
                          <span className="text-[10px] font-mono tabular-nums font-semibold text-primary bg-primary/8 px-1.5 py-0.5 rounded shrink-0 min-w-[36px] text-center">
                            {chNum}
                          </span>
                        )}
                        <span className="text-[12px] truncate text-on-surface font-medium flex-1 min-w-0">
                          {c.chapterTitle}
                        </span>
                        {!allSame && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${badgeText}`}>
                            {isErr ? (t('queue.status.error') || 'Error') : (t(`queue.status.${c.status}`) || c.status)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {(isDl || isWait) && (
                          <button
                            type="button"
                            onClick={() => onSkipChapter && onSkipChapter(item.id, c.id, isDl)}
                            className="text-on-surface-variant hover:text-amber-500 hover:bg-amber-500/10 rounded-full p-1 transition-colors"
                            data-tooltip={t('queue.skipChapterTitle') || 'Skip'}
                          >
                            <span className="material-symbols-outlined !text-[14px]">skip_next</span>
                          </button>
                        )}
                        {isErr && (
                          <button
                            type="button"
                            onClick={() => onRetryChapter && onRetryChapter(item.id, c.id)}
                            className="text-on-surface-variant hover:text-green-500 hover:bg-green-500/10 rounded-full p-1 transition-colors"
                            data-tooltip={t('queue.retryChapterTitle') || 'Retry'}
                          >
                            <span className="material-symbols-outlined !text-[14px]">refresh</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveChapter && onRemoveChapter(item.id, c.id)}
                          className="text-on-surface-variant hover:text-error hover:bg-error/10 rounded-full p-1 transition-colors"
                          data-tooltip={t('queue.removeChapterTitle') || 'Remove'}
                        >
                          <span className="material-symbols-outlined !text-[14px]">close</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}
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
  onRemoveSelectedGroups: propOnRemoveSelectedGroups,
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
  chapterFolder,
}) {
  const { t } = useI18n();
  const downloadCtx = useDownloadSafe();
  const defaultQueueWorkflowId = propDefaultQueueWorkflowId ?? downloadCtx.defaultQueueWorkflowId ?? 'none';
  const setDefaultQueueWorkflowId = propSetDefaultQueueWorkflowId ?? downloadCtx.setDefaultQueueWorkflowId;
  const setGroupWorkflow = propOnSetGroupWorkflow ?? downloadCtx.setGroupWorkflow;
  const setAllGroupsWorkflow = propOnSetAllGroupsWorkflow ?? downloadCtx.setAllGroupsWorkflow;
  const retryGroupWorkflow = propOnRetryGroupWorkflow ?? downloadCtx.retryGroupWorkflow;
  const removeSelectedGroups = propOnRemoveSelectedGroups ?? downloadCtx.removeQueueGroups;
  const [confirmRemoveSelectedOpen, setConfirmRemoveSelectedOpen] = useState(false);

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
  const [chapterSearchQuery, setChapterSearchQuery] = useState({});

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
      g.chapters.some((c) => c.status === 'waiting')
  );
  const clearableCount = useMemo(
    () =>
      queue.filter(
        (g) => g.chapters.length > 0 && g.chapters.every((c) => c.status === 'done') && !g.chapters.some((c) => c.downloadError)
      ).length,
    [queue]
  );
  const hasClearable = clearableCount > 0;

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

  /** Tạm dừng khi đang xử lý hoặc còn chương treo ở trạng thái downloading; Tiếp tục chỉ bật khi có chương waiting. */
  const pauseResumeDisabled =
    selectedPauseMode === 'resume'
      ? !someSelected || !hasWaiting
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
  const [errorModalTarget, setErrorModalTarget] = useState(null);
  const [copiedErrorKey, setCopiedErrorKey] = useState(null);
  const copyTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const errorModalCloseBtnRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const errorModalData = useMemo(() => {
    if (!errorModalTarget?.groupId) return null;
    const group = queue.find((g) => g.id === errorModalTarget.groupId);
    if (!group) return null;
    const entries = [];
    for (const c of group.chapters || []) {
      if (!isFailedQueueChapter(c)) continue;
      if (errorModalTarget.chapterId && c.id !== errorModalTarget.chapterId) continue;
      entries.push({
        chapterId: c.id,
        at: c.errorAt || '',
        mangaTitle: group.mangaTitle || '',
        chapterTitle: c.chapterTitle || '',
        message: c.downloadError || t('queue.status.error'),
        successCount: c.successCount,
        totalPages: c.totalPages,
        failedPageIndices: c.failedPageIndices,
        chapterUrl: c.chapterUrl || '',
        mangaUrl: group.mangaUrl || '',
      });
    }
    if (entries.length === 0) return null;
    return {
      groupId: group.id,
      chapterId: errorModalTarget.chapterId || null,
      mangaTitle: group.mangaTitle || '',
      hasDl: groupProgress(group).hasDl,
      entries,
    };
  }, [queue, errorModalTarget, t]);

  useEffect(() => {
    if (errorModalTarget && !errorModalData) {
      setErrorModalTarget(null);
    }
  }, [errorModalTarget, errorModalData]);

  useEffect(() => {
    if (!errorModalData) return undefined;
    const rafId = window.requestAnimationFrame(() => errorModalCloseBtnRef.current?.focus?.());
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setErrorModalTarget(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [errorModalData]);

  const failedGroups = useMemo(
    () => queue.filter((g) => groupProgress(g).err > 0),
    [queue]
  );
  const totalFailedChapters = useMemo(
    () => failedGroups.reduce((sum, g) => sum + groupProgress(g).err, 0),
    [failedGroups]
  );

  const failedQueueErrorRows = useMemo(() => {
    const rows = [];
    for (const g of queue) {
      for (const c of g.chapters || []) {
        if (!isFailedQueueChapter(c)) continue;
        rows.push({
          at: c.errorAt || '',
          mangaTitle: g.mangaTitle || '',
          chapterTitle: c.chapterTitle || '',
          message: c.downloadError || t('queue.status.error'),
          successCount: c.successCount,
          totalPages: c.totalPages,
          failedPageIndices: c.failedPageIndices,
          chapterUrl: c.chapterUrl || '',
          mangaUrl: g.mangaUrl || '',
        });
      }
    }
    return rows;
  }, [queue, t]);

  const handleExportQueueErrorsCsv = useCallback(() => {
    exportErrorRowsToCsv(failedQueueErrorRows, {
      t,
      chapterFolder,
      filenamePrefix: 'manga-queue-errors',
    });
  }, [failedQueueErrorRows, t, chapterFolder]);

  const handleCopyErrorText = useCallback(async (key, text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (!isMountedRef.current) return;
      setCopiedErrorKey(key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        if (isMountedRef.current) setCopiedErrorKey(null);
      }, 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const queueStats = useMemo(() => {
    let totalCh = 0;
    let doneCh = 0;
    let errCh = 0;
    for (const g of queue) {
      const p = groupProgress(g);
      totalCh += p.total;
      doneCh += p.done;
      errCh += p.err;
    }
    return { mangas: queue.length, totalCh, doneCh, errCh };
  }, [queue]);

  const handleRetryAllFailed = () => {
    if (typeof onRetryFailedChapters !== 'function' || failedGroups.length === 0) return;
    failedGroups.forEach((g) => onRetryFailedChapters(g.id));
  };

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

  const visibleSelectedIds = useMemo(
    () => filteredQueue.filter((g) => selectedIds.has(g.id)).map((g) => g.id),
    [filteredQueue, selectedIds]
  );

  const selectedHasActiveDownload = useMemo(() => {
    const visSet = new Set(visibleSelectedIds);
    return queue.some(
      (g) => visSet.has(g.id) && g.chapters.some((c) => c.status === 'downloading')
    );
  }, [queue, visibleSelectedIds]);

  const filteredAllSelected =
    filteredQueue.length > 0 && filteredQueue.every((g) => selectedIds.has(g.id));

  const toggleSelectFiltered = () => {
    setQueueSelectedIds((prev) => {
      const next = new Set(prev instanceof Set ? prev : []);
      if (filteredAllSelected) {
        filteredQueue.forEach((g) => next.delete(g.id));
      } else {
        filteredQueue.forEach((g) => next.add(g.id));
      }
      return next;
    });
  };

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
      <StudioPrimaryActionSlot>
        <div className="flex items-center gap-2 shrink-0">
          {selectedPauseMode === 'resume' && someSelected && hasWaiting ? (
            <button
              type="button"
              data-testid="start-queue-btn"
              disabled={pauseResumeDisabled}
              onClick={handlePauseToggle}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
              data-tooltip={t('queue.resumeTitle')}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">play_circle</span>
              <span>{t('queue.resume')}</span>
            </button>
          ) : queueProcessing || hasActiveDownload ? (
            <button
              type="button"
              disabled={pauseResumeDisabled}
              onClick={handlePauseToggle}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
              data-tooltip={pauseResumeTitle}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">pause</span>
              <span>{t('queue.pause')}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="start-queue-btn"
              disabled={!hasWaiting || !someSelected}
              data-tooltip={!someSelected ? t('queue.startNeedSelection') : undefined}
              onClick={onStartQueue}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">play_arrow</span>
              <span>{t('queue.start')}</span>
            </button>
          )}
          {visibleSelectedIds.length > 0 && typeof removeSelectedGroups === 'function' ? (
            <button
              type="button"
              disabled={selectedHasActiveDownload}
              onClick={() => setConfirmRemoveSelectedOpen(true)}
              data-tooltip={
                selectedHasActiveDownload
                  ? t('queue.removeSelectedActiveTooltip')
                  : t('queue.removeSelectedTooltip', { count: visibleSelectedIds.length })
              }
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-error/30 bg-error/15 px-3 text-xs font-semibold text-error hover:bg-error/25 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
              <span>{t('queue.removeSelected', { count: visibleSelectedIds.length })}</span>
            </button>
          ) : null}
          {failedGroups.length > 0 && typeof onRetryFailedChapters === 'function' ? (
            <button
              type="button"
              onClick={handleRetryAllFailed}
              data-tooltip={t('queue.retryAllFailedTooltip')}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/12 px-3 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
              <span>{t('queue.retryAllFailed', { count: totalFailedChapters })}</span>
            </button>
          ) : null}
          {failedQueueErrorRows.length > 0 ? (
            <button
              type="button"
              data-testid="queue-export-error-csv-btn"
              onClick={handleExportQueueErrorsCsv}
              data-tooltip={t('queue.exportErrorsCsvTooltip')}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-3 text-xs font-medium text-on-surface hover:border-outline-variant/50 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">download</span>
              <span>{t('queue.exportErrorsCsv')}</span>
            </button>
          ) : null}
        </div>
      </StudioPrimaryActionSlot>

      <StudioRightToolbarSlot>
        {hasClearable ? (
          <button
            type="button"
            onClick={onClearCompleted}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-2.5 text-xs font-semibold text-on-surface-variant hover:text-error hover:border-error/30 hover:bg-error/10 transition-colors cursor-pointer"
            data-tooltip={t('queue.clearCompletedTooltip') || t('queue.clearCompleted')}
            aria-label={t('queue.clearCompletedTooltip') || t('queue.clearCompleted')}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">delete_sweep</span>
            <span className="tabular-nums">{clearableCount}</span>
          </button>
        ) : null}
      </StudioRightToolbarSlot>

      <div className="flex-1 flex flex-col px-6 pt-4 pb-4 gap-4 sm:px-8 overflow-hidden min-h-0">
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex-1 flex h-10 items-center gap-2 bg-surface-container-highest rounded-xl px-3 sm:px-3.5 border border-outline-variant/25 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-colors min-w-[200px]">
            <span className="material-symbols-outlined text-outline shrink-0 text-[18px] leading-none">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('queue.searchPlaceholder')}
              className="min-h-0 h-8 bg-transparent border-none text-xs sm:text-sm leading-normal focus:ring-0 p-0 flex-1 min-w-0 text-on-surface outline-none placeholder:text-outline"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                data-tooltip={t('queue.clearSearch')}
                aria-label={t('queue.clearSearch')}
                className="cursor-pointer shrink-0 rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">close</span>
              </button>
            ) : null}
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
                  checked={filteredAllSelected}
                  onChange={() => toggleSelectFiltered()}
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
              width: 'w-64 min-w-[256px]',
              header: '',
              ariaLabel: t('queue.col.actionsHeader'),
              align: 'right',
              headerClassName: 'w-64 min-w-[256px] border-none p-3 pr-4 sm:pr-5 text-right',
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
                  <span className="block truncate">{item.mangaTitle}</span>
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
                        >
                          {t('queue.retryFailed', { n: p.err })}
                        </button>
                      ) : null}
                    </div>
                    <div className="h-1.5 w-full bg-outline-variant/25 rounded-full overflow-hidden flex">
                      {p.err > 0 ? (
                        <>
                          <div
                            className="h-full bg-green-500 transition-[width] duration-300 shrink-0"
                            style={{ width: `${(p.success / p.total) * 100}%` }}
                          />
                          <div
                            className="h-full bg-error transition-[width] duration-300 shrink-0"
                            style={{ width: `${(p.err / p.total) * 100}%` }}
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
                        <span className="min-w-0 truncate" data-tooltip={item.workflowProgress?.error}>
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
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
                      <span className="min-w-0 truncate">{statusText}</span>
                    </span>
                  ) : (
                    <span
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        p.err > 0
                          ? 'text-error border-error/25 bg-error/10'
                          : p.allDone
                            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/10'
                            : isPaused
                              ? 'text-amber-600 dark:text-amber-400 border-amber-500/25 bg-amber-500/10'
                              : 'text-on-surface-variant border-outline-variant/25 bg-surface-container-highest/70'
                      }`}
                    >
                      {p.err > 0 ? (
                        <span className="material-symbols-outlined text-[14px] leading-none shrink-0">error</span>
                      ) : p.allDone ? (
                        <span className="material-symbols-outlined text-[14px] leading-none shrink-0">check_circle</span>
                      ) : (
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            isPaused ? 'bg-amber-500' : 'bg-outline'
                          }`}
                        />
                      )}
                      <span className="min-w-0 truncate">{statusText}</span>
                    </span>
                  )}
                </td>
                <td className="p-2 sm:p-3 pr-4 sm:pr-5 w-64 min-w-[256px] align-middle" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(item.id)}
                      className="h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary/10 inline-flex items-center justify-center transition-colors active:scale-95 shrink-0 cursor-pointer"
                      data-tooltip={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
                      aria-label={t(isExpanded ? 'queue.collapseChapters' : 'queue.expandChapters')}
                    >
                      <span
                        className="material-symbols-outlined text-[19px] leading-none transition-transform duration-200"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        expand_more
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleGroupDownloadOrder?.(item.id)}
                      disabled={p.hasDl}
                      className="cursor-pointer h-8 w-8 shrink-0 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-primary/10 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                      className="shrink-0"
                    />
                    <button
                      type="button"
                      disabled={!(p.done > 0 || p.hasDl)}
                      onClick={() => onOpenMangaFolder?.(item.mangaTitle)}
                      className="cursor-pointer h-8 w-8 shrink-0 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-primary hover:border-primary/40 hover:bg-primary/10 inline-flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      data-tooltip={p.done > 0 || p.hasDl ? t('queue.openTitle') : t('queue.folderNotReadyTooltip')}
                      aria-label={p.done > 0 || p.hasDl ? t('queue.openTitle') : t('queue.folderNotReadyTooltip')}
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
                    </button>
                    {p.err > 0 ? (
                      <button
                        type="button"
                        data-testid="queue-group-bug-btn"
                        onClick={() => {
                          setCopiedErrorKey(null);
                          setErrorModalTarget({ groupId: item.id });
                        }}
                        className="cursor-pointer h-8 w-8 shrink-0 rounded-lg border border-error/30 bg-error/10 text-error hover:bg-error/20 inline-flex items-center justify-center transition-colors"
                        data-tooltip={t('queue.viewMangaErrorsTooltip', { count: p.err })}
                        aria-label={t('queue.viewMangaErrorsTooltip', { count: p.err })}
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">bug_report</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={p.hasDl}
                      onClick={() => onRemoveItem(item.id)}
                      className="cursor-pointer h-8 w-8 shrink-0 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-error hover:border-error/30 hover:bg-error/10 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      data-tooltip={t('queue.removeTitle')}
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
            const summary = chapterStatusSummary(item.chapters);
            const allSame = isAllSameStatus(item.chapters);
            const searchQ = (chapterSearchQuery[item.id] || '').toLowerCase();
            const sorted = sortChaptersByStatusPriority(item.chapters);
            const filtered = searchQ ? sorted.filter(({ c }) => (c.chapterTitle || '').toLowerCase().includes(searchQ)) : sorted;
            return (
              <tr key={`${item.id}-expanded`} className="bg-surface-container-lowest">
                <td colSpan={7} className="p-0 border-b border-outline-variant/10">
                  <div className="bg-surface-container/30 px-3 py-3 shadow-inner border-y border-outline-variant/5">
                    {/* Mini summary bar + actions */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                        <span className="font-semibold text-on-surface">{summary.total}</span>
                        <span>{t('queue.chapterUnit') || 'chương'}</span>
                        {summary.err > 0 && <span className="text-error">· {summary.err} {t('queue.status.error') || 'lỗi'}</span>}
                        {summary.dl > 0 && <span className="text-blue-500">· {summary.dl} {t('queue.status.downloading') || 'đang tải'}</span>}
                        {summary.done > 0 && <span className="text-green-500">· {summary.done} {t('queue.status.done') || 'xong'}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Search bar - show when > 20 chapters */}
                        {item.chapters.length > 20 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-outline-variant/20 bg-surface focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                            <span className="material-symbols-outlined !text-[16px] text-on-surface-variant shrink-0">search</span>
                            <input
                              type="text"
                              value={chapterSearchQuery[item.id] || ''}
                              onChange={e => setChapterSearchQuery(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder={t('queue.searchChapter') || 'Tìm chapter...'}
                              className="w-36 min-w-0 bg-transparent text-[12px] text-on-surface placeholder:text-on-surface-variant/50 outline-none"
                            />
                            {searchQ && (
                              <button
                                type="button"
                                onClick={() => setChapterSearchQuery(prev => ({ ...prev, [item.id]: '' }))}
                                className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                              >
                                <span className="material-symbols-outlined !text-[14px]">close</span>
                              </button>
                            )}
                          </div>
                        )}
                        {item.chapters.some(c => c.status === 'done' && !c.downloadError) && (
                          <button
                            type="button"
                            onClick={() => onClearCompletedInGroup?.(item.id)}
                            className="flex items-center gap-1 text-[12px] font-medium text-on-surface-variant hover:text-error transition-colors px-2 py-1 rounded bg-surface hover:bg-error/10 border border-outline-variant/20 shadow-sm"
                            aria-label={t('queue.clearCompletedInGroup') || 'Clear completed'}
                          >
                            <span className="material-symbols-outlined !text-[16px]">clear_all</span>
                            {t('queue.clearCompletedInGroup') || 'Clear completed'}
                          </button>
                        )}
                      </div>
                    </div>
                    {searchQ && (
                      <div className="text-[10px] text-on-surface-variant mb-1.5 px-1">
                        {filtered.length}/{summary.total} {t('queue.chapterUnit') || 'chương'}
                      </div>
                    )}
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-2">
                      {filtered.map(({ c, origIdx }, visualIdx) => {
                        const isDone = c.status === 'done' && !c.downloadError;
                        const isErr = c.status === 'error' || c.status === 'failed' || (c.status === 'done' && !!c.downloadError);
                        const isDl = c.status === 'downloading';
                        const isWait = c.status === 'waiting';
                        const badgeBg = isDone ? 'bg-green-500/10 dark:bg-green-500/20' : isErr ? 'bg-red-500/10 dark:bg-red-500/20' : isDl ? 'bg-blue-500/10 dark:bg-blue-500/20' : 'bg-surface-container-high';
                        const badgeText = isDone ? 'text-green-600 dark:text-green-400' : isErr ? 'text-error' : isDl ? 'text-blue-600 dark:text-blue-400' : 'text-on-surface-variant';
                        const borderColor = isDone ? 'border-green-500/40' : isErr ? 'border-red-500/40' : isDl ? 'border-blue-500/40' : 'border-outline-variant/20';
                        const chNum = extractChapterNumber(c.chapterTitle);
                        const stripeBg = visualIdx % 2 === 0 ? 'bg-surface' : 'bg-surface-container/30';
                        
                        const isDragOver = chapterDragOverInfo?.groupId === item.id && chapterDragOverInfo?.index === origIdx;
                          
                        return (
                          <div 
                            key={c.id}
                            draggable={!searchQ}
                            onDragStart={(e) => {
                              chapterDragFromInfoRef.current = { groupId: item.id, index: origIdx };
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => handleChapterDragOver(e, item.id, origIdx)}
                            onDragLeave={() => setChapterDragOverInfo(null)}
                            onDrop={(e) => handleChapterDrop(e, item.id, origIdx)}
                            className={`group/row flex items-center justify-between py-1.5 px-3 border-l-2 ${borderColor} rounded-r-md rounded-l-sm ${stripeBg} hover:bg-surface-container-high transition-all duration-150 ${searchQ ? '' : 'cursor-move'} ${isDragOver ? 'ring-2 ring-inset ring-primary/50' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {chNum && (
                                <span className="text-[11px] font-mono tabular-nums font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded shrink-0 min-w-[40px] text-center">
                                  {chNum}
                                </span>
                              )}
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[13px] truncate text-on-surface font-medium">
                                  {c.chapterTitle}
                                </span>
                                {isErr && c.downloadError ? (
                                  <span
                                    className="text-[11px] text-error/90 truncate"
                                    data-tooltip={c.downloadError}
                                  >
                                    {c.downloadError}
                                  </span>
                                ) : null}
                              </div>
                              {!allSame && (
                                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeBg} ${badgeText} shrink-0`}>
                                  {isErr ? (t('queue.status.error') || 'Error') : (t(`queue.status.${c.status}`) || c.status)}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-3">
                              {isErr && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCopiedErrorKey(null);
                                    setErrorModalTarget({ groupId: item.id, chapterId: c.id });
                                  }}
                                  className="h-7 w-7 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-error hover:border-error/30 hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer"
                                  data-tooltip={t('history.bugDetailOpenTitle')}
                                  aria-label={t('history.bugDetailOpenTitle')}
                                >
                                  <span className="material-symbols-outlined !text-[15px] leading-none">bug_report</span>
                                </button>
                              )}
                              {(isDl || isWait) && (
                                <button
                                  type="button"
                                  onClick={() => onSkipChapter && onSkipChapter(item.id, c.id, isDl)}
                                  className="text-on-surface-variant hover:text-amber-500 hover:bg-amber-500/10 rounded-lg w-7 h-7 flex items-center justify-center transition-colors cursor-pointer"
                                  data-tooltip={t('queue.skipChapterTitle') || 'Skip'}
                                  aria-label={t('queue.skipChapterTitle') || 'Skip'}
                                >
                                  <span className="material-symbols-outlined !text-[16px]">skip_next</span>
                                </button>
                              )}
                              {isErr && (
                                <button
                                  type="button"
                                  onClick={() => onRetryChapter && onRetryChapter(item.id, c.id)}
                                  className="text-on-surface-variant hover:text-green-500 hover:bg-green-500/10 rounded-lg w-7 h-7 flex items-center justify-center transition-colors cursor-pointer"
                                  data-tooltip={t('queue.retryChapterTitle') || 'Retry'}
                                  aria-label={t('queue.retryChapterTitle') || 'Retry'}
                                >
                                  <span className="material-symbols-outlined !text-[16px]">refresh</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onRemoveChapter && onRemoveChapter(item.id, c.id)}
                                className="text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg w-7 h-7 flex items-center justify-center transition-colors cursor-pointer"
                                data-tooltip={t('queue.removeChapterTitle') || 'Remove'}
                                aria-label={t('queue.removeChapterTitle') || 'Remove'}
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
          </div>
          {queue.length > 0 ? (
            <div className="border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none shrink-0">
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs shrink-0">
                {t('queue.summaryStats', {
                  mangas: queueStats.mangas,
                  done: queueStats.doneCh,
                  total: queueStats.totalCh,
                })}
              </span>
              <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
                <ProgressPanel
                  compact
                  queue={queue}
                  downloadProgress={downloadProgress}
                  queueProcessing={queueProcessing}
                  activeChapterLabel={activeChapterLabel}
                />
                {queueStats.errCh > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStatusFilter((prev) => (prev === 'error' ? 'all' : 'error'))}
                    className={`cursor-pointer inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                      statusFilter === 'error'
                        ? 'bg-error text-on-error'
                        : 'border border-error/25 bg-error/10 text-error hover:bg-error/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px] leading-none">error</span>
                    <span>{t('queue.summaryFailedPill', { count: queueStats.errCh })}</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <ConfirmModal
            open={confirmRemoveSelectedOpen && visibleSelectedIds.length > 0}
            variant="danger"
            icon="delete_forever"
            title={t('queue.removeSelectedConfirmTitle')}
            message={t('queue.removeSelectedConfirmMessage', { count: visibleSelectedIds.length })}
            confirmLabel={t('queue.removeSelected', { count: visibleSelectedIds.length })}
            cancelLabel={t('confirmModal.cancel')}
            onConfirm={() => {
              const visSet = new Set(visibleSelectedIds);
              const safeIds = queue
                .filter((g) => visSet.has(g.id) && !g.chapters.some((c) => c.status === 'downloading'))
                .map((g) => g.id);
              if (safeIds.length > 0) removeSelectedGroups?.(safeIds);
              setConfirmRemoveSelectedOpen(false);
            }}
            onCancel={() => setConfirmRemoveSelectedOpen(false)}
          />
          {errorModalData && typeof document !== 'undefined'
            ? createPortal(
                <div
                  data-testid="queue-error-modal-backdrop"
                  className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="queue-error-detail-title"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setErrorModalTarget(null);
                  }}
                >
                  <div className="bg-surface max-w-2xl w-full max-h-[82vh] overflow-hidden flex flex-col rounded-2xl border border-outline-variant/20 shadow-2xl">
                    <div className="px-5 py-3.5 border-b border-outline-variant/20 bg-surface-container-low/80 flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-[19px] leading-none text-error shrink-0">
                          bug_report
                        </span>
                        <h2 id="queue-error-detail-title" className="text-sm font-bold text-on-surface truncate">
                          {errorModalData.mangaTitle || t('history.bugDetailTitle')}
                        </h2>
                        <span className="inline-flex items-center rounded-full border border-error/25 bg-error/10 px-2.5 py-0.5 text-[11px] font-semibold text-error tabular-nums shrink-0">
                          {t('history.errorCountBadge', { count: errorModalData.entries.length })}
                        </span>
                      </div>
                      <button
                        ref={errorModalCloseBtnRef}
                        type="button"
                        onClick={() => setErrorModalTarget(null)}
                        data-tooltip={t('history.detailClose')}
                        aria-label={t('history.detailClose')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50 transition-colors cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                      </button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar min-h-0 flex-1 space-y-3">
                      {errorModalData.entries.map((entry) => {
                        const detailText = buildErrorDetailText(entry, { t, chapterFolder });
                        const isEntryCopied = copiedErrorKey === entry.chapterId;
                        return (
                          <div
                            key={entry.chapterId}
                            className="rounded-xl border border-error/20 bg-surface-container-low/60 p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-on-surface truncate">
                                {formatChapterFolderName(entry.chapterTitle, chapterFolder)}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyErrorText(entry.chapterId, detailText)}
                                  data-tooltip={isEntryCopied ? t('history.detailCopied') : t('history.detailCopy')}
                                  aria-label={isEntryCopied ? t('history.detailCopied') : t('history.detailCopy')}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[15px] leading-none">
                                    {isEntryCopied ? 'check' : 'content_copy'}
                                  </span>
                                </button>
                                {typeof onRetryChapter === 'function' ? (
                                  <button
                                    type="button"
                                    disabled={errorModalData.hasDl}
                                    onClick={() => onRetryChapter(errorModalData.groupId, entry.chapterId)}
                                    data-tooltip={t('queue.retryChapterTitle') || 'Retry'}
                                    aria-label={t('queue.retryChapterTitle') || 'Retry'}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-green-500 hover:border-green-500/35 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            <pre className="whitespace-pre-wrap break-words text-xs text-on-surface-variant font-mono leading-relaxed">
                              {detailText}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            exportErrorRowsToCsv(errorModalData.entries, {
                              t,
                              chapterFolder,
                              filenamePrefix: 'manga-queue-errors',
                            })
                          }
                          data-tooltip={t('queue.exportMangaErrorsCsvTooltip')}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-3 text-xs font-medium text-on-surface hover:border-outline-variant/50 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px] leading-none">download</span>
                          <span>{t('queue.exportMangaErrorsCsv')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const combined = errorModalData.entries
                              .map((entry) => buildErrorDetailText(entry, { t, chapterFolder }))
                              .join('\n\n---\n\n');
                            handleCopyErrorText('all', combined);
                          }}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-3 text-xs font-medium text-on-surface hover:border-outline-variant/50 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px] leading-none">
                            {copiedErrorKey === 'all' ? 'check' : 'content_copy'}
                          </span>
                          <span>
                            {copiedErrorKey === 'all'
                              ? t('history.detailCopied')
                              : errorModalData.entries.length > 1
                                ? t('queue.copyAllErrors')
                                : t('history.detailCopy')}
                          </span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {errorModalData.chapterId && typeof onRetryChapter === 'function' ? (
                          <button
                            type="button"
                            disabled={errorModalData.hasDl}
                            onClick={() => onRetryChapter(errorModalData.groupId, errorModalData.chapterId)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
                            <span>{t('queue.retryChapterTitle') || 'Retry'}</span>
                          </button>
                        ) : !errorModalData.chapterId && typeof onRetryFailedChapters === 'function' ? (
                          <button
                            type="button"
                            disabled={errorModalData.hasDl}
                            onClick={() => onRetryFailedChapters(errorModalData.groupId)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
                            <span>{t('queue.retryFailed', { n: errorModalData.entries.length })}</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setErrorModalTarget(null)}
                          className="inline-flex h-8 items-center justify-center rounded-lg bg-surface-container-high px-3.5 text-xs font-medium text-on-surface hover:bg-surface-container-highest cursor-pointer transition-colors"
                        >
                          {t('history.detailClose')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : null}
        </div>
    );
  }
