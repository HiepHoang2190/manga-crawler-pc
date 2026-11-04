import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExtrasStatus } from './useExtrasStatus';
import { useI18n } from '../../context/I18nContext';

/**
 * Modal kích hoạt và tải Gói Tài Nguyên AI (Upscale & Translation)
 * Tiêu chí: Zero-friction UX (1-click tải tự động hoặc nạp zip thủ công)
 */
export default function ExtrasInstallModal({ isOpen, onClose, title }) {
  const { t } = useI18n();
  const modalTitle = title || t('extras.modal.title');

  const {
    status,
    isDownloading,
    progress,
    error,
    startDownload,
    selectAndInstallZip,
    cancelDownload,
    refreshStatus,
  } = useExtrasStatus();

  const [completed, setCompleted] = useState(false);

  // Xử lý phím Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDownloading) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDownloading, onClose]);

  // Tự động đóng sau khi hoàn tất thành công
  useEffect(() => {
    if (progress?.phase === 'ready' || (status.installed && !isDownloading && completed)) {
      setCompleted(true);
      const timer = setTimeout(() => {
        onClose?.();
        setCompleted(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [progress?.phase, status.installed, isDownloading, completed, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const percent = progress?.percent || 0;
  const speed = progress?.speed || '';
  const detail = progress?.detail || t('extras.modal.preparing');
  const receivedMB = progress?.receivedBytes ? (progress.receivedBytes / 1024 / 1024).toFixed(1) : 0;
  const totalMB = progress?.totalBytes ? (progress.totalBytes / 1024 / 1024).toFixed(1) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150">
      <div className="relative max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-high shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
        {/* Nút đóng góc trên phải */}
        {!isDownloading && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
            aria-label={t('extras.modal.close')}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}

        {/* Header với Icon */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[28px]">
              {completed ? 'check_circle' : 'smart_toy'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-on-surface truncate">{modalTitle}</h3>
            {(completed || isDownloading) && (
              <p className="text-xs text-on-surface-variant/70 mt-0.5">
                {completed
                  ? t('extras.modal.activatedSuccess')
                  : t('extras.modal.installingProgress')}
              </p>
            )}
          </div>
        </div>

        {/* Nội dung giải thích (khi chưa tải) */}
        {!isDownloading && !completed && (
          <div className="space-y-3">
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 p-3.5 text-xs text-on-surface-variant leading-relaxed">
              {t('extras.modal.descIntro')}{' '}
              <strong className="text-on-surface">Upscale NCNN (RealESRGAN, Waifu2x)</strong> {t('extras.modal.and')}{' '}
              <strong className="text-on-surface">ONNX Runtime</strong> {t('extras.modal.descMiddle')}{' '}
              <span className="text-primary font-medium">{t('extras.modal.persistentStorage')}</span>
              {t('extras.modal.descEnd')}
            </div>

            {error && (
              <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Trạng thái tiến trình tải & giải nén */}
        {isDownloading && (
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between text-xs font-medium text-on-surface">
              <span className="flex items-center gap-1.5 text-primary">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                {detail}
              </span>
              <span className="font-mono text-primary font-bold">{percent}%</span>
            </div>

            {/* Track & Bar */}
            <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Thông số chi tiết */}
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant/70 font-mono">
              <span>
                {totalMB > 0
                  ? t('extras.modal.downloadedOf', { received: receivedMB, total: totalMB })
                  : t('extras.modal.downloaded', { received: receivedMB })}
              </span>
              {speed && <span>{speed}</span>}
            </div>
          </div>
        )}

        {/* Trạng thái hoàn tất */}
        {completed && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center space-y-1">
            <span className="material-symbols-outlined text-emerald-400 text-[32px]">task_alt</span>
            <p className="text-sm font-bold text-emerald-400">{t('extras.modal.completedTitle')}</p>
            <p className="text-xs text-on-surface-variant/70">{t('extras.modal.completedSub')}</p>
          </div>
        )}

        {/* Cụm nút hành động */}
        {!completed && (
          <div className="space-y-2.5 pt-1">
            {!isDownloading ? (
              <>
                <button
                  type="button"
                  onClick={() => startDownload()}
                  className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.98] text-on-primary font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">cloud_download</span>
                  {t('extras.modal.autoDownload')}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={selectAndInstallZip}
                    className="text-xs text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                    {t('extras.modal.selectZip')}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors cursor-pointer"
                  >
                    {t('extras.modal.later')}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={cancelDownload}
                className="w-full py-2.5 px-4 rounded-xl border border-error/30 hover:bg-error/10 text-error font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                {t('extras.modal.cancel')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
