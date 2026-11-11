import React, { useEffect } from 'react';

export function OfflineCbzFolderModal({
  isOpen,
  onClose,
  folderPath,
  folderFiles = [],
  detectingPath,
  setDetectingPath,
  loadingArchiveFilePath,
  setLoadingArchiveFilePath,
  cbzLoadProgress,
  onReadCbzFromPath,
  onOpenEbook,
  setError,
  t,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isArchiveKind = folderFiles.some((f) => f.format !== 'CBZ');

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cbz-folder-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[min(85vh,520px)] min-h-0 flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container-high shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2 border-b border-outline-variant/15 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="cbz-folder-modal-title" className="text-base font-bold text-on-surface">
              {isArchiveKind
                ? t('offlineLibrary.archiveFolderModalTitle')
                : t('offlineLibrary.cbzFolderModalTitle')}
            </h2>
            <p className="text-[11px] text-on-surface-variant mt-1 break-all line-clamp-3" data-tooltip={folderPath}>
              {folderPath}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
            aria-label={t('offlineLibrary.cbzFolderModalClose')}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">close</span>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-2">
          {folderFiles.length > 0 ? (
            <ul className="divide-y divide-outline-variant/10 rounded-lg border border-outline-variant/15 bg-surface-container-highest/50">
              {folderFiles.map((f) => {
                const ext = f.name?.split('.').pop()?.toLowerCase();
                const isEbook = ext === 'epub' || ext === 'pdf';
                const isDetecting = detectingPath === f.absolutePath;
                const isThisLoading =
                  loadingArchiveFilePath === f.absolutePath ||
                  (cbzLoadProgress?.filePath && cbzLoadProgress.filePath === f.absolutePath);

                return (
                  <li
                    key={f.absolutePath}
                    className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-xs"
                  >
                    <span className="min-w-0 flex items-center gap-1.5 truncate text-on-surface" data-tooltip={f.name}>
                      <span className="truncate">{f.name}</span>
                      {f.format ? (
                        <span className="shrink-0 text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                          {f.format}
                        </span>
                      ) : null}
                    </span>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!isEbook) {
                          setLoadingArchiveFilePath(f.absolutePath);
                          onReadCbzFromPath?.(f.absolutePath);
                          return;
                        }
                        const api = typeof window !== 'undefined' ? window.electronAPI : null;
                        if (!api?.detectEbookContentType) {
                          setLoadingArchiveFilePath(f.absolutePath);
                          onReadCbzFromPath?.(f.absolutePath);
                          return;
                        }
                        setDetectingPath(f.absolutePath);
                        setError('');
                        try {
                          const result = await api.detectEbookContentType(f.absolutePath);
                          if (!result?.ok) {
                            setError(result?.error || t('offlineLibrary.cbzFolderScanFailed'));
                          } else if (result.contentType === 'text') {
                            onOpenEbook?.(f.absolutePath);
                          } else {
                            setLoadingArchiveFilePath(f.absolutePath);
                            onReadCbzFromPath?.(f.absolutePath);
                          }
                        } catch (e) {
                          setError(String(e?.message || e));
                        } finally {
                          setDetectingPath(null);
                        }
                      }}
                      disabled={isDetecting || Boolean(cbzLoadProgress) || (!isEbook && typeof onReadCbzFromPath !== 'function')}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        isThisLoading
                          ? 'bg-primary text-on-primary shadow-xs'
                          : 'bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40'
                      }`}
                    >
                      {isDetecting || isThisLoading ? (
                        <span className="material-symbols-outlined text-[13px] leading-none animate-spin">
                          progress_activity
                        </span>
                      ) : null}
                      {isThisLoading && cbzLoadProgress && cbzLoadProgress.total > 0
                        ? `${cbzLoadProgress.pct ?? 0}%`
                        : t('offlineLibrary.readThisCbz')}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-on-surface-variant px-1 py-2">{t('offlineLibrary.cbzFolderEmpty')}</p>
          )}
        </div>
        <div className="flex justify-end px-4 py-3 border-t border-outline-variant/15 shrink-0 bg-surface-container-high">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary shadow-md hover:brightness-110 transition-[filter] cursor-pointer"
          >
            {t('offlineLibrary.cbzFolderModalClose')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OfflineCbzFolderModal;

