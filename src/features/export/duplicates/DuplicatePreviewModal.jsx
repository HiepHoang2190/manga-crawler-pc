import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatBytes } from './duplicateUtils';

/**
 * Theme-aware studio preview modal matching PipelinePreviewModal & desktop theme tokens.
 */
export default function DuplicatePreviewModal({
  item,
  previewDataUrl,
  previewError = false,
  hasScanned = false,
  isSelected = false,
  currentIndex = 0,
  totalCount = 0,
  onToggleSelect,
  onOpenFolder,
  onPrev,
  onNext,
  onClose,
  t,
}) {
  const modalRef = useRef(null);
  const isOpen = Boolean(item?.fullPath);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const prevFocused = document.activeElement;
    modalRef.current?.focus?.();
    return () => {
      if (prevFocused && typeof prevFocused.focus === 'function' && prevFocused.isConnected !== false) {
        prevFocused.focus();
      }
    };
  }, [isOpen]);

  if (!item || typeof document === 'undefined') return null;

  const iconBtnClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0';

  return createPortal(
    <div
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('duplicateTab.preview')}
      data-testid="duplicate-preview-modal"
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6 select-none outline-none animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="flex h-[min(90vh,860px)] w-[min(94vw,1120px)] flex-col overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface text-on-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Studio Header */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-low px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            {totalCount > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    onPrev?.();
                    e.currentTarget.blur();
                  }}
                  data-tooltip={t('duplicateTab.prevImage')}
                  aria-label={t('duplicateTab.prevImage')}
                  className={iconBtnClass}
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">chevron_left</span>
                </button>
                <span className="px-1.5 text-xs font-mono font-semibold text-on-surface-variant tabular-nums">
                  {currentIndex >= 0 ? `${currentIndex + 1}/${totalCount}` : `—/${totalCount}`}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    onNext?.();
                    e.currentTarget.blur();
                  }}
                  data-tooltip={t('duplicateTab.nextImage')}
                  aria-label={t('duplicateTab.nextImage')}
                  className={iconBtnClass}
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">chevron_right</span>
                </button>
              </div>
            )}

            {hasScanned && item.isDuplicate && (
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                  item.isOriginal
                    ? 'border-cyan-500/35 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400'
                    : 'border-rose-500/35 bg-rose-500/12 text-rose-600 dark:text-rose-400'
                }`}
              >
                {item.isOriginal ? t('duplicateTab.originalBadge') : t('duplicateTab.duplicateBadge')}
              </span>
            )}

            {hasScanned && item.duplicateGroup != null && (
              <span className="hidden sm:inline-flex shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {t('duplicateTab.group', { id: item.duplicateGroup })}
              </span>
            )}

            <span className="truncate text-xs sm:text-sm font-semibold text-on-surface min-w-0">
              {item.name}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasScanned && typeof onToggleSelect === 'function' && (
              <button
                type="button"
                data-testid="duplicate-preview-toggle-delete"
                onClick={(e) => {
                  onToggleSelect(item.fullPath);
                  e.currentTarget.blur();
                }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'border-error/40 bg-error/15 text-error hover:bg-error/25'
                    : 'border-outline-variant/25 bg-surface-container-highest text-on-surface hover:border-primary/40 hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">
                  {isSelected ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <span>
                  {isSelected ? t('duplicateTab.previewMarkedDelete') : t('duplicateTab.previewKeepImage')}
                </span>
              </button>
            )}

            {typeof onOpenFolder === 'function' && (
              <button
                type="button"
                onClick={(e) => {
                  onOpenFolder(item.fullPath);
                  e.currentTarget.blur();
                }}
                data-tooltip={t('duplicateTab.openFolder')}
                aria-label={t('duplicateTab.openFolder')}
                className={iconBtnClass}
              >
                <span className="material-symbols-outlined text-[17px] leading-none">folder_open</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              data-tooltip={t('duplicateTab.closePreview')}
              aria-label={t('duplicateTab.closePreview')}
              className={iconBtnClass}
            >
              <span className="material-symbols-outlined text-[18px] leading-none">close</span>
            </button>
          </div>
        </header>

        {/* Theme-Aware Image Canvas Stage */}
        <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-container-lowest/70 p-4 sm:p-6">
          {totalCount > 1 && (
            <button
              type="button"
              onClick={(e) => {
                onPrev?.();
                e.currentTarget.blur();
              }}
              data-tooltip={t('duplicateTab.prevImage')}
              aria-label={t('duplicateTab.prevImage')}
              className="hidden sm:inline-flex z-10 absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full border border-outline-variant/25 bg-surface-container-high/85 backdrop-blur text-on-surface hover:border-primary/40 hover:text-primary shadow-md cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">chevron_left</span>
            </button>
          )}

          {previewDataUrl ? (
            <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center">
              <img
                src={previewDataUrl}
                alt={item.name || ''}
                draggable={false}
                className="max-h-full max-w-full rounded-xl border border-outline-variant/20 bg-surface-container object-contain shadow-lg"
              />
            </div>
          ) : previewError ? (
            <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-2xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant/60">
              <span className="material-symbols-outlined text-4xl">broken_image</span>
            </div>
          ) : (
            <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-2xl border border-outline-variant/20 bg-surface-container-low">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                progress_activity
              </span>
            </div>
          )}

          {totalCount > 1 && (
            <button
              type="button"
              onClick={(e) => {
                onNext?.();
                e.currentTarget.blur();
              }}
              data-tooltip={t('duplicateTab.nextImage')}
              aria-label={t('duplicateTab.nextImage')}
              className="hidden sm:inline-flex z-10 absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full border border-outline-variant/25 bg-surface-container-high/85 backdrop-blur text-on-surface hover:border-primary/40 hover:text-primary shadow-md cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">chevron_right</span>
            </button>
          )}
        </main>

        {/* Studio Metadata & Shortcuts Footer */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-xs">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="material-symbols-outlined text-[15px] text-on-surface-variant/70 shrink-0">
              description
            </span>
            <span
              className="truncate font-mono text-[11px] text-on-surface-variant"
              data-tooltip={item.fullPath}
            >
              {item.fullPath}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.width && item.height ? (
              <span className="rounded-md border border-outline-variant/20 bg-surface-container-highest px-2 py-0.5 font-mono text-[11px] font-medium text-on-surface tabular-nums">
                {item.width}×{item.height}
              </span>
            ) : null}
            <span className="rounded-md border border-outline-variant/20 bg-surface-container-highest px-2 py-0.5 font-mono text-[11px] font-medium text-on-surface tabular-nums">
              {formatBytes(item.sizeBytes)}
            </span>
            <span className="hidden md:inline text-[11px] text-on-surface-variant/70 pl-1">
              {t('duplicateTab.previewShortcuts')}
            </span>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
