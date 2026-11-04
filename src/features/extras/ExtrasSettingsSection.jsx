import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useExtrasStatus } from './useExtrasStatus';
import ExtrasInstallModal from './ExtrasInstallModal';
import { useI18n } from '../../context/I18nContext';

export default function ExtrasSettingsSection() {
  const { t } = useI18n();
  const { status, openFolder, deleteExtras, refreshStatus } = useExtrasStatus();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteExtras();
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-primary text-[22px]">smart_toy</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-on-surface">{t('extras.settings.title')}</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  status.installed
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">
                  {status.installed ? 'check_circle' : 'warning'}
                </span>
                {status.installed
                  ? t('extras.settings.installed', { version: status.version || 'v1.0.0' })
                  : t('extras.settings.notInstalled')}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant/70 mt-1 leading-relaxed">
              {t('extras.settings.desc')}
            </p>
            {status.path && (
              <p className="text-[11px] font-mono text-on-surface-variant/50 mt-1 truncate">
                {t('extras.settings.path', { path: status.path })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
          {status.installed && (
            <>
              <button
                type="button"
                onClick={openFolder}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/30 hover:bg-surface-container-highest text-xs font-medium text-on-surface transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">folder_open</span>
                {t('extras.settings.openFolder')}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 rounded-lg border border-error/30 hover:bg-error/10 text-xs font-medium text-error transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                {t('extras.settings.delete')}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-on-primary text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {status.installed ? 'refresh' : 'cloud_download'}
            </span>
            {status.installed ? t('extras.settings.reinstall') : t('extras.settings.downloadNow')}
          </button>
        </div>
      </div>

      <ExtrasInstallModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          refreshStatus();
        }}
      />

      {/* Confirmation Modal Xóa gói tài nguyên */}
      {showDeleteConfirm && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150">
            <div className="relative max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-high shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-error text-[24px]">delete_forever</span>
                </div>
                <h3 className="text-base font-bold text-on-surface">
                  {t('extras.settings.deleteConfirmTitle')}
                </h3>
              </div>

              <p className="text-xs text-on-surface-variant leading-relaxed">
                {t('extras.settings.deleteConfirmDesc')}
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('extras.settings.deleteCancelBtn')}
                </button>

                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-on-error text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {deleting ? (
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  )}
                  {t('extras.settings.deleteConfirmBtn')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
