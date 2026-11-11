import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useSettings } from './SettingsProvider';
import { parseChangelog } from './utils/parseChangelog.mjs';

const STATES = {
  IDLE: 'idle',
  CHECKING: 'checking',
  UP_TO_DATE: 'up_to_date',
  UPDATE_AVAILABLE: 'update_available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  INSTALLING: 'installing',
  ERROR: 'error',
};

export default function UpdateChecker({
  state,
  setState,
  error,
  setError,
  checkResult,
  setCheckResult,
  downloadProgress,
  setDownloadProgress,
  downloadedPath,
  setDownloadedPath,
  autoCheckEnabled = true,
  onAutoCheckEnabledChange,
}) {
  const { t } = useI18n();
  const settings = useSettings();
  const openUpdateModal = settings?.openUpdateModal;
  const unsubRef = useRef(null);

  const changelogItems = useMemo(() => {
    return parseChangelog(checkResult?.changelog || '');
  }, [checkResult?.changelog]);

  // Đồng bộ state ban đầu nếu có checkResult từ auto-check của App.jsx
  useEffect(() => {
    if (state === STATES.IDLE && checkResult) {
      setState(checkResult.hasUpdate ? STATES.UPDATE_AVAILABLE : STATES.UP_TO_DATE);
    }
  }, [state, checkResult, setState]);

  // Xử lý re-subscribe khi component được mount lại trong lúc đang tải
  useEffect(() => {
    if (state === STATES.DOWNLOADING) {
      const api = window.electronAPI;
      if (api?.subscribeUpdateDownloadProgress) {
        unsubRef.current?.();
        unsubRef.current = api.subscribeUpdateDownloadProgress((p) => {
          setDownloadProgress(p);
        });
      }
    }
    return () => { unsubRef.current?.(); };
  }, [state, setDownloadProgress]);

  const handleCheck = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.checkUpdate) return;
    setState(STATES.CHECKING);
    setError('');
    setCheckResult(null);
    setDownloadProgress(null);
    setDownloadedPath(null);
    try {
      const r = await api.checkUpdate();
      if (!r.ok) {
        setError(r.error || t('update.errorCheck'));
        setState(STATES.ERROR);
        return;
      }
      setCheckResult(r);
      setState(r.hasUpdate ? STATES.UPDATE_AVAILABLE : STATES.UP_TO_DATE);
    } catch (e) {
      setError(String(e?.message || e));
      setState(STATES.ERROR);
    }
  }, [setState, setError, setCheckResult, setDownloadProgress, setDownloadedPath, t]);

  const handleDownload = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.downloadUpdate || !checkResult?.downloadInfo) return;

    setState(STATES.DOWNLOADING);
    setDownloadProgress({ percent: 0, downloaded: 0, total: 0 });

    // Subscribe progress
    unsubRef.current?.();
    if (api.subscribeUpdateDownloadProgress) {
      unsubRef.current = api.subscribeUpdateDownloadProgress((p) => {
        setDownloadProgress(p);
      });
    }

    try {
      const r = await api.downloadUpdate(checkResult.downloadInfo);
      unsubRef.current?.();
      unsubRef.current = null;
      if (!r.ok) {
        setError(r.error || t('update.errorDownload'));
        setState(STATES.ERROR);
        return;
      }
      setDownloadedPath(r.filePath);
      setState(STATES.DOWNLOADED);
    } catch (e) {
      unsubRef.current?.();
      unsubRef.current = null;
      setError(String(e?.message || e));
      setState(STATES.ERROR);
    }
  }, [checkResult, setState, setDownloadProgress, setError, setDownloadedPath, t]);

  const handleInstall = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.installUpdate || !downloadedPath) return;
    setState(STATES.INSTALLING);
    try {
      const r = await api.installUpdate(downloadedPath);
      if (!r.ok) {
        setError(r.error || t('update.errorInstall'));
        setState(STATES.ERROR);
        return;
      }
      // Windows: đã mở thư mục, macOS: đã relaunch
      if (r.action === 'opened_folder') {
        setState(STATES.IDLE);
        setCheckResult(null);
      }
      // macOS relaunch → app thoát, không cần xử lý thêm
    } catch (e) {
      setError(String(e?.message || e));
      setState(STATES.ERROR);
    }
  }, [downloadedPath, setState, setError, setCheckResult, t]);

  const isWindows = checkResult?.platform === 'win32';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high/50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-on-surface">{t('update.autoCheck')}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">{t('update.autoCheckSub')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(autoCheckEnabled)}
          aria-label={t('update.autoCheck')}
          onClick={() => onAutoCheckEnabledChange?.(!autoCheckEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            autoCheckEnabled ? 'bg-primary' : 'bg-outline-variant/50'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              autoCheckEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={state === STATES.CHECKING || state === STATES.DOWNLOADING || state === STATES.INSTALLING}
          onClick={handleCheck}
          className="shrink-0 h-10 px-4 rounded-md text-sm inline-flex items-center gap-1.5 bg-surface-container-high text-on-surface font-medium hover:bg-surface-bright transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            {state === STATES.CHECKING ? 'sync' : 'system_update_alt'}
          </span>
          {state === STATES.CHECKING ? t('update.checking') : t('update.checkBtn')}
        </button>

        {checkResult && (
          <span className="text-xs text-on-surface-variant">
            {t('update.currentVersion')} <span className="font-mono">{checkResult.currentVersion}</span>
            {checkResult.hasUpdate && (
              <>
                {' → '}
                <span className="font-mono text-primary">{checkResult.remoteVersion}</span>
              </>
            )}
          </span>
        )}
      </div>

      {state === STATES.UP_TO_DATE && (
        <p className="text-sm text-green-500 dark:text-green-400 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] leading-none">check_circle</span>
          {t('update.upToDate')}
        </p>
      )}

      {state === STATES.UPDATE_AVAILABLE && checkResult?.downloadInfo && (
        <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-on-surface font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">rocket_launch</span>
              {t('update.available')} <span className="text-primary font-bold">v{checkResult.remoteVersion}</span>
              {checkResult.releaseDate && (
                <span className="text-xs text-on-surface-variant font-normal">({checkResult.releaseDate})</span>
              )}
            </p>
            {openUpdateModal && (
              <button
                type="button"
                onClick={openUpdateModal}
                className="text-xs font-semibold text-primary hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer"
              >
                <span>{t('updateModal.viewChanges')}</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            )}
          </div>

          {changelogItems.length > 0 && (
            <div className="max-h-36 overflow-y-auto rounded-lg bg-surface-container-lowest/80 border border-outline-variant/15 p-2.5 space-y-1.5 custom-scrollbar text-xs">
              {changelogItems.slice(0, 5).map((item) => {
                let badgeClasses = 'bg-surface-container-high text-on-surface-variant border-outline-variant/30';
                if (item.type === 'new') {
                  badgeClasses = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                } else if (item.type === 'fix') {
                  badgeClasses = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
                } else if (item.type === 'improve') {
                  badgeClasses = 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';
                }

                return (
                  <div key={item.id} className="flex items-start gap-2 text-on-surface">
                    {item.tag ? (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClasses}`}>
                        {item.tag}
                      </span>
                    ) : (
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                    )}
                    <span className="truncate">{item.content}</span>
                  </div>
                );
              })}
              {changelogItems.length > 5 && openUpdateModal && (
                <button
                  type="button"
                  onClick={openUpdateModal}
                  className="text-[11px] font-medium text-primary hover:opacity-80 transition-opacity block pt-0.5 cursor-pointer"
                >
                  + {changelogItems.length - 5} thay đổi khác...
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-on-surface-variant">
            {t('update.filename')} <span className="font-mono">{checkResult.downloadInfo.filename}</span>
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownload}
              className="h-9 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 bg-primary text-on-primary shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">download</span>
              {t('update.download')}
            </button>
            {openUpdateModal && (
              <button
                type="button"
                onClick={openUpdateModal}
                className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-surface-container-high text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">info</span>
                {t('updateModal.title')}
              </button>
            )}
          </div>
        </div>
      )}

      {state === STATES.UPDATE_AVAILABLE && !checkResult?.downloadInfo && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3 space-y-1">
          <p className="text-sm text-on-surface font-medium">
            {t('update.available')} <span className="text-primary">{checkResult.remoteVersion}</span>
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('update.archNotAvailable', { arch: `${checkResult.platform || ''} ${checkResult.arch || ''}`.trim() })}
          </p>
        </div>
      )}

      {state === STATES.DOWNLOADING && downloadProgress && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>{t('update.downloading')}</span>
            <span>
              {downloadProgress.percent >= 0
                ? `${downloadProgress.percent}%`
                : `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: downloadProgress.percent >= 0 ? `${downloadProgress.percent}%` : '100%' }}
            />
          </div>
        </div>
      )}

      {state === STATES.DOWNLOADED && (
        <div className="rounded-md bg-surface-container-high px-4 py-3 space-y-2">
          <p className="text-sm text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] leading-none text-green-500">download_done</span>
            {t('update.downloaded')}
          </p>
          {isWindows && (
            <p className="text-xs text-on-surface-variant">
              {t('update.windowsNote')}
            </p>
          )}
          {!isWindows && (
            <p className="text-xs text-on-surface-variant">
              {t('update.macNote')}
            </p>
          )}
          <button
            type="button"
            onClick={handleInstall}
            className="h-9 px-4 rounded-md text-sm inline-flex items-center gap-1.5 bg-primary text-on-primary font-medium hover:opacity-90 transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">install_desktop</span>
            {isWindows ? t('update.installWin') : t('update.installMac')}
          </button>
        </div>
      )}

      {state === STATES.INSTALLING && (
        <p className="text-sm text-on-surface-variant flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] leading-none animate-spin">sync</span>
          {t('update.installing')}
        </p>
      )}

      {state === STATES.ERROR && (
        <p className="text-sm text-red-500 dark:text-red-400 flex items-start gap-1.5">
          <span className="material-symbols-outlined text-[18px] leading-none shrink-0 mt-0.5">error</span>
          {error}
        </p>
      )}
    </div>
  );
}
