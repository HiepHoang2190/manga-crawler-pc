import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';

function getFileName(filePath) {
  if (!filePath) return '';
  const normalized = String(filePath).replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts.slice(-2).join('/');
}

export default function UpscaleCompletionModal({
  open = false,
  data = null,
  onClose,
  onOpenFolder,
  onClearAndReset,
  onKeepOnlyFailed,
  onForceClearAll,
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !data || typeof document === 'undefined') {
    return null;
  }

  const failedItems = Array.isArray(data.failed) ? data.failed : [];
  const hasErrors = failedItems.length > 0;
  const doneCount = data.done ?? 0;
  const totalCount = data.total ?? (doneCount + failedItems.length);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-2xl">
        {/* Nút X đóng nhanh ở góc trên bên phải */}
        <button
          type="button"
          onClick={onClose}
          data-tooltip={t('upscale.completion.close')}
          aria-label={t('upscale.completion.close')}
          className="absolute top-3.5 right-3.5 flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer z-10"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>

        {/* Header with status icon */}
        <div className="flex flex-col items-center px-6 pt-6 pb-4 text-center">
          <div
            className={`mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl shadow-xs ${
              hasErrors
                ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
            }`}
          >
            <span className="material-symbols-outlined text-[32px]">
              {hasErrors ? 'warning' : 'check_circle'}
            </span>
          </div>
          <h2 className="text-base font-bold text-on-surface tracking-tight">
            {hasErrors
              ? t('upscale.completion.titleWarning')
              : t('upscale.completion.titleSuccess')}
          </h2>
          <p className="mt-1 text-xs text-on-surface-variant max-w-sm leading-relaxed">
            {hasErrors
              ? t('upscale.completion.descWarning', {
                done: doneCount,
                total: totalCount,
                failed: failedItems.length,
              })
              : t('upscale.completion.descSuccess', { count: doneCount })}
          </p>
        </div>

        {/* Stats Summary Grid */}
        <div className="px-6 pb-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-outline-variant/15 bg-surface-container-highest/40 p-3 text-center">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">
                {t('upscale.completion.successCount')}
              </span>
              <p className="text-base font-bold text-emerald-400">
                {doneCount}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">
                {t('upscale.completion.errorCount')}
              </span>
              <p className={`text-base font-bold ${hasErrors ? 'text-error' : 'text-on-surface-variant/50'}`}>
                {failedItems.length}
              </p>
            </div>
          </div>
        </div>

        {/* Error list details when errors exist */}
        {hasErrors && (
          <div className="flex-1 min-h-0 px-6 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-error/90">
              {t('upscale.completion.errorListTitle')}
            </p>
            <ul className="max-h-36 overflow-y-auto custom-scrollbar rounded-xl border border-outline-variant/15 bg-surface-container-highest/60 p-2 space-y-1.5">
              {failedItems.map((item, idx) => (
                <li
                  key={item.path || idx}
                  className="flex items-start gap-2 rounded-lg bg-surface-container-high/60 p-1.5 text-xs"
                >
                  <span className="material-symbols-outlined text-[15px] text-error shrink-0 mt-0.5">
                    error
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-on-surface truncate">
                      {getFileName(item.path)}
                    </p>
                    <p className="text-[10px] text-error/90 truncate leading-tight">
                      {item.error || 'Unknown error'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons Footer — 2 Nút Chia Đều Cân Xứng, Không Cần Nút Đóng */}
        <div className="flex items-center gap-2.5 border-t border-outline-variant/15 bg-surface-container-low/90 px-5 py-3.5">
          {!hasErrors ? (
            <>
              {onClearAndReset && (
                <button
                  type="button"
                  onClick={onClearAndReset}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/25 bg-surface-container-high px-3 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                  <span>{t('upscale.completion.clearAndReset')}</span>
                </button>
              )}
              {onOpenFolder && data.targetDir && (
                <button
                  type="button"
                  onClick={onOpenFolder}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-on-primary shadow-md shadow-primary/25 transition-all hover:opacity-95 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">folder_open</span>
                  <span>{t('upscale.completion.openFolder')}</span>
                </button>
              )}
            </>
          ) : (
            <>
              {onForceClearAll && (
                <button
                  type="button"
                  onClick={onForceClearAll}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-error/25 bg-error/10 px-3.5 text-xs font-semibold text-error hover:bg-error/15 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                  <span>{t('upscale.completion.forceClearAll')}</span>
                </button>
              )}
              {onKeepOnlyFailed && (
                <button
                  type="button"
                  onClick={onKeepOnlyFailed}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-on-primary shadow-md shadow-primary/25 transition-all hover:opacity-95 active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">filter_list</span>
                  <span>{t('upscale.completion.keepOnlyFailed')}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
