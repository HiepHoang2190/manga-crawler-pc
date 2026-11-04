import React from 'react';
import ResizeSplitter from '../ui/ResizeSplitter';
import { useSafeI18n } from '../../context/I18nContext';

/**
 * StudioLayout — Bộ khung layout chuẩn Workflow Studio
 * Bao gồm các subcomponent compound:
 * - StudioLayout.Toolbar
 * - StudioLayout.LeftSidebar
 * - StudioLayout.Content
 * - StudioLayout.RightSidebar
 * - StudioLayout.BottomDrawer
 */
export default function StudioLayout({ children, className = '' }) {
  return (
    <div
      className={`flex flex-col h-full w-full bg-surface text-on-surface overflow-hidden select-none font-sans ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * StudioLayout.Toolbar — Thanh công cụ đỉnh
 */
StudioLayout.Toolbar = function StudioToolbar({
  icon,
  title,
  subtitle,
  leftSlot,
  centerSlot,
  rightSlot,
  showLeftSidebar,
  onToggleLeftSidebar,
  leftSidebarTooltip,
  showRightSidebar,
  onToggleRightSidebar,
  rightSidebarTooltip,
  isBottomOpen,
  onToggleBottom,
  bottomTooltip,
  onHelpClick,
  helpTooltip,
  children,
  className = '',
}) {
  const { t } = useSafeI18n();
  if (children) {
    return (
      <header
        className={`h-11 min-h-[44px] border-b border-outline-variant/20 bg-surface-container-low/70 backdrop-blur px-4 flex items-center justify-between shrink-0 select-none ${className}`}
      >
        {children}
      </header>
    );
  }

  const effectiveLeftSidebarTooltip =
    leftSidebarTooltip ||
    (showLeftSidebar ? t('studio.collapseLeftSidebar') : t('studio.expandLeftSidebar'));
  const effectiveBottomTooltip = bottomTooltip || t('studio.toggleBottomDrawer');
  const effectiveRightSidebarTooltip = rightSidebarTooltip || t('studio.toggleRightSidebar');
  const effectiveHelpTooltip = helpTooltip || t('help.tabGuideTooltip');

  return (
    <header
      className={`relative h-11 min-h-[44px] border-b border-outline-variant/20 bg-surface-container-low/70 backdrop-blur px-4 flex items-center justify-between shrink-0 select-none gap-3 ${className}`}
    >
      {/* Left Slot: Toggle Sidebar (thay thế logo), Title, Subtitle, or custom left */}
      <div className="flex items-center gap-2.5 min-w-0 z-10 shrink-0">
        {onToggleLeftSidebar ? (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            data-tooltip={effectiveLeftSidebarTooltip}
            aria-label={effectiveLeftSidebarTooltip}
            className={`cursor-pointer w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
              showLeftSidebar
                ? 'text-primary bg-primary/10 hover:bg-primary/20 shadow-2xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className={`material-symbols-outlined text-[18px] ${!showLeftSidebar ? 'scale-x-[-1]' : ''}`}>
              {showLeftSidebar ? 'dock_to_left' : 'view_sidebar'}
            </span>
          </button>
        ) : icon ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
          </div>
        ) : null}

        {(title || subtitle) && (
          <div className="flex flex-col min-w-0 shrink-0">
            {title && (
              <h1 className="text-xs font-bold text-on-surface tracking-tight leading-tight truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <span className="text-[10px] text-on-surface-variant/80 truncate leading-tight">
                {subtitle}
              </span>
            )}
          </div>
        )}
        {leftSlot}
      </div>

      {/* Center Slot: Subtabs / Navigation pills / Action button (in-flow flexible center, no overlap) */}
      {centerSlot ? (
        <div className="flex-1 min-w-0 flex items-center justify-center px-2 z-10 overflow-hidden">
          <div className="flex items-center justify-center gap-2 shrink-0">
            {centerSlot}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-w-0" />
      )}

      {/* Right Slot: Actions + Sidebar Toggles + Help */}
      <div className="flex items-center gap-1.5 shrink-0 z-10">
        {rightSlot}

        {/* View Toggle Group for Bottom / Right */}
        {(onToggleRightSidebar || onToggleBottom) && (
          <div className="flex items-center gap-0.5 rounded-lg bg-surface-container p-0.5 border border-outline-variant/20">
            {onToggleBottom && (
              <button
                type="button"
                onClick={onToggleBottom}
                data-tooltip={effectiveBottomTooltip}
                aria-label={effectiveBottomTooltip}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  isBottomOpen
                    ? 'bg-primary/15 text-primary font-bold shadow-xs'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">terminal</span>
              </button>
            )}
            {onToggleRightSidebar && (
              <button
                type="button"
                onClick={onToggleRightSidebar}
                data-tooltip={effectiveRightSidebarTooltip}
                aria-label={effectiveRightSidebarTooltip}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  showRightSidebar
                    ? 'bg-primary/15 text-primary font-bold shadow-xs'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">dock_to_right</span>
              </button>
            )}
          </div>
        )}

        {/* Help button */}
        {onHelpClick && (
          <button
            type="button"
            onClick={onHelpClick}
            data-tooltip={effectiveHelpTooltip}
            aria-label={effectiveHelpTooltip}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">help</span>
          </button>
        )}
      </div>
    </header>
  );
};

