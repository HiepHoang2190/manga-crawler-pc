import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';

/**
 * Unified confirmation dialog modal replacing native browser confirm dialogs.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'primary',
  icon = 'help',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useI18n();
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const rafId = typeof window !== 'undefined'
      ? window.requestAnimationFrame(() => cancelBtnRef.current?.focus?.())
      : null;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, busy, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  const isDanger = variant === 'danger';
  const iconTone = isDanger ? 'text-error' : 'text-amber-500';
  const confirmButtonCls = isDanger
    ? 'px-4 py-2 rounded-xl text-sm font-semibold bg-error text-on-error shadow-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 cursor-pointer'
    : 'px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 cursor-pointer';

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onCancel?.();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface-container-high shadow-2xl p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <span className={`material-symbols-outlined text-3xl shrink-0 ${iconTone}`}>
            {icon}
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 id="confirm-modal-title" className="text-base font-bold text-on-surface leading-snug">
              {title || t('confirmModal.confirm')}
            </h2>
            {message ? (
              <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                {message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            ref={cancelBtnRef}
            type="button"
            disabled={busy}
            onClick={() => onCancel?.()}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-outline-variant/25 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel || t('confirmModal.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm?.()}
            className={confirmButtonCls}
          >
            {confirmLabel || t('confirmModal.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
