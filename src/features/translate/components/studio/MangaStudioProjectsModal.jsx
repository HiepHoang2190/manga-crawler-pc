import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';

/**
 * Modal quản lý và chuyển đổi dự án đang làm việc trong Manga Studio
 */
export function MangaStudioProjectsModal({
  isOpen,
  onClose,
  projectsList = [],
  currentProject = null,
  pagesCount = 0,
  onCreateProject,
  onSwitchProject,
  onRenameProject,
  onDeleteProject,
}) {
  const { t } = useI18n();
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectNameInput, setNewProjectNameInput] = useState('');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleClose = () => {
    onClose?.();
    setIsCreatingProject(false);
    setEditingProjectId(null);
    setProjectToDelete(null);
  };

  const handleCreate = () => {
    if (onCreateProject) {
      onCreateProject(newProjectNameInput);
    }
    setIsCreatingProject(false);
    setNewProjectNameInput('');
  };

  const handleRename = (id, name) => {
    if (onRenameProject) {
      onRenameProject(id, name);
    }
    setEditingProjectId(null);
  };

  const handleDelete = (id) => {
    if (onDeleteProject) {
      onDeleteProject(id);
    }
    setProjectToDelete(null);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 sm:p-6 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="max-w-2xl w-full max-h-[85vh] rounded-3xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-6 flex flex-col text-on-surface overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20 shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-2xl">folder_open</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-on-surface">{t('translate.studio.projectsTitle')}</h3>
              <p className="text-xs text-on-surface-variant truncate">
                {t('translate.studio.projectsDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isCreatingProject && (
              <button
                type="button"
                onClick={() => {
                  setIsCreatingProject(true);
                  setNewProjectNameInput(`Project ${(projectsList?.length || 0) + 1}`);
                }}
                className="h-8 px-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>{t('translate.studio.projectNew')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Inline Form: Tạo Dự Án Mới */}
        {isCreatingProject && (
          <div className="mt-4 p-4 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col gap-3 shrink-0 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                {t('translate.studio.projectNewTitle')}
              </span>
              <span className="text-[11px] text-on-surface-variant">
                {t('translate.studio.projectAutoSaveNotice', { count: pagesCount })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newProjectNameInput}
                onChange={(e) => setNewProjectNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setIsCreatingProject(false);
                }}
                autoFocus
                placeholder={t('translate.studio.projectPlaceholder')}
                className="flex-1 px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold cursor-pointer transition-all shadow-xs"
              >
                {t('translate.studio.projectCreateOpen')}
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingProject(false)}
                className="px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Project List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-2.5 min-h-[220px]">
          {projectsList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/60">
              <span className="material-symbols-outlined text-4xl mb-2">folder_off</span>
              <p className="text-xs">{t('translate.studio.projectEmptyList')}</p>
            </div>
          ) : (
            projectsList.map((proj) => {
              const isActive = proj.id === currentProject?.id;
              const isEditing = editingProjectId === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => !isActive && !isEditing && onSwitchProject?.(proj.id)}
                  className={`group p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${isActive
                    ? 'border-primary/50 bg-primary/5 shadow-xs'
                    : 'border-outline-variant/25 bg-surface-container hover:bg-surface-container-high hover:border-outline-variant/50 cursor-pointer'
                    }`}
                >
                  {/* Left: Thumbnail & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Cover Thumbnail */}
                    <div className="w-12 h-14 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                      {proj.coverThumb ? (
                        <img src={proj.coverThumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50">
                          auto_stories
                        </span>
                      )}
                    </div>

                    {/* Title & Metadata */}
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingProjectName}
                            onChange={(e) => setEditingProjectName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(proj.id, editingProjectName);
                              if (e.key === 'Escape') setEditingProjectId(null);
                            }}
                            autoFocus
                            className="px-2 py-1 rounded-lg border border-primary bg-surface-container-lowest text-xs text-on-surface focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRename(proj.id, editingProjectName)}
                            className="w-6 h-6 rounded-lg bg-primary text-on-primary flex items-center justify-center text-xs cursor-pointer"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProjectId(null)}
                            className="w-6 h-6 rounded-lg bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-xs text-on-surface truncate">{proj.name}</h4>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProjectId(proj.id);
                              setEditingProjectName(proj.name);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-opacity p-0.5 cursor-pointer"
                            data-tooltip={t('translate.studio.projectRename')}
                          >
                            <span className="material-symbols-outlined text-[13px]">edit</span>
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant flex-wrap">
                        <span className="font-medium bg-surface-container-lowest px-2 py-0.5 rounded-md border border-outline-variant/15">
                          {t('translate.studio.pagesCount', { count: proj.pageCount || 0 })}
                        </span>
                        <span>•</span>
                        <span className="truncate">
                          {t('translate.studio.projectUpdated')} {proj.updatedAt ? new Date(proj.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : t('translate.studio.projectJustCreated')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isActive ? (
                      <span className="px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[11px] font-bold flex items-center gap-1 select-none">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        {t('translate.studio.projectOpening')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSwitchProject?.(proj.id)}
                        className="px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary hover:text-on-primary text-primary text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[14px]">folder_open</span>
                        {t('translate.studio.projectOpen')}
                      </button>
                    )}

                    {/* Nút xóa dự án (nếu còn > 1 dự án) */}
                    {projectsList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setProjectToDelete(proj)}
                        className="w-8 h-8 rounded-xl border border-transparent hover:border-error/30 hover:bg-error/10 text-on-surface-variant/50 hover:text-error flex items-center justify-center transition-all cursor-pointer"
                        data-tooltip={t('translate.studio.projectDelete')}
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

        {/* Modal Xác nhận xóa dự án */}
        {projectToDelete && (
          <div className="p-3.5 mt-2 rounded-2xl border border-error/30 bg-error/5 flex items-center justify-between gap-3 animate-fadeIn shrink-0">
            <div className="flex items-center gap-2 text-xs text-error">
              <span className="material-symbols-outlined text-[18px]">warning</span>
              <span>{t('translate.studio.projectDeleteConfirm', { name: projectToDelete.name })}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-3 py-1 rounded-xl border border-outline-variant/30 bg-surface-container text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(projectToDelete.id)}
                className="px-3 py-1 rounded-xl bg-error hover:brightness-110 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                {t('translate.studio.projectDeleteBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

