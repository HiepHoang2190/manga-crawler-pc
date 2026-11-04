// src/features/tools-studio/image-pipeline/SaveTemplateDialog.jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';

export default function SaveTemplateDialog({ initialName = '', onConfirm, onCancel }) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed.slice(0, 80));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-[22rem] rounded-2xl border border-outline-variant/20 bg-surface-container-high p-4 shadow-2xl space-y-3">
        <p className="text-sm font-semibold text-on-surface">{t('imagePipeline.template.saveAs')}</p>
        <label className="block space-y-1 text-xs text-on-surface-variant">
          <span>{t('imagePipeline.template.nameLabel')}</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onCancel();
            }}
            className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg border border-outline-variant/30 px-3 text-xs font-medium text-on-surface-variant hover:bg-surface-container-highest cursor-pointer"
          >
            {t('imagePipeline.template.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {t('imagePipeline.template.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