/**
 * StudioLayout.Body — Thân container chứa Sidebars và Content
 */
StudioLayout.Body = function StudioBody({ children, className = '' }) {
  return (
    <div className={`flex-1 flex min-h-0 min-w-0 relative overflow-hidden ${className}`}>
      {children}
    </div>
  );
};

/**
 * StudioLayout.LeftSidebar — Sidebar bên trái với ResizeSplitter và Scrollbar Isolation
 */
StudioLayout.LeftSidebar = function StudioLeftSidebar({
  open = true,
  width = 260,
  onResizeStart,
  icon,
  title,
  headerActions,
  onClose,
  children,
  className = '',
}) {
  const { t } = useSafeI18n();
  if (!open) return null;

  return (
    <aside
      style={{ width }}
      className={`relative flex flex-col shrink-0 h-full border-r border-outline-variant/20 bg-surface-container-lowest/60 backdrop-blur overflow-visible select-none ${className}`}
    >
      {/* Optional Header */}
      {(title || icon || headerActions || onClose) && (
        <div className="h-10 min-h-[40px] border-b border-outline-variant/15 px-3 flex items-center justify-between shrink-0 bg-surface-container-low/40">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                {icon}
              </span>
            )}
            {title && (
              <span className="text-xs font-bold text-on-surface truncate tracking-tight">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
                data-tooltip={t('studio.collapseLeftSidebar')}
                aria-label={t('studio.collapseLeftSidebar')}
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Content with strict Scrollbar Isolation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 mr-1.5 flex flex-col">
        {children}
      </div>

      {/* Draggable ResizeSplitter on the right border */}
      {onResizeStart && (
        <ResizeSplitter
          variant="overlay"
          side="right"
          onPointerDown={onResizeStart}
          title={t('studio.resizeWidth')}
          ariaLabel={t('studio.resizeWidth')}
        />
      )}
    </aside>
  );
};

/**
 * StudioLayout.Content — Vùng hiển thị trung tâm (Canvas / Preview / Data)
 */
StudioLayout.Content = function StudioContent({ children, className = '' }) {
  return (
    <main className={`flex-1 relative h-full min-w-0 overflow-hidden bg-surface flex flex-col ${className}`}>
      {children}
    </main>
  );
};

/**
 * StudioLayout.RightSidebar — Sidebar bên phải với ResizeSplitter và Scrollbar Isolation
 */
StudioLayout.RightSidebar = function StudioRightSidebar({
  open = true,
  width = 340,
  onResizeStart,
  icon,
  title,
  headerActions,
  onClose,
  children,
  className = '',
}) {
  const { t } = useSafeI18n();
  if (!open) return null;

  return (
    <aside
      style={{ width }}
      className={`relative flex flex-col shrink-0 h-full border-l border-outline-variant/20 bg-surface-container-lowest/60 backdrop-blur overflow-visible select-none ${className}`}
    >
      {/* Draggable ResizeSplitter on the left border */}
      {onResizeStart && (
        <ResizeSplitter
          variant="overlay"
          side="left"
          onPointerDown={onResizeStart}
          title={t('studio.resizeWidth')}
          ariaLabel={t('studio.resizeWidth')}
        />
      )}

      {/* Optional Header */}
      {(title || icon || headerActions || onClose) && (
        <div className="h-10 min-h-[40px] border-b border-outline-variant/15 px-3 flex items-center justify-between shrink-0 bg-surface-container-low/40">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                {icon}
              </span>
            )}
            {title && (
              <span className="text-xs font-bold text-on-surface truncate tracking-tight">
                {title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
                aria-label={t('studio.closeInspector')}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Content with strict Scrollbar Isolation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 mr-1.5 flex flex-col">
        {children}
      </div>
    </aside>
  );
};

/**
 * StudioLayout.BottomDrawer — Khung nhật ký / Console / Tiến trình đáy
 */
StudioLayout.BottomDrawer = function StudioBottomDrawer({
  open = true,
  height = 220,
  onResizeStart,
  icon = 'terminal',
  title = 'Bảng điều khiển & Nhật ký',
  headerActions,
  onClose,
  children,
  className = '',
}) {
  const { t } = useSafeI18n();
  if (!open) return null;

  return (
    <div
      style={{ height }}
      className={`relative flex flex-col shrink-0 w-full border-t border-outline-variant/20 bg-surface-container-lowest shadow-2xl z-30 overflow-hidden ${className}`}
    >
      {/* Horizontal Resize Bar */}
      {onResizeStart && (
        <div
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={onResizeStart}
          className="group relative z-40 flex h-2 w-full shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-b border-outline-variant/10 hover:bg-primary/15 transition-colors"
          aria-label={t('studio.resizeHeight')}
        >
          <div className="h-1 w-12 rounded-full bg-outline-variant/40 group-hover:bg-primary transition-all duration-150" />
        </div>
      )}

      {/* Header */}
      <div className="h-8 min-h-[32px] border-b border-outline-variant/15 px-3 flex items-center justify-between shrink-0 bg-surface-container-low/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
            {icon}
          </span>
          <span className="text-[11px] font-bold text-on-surface truncate tracking-tight">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {headerActions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-5 w-5 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
              data-tooltip={t('studio.closeConsole')}
              aria-label={t('studio.closeConsole')}
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 mr-1.5 flex flex-col">
        {children}
      </div>
    </div>
  );
};

