import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { SearchableSelect } from '../../../shared';
import { DEFAULT_TEMPLATES } from '../templates/defaultTemplates.mjs';

export default function WorkflowManagerModal({
  isOpen,
  onClose,
  workflows = [],
  currentWfId,
  onSelectWorkflow,
  onCreateWorkflow,
  onRenameWorkflow,
  onDuplicateWorkflow,
  onDeleteWorkflow,
}) {
  const { t } = useI18n();
  const [isCreating, setIsCreating] = useState(false);
  const [newWfName, setNewWfName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('empty');
  const [editingWfId, setEditingWfId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [workflowToDelete, setWorkflowToDelete] = useState(null);

  const inputRef = useRef(null);

  const templateOptions = useMemo(() => [
    {
      value: 'empty',
      label: `📄 ${t('workflow.manager.templateEmpty')}`,
      materialIcon: 'note_add',
    },
    ...DEFAULT_TEMPLATES.map((tpl) => ({
      value: tpl.id,
      label: `⚡ ${t(`workflow.templates.builtin.${tpl.id}.name`, tpl.name)} (${t('workflow.manager.blocksCount', { count: tpl.nodes?.length || 0 })})`,
      materialIcon: 'bolt',
    })),
  ], [t]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingWfId) {
          setEditingWfId(null);
        } else if (isCreating) {
          setIsCreating(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, editingWfId, isCreating]);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleStartCreate = () => {
    setIsCreating(true);
    setNewWfName(`${t('workflow.studio.defaultWorkflowName')} ${(workflows?.length || 0) + 1}`);
    setSelectedTemplateId('empty');
    setWorkflowToDelete(null);
  };

  const handleConfirmCreate = () => {
    if (!newWfName.trim()) return;
    onCreateWorkflow({
      name: newWfName.trim(),
      templateId: selectedTemplateId === 'empty' ? null : selectedTemplateId,
    });
    setIsCreating(false);
    onClose();
  };

  const handleStartRename = (wf) => {
    setEditingWfId(wf.id);
    setEditingName(wf.name);
  };

  const handleConfirmRename = (wfId) => {
    if (editingName.trim()) {
      onRenameWorkflow(wfId, editingName.trim());
    }
    setEditingWfId(null);
  };

  const handleConfirmDelete = (wfId) => {
    onDeleteWorkflow(wfId);
    setWorkflowToDelete(null);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface-container-lowest text-on-surface rounded-3xl border border-outline-variant/30 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-outline-variant/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">account_tree</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-on-surface">{t('workflow.manager.title')}</h3>
              <p className="text-xs text-on-surface-variant truncate">
                {t('workflow.manager.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('workflow.manager.close')}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Inline Form: Tạo Workflow Mới */}
        {isCreating && (
          <div className="m-4 p-4 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col gap-3 shrink-0 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                {t('workflow.manager.formTitle')}
              </span>
              <span className="text-[11px] text-on-surface-variant">
                {t('workflow.manager.workflowCount', { count: workflows.length })}
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[11px] font-semibold text-on-surface-variant mb-1 block">
                  {t('workflow.manager.nameLabel')}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={newWfName}
                  onChange={(e) => setNewWfName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder={t('workflow.manager.namePlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-on-surface-variant mb-1 block">
                  {t('workflow.manager.initLabel')}
                </label>
                <SearchableSelect
                  value={selectedTemplateId}
                  onChange={setSelectedTemplateId}
                  options={templateOptions}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('workflow.manager.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmCreate}
                disabled={!newWfName.trim()}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-40"
              >
                {t('workflow.manager.createBtn')}
              </button>
            </div>
          </div>
        )}

        {/* Workflow List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[240px]">
          {workflows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/60">
              <span className="material-symbols-outlined text-4xl mb-2">folder_off</span>
              <p className="text-xs">{t('workflow.manager.empty')}</p>
            </div>
          ) : (
            workflows.map((wf) => {
              const isActive = wf.id === currentWfId;
              const isEditing = editingWfId === wf.id;
              const nodeCount = wf.nodes?.length || 0;
              const edgeCount = wf.edges?.length || 0;

              return (
                <div
                  key={wf.id}
                  onClick={() => !isActive && !isEditing && onSelectWorkflow(wf.id)}
                  className={`group p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isActive
                      ? 'border-primary/50 bg-primary/5 shadow-xs'
                      : 'border-outline-variant/25 bg-surface-container hover:bg-surface-container-high hover:border-outline-variant/50 cursor-pointer'
                  }`}
                >
                  {/* Left: Icon & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                        isActive
                          ? 'bg-primary/20 text-primary border-primary/40'
                          : 'bg-surface-container-lowest text-on-surface-variant/70 border-outline-variant/20'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">account_tree</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmRename(wf.id);
                              if (e.key === 'Escape') setEditingWfId(null);
                            }}
                            autoFocus
                            className="px-2 py-1 rounded-lg border border-primary bg-surface-container-lowest text-xs text-on-surface focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmRename(wf.id)}
                            className="w-6 h-6 rounded-lg bg-primary text-on-primary flex items-center justify-center text-xs cursor-pointer"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingWfId(null)}
                            className="w-6 h-6 rounded-lg bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-xs text-on-surface truncate">
                            {wf.id?.startsWith('template_') && (!wf.custom || wf.name === DEFAULT_TEMPLATES.find((d) => d.id === wf.id)?.name)
                              ? t(`workflow.templates.builtin.${wf.id}.name`, wf.name)
                              : wf.name}
                          </h4>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRename(wf);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-opacity p-0.5 cursor-pointer"
                            data-tooltip={t('workflow.manager.renameTooltip')}
                            aria-label={t('workflow.manager.renameTooltip')}
                          >
                            <span className="material-symbols-outlined text-[13px]">edit</span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant flex-wrap">
                        <span className="font-medium bg-surface-container-lowest px-2 py-0.5 rounded-md border border-outline-variant/15">
                          {t('workflow.manager.itemStats', { nodes: nodeCount, edges: edgeCount })}
                        </span>
                        <span>•</span>
                        <span className="truncate">
                          {wf.updatedAt
                            ? t('workflow.manager.updated', {
                                time: new Date(wf.updatedAt).toLocaleString(undefined, {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                }),
                              })
                            : t('workflow.manager.justCreated')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isActive ? (
                      <span className="px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold flex items-center gap-1 select-none">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        {t('workflow.manager.active')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectWorkflow(wf.id)}
                        className="px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary hover:text-on-primary text-primary text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[14px]">folder_open</span>
                        {t('workflow.manager.open')}
                      </button>
                    )}

                    {/* Duplicate button */}
                    <button
                      type="button"
                      onClick={() => onDuplicateWorkflow(wf.id)}
                      className="w-8 h-8 rounded-xl border border-transparent hover:border-outline-variant/30 hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-all cursor-pointer"
                      data-tooltip={t('workflow.manager.duplicateTooltip')}
                      aria-label={t('workflow.manager.duplicateTooltip')}
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>

                    {/* Delete button (if > 1 workflow) */}
                    {workflows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setWorkflowToDelete(wf)}
                        className="w-8 h-8 rounded-xl border border-transparent hover:border-error/30 hover:bg-error/10 text-on-surface-variant/60 hover:text-error flex items-center justify-center transition-all cursor-pointer"
                        data-tooltip={t('workflow.manager.deleteTooltip')}
                        aria-label={t('workflow.manager.deleteTooltip')}
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Xác nhận xóa Workflow */}
        {workflowToDelete && (
          <div className="p-3.5 m-4 mt-0 rounded-2xl border border-error/30 bg-error/5 flex items-center justify-between gap-3 animate-in fade-in shrink-0">
            <div className="flex items-center gap-2 text-xs text-error min-w-0">
              <span className="material-symbols-outlined text-[18px] shrink-0">warning</span>
              <span className="truncate">
                {t('workflow.manager.confirmDelete', { name: workflowToDelete.name })}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setWorkflowToDelete(null)}
                className="px-3 py-1 rounded-xl border border-outline-variant/30 bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('workflow.manager.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(workflowToDelete.id)}
                className="px-3 py-1 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                {t('workflow.manager.confirmDeleteBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
