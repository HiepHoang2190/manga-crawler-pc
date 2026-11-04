import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../context/I18nContext';

/**
 * Hook quản lý trạng thái và tiến trình của Gói Tài Nguyên AI (Extras)
 */
export function useExtrasStatus() {
  const { t } = useI18n();
  const [status, setStatus] = useState({
    installed: false,
    version: null,
    path: '',
    components: { upscale: false, onnx: false },
  });
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const refreshStatus = useCallback(async () => {
    if (!window?.electronAPI?.extrasGetStatus) {
      setLoading(false);
      return;
    }
    try {
      const res = await window.electronAPI.extrasGetStatus();
      if (res) {
        setStatus(res);
      }
    } catch (e) {
      console.warn('[useExtrasStatus] refreshStatus error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();

    if (window?.electronAPI?.onExtrasProgress) {
      const cleanup = window.electronAPI.onExtrasProgress((prog) => {
        setProgress(prog);
        if (prog?.phase === 'ready') {
          setIsDownloading(false);
          refreshStatus();
        } else if (prog?.phase === 'error') {
          setIsDownloading(false);
          setError(prog?.error || t('extras.error.generic'));
        }
      });
      return cleanup;
    }
  }, [refreshStatus, t]);

  const startDownload = useCallback(async (overrideUrl = null) => {
    if (!window?.electronAPI?.extrasStartDownload) return;
    setIsDownloading(true);
    setError(null);
    setProgress({ phase: 'downloading', percent: 0, detail: t('extras.progress.connecting') });

    try {
      const res = await window.electronAPI.extrasStartDownload(overrideUrl);
      if (!res?.ok) {
        throw new Error(res?.error || t('extras.error.cannotStart'));
      }
      if (res?.status) {
        setStatus(res.status);
      }
    } catch (err) {
      setError(err?.message || String(err));
      setIsDownloading(false);
    }
  }, [t]);

  const selectAndInstallZip = useCallback(async () => {
    if (!window?.electronAPI?.extrasSelectZipFile || !window?.electronAPI?.extrasInstallFromZip) return;
    setError(null);

    try {
      const fileRes = await window.electronAPI.extrasSelectZipFile();
      if (fileRes?.canceled || !fileRes?.filePath) return;

      setIsDownloading(true);
      setProgress({ phase: 'extracting', percent: 10, detail: t('extras.progress.extracting') });

      const installRes = await window.electronAPI.extrasInstallFromZip(fileRes.filePath);
      if (!installRes?.ok) {
        throw new Error(installRes?.error || t('extras.error.cannotInstallZip'));
      }
      if (installRes?.status) {
        setStatus(installRes.status);
      }
      setIsDownloading(false);
      await refreshStatus();
    } catch (err) {
      setError(err?.message || String(err));
      setIsDownloading(false);
    }
  }, [refreshStatus, t]);

  const cancelDownload = useCallback(async () => {
    if (!window?.electronAPI?.extrasCancel) return;
    try {
      await window.electronAPI.extrasCancel();
    } catch (e) {
      console.warn('[useExtrasStatus] cancel error:', e);
    } finally {
      setIsDownloading(false);
      setProgress(null);
    }
  }, []);

  const openFolder = useCallback(async () => {
    if (!window?.electronAPI?.extrasOpenFolder) return;
    try {
      await window.electronAPI.extrasOpenFolder();
    } catch (e) {
      console.warn('[useExtrasStatus] openFolder error:', e);
    }
  }, []);

  const deleteExtras = useCallback(async () => {
    if (!window?.electronAPI?.extrasDelete) return false;
    try {
      const res = await window.electronAPI.extrasDelete();
      if (res?.ok) {
        if (res?.status) setStatus(res.status);
        await refreshStatus();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[useExtrasStatus] deleteExtras error:', e);
      return false;
    }
  }, [refreshStatus]);

  return {
    status,
    loading,
    isDownloading,
    progress,
    error,
    refreshStatus,
    startDownload,
    selectAndInstallZip,
    cancelDownload,
    openFolder,
    deleteExtras,
  };
}
