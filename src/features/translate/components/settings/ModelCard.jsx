import React, { useState } from 'react';
import { useI18n } from '../../../../context/I18nContext';

export function ModelCard({
  model,
  onDownload,
  onCancel,
  onDelete,
  onImport,
  onOpenFolder,
  progress,
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [copiedPath, setCopiedPath] = useState(false);

  if (!model) return null;

  const installed = Boolean(model.installed);
  const isDownloading = Boolean(progress);
  const diskSize = typeof model.diskSize === 'number' ? model.diskSize : 0;
  const files = Array.isArray(model.files) ? model.files : [];

  const sizeLabel = diskSize > 0
    ? `${(diskSize / 1e6).toFixed(0)} MB`
    : files.length > 0
      ? `~${(files.reduce((s, f) => s + (f?.sizeBytes || 0), 0) / 1e6).toFixed(0)} MB`
      : '';

  const purposeMeta = {
    detection: {
      icon: 'crop_free',
      label: 'Detection',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
    },
    ocr: {
      icon: 'text_fields',
      label: 'OCR',
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
    },
    inpainting: {
      icon: 'auto_fix_high',
      label: 'Inpainting',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
    },
  }[model.purpose] || {
    icon: 'deployed_code',
    label: 'ONNX',
    color: 'bg-primary/10 text-primary border-primary/25',
  };

  const handleCopy = (text, type) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    if (type === 'path') {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } else {
      setCopiedUrl(type);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all ${isDownloading
        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
        : 'border-outline-variant/20 bg-surface-container-low hover:border-outline-variant/35'
        }`}
    >
      <div className="p-3 space-y-2">
        {/* Row 1: Header (Icon + Name + Tag + Status + Size) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${purposeMeta.color}`}>
              <span className="material-symbols-outlined text-[16px]">{purposeMeta.icon}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs text-on-surface font-mono">{model.name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${purposeMeta.color}`}>
                  {purposeMeta.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {sizeLabel && (
              <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container-lowest px-1.5 py-0.5 rounded border border-outline-variant/15">
                {sizeLabel}
              </span>
            )}
            {installed ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg whitespace-nowrap">
                <span className="material-symbols-outlined text-[12px]">check_circle</span>
                <span>{t('translate.settings.modelInstalled')}</span>
              </span>
            ) : isDownloading ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg animate-pulse whitespace-nowrap">
                <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>
                <span>{progress.percent != null ? `${progress.percent}%` : '...'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-lg border border-outline-variant/20 whitespace-nowrap">
                {t('translate.settings.modelNotInstalled') || 'Chưa tải'}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Full-width Description */}
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          {model.description}
        </p>

        {/* Row 3: Downloading Progress Bar */}
        {isDownloading && (
          <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-primary flex items-center gap-1.5 truncate">
                <span className="material-symbols-outlined text-[14px] animate-spin shrink-0">sync</span>
                <span className="truncate">{progress.detail || (progress.file ? `File: ${progress.file}` : t('translate.settings.downloadingBadge'))}</span>
              </span>
              <span className="font-bold font-mono text-on-surface shrink-0 ml-2">
                {progress.percent != null ? `${progress.percent}%` : '...'}
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent ?? 15}%` }}
              />
            </div>
          </div>
        )}

        {/* Row 4: Action Toolbar & File Details Toggle */}
        <div className="pt-2 border-t border-outline-variant/10 flex items-center justify-between gap-2 flex-wrap">
          {/* Toggle details */}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors py-1 px-1.5 rounded-lg hover:bg-surface-container-high"
          >
            <span
              className="material-symbols-outlined text-[16px] text-primary transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              keyboard_arrow_down
            </span>
            <span>{expanded ? (t('translate.settings.hideOnnxFiles') || 'Ẩn file ONNX') : (t('translate.settings.viewOnnxFiles', { count: files.length }) || `Xem file ONNX (${files.length})`)}</span>
          </button>

          {/* Actions on right */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Open Folder */}
            <button
              type="button"
              onClick={() => onOpenFolder(model.id)}
              className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center shrink-0"
              data-tooltip={t('translate.settings.modelOpenFolderTitle')}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">folder_open</span>
            </button>

            {/* Import file */}
            <button
              type="button"
              onClick={() => onImport(model.id)}
              className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center shrink-0"
              data-tooltip={t('translate.settings.modelImportTitle')}
            >
              <span className="material-symbols-outlined text-[16px] leading-none">upload_file</span>
            </button>

            {/* Main Action: Download / Cancel / Delete */}
            {installed ? (
              <button
                type="button"
                onClick={() => onDelete(model.id)}
                className="cursor-pointer w-7 h-7 rounded-lg border border-error/20 bg-error/5 hover:bg-error/15 text-error transition-colors flex items-center justify-center shrink-0"
                data-tooltip={t('translate.settings.modelDeleteTitle')}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
              </button>
            ) : isDownloading ? (
              <button
                type="button"
                onClick={() => onCancel(model.id)}
                className="cursor-pointer inline-flex items-center gap-1 px-2.5 h-7 rounded-lg border border-error/30 bg-error/10 hover:bg-error/20 text-error text-[11px] font-semibold transition-colors"
                data-tooltip={t('translate.settings.modelCancelDownloadTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">cancel</span>
                <span>{t('translate.settings.cancelPullBtn') || 'Hủy'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDownload(model.id)}
                className="cursor-pointer inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-primary hover:brightness-110 text-on-primary text-[11px] font-semibold transition-all shadow-2xs"
                data-tooltip={t('translate.settings.modelAutoDownloadTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                <span>{t('translate.settings.downloadBtn') || 'Tải về'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details: URLs and Storage Path */}
      {expanded && (
        <div className="border-t border-outline-variant/15 px-3.5 py-3 bg-surface-container-lowest/70 space-y-3 rounded-b-xl text-xs animate-fadeIn">
          {/* Storage Directory Path */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-on-surface-variant font-medium text-[11px]">
              <span className="flex items-center gap-1.5 text-on-surface font-semibold">
                <span className="material-symbols-outlined text-[16px] text-primary">folder</span>
                <span>{t('translate.settings.modelStorageLocation')}</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(model.installDir, 'path')}
                  className={`cursor-pointer w-7 h-7 rounded-lg border transition-all flex items-center justify-center shrink-0 ${copiedPath
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                    }`}
                  data-tooltip={copiedPath ? t('translate.settings.modelCopied') : t('translate.settings.modelCopyPath')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">
                    {copiedPath ? 'check' : 'content_copy'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFolder(model.id)}
                  className="cursor-pointer w-7 h-7 rounded-lg border border-outline-variant/25 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center shrink-0"
                  data-tooltip={t('translate.settings.modelOpenFolderTitle')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
                </button>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-surface-container-high/40 text-[11px] font-mono text-on-surface-variant break-all select-all border border-outline-variant/15">
              {model.installDir || '--'}
            </div>
          </div>

          {/* Download URLs & Per-file controls */}
          <div className="space-y-2 pt-2 border-t border-outline-variant/10">
            <span className="block text-on-surface-variant font-semibold text-[11px]">
              {t('translate.settings.modelDirectUrls')}
            </span>
            <div className="space-y-2">
              {files.map((f, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold font-mono text-xs text-on-surface">{f.filename}</span>
                      <span className="text-[10px] font-mono text-on-surface-variant">
                        ({((f.sizeBytes || 0) / 1e6).toFixed(1)} MB)
                      </span>
                      {f.installed ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                          <span className="material-symbols-outlined text-[11px]">check</span>
                          <span>{t('translate.settings.modelFilePresent')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                          <span>{t('translate.settings.modelFileMissing')}</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onImport(model.id, f.filename)}
                      className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-primary hover:bg-primary/10 border border-primary/20 transition-colors"
                      data-tooltip={t('translate.settings.modelImportTitle')}
                    >
                      <span className="material-symbols-outlined text-[13px]">upload_file</span>
                      <span>{t('translate.settings.modelImportFile')}</span>
                    </button>
                  </div>

                  {/* URL Box with Copy & Open */}
                  <div className="flex items-center gap-1 bg-surface-container-high/40 rounded-md px-2 py-1.5 border border-outline-variant/15">
                    <span
                      className="text-[10px] font-mono text-on-surface-variant select-all truncate flex-1 min-w-0"
                      data-tooltip={f.url}
                    >
                      {f.url}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(f.url, f.filename)}
                      className="cursor-pointer p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
                      data-tooltip={t('translate.settings.modelCopyUrl')}
                    >
                      <span className="material-symbols-outlined text-[14px] block">
                        {copiedUrl === f.filename ? 'check' : 'content_copy'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const api = typeof window !== 'undefined' ? window.electronAPI : null;
                        api?.openExternal?.(f.url);
                      }}
                      className="cursor-pointer p-1 rounded hover:bg-surface-container-high text-primary transition-colors shrink-0"
                      data-tooltip={t('translate.settings.modelOpenBrowser')}
                    >
                      <span className="material-symbols-outlined text-[14px] block">open_in_new</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelCard;
