import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../../context/I18nContext';

export default function KindleGenCompilerCard({ disabled, className = '' }) {
  const { t } = useI18n();
  const [compilerStatus, setCompilerStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const refreshStatus = useCallback(async () => {
    if (!api?.ebookGetKindleGenStatus) return;
    setChecking(true);
    try {
      const status = await api.ebookGetKindleGenStatus();
      setCompilerStatus(status);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!api?.subscribeEbookToolProgress) return;
    const unsub = api.subscribeEbookToolProgress((p) => {
      if (p?.message) setStatusMsg(p.message);
    });
    return unsub;
  }, [api]);

  const handleDownload = async () => {
    if (!api?.ebookDownloadKindleGen) return;
    setDownloading(true);
    setStatusMsg(t('ebookStudio.converter.preparingDownload', 'Đang chuẩn bị tải KindleGen...'));
    try {
      const res = await api.ebookDownloadKindleGen();
      if (res.ok) {
        setStatusMsg(t('ebookStudio.converter.installSuccess', 'Cài đặt KindleGen thành công.'));
        await refreshStatus();
      } else {
        setStatusMsg(res.error || t('ebookStudio.converter.downloadFailed', 'Tải thất bại.'));
      }
    } catch (e) {
      setStatusMsg(String(e?.message || e));
    } finally {
      setDownloading(false);
    }
  };

  const handleImport = async () => {
    if (!api?.ebookImportKindleGen) return;
    setImporting(true);
    try {
      const res = await api.ebookImportKindleGen();
      if (res?.canceled) {
        return;
      }
      if (res?.ok) {
        setStatusMsg(t('ebookStudio.converter.importSuccess', 'Đã nạp thành công công cụ biên dịch.'));
        await refreshStatus();
      } else {
        setStatusMsg(res?.error || t('ebookStudio.converter.importFailed', 'Nhập file thất bại.'));
      }
    } catch (e) {
      setStatusMsg(String(e?.message || e));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenLocation = () => {
    if (compilerStatus?.path) {
      if (api?.showItemInFolder) {
        const target = compilerStatus.path.includes('.app')
          ? compilerStatus.path.split('.app')[0] + '.app'
          : compilerStatus.path;
        api.showItemInFolder(target);
        return;
      }
      if (api?.openPath) {
        const dir = compilerStatus.path.includes('.app')
          ? '/Applications'
          : compilerStatus.path.substring(0, compilerStatus.path.lastIndexOf('/'));
        api.openPath(dir);
        return;
      }
    }
    if (compilerStatus?.toolsDirectory && api?.openPath) {
      api.openPath(compilerStatus.toolsDirectory);
    }
  };

  const isMac =
    compilerStatus?.platform === 'darwin' ||
    (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac'));

  return (
    <div
      className={`rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 p-3 space-y-2.5 ${className}`}
    >
      {/* 1. Trạng thái kiểm tra */}
      {checking && (
        <div className="flex items-center gap-2 py-1 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] animate-spin text-primary">
            progress_activity
          </span>
          <span>{t('ebookStudio.converter.kindleGenChecking', 'Đang kiểm tra trình biên dịch...')}</span>
        </div>
      )}

      {/* 2. Trạng thái ĐÃ SẴN SÀNG */}
      {!checking && compilerStatus?.available && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low/70 px-2.5 py-2 border border-outline-variant/15">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                auto_stories
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-on-surface">
                    {compilerStatus.type === 'calibre' ? 'Calibre' : 'KindleGen'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t('ebookStudio.converter.kindleGenReady', 'Đã sẵn sàng')}
                  </span>
                </div>
                {compilerStatus.path && (
                  <p className="font-mono text-[10.5px] text-on-surface-variant/60 truncate max-w-[190px] sm:max-w-xs select-text">
                    {compilerStatus.path}
                  </p>
                )}
              </div>
            </div>

            {/* Quick action icons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || disabled}
                data-tooltip={t('ebookStudio.converter.kindleGenChangeFile', 'Đổi file khác')}
                aria-label={t('ebookStudio.converter.kindleGenChangeFile', 'Đổi file khác')}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors cursor-pointer disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {importing ? 'progress_activity' : 'swap_horiz'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleOpenLocation}
                aria-label={t('ebookStudio.converter.kindleGenOpenFolder', 'Mở vị trí cài đặt')}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">folder_open</span>
              </button>

              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                data-tooltip={t('ebookStudio.converter.helpTitle', 'Trợ giúp & Sửa lỗi')}
                aria-label={t('ebookStudio.converter.helpTitle', 'Trợ giúp & Sửa lỗi')}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/25 transition-colors cursor-pointer ${
                  showHelp
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">help_outline</span>
              </button>
            </div>
          </div>

          {/* Help & Troubleshooting (chỉ mở khi bấm icon Trợ giúp) */}
          {showHelp && (
            <div className="space-y-2 rounded-lg bg-surface-container p-2.5 text-[11px] text-on-surface-variant border border-outline-variant/15 animate-in fade-in-0 duration-150">
              <p className="leading-relaxed">
                {isMac
                  ? t(
                      'ebookStudio.converter.macCalibreHint',
                      'Trên macOS (Apple Silicon & Intel), Calibre trong Applications được dùng để xuất MOBI thay cho KindleGen 32-bit cũ.'
                    )
                  : t(
                      'ebookStudio.converter.kindleGenDesc',
                      'KindleGen (Amazon) hoặc Calibre (ebook-convert) dùng để biên dịch sách .mobi cho Kindle đời cũ.'
                    )}
              </p>

              <div className="flex items-start gap-1.5 rounded bg-surface-container-lowest/60 p-2 text-[10.5px] border border-outline-variant/10">
                <span className="material-symbols-outlined text-[13px] text-amber-500 shrink-0 mt-0.5">
                  info
                </span>
                <span className="leading-relaxed">
                  {t(
                    'ebookStudio.converter.kindleGenTroubleshooting',
                    'Nếu xuất gặp lỗi (spawn error): Hãy bấm "Đổi file" để chọn lại file kindlegen.exe / Calibre trên máy, hoặc bấm nút Tải lại bên dưới.'
                  )}
                </span>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || disabled}
                  className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[13px]">refresh</span>
                  <span>{downloading ? 'Đang tải...' : t('ebookStudio.converter.kindleGenRedownload', 'Tải lại tự động')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Trạng thái CHƯA CÀI ĐẶT */}
      {!checking && !compilerStatus?.available && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-amber-500">
                warning
              </span>
              <span className="text-xs font-semibold text-on-surface">
                {t('ebookStudio.converter.kindleGenTitle', 'Trình biên dịch MOBI')}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {t('ebookStudio.converter.kindleGenNotInstalled', 'Chưa cài đặt')}
            </span>
          </div>

          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            {isMac
              ? t(
                  'ebookStudio.converter.macCalibreHint',
                  'Trên macOS, Amazon KindleGen 32-bit cũ không thể chạy. Vui lòng cài đặt Calibre vào Applications để xuất MOBI (hệ thống tự động nhận diện).'
                )
              : t(
                  'ebookStudio.converter.kindleGenDesc',
                  'Cần có KindleGen (Amazon) hoặc Calibre (ebook-convert) để biên dịch sách .mobi cho Kindle đời cũ.'
                )}
          </p>

          <div className="flex items-center gap-2 pt-0.5">
            {isMac ? (
              <button
                type="button"
                onClick={() =>
                  api?.openExternal
                    ? api.openExternal('https://calibre-ebook.com/download_osx')
                    : window.open('https://calibre-ebook.com/download_osx', '_blank')
                }
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 transition-all cursor-pointer active:scale-95 shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                <span>{t('ebookStudio.converter.downloadCalibreMac', 'Tải Calibre (.dmg)')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading || disabled}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>
                  {downloading
                    ? 'Đang tải...'
                    : t('ebookStudio.converter.downloadKindleGen', 'Tải KindleGen (~2.8MB)')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || disabled}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">file_upload</span>
              <span>{importing ? 'Đang nạp...' : t('ebookStudio.converter.importKindleGen', 'Chọn file')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Thông báo tiến trình/lỗi ngữ cảnh */}
      {statusMsg && (
        <p className="text-[11px] font-medium text-primary flex items-center gap-1 pt-1">
          <span className="material-symbols-outlined text-[14px]">info</span>
          <span>{statusMsg}</span>
        </p>
      )}
    </div>
  );
}
