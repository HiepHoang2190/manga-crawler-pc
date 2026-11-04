// src/features/tools-studio/image-pipeline/TemplateToolbar.jsx
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { SearchableSelect } from '../../../shared';

export default function TemplateToolbar({
  templates,
  activeId,
  dirty,
  onSelect,
  onSave,
  onSaveAs,
  onDelete,
  onImport,
  onExport,
  disabled = false,
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const moreBtnRef = useRef(null);
  const menuRef = useRef(null);

  const active = templates.find((tpl) => tpl.id === activeId);
  const labelOf = (tpl) => (tpl.nameKey ? t(tpl.nameKey) : tpl.name);
  const options = templates.map((tpl) => ({
    value: tpl.id,
    label: tpl.id === activeId && dirty ? `${labelOf(tpl)} ${t('imagePipeline.template.unsaved')}` : labelOf(tpl),
    icon: tpl.system ? 'auto_awesome' : 'bookmark',
  }));

  // Cập nhật vị trí menu khi mở
  useLayoutEffect(() => {
    if (!menuOpen || !moreBtnRef.current) return;
    const rect = moreBtnRef.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const top = rect.bottom + 6;
    setMenuStyle({
      position: 'fixed',
      top: `${top}px`,
      right: `${right}px`,
    });
  }, [menuOpen]);

  // Đóng menu khi click ra ngoài hoặc nhấn phím Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !moreBtnRef.current?.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        moreBtnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleAction = (actionFn) => {
    setMenuOpen(false);
    if (typeof actionFn === 'function') actionFn();
  };

  return (
    <div className="flex items-center gap-1.5">
      <SearchableSelect
        value={activeId}
        onChange={onSelect}
        options={options}
        disabled={disabled}
        size="sm"
        showPlaceholderOption={false}
        placeholder={t('imagePipeline.template.select')}
        className="min-w-[11.5rem]"
      />

      <div className="flex h-8 items-center rounded-lg border border-outline-variant/25 bg-surface-container-highest box-border overflow-hidden">
        {/* Nút Lưu nhanh - nổi bật khi có thay đổi chưa lưu (dirty) */}
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          data-tooltip={dirty ? `${t('imagePipeline.template.save')} ${t('imagePipeline.template.unsaved')}` : t('imagePipeline.template.save')}
          aria-label={t('imagePipeline.template.save')}
          className={`relative flex h-full w-8 items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
            dirty
              ? 'bg-primary/15 text-primary hover:bg-primary/25'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">save</span>
          {dirty && (
            <span
              className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-surface animate-pulse"
              aria-hidden="true"
            />
          )}
        </button>

        <div className="h-4 w-px bg-outline-variant/25 shrink-0" />

        {/* Nút Thao tác thêm (More menu) */}
        <button
          ref={moreBtnRef}
          type="button"
          disabled={disabled}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={t('imagePipeline.template.actions')}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          className={`flex h-full w-8 items-center justify-center text-on-surface-variant transition-colors cursor-pointer hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40 ${
            menuOpen ? 'bg-surface-container-high text-primary' : ''
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
      </div>

      {/* Menu thả xuống qua Portal */}
      {menuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            role="menu"
            className="z-[9999] min-w-[210px] rounded-xl border border-outline-variant/20 bg-surface-container-high/95 p-1 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col space-y-0.5"
          >
            {/* Lưu thành template mới */}
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onSaveAs)}
              data-tooltip={t('imagePipeline.template.saveAs')}
              aria-label={t('imagePipeline.template.saveAs')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer text-left"
            >
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0">save_as</span>
              <span className="truncate flex-1">{t('imagePipeline.template.saveAs')}</span>
            </button>

            {/* Xoá template (nếu là template tùy chỉnh) */}
            {active && !active.system && (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleAction(onDelete)}
                data-tooltip={t('imagePipeline.template.delete')}
                aria-label={t('imagePipeline.template.delete')}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-error hover:bg-error/10 transition-colors cursor-pointer text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-error shrink-0">delete</span>
                <span className="truncate flex-1">{t('imagePipeline.template.delete')}</span>
              </button>
            )}

            <div className="my-1 h-px bg-outline-variant/15" />

            {/* Nhập template từ JSON */}
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onImport)}
              data-tooltip={t('imagePipeline.template.import')}
              aria-label={t('imagePipeline.template.import')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer text-left"
            >
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">file_open</span>
              <span className="truncate flex-1">{t('imagePipeline.template.import')}</span>
            </button>

            {/* Xuất template ra JSON */}
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onExport)}
              data-tooltip={t('imagePipeline.template.export')}
              aria-label={t('imagePipeline.template.export')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer text-left"
            >
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">ios_share</span>
              <span className="truncate flex-1">{t('imagePipeline.template.export')}</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
