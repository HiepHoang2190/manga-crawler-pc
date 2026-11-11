import { useI18n } from '../../../context/I18nContext';

export default function SaveDirErrorModal({ open, error, path, onClose, onSelectNewDir }) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-dir-error-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface-container-high shadow-2xl p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 text-3xl shrink-0">
            folder_off
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="save-dir-error-title" className="text-lg font-bold text-on-surface">
              {t('saveDirError.modalTitle')}
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {error || t('saveDirError.modalBody')}
            </p>
          </div>
        </div>

        {path ? (
          <div className="rounded-xl border border-outline-variant/15 bg-surface-container-highest/60 p-3 text-xs font-mono text-on-surface break-all select-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60 shrink-0">
              folder
            </span>
            <span className="flex-1 min-w-0">{path}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            {t('saveDirError.close')}
          </button>
          <button
            type="button"
            onClick={onSelectNewDir}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary shadow-md hover:brightness-110 transition-[filter] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">folder_open</span>
            <span>{t('saveDirError.selectFolder')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
