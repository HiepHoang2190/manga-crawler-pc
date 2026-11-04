import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';

export default function WorkflowToolbar({
  workflowName,
  onChangeWorkflowName,
  isRunning,
  canRun = true,
  blockingReason = null,
  onRun,
  onStop,
  onOpenWorkflowManager,
  onNewWorkflow,
  onOpenTemplates,
  onAutoConnect,
  onSave,
  onExportJson,
  onImportJson,
  onClear,
  nodeCount = 0,
  isConsoleOpen = false,
  onToggleConsole,
  logCount = 0,
  showLeftSidebar = true,
  onToggleLeftSidebar,
  showRightSidebar = true,
  onToggleRightSidebar,
}) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const actionsBtnRef = useRef(null);
  const actionsMenuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  // Cập nhật vị trí menu khi mở
  useLayoutEffect(() => {
    if (!isActionsOpen || !actionsBtnRef.current) return;
    const rect = actionsBtnRef.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = rect.bottom + 6;
    setMenuStyle({
      position: 'fixed',
      top: `${top}px`,
      right: `${right}px`,
    });
  }, [isActionsOpen]);

  // Đóng menu khi click ra ngoài hoặc nhấn phím Escape
  useEffect(() => {
    if (!isActionsOpen) return;
    const handlePointerDown = (e) => {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(e.target) &&
        !actionsBtnRef.current?.contains(e.target)
      ) {
        setIsActionsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsActionsOpen(false);
        actionsBtnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionsOpen]);

  const handleAction = (actionFn) => {
    setIsActionsOpen(false);
    if (typeof actionFn === 'function') actionFn();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        onImportJson(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const paletteTooltip = showLeftSidebar
    ? t('workflow.toolbar.collapsePalette')
    : t('workflow.toolbar.expandPalette');
  const inspectorTooltip = showRightSidebar
    ? t('workflow.toolbar.collapseInspector')
    : t('workflow.toolbar.expandInspector');

  return (
    <header className="h-12 px-4 bg-surface-container-lowest border-b border-outline-variant/20 shadow-2xs flex items-center justify-between gap-3 shrink-0 z-30 select-none text-on-surface">
      {/* Left: Sidebar Toggle, Project Selector (Manga Studio style), New button & Title */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Toggle Left Sidebar Button */}
        {onToggleLeftSidebar && (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            className={`cursor-pointer w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
              showLeftSidebar
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
            data-tooltip={paletteTooltip}
            aria-label={paletteTooltip}
          >
            <span className={`material-symbols-outlined text-[18px] ${!showLeftSidebar ? 'scale-x-[-1]' : ''}`}>
              {showLeftSidebar ? 'dock_to_left' : 'view_sidebar'}
            </span>
          </button>
        )}

        {/* Project Selector Button (Mở modal danh sách các Workflow) */}
        <button
          type="button"
          onClick={onOpenWorkflowManager}
          className="h-8 px-2.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs shrink-0 max-w-[210px] hover:border-primary/40 whitespace-nowrap"
          data-tooltip={t('workflow.toolbar.manageWorkflows')}
        >
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">folder_open</span>
          <span className="truncate max-w-[120px] sm:max-w-[140px] text-left font-medium">
            {workflowName || t('workflow.studio.defaultName')}
          </span>
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">expand_more</span>
        </button>

        {/* Quick New Workflow button */}
        <button
          type="button"
          onClick={onNewWorkflow}
          className="h-8 px-2 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shrink-0"
          data-tooltip={t('workflow.toolbar.newWorkflow')}
        >
          <span className="material-symbols-outlined text-[15px] text-primary">add</span>
          <span className="hidden sm:inline">{t('workflow.toolbar.newShort')}</span>
        </button>
      </div>

      {/* Center: Primary Run / Stop Controls */}
      <div className="flex items-center gap-2">
        {!isRunning ? (
          <button
            type="button"
            onClick={onRun}
            disabled={nodeCount === 0 || !canRun}
            data-tooltip={!canRun && nodeCount > 0 ? blockingReason : undefined}
            className={`px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950/20 flex items-center gap-1.5 transition-all ${
              nodeCount === 0 || !canRun
                ? 'opacity-60 grayscale-[35%] cursor-not-allowed shadow-none'
                : 'cursor-pointer hover:from-emerald-500 hover:to-emerald-400 hover:scale-105 active:scale-95'
            }`}
          >
            <span className="material-symbols-outlined text-base">play_arrow</span>
            <span>{t('workflow.toolbar.run')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="cursor-pointer px-4 py-1.5 rounded-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white text-xs font-bold shadow-sm shadow-red-950/20 flex items-center gap-1.5 transition-all animate-pulse"
          >
            <span className="material-symbols-outlined text-base">stop</span>
            <span>{t('workflow.toolbar.stop')}</span>
          </button>
        )}
      </div>

      {/* Right: Console HUD, Options Menu (Save/Export/Import/Clear), Toggle Inspector */}
      <div className="flex items-center gap-1.5">
        {/* Nhật ký Console Toggle */}
        <button
          type="button"
          onClick={onToggleConsole}
          className={`cursor-pointer px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
            isConsoleOpen
              ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
              : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface'
          }`}
          data-tooltip={t('workflow.toolbar.logsToggle')}
        >
          <span className="material-symbols-outlined text-[15px] text-primary">terminal</span>
          <span>{t('workflow.toolbar.logsLabel')} {logCount > 0 ? `(${logCount})` : ''}</span>
        </button>

        {/* Unified Options / Actions Dropdown Menu */}
        <div className="relative">
          <button
            ref={actionsBtnRef}
            type="button"
            onClick={() => setIsActionsOpen((prev) => !prev)}
            aria-expanded={isActionsOpen}
            aria-haspopup="true"
            data-tooltip={t('workflow.toolbar.actionsTooltip', 'Tùy chọn quy trình (Lưu, Xuất, Nhập, Xóa)')}
            className={`cursor-pointer px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs ${
              isActionsOpen
                ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
                : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] text-primary">tune</span>
            <span>{t('workflow.toolbar.actions', 'Tùy chọn')}</span>
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">expand_more</span>
          </button>

          {isActionsOpen && typeof document !== 'undefined' && createPortal(
            <div
              ref={actionsMenuRef}
              style={menuStyle}
              role="menu"
              className="z-[9999] min-w-[200px] rounded-2xl border border-outline-variant/30 bg-surface-container-high/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col space-y-0.5"
            >
              {/* Lưu */}
              <button
                type="button"
                role="menuitem"
                onClick={() => handleAction(onSave)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-primary shrink-0">save</span>
                <span className="flex-1 font-semibold">{t('workflow.toolbar.save')}</span>
              </button>

              {/* Xuất file JSON */}
              <button
                type="button"
                role="menuitem"
                onClick={() => handleAction(onExportJson)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-primary shrink-0">file_upload</span>
                <span className="flex-1">{t('workflow.toolbar.exportJson')}</span>
              </button>

              {/* Nhập file JSON */}
              <button
                type="button"
                role="menuitem"
                onClick={() => handleAction(() => fileInputRef.current?.click())}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-primary shrink-0">file_download</span>
                <span className="flex-1">{t('workflow.toolbar.importJson')}</span>
              </button>

              <div className="my-1 h-px bg-outline-variant/20" />

              {/* Xóa trắng bảng vẽ */}
              <button
                type="button"
                role="menuitem"
                onClick={() => handleAction(onClear)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-error hover:bg-error/10 transition-colors cursor-pointer text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-error shrink-0">delete_sweep</span>
                <span className="flex-1">{t('workflow.toolbar.clearCanvas')}</span>
              </button>
            </div>,
            document.body
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        {onToggleRightSidebar && (
          <>
            <div className="w-px h-4 bg-outline-variant/30 mx-0.5" />
            <button
              type="button"
              onClick={onToggleRightSidebar}
              className={`cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                showRightSidebar
                  ? 'text-primary bg-primary/10 hover:bg-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
              data-tooltip={inspectorTooltip}
              aria-label={inspectorTooltip}
            >
              <span className="material-symbols-outlined text-[17px]">
                {showRightSidebar ? 'dock_to_right' : 'view_sidebar'}
              </span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
