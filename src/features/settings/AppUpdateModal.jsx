import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { useSettings } from './SettingsProvider';
import { parseChangelog } from './utils/parseChangelog.mjs';

/**
 * Hộp thoại hiển thị thông tin chi tiết bản cập nhật mới và Changelog.
 * Cung cấp 3 lựa chọn:
 * 1. Cập nhật ngay (tải và cài đặt trực tiếp trong Modal).
 * 2. Để sau (đóng modal, badge vX.Y.Z vẫn giữ trên thanh tiêu đề).
 * 3. Bỏ qua phiên bản này (lưu vào localStorage, ẩn badge cho đến khi có bản mới hơn).
 */
export default function AppUpdateModal() {
  const { t } = useI18n();
  const {
    isUpdateModalOpen,
    closeUpdateModal,
    updateCheckResult,
    appUpdateState,
    appUpdateError,
    appUpdateDownloadProgress,
    appUpdateDownloadedPath,
    skipUpdateVersion,
    startAppDownload,
    startAppInstall,
  } = useSettings();

  const [confirmSkip, setConfirmSkip] = useState(false);

  // Close on Escape key (trừ khi đang cài đặt)
  useEffect(() => {
    if (!isUpdateModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && appUpdateState !== 'installing') {
        if (confirmSkip) {
          setConfirmSkip(false);
        } else {
          closeUpdateModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUpdateModalOpen, appUpdateState, confirmSkip, closeUpdateModal]);

  // Reset confirmSkip khi modal mở/đóng
  useEffect(() => {
    if (!isUpdateModalOpen) {
      setConfirmSkip(false);
    }
  }, [isUpdateModalOpen]);

  const changelogItems = useMemo(() => {
    return parseChangelog(updateCheckResult?.changelog || '');
  }, [updateCheckResult?.changelog]);

  if (!isUpdateModalOpen || typeof document === 'undefined') return null;

  const currentVersion = updateCheckResult?.currentVersion || '—';
  const remoteVersion = updateCheckResult?.remoteVersion || '';
  const releaseDate = updateCheckResult?.releaseDate;
  const isWindows = updateCheckResult?.platform === 'win32';
  const isBusy = appUpdateState === 'downloading' || appUpdateState === 'installing';

  const handleSkipCurrent = () => {
    if (remoteVersion) {
      skipUpdateVersion(remoteVersion);
    }
  };

  const handlePrimaryAction = () => {
    if (appUpdateState === 'downloaded') {
      startAppInstall();
    } else {
      startAppDownload();
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-modal-title"
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (!isBusy) closeUpdateModal();
      }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/95 p-6 shadow-2xl backdrop-blur-xl transition-all select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút đóng góc phải */}
        {!isBusy && (
          <button
            type="button"
            onClick={closeUpdateModal}
            data-tooltip={t('updateModal.remindLater')}
            aria-label={t('updateModal.remindLater')}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant/70 hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">close</span>
          </button>
        )}

        {/* Khung Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25 shadow-md shadow-primary/10">
            <span
              className="material-symbols-outlined text-[26px] leading-none"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}
            >
              rocket_launch
            </span>
          </div>

          <div className="min-w-0 flex-1 pr-6">
            <h2 id="app-update-modal-title" className="text-lg font-bold text-on-surface tracking-tight">
              {t('updateModal.title')}
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
              {t('updateModal.subtitle')}
            </p>

            {/* Version Pills */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant/25 bg-surface-container-high/60 px-3 py-1 font-mono text-xs shadow-2xs">
                <span className="text-on-surface-variant/80 font-medium">v{currentVersion}</span>
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40">arrow_forward</span>
                <span className="flex items-center gap-1.5 font-bold text-primary">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  v{remoteVersion}
                </span>
              </div>

              {releaseDate && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high/50 border border-outline-variant/15 px-2.5 py-1 text-[11px] text-on-surface-variant/80 font-medium">
                  <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                  {releaseDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Khung Tiến Trình Tải / Cài Đặt (Khi Đang Tải hoặc Đã Tải) */}
        {appUpdateState === 'downloading' && (
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-primary">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                {t('updateModal.downloadingTitle')}
              </span>
              <span>
                {appUpdateDownloadProgress?.percent >= 0
                  ? `${appUpdateDownloadProgress.percent}%`
                  : `${((appUpdateDownloadProgress?.downloaded || 0) / 1024 / 1024).toFixed(1)} MB`}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: appUpdateDownloadProgress?.percent >= 0 ? `${appUpdateDownloadProgress.percent}%` : '100%' }}
              />
            </div>
          </div>
        )}

        {appUpdateState === 'downloaded' && (
          <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-500">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {t('updateModal.downloadCompleted')}
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {isWindows ? t('update.windowsNote') : t('update.macNote')}
            </p>
          </div>
        )}

        {appUpdateState === 'error' && (
          <div className="mt-5 rounded-xl border border-error/25 bg-error/10 p-3.5 flex items-start gap-2 text-xs text-error">
            <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
            <div className="flex-1 leading-relaxed">
              <p className="font-semibold">{t('update.errorDownload')}</p>
              <p className="opacity-90">{appUpdateError}</p>
            </div>
          </div>
        )}

        {/* Khung Nội Dung Changelog */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/75 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-primary">auto_awesome</span>
              {t('updateModal.whatsNew')}
            </h3>
            <span className="text-[11px] text-on-surface-variant/60 font-mono">
              {changelogItems.length > 0 ? `${changelogItems.length} mục` : ''}
            </span>
          </div>

          <div className="max-h-60 min-h-[120px] overflow-y-auto rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 p-2 custom-scrollbar">
            {changelogItems.length > 0 ? (
              <div className="space-y-1">
                {changelogItems.map((item) => {
                  let badgeClasses = 'bg-surface-container-high text-on-surface-variant border-outline-variant/30';
                  let icon = 'label';

                  if (item.type === 'new') {
                    badgeClasses = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                    icon = 'auto_awesome';
                  } else if (item.type === 'fix') {
                    badgeClasses = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
                    icon = 'bug_report';
                  } else if (item.type === 'improve') {
                    badgeClasses = 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';
                    icon = 'trending_up';
                  }

                  return (
                    <div
                      key={item.id}
                      className="group flex items-start gap-2.5 rounded-xl p-2 transition-colors hover:bg-surface-container-high/50 text-xs text-on-surface leading-relaxed"
                    >
                      {item.tag ? (
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[10.5px] border shadow-2xs ${badgeClasses}`}
                        >
                          <span className="material-symbols-outlined text-[13px] leading-none">{icon}</span>
                          <span>{item.tag}</span>
                        </span>
                      ) : (
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      )}
                      <span className="flex-1 pt-0.5 break-words font-normal text-on-surface/90">
                        {item.content}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-[100px] flex-col items-center justify-center text-center p-4">
                <span className="material-symbols-outlined text-[24px] text-on-surface-variant/40 mb-1">
                  verified
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {t('updateModal.noChangelog')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Hộp xác nhận bỏ qua phiên bản này */}
        {confirmSkip ? (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 animate-in fade-in duration-150">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-amber-500 shrink-0 mt-0.5">warning</span>
              <div className="flex-1 text-xs">
                <p className="font-bold text-amber-600 dark:text-amber-400">
                  {t('updateModal.skipConfirmTitle', { version: remoteVersion })}
                </p>
                <p className="text-on-surface-variant mt-0.5 leading-relaxed">
                  {t('updateModal.skipConfirmDesc')}
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmSkip(false)}
                    className="h-7 px-3 rounded-lg text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    {t('common.cancel') || 'Hủy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipCurrent}
                    className="h-7 px-3 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer shadow-xs"
                  >
                    {t('updateModal.skipVersion')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Cụm Nút Hành Động */
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/15">
            {/* Nút Bỏ qua phiên bản này */}
            {!isBusy && remoteVersion ? (
              <button
                type="button"
                onClick={() => setConfirmSkip(true)}
                className="flex items-center gap-1.5 text-xs text-on-surface-variant/70 hover:text-amber-500 transition-colors py-1.5 px-2 rounded-lg hover:bg-amber-500/10 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">do_not_disturb_on</span>
                <span>{t('updateModal.skipVersion')}</span>
              </button>
            ) : (
              <div />
            )}

            {/* Nút Để sau & Cập nhật ngay */}
            <div className="flex items-center gap-2.5">
              {!isBusy && (
                <button
                  type="button"
                  onClick={closeUpdateModal}
                  className="h-9 px-4 rounded-xl text-xs font-semibold text-on-surface bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/20 transition-colors active:scale-95 cursor-pointer"
                >
                  {t('updateModal.remindLater')}
                </button>
              )}

              <button
                type="button"
                disabled={appUpdateState === 'downloading' || appUpdateState === 'installing'}
                onClick={handlePrimaryAction}
                className="flex h-9 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-on-primary shadow-md shadow-primary/25 transition-all hover:opacity-95 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {appUpdateState === 'downloading' ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>{t('update.downloading')}</span>
                  </>
                ) : appUpdateState === 'installing' ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>{t('update.installing')}</span>
                  </>
                ) : appUpdateState === 'downloaded' ? (
                  <>
                    <span className="material-symbols-outlined text-[18px]">install_desktop</span>
                    <span>{t('updateModal.installNow')}</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span>{t('updateModal.updateNow')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
