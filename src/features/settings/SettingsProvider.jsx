import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadThreads,
  saveThreads,
  loadDuplicateScanRecursive,
  saveDuplicateScanRecursive,
  loadAutoRetryMax,
  saveAutoRetryMax,
  loadMangadexVolumeFolderGrouping,
  saveMangadexVolumeFolderGrouping,
} from '../../utils/appSettings';

const SettingsContext = createContext(null);

const DEFAULT_CHAPTER_FOLDER = { mode: 'numbered', prefix: 'Chap', padDigits: 3, layout: 'subfolder' };

const AUTO_CHECK_UPDATE_KEY = 'mangaAutoCheckUpdate';
const SKIPPED_UPDATE_KEY = 'mangaSkippedUpdateVersion';

function loadAutoCheckUpdate() {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(AUTO_CHECK_UPDATE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function loadSkippedUpdateVersion() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SKIPPED_UPDATE_KEY) || null;
  } catch {
    return null;
  }
}

export function SettingsProvider({ children }) {
  const [savePath, setSavePath] = useState('');
  const [threads, setThreads] = useState(() => loadThreads());
  const [autoRetryMax, setAutoRetryMax] = useState(() => loadAutoRetryMax());
  const [duplicateScanRecursive, setDuplicateScanRecursive] = useState(() =>
    loadDuplicateScanRecursive()
  );
  const [mangadexVolumeFolderGrouping, setMangadexVolumeFolderGrouping] = useState(() =>
    loadMangadexVolumeFolderGrouping()
  );
  const [chapterFolder, setChapterFolder] = useState(DEFAULT_CHAPTER_FOLDER);
  /** Version mới phát hiện qua auto-check định kỳ — hiện badge trên TitleBar. */
  const [updateAvailableVersion, setUpdateAvailableVersion] = useState(null);
  /** Full checkResult từ auto-check — truyền vào UpdateChecker để khỏi check lại. */
  const [updateCheckResult, setUpdateCheckResult] = useState(null);
  const [appUpdateState, setAppUpdateState] = useState('idle');
  const appUpdateStateRef = useRef('idle');
  const [appUpdateError, setAppUpdateError] = useState('');
  const [appUpdateDownloadProgress, setAppUpdateDownloadProgress] = useState(null);
  const [appUpdateDownloadedPath, setAppUpdateDownloadedPath] = useState(null);

  /** Phiên bản người dùng chọn bỏ qua — không hiện badge thông báo trên TitleBar. */
  const [skippedUpdateVersion, setSkippedUpdateVersion] = useState(() => loadSkippedUpdateVersion());
  /** Trạng thái mở Hộp thoại chi tiết cập nhật & changelog. */
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  /** Khi true → SettingsPanel scroll đến section Cập nhật; reset sau khi dùng. */
  const [scrollSettingsToUpdate, setScrollSettingsToUpdate] = useState(false);
  /** Khi có giá trị (vd: 'downloads', 'update') → SettingsPanel chuyển tab và scroll tới section đó; reset sau khi dùng. */
  const [scrollSettingsToSection, setScrollSettingsToSection] = useState(null);
  /** Tự kiểm tra cập nhật khi mở app / định kỳ — localStorage mangaAutoCheckUpdate. */
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(() => loadAutoCheckUpdate());

  useEffect(() => {
    appUpdateStateRef.current = appUpdateState;
  }, [appUpdateState]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_CHECK_UPDATE_KEY, autoCheckUpdate ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [autoCheckUpdate]);

  const openUpdateModal = useCallback(() => {
    setIsUpdateModalOpen(true);
  }, []);

  const closeUpdateModal = useCallback(() => {
    setIsUpdateModalOpen(false);
  }, []);

  const skipUpdateVersion = useCallback((versionToSkip) => {
    const v = String(versionToSkip || '').trim();
    if (!v) return;
    try {
      localStorage.setItem(SKIPPED_UPDATE_KEY, v);
    } catch {
      /* ignore */
    }
    setSkippedUpdateVersion(v);
    setUpdateAvailableVersion(null);
    setIsUpdateModalOpen(false);
  }, []);

  const startAppDownload = useCallback(
    async (downloadInfoOverride) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      const info = downloadInfoOverride || updateCheckResult?.downloadInfo;
      if (!api?.downloadUpdate || !info) return { ok: false, error: 'No download info' };

      setAppUpdateState('downloading');
      setAppUpdateError('');
      setAppUpdateDownloadProgress({ percent: 0, downloaded: 0, total: 0 });

      let unsub = null;
      if (api.subscribeUpdateDownloadProgress) {
        unsub = api.subscribeUpdateDownloadProgress((p) => {
          setAppUpdateDownloadProgress(p);
        });
      }

      try {
        const r = await api.downloadUpdate(info);
        unsub?.();
        if (!r?.ok) {
          setAppUpdateError(r?.error || 'Download failed');
          setAppUpdateState('error');
          return r;
        }
        setAppUpdateDownloadedPath(r.filePath);
        setAppUpdateState('downloaded');
        return r;
      } catch (e) {
        unsub?.();
        const err = String(e?.message || e);
        setAppUpdateError(err);
        setAppUpdateState('error');
        return { ok: false, error: err };
      }
    },
    [updateCheckResult]
  );

  const startAppInstall = useCallback(
    async (filePathOverride) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      const targetPath = filePathOverride || appUpdateDownloadedPath;
      if (!api?.installUpdate || !targetPath) return { ok: false, error: 'No downloaded file' };

      setAppUpdateState('installing');
      setAppUpdateError('');
      try {
        const r = await api.installUpdate(targetPath);
        if (!r?.ok) {
          setAppUpdateError(r?.error || 'Install failed');
          setAppUpdateState('error');
          return r;
        }
        if (r.action === 'opened_folder') {
          setAppUpdateState('idle');
          setUpdateCheckResult(null);
          setUpdateAvailableVersion(null);
          setIsUpdateModalOpen(false);
        }
        return r;
      } catch (e) {
        const err = String(e?.message || e);
        setAppUpdateError(err);
        setAppUpdateState('error');
        return { ok: false, error: err };
      }
    },
    [appUpdateDownloadedPath]
  );

  /** Auto-check update định kỳ mỗi 6 giờ, và 1 lần khi bật / mở app (nếu preference bật). */
  useEffect(() => {
    if (!autoCheckUpdate) {
      setUpdateAvailableVersion(null);
      const busy =
        appUpdateStateRef.current === 'downloading' ||
        appUpdateStateRef.current === 'installing' ||
        appUpdateStateRef.current === 'downloaded';
      if (!busy) {
        setUpdateCheckResult(null);
        setAppUpdateState('idle');
      }
      return undefined;
    }

    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.checkUpdate) return undefined;

    const doCheck = async () => {
      try {
        const r = await api.checkUpdate();
        if (r?.ok) {
          setUpdateCheckResult(r);
          if (r?.hasUpdate && r?.remoteVersion) {
            const currentSkipped = loadSkippedUpdateVersion();
            if (r.remoteVersion !== currentSkipped) {
              setUpdateAvailableVersion(r.remoteVersion);
            } else {
              setUpdateAvailableVersion(null);
            }
          } else {
            setUpdateAvailableVersion(null);
          }
        }
      } catch {
        /* silent */
      }
    };

    // Check lần đầu sau 10 giây (tránh block startup / khi vừa bật lại)
    const firstTimer = setTimeout(doCheck, 10_000);
    // Sau đó định kỳ mỗi 6 giờ
    const interval = setInterval(doCheck, 6 * 60 * 60 * 1000);

    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [autoCheckUpdate]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getSavedDownloadPath) {
      api?.getDefaultDownloadPath?.().then(setSavePath).catch(() => {});
      return undefined;
    }
    api
      .getSavedDownloadPath()
      .then((saved) => {
        if (saved) setSavePath(saved);
        else api.getDefaultDownloadPath?.().then(setSavePath).catch(() => {});
      })
      .catch(() => {
        api.getDefaultDownloadPath?.().then(setSavePath).catch(() => {});
      });
    return undefined;
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.getChapterFolderSettings) return undefined;
    api
      .getChapterFolderSettings()
      .then((r) => {
        if (r && typeof r === 'object') setChapterFolder(r);
      })
      .catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__openUpdateModalForTest = (mockResult) => {
        if (mockResult) setUpdateCheckResult(mockResult);
        setIsUpdateModalOpen(true);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__openUpdateModalForTest;
      }
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!savePath.trim() || !api?.setSavedDownloadPath) return undefined;
    api.setSavedDownloadPath(savePath.trim()).catch(() => {});
    return undefined;
  }, [savePath]);

  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  useEffect(() => {
    saveAutoRetryMax(autoRetryMax);
  }, [autoRetryMax]);

  useEffect(() => {
    saveDuplicateScanRecursive(duplicateScanRecursive);
  }, [duplicateScanRecursive]);

  useEffect(() => {
    saveMangadexVolumeFolderGrouping(mangadexVolumeFolderGrouping);
  }, [mangadexVolumeFolderGrouping]);

  /** Threads chỉ 1–5 (đồng bộ với backend). */
  const setThreadsClamped = useCallback((v) => {
    setThreads((prev) => {
      const base = typeof v === 'function' ? v(prev) : v;
      const x = Number(base);
      const next = Number.isFinite(x) ? Math.floor(x) : 5;
      return Math.max(1, Math.min(next || 5, 5));
    });
  }, []);

  const persistChapterFolder = useCallback((partial) => {
    const api = window.electronAPI;
    if (!api?.setChapterFolderSettings) return;
    setChapterFolder((prev) => {
      const merged = { ...prev, ...partial };
      api.setChapterFolderSettings(merged).then((r) => {
        if (r && typeof r === 'object') setChapterFolder(r);
      });
      return merged;
    });
  }, []);

  const handleBrowse = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.selectDirectory) return;
    const dir = await api.selectDirectory();
    if (dir) setSavePath(dir);
  }, []);

  const value = useMemo(
    () => ({
      savePath,
      setSavePath,
      threads,
      setThreads,
      setThreadsClamped,
      autoRetryMax,
      setAutoRetryMax,
      duplicateScanRecursive,
      setDuplicateScanRecursive,
      mangadexVolumeFolderGrouping,
      setMangadexVolumeFolderGrouping,
      chapterFolder,
      setChapterFolder,
      persistChapterFolder,
      handleBrowse,
      autoCheckUpdate,
      setAutoCheckUpdate,
      appUpdateState,
      setAppUpdateState,
      appUpdateError,
      setAppUpdateError,
      appUpdateDownloadProgress,
      setAppUpdateDownloadProgress,
      appUpdateDownloadedPath,
      setAppUpdateDownloadedPath,
      updateAvailableVersion,
      setUpdateAvailableVersion,
      updateCheckResult,
      setUpdateCheckResult,
      scrollSettingsToUpdate,
      setScrollSettingsToUpdate,
      scrollSettingsToSection,
      setScrollSettingsToSection,
      skippedUpdateVersion,
      setSkippedUpdateVersion,
      skipUpdateVersion,
      isUpdateModalOpen,
      setIsUpdateModalOpen,
      openUpdateModal,
      closeUpdateModal,
      startAppDownload,
      startAppInstall,
    }),
    [
      savePath,
      threads,
      setThreadsClamped,
      autoRetryMax,
      duplicateScanRecursive,
      mangadexVolumeFolderGrouping,
      chapterFolder,
      persistChapterFolder,
      handleBrowse,
      autoCheckUpdate,
      appUpdateState,
      appUpdateError,
      appUpdateDownloadProgress,
      appUpdateDownloadedPath,
      updateAvailableVersion,
      updateCheckResult,
      scrollSettingsToUpdate,
      scrollSettingsToSection,
      skippedUpdateVersion,
      skipUpdateVersion,
      isUpdateModalOpen,
      openUpdateModal,
      closeUpdateModal,
      startAppDownload,
      startAppInstall,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
