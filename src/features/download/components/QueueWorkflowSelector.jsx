import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { useDownload } from '../DownloadProvider';
import { loadSavedWorkflows } from '../../workflow/utils/workflowStorage.mjs';
import { DEFAULT_TEMPLATES } from '../../workflow/templates/defaultTemplates.mjs';
import { isWorkflowCompatibleWithQueue } from '../queueWorkflowAdapter.js';

function useDownloadSafe() {
  try {
    return useDownload();
  } catch {
    return {};
  }
}

/**
 * QueueWorkflowSelector component.
 * Provides a dropdown for selecting default post-download workflow in the queue toolbar,
 * or assigning a specific workflow to an individual manga group in the table rows.
 */
export default function QueueWorkflowSelector({
  value: propValue,
  onChange: propOnChange,
  onApplyToAll: propOnApplyToAll,
  groupId,
  compact = false,
  disabled = false,
  className = '',
}) {
  const { t } = useI18n();
  const downloadCtx = useDownloadSafe();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Load templates and saved workflows
  const templates = useMemo(() => {
    return Array.isArray(DEFAULT_TEMPLATES) ? DEFAULT_TEMPLATES : [];
  }, []);

  const savedWorkflows = useMemo(() => {
    if (!isOpen && !propValue && !downloadCtx.defaultQueueWorkflowId) return [];
    try {
      return loadSavedWorkflows() || [];
    } catch {
      return [];
    }
  }, [isOpen, propValue, downloadCtx.defaultQueueWorkflowId]);

  const customWorkflows = useMemo(() => {
    const templateIds = new Set(templates.map((tpl) => tpl.id));
    return savedWorkflows
      .filter((wf) => wf && wf.id && !templateIds.has(wf.id))
      .filter((wf) => isWorkflowCompatibleWithQueue(wf));
  }, [savedWorkflows, templates]);

  // Value resolution
  const isRowMode = compact || Boolean(groupId);
  const [placement, setPlacement] = useState('right');

  // Dynamically compute alignment (right-0 vs left-0) to prevent clipping at window edges
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const updatePlacement = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownWidth = isRowMode ? 288 : 320;
      const spaceRight = window.innerWidth - rect.left;
      const spaceLeft = rect.right;

      if (spaceRight < dropdownWidth + 16 && spaceLeft >= dropdownWidth) {
        setPlacement('right');
      } else if (spaceLeft < dropdownWidth + 16 && spaceRight >= dropdownWidth) {
        setPlacement('left');
      } else {
        setPlacement(rect.left + rect.width / 2 > window.innerWidth / 2 ? 'right' : 'left');
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [isOpen, isRowMode]);

  const currentValue = useMemo(() => {
    if (propValue !== undefined) return propValue;
    if (isRowMode) return undefined;
    return downloadCtx.defaultQueueWorkflowId || 'none';
  }, [propValue, isRowMode, downloadCtx.defaultQueueWorkflowId]);

  const handleChange = (newId) => {
    if (isRowMode && groupId) {
      if (propOnChange) {
        propOnChange(newId);
      } else if (downloadCtx.setGroupWorkflow) {
        downloadCtx.setGroupWorkflow(groupId, newId);
      }
    } else {
      // Toolbar mode: cập nhật mặc định VÀ tự động áp dụng cho tất cả truyện đang chờ trong hàng đợi
      if (propOnChange) {
        propOnChange(newId);
      } else if (downloadCtx.setDefaultQueueWorkflowId) {
        downloadCtx.setDefaultQueueWorkflowId(newId);
      }
      if (propOnApplyToAll) {
        propOnApplyToAll(newId);
      } else if (downloadCtx.setAllGroupsWorkflow) {
        downloadCtx.setAllGroupsWorkflow(newId);
      }
    }
    setIsOpen(false);
  };

  // Resolve human-readable name of the active workflow
  const activeLabel = useMemo(() => {
    if (isRowMode && (currentValue === undefined || currentValue === null || currentValue === 'inherit')) {
      return t('queue.workflowInheritDefault') || 'Theo mặc định hàng đợi';
    }
    if (!currentValue || currentValue === 'none') {
      return t('queue.workflowNone') || 'Không chạy quy trình';
    }
    const matchedTpl = templates.find((tpl) => tpl.id === currentValue);
    if (matchedTpl) return matchedTpl.name;
    const matchedCustom = customWorkflows.find((wf) => wf.id === currentValue);
    if (matchedCustom) return matchedCustom.name;
    return currentValue;
  }, [currentValue, isRowMode, templates, customWorkflows, t]);

  // If in row/compact mode
  if (isRowMode) {
    const isCustomized = currentValue !== undefined && currentValue !== null && currentValue !== 'inherit';
    const isNone = currentValue === 'none';

    return (
      <div className={`relative inline-flex items-center ${className}`} ref={containerRef} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`cursor-pointer rounded p-1.5 transition-colors flex items-center justify-center ${
            isCustomized && !isNone
              ? 'text-primary bg-primary/10 hover:bg-primary/20'
              : isNone
                ? 'text-on-surface-variant/50 hover:bg-surface-container-high hover:text-on-surface'
                : 'text-primary hover:bg-surface-container-high'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          data-tooltip={`${t('queue.rowWorkflowTooltip') || 'Quy trình'}: ${activeLabel}`}
          aria-label={`${t('queue.rowWorkflowTooltip') || 'Quy trình'}: ${activeLabel}`}
        >
          <span className="material-symbols-outlined text-[18px] leading-none">schema</span>
        </button>

        {isOpen && (
          <div
            className={`absolute ${placement === 'left' ? 'left-0' : 'right-0'} top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-outline-variant/20 bg-surface shadow-2xl p-2 flex flex-col gap-1 text-left`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5 border-b border-outline-variant/10 pb-1.5">
              <span className="material-symbols-outlined text-[14px]">schema</span>
              <span>{t('queue.rowWorkflowTitle') || 'Quy trình cho truyện này'}</span>
            </div>

            <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pt-1">
              {/* Inherit Default */}
              <button
                type="button"
                onClick={() => handleChange(undefined)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                  currentValue === undefined || currentValue === null || currentValue === 'inherit'
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] shrink-0">tune</span>
                <span className="truncate flex-1">{t('queue.workflowInheritDefault') || 'Theo mặc định hàng đợi'}</span>
                {(currentValue === undefined || currentValue === null || currentValue === 'inherit') && (
                  <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
                )}
              </button>

              {/* None */}
              <button
                type="button"
                onClick={() => handleChange('none')}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                  currentValue === 'none'
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] shrink-0">block</span>
                <span className="truncate flex-1">{t('queue.workflowNone') || 'Không chạy quy trình'}</span>
                {currentValue === 'none' && (
                  <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
                )}
              </button>

              {/* Templates */}
              {templates.length > 0 && (
                <>
                  <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                    {t('queue.workflowTemplatesGroup') || 'Mẫu quy trình có sẵn'}
                  </div>
                  {templates.map((tpl) => {
                    const isSelected = currentValue === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleChange(tpl.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          isSelected
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-on-surface hover:bg-surface-container-high'
                        }`}
                        data-tooltip={tpl.description || tpl.name}
                      >
                        <span className="material-symbols-outlined text-[16px] shrink-0 text-primary">account_tree</span>
                        <span className="truncate flex-1 min-w-0">{tpl.name}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Custom Workflows */}
              {customWorkflows.length > 0 && (
                <>
                  <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                    {t('queue.workflowCustomGroup') || 'Quy trình đã lưu'}
                  </div>
                  {customWorkflows.map((wf) => {
                    const isSelected = currentValue === wf.id;
                    return (
                      <button
                        key={wf.id}
                        type="button"
                        onClick={() => handleChange(wf.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          isSelected
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] shrink-0 text-primary">flowsheet</span>
                        <span className="truncate flex-1 font-medium min-w-0">{wf.name}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Toolbar Mode
  return (
    <div className={`relative inline-flex items-center ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-11 px-3 rounded-xl border border-outline-variant/25 bg-surface-container-highest text-on-surface text-xs font-medium hover:border-outline-variant/50 transition-colors cursor-pointer flex items-center gap-2 shrink-0 select-none disabled:opacity-40 disabled:cursor-not-allowed max-w-[260px]"
        data-tooltip={`${t('queue.workflowSelectorLabel') || 'Quy trình sau tải'}: ${activeLabel}`}
        aria-label={`${t('queue.workflowSelectorLabel') || 'Quy trình sau tải'}: ${activeLabel}`}
      >
        <span className="material-symbols-outlined text-[18px] text-primary leading-none shrink-0">schema</span>
        <span className="truncate font-semibold">{activeLabel}</span>
        <span className="material-symbols-outlined text-[16px] leading-none shrink-0 opacity-70">arrow_drop_down</span>
      </button>

      {isOpen && (
        <div
          className={`absolute ${placement === 'left' ? 'left-0' : 'right-0'} top-full mt-1.5 z-50 w-80 max-w-[calc(100vw-32px)] rounded-xl border border-outline-variant/20 bg-surface shadow-2xl p-2 flex flex-col gap-1 text-left`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5 border-b border-outline-variant/10 pb-1.5">
            <span className="material-symbols-outlined text-[14px]">settings</span>
            <span>{t('queue.workflowSelectorHeader') || 'Quy trình mặc định sau tải'}</span>
          </div>

          <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pt-1">
            {/* None */}
            <button
              type="button"
              onClick={() => handleChange('none')}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                currentValue === 'none'
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px] shrink-0">block</span>
              <span className="truncate flex-1">{t('queue.workflowNone') || 'Không chạy quy trình'}</span>
              {currentValue === 'none' && (
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
              )}
            </button>

            {/* Templates */}
            {templates.length > 0 && (
              <>
                <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                  {t('queue.workflowTemplatesGroup') || 'Mẫu quy trình có sẵn'}
                </div>
                {templates.map((tpl) => {
                  const isSelected = currentValue === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleChange(tpl.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-on-surface hover:bg-surface-container-high'
                      }`}
                      data-tooltip={tpl.description || tpl.name}
                    >
                      <span className="material-symbols-outlined text-[16px] shrink-0 text-primary">account_tree</span>
                      <div className="truncate flex-1 flex flex-col min-w-0">
                        <span className="truncate font-medium">{tpl.name}</span>
                        {tpl.description && (
                          <span className="truncate text-[10px] text-on-surface-variant font-normal opacity-80">
                            {tpl.description}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Custom Workflows */}
            {customWorkflows.length > 0 && (
              <>
                <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                  {t('queue.workflowCustomGroup') || 'Quy trình đã lưu'}
                </div>
                {customWorkflows.map((wf) => {
                  const isSelected = currentValue === wf.id;
                  return (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => handleChange(wf.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px] shrink-0 text-primary">flowsheet</span>
                      <span className="truncate flex-1 font-medium min-w-0">{wf.name}</span>
                      {isSelected && (
                        <span className="material-symbols-outlined text-[16px] text-primary shrink-0">check</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Hint note: Mặc định áp dụng cho tất cả truyện đang chờ tải */}
          <div className="border-t border-outline-variant/10 px-2.5 py-2 mt-1 flex items-center gap-2 text-[11px] text-on-surface-variant/80 bg-surface-container-low/50 rounded-lg select-none">
            <span className="material-symbols-outlined text-[15px] text-primary shrink-0">info</span>
            <span className="leading-tight">
              {t('queue.workflowHeaderHint') || 'Mặc định áp dụng cho tất cả truyện đang chờ tải'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
