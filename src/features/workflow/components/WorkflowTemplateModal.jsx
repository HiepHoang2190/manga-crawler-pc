import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { DEFAULT_TEMPLATES } from '../templates/defaultTemplates';
import { loadSavedWorkflows, deleteWorkflow } from '../utils/workflowStorage';
import { NODE_DEFINITIONS } from '../engine/nodeDefinitions';
import { getTopologicallyOrderedNodes } from '../engine/workflowGraph';

export default function WorkflowTemplateModal({ isOpen, onClose, onSelectTemplate }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('builtin'); // 'builtin' | 'saved'
  const [savedList, setSavedList] = useState(() => loadSavedWorkflows());

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleDeleteSaved = (id, e) => {
    e.stopPropagation();
    deleteWorkflow(id);
    setSavedList(loadSavedWorkflows());
  };

  const templatesToShow = tab === 'builtin' ? DEFAULT_TEMPLATES : savedList;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest text-on-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">{t('workflow.templates.title')}</h3>
              <p className="text-[11px] text-on-surface-variant">
                {t('workflow.templates.subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('workflow.templates.close')}
            className="cursor-pointer w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-5 pt-3 pb-2 flex gap-2 border-b border-outline-variant/20 bg-surface-container-low/40">
          <button
            type="button"
            onClick={() => setTab('builtin')}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === 'builtin'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            {t('workflow.templates.builtinTab', { count: DEFAULT_TEMPLATES.length })}
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedList(loadSavedWorkflows());
              setTab('saved');
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === 'saved'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            {t('workflow.templates.savedTab', { count: savedList.length })}
          </button>
        </div>

        {/* Templates List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {templatesToShow.length === 0 && (
            <div className="py-12 text-center text-xs text-on-surface-variant/70">
              {t('workflow.templates.emptySaved')}
            </div>
          )}

          {templatesToShow.map((tpl) => {
            const isBuiltinMatch = tpl.id.startsWith('template_') && (!tpl.custom || tpl.name === DEFAULT_TEMPLATES.find((d) => d.id === tpl.id)?.name);
            const displayName = tab === 'builtin' || isBuiltinMatch
              ? t(`workflow.templates.builtin.${tpl.id}.name`, tpl.name)
              : tpl.name;
            const displayDesc = tab === 'builtin' || isBuiltinMatch
              ? t(`workflow.templates.builtin.${tpl.id}.desc`, tpl.description || t('workflow.templates.defaultDesc'))
              : (tpl.description || t('workflow.templates.defaultDesc'));

            return (
              <div
                key={tpl.id}
                onClick={() => {
                  onSelectTemplate({
                    ...tpl,
                    name: displayName,
                    description: displayDesc,
                  });
                  onClose();
                }}
                className="p-4 rounded-xl bg-surface-container/60 hover:bg-surface-container-high border border-outline-variant/20 hover:border-primary/40 transition-all cursor-pointer group shadow-2xs flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors">
                      {displayName}
                    </h4>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      {displayDesc}
                    </p>
                  </div>

                  {tab === 'saved' && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSaved(tpl.id, e)}
                      data-tooltip={t('workflow.templates.deleteTooltip')}
                      aria-label={t('workflow.templates.deleteTooltip')}
                      className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-on-surface-variant/70 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  )}
                </div>

                {/* Node sequence preview chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {getTopologicallyOrderedNodes(tpl.nodes, tpl.edges).map((node, idx, arr) => {
                    const def = NODE_DEFINITIONS[node.type];
                    return (
                      <React.Fragment key={node.id}>
                        <span className="px-2 py-0.5 rounded-md bg-surface-container-highest/80 text-[10px] text-on-surface-variant font-medium flex items-center gap-1 border border-outline-variant/20">
                          <span className="material-symbols-outlined text-[12px] text-primary">
                            {def?.icon || 'extension'}
                          </span>
                          <span>{t(`workflow.nodeDef.${node.type}.title`, def?.title || node.type)}</span>
                        </span>
                        {idx < arr.length - 1 && (
                          <span className="text-on-surface-variant/40 text-[10px]">➔</span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-4 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors shadow-2xs"
          >
            {t('workflow.templates.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
