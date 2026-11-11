import React, { useState, useEffect } from 'react';

const thumbnailCache = new Map();

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getExtUpper(filePath) {
  if (!filePath) return 'IMG';
  const idx = filePath.lastIndexOf('.');
  return idx >= 0 ? filePath.slice(idx + 1).toUpperCase() : 'IMG';
}

export default function UpscaleListItem({
  img,
  api,
  index,
  isDone = false,
  isProcessing = false,
  isSkipped = false,
  error = null,
  duration = null,
  outputPath = null,
  outputSize = null,
  scale = 2,
  outputFormat = 'original',
  filePercent = 0,
  isChecked = true,
  modelName = null,
  onToggleCheck,
  onPreview,
  onRemove,
  onErrorDetail,
}) {
  const activePath = isDone && outputPath ? outputPath : img?.absolutePath;
  const isOutputShowing = Boolean(isDone && outputPath);

  const [thumbUrl, setThumbUrl] = useState(() => {
    return activePath && thumbnailCache.has(activePath) ? thumbnailCache.get(activePath) : null;
  });
  const [dims, setDims] = useState(() => ({
    w: img?.width || img?.pixelWidth || null,
    h: img?.height || img?.pixelHeight || null,
  }));
  const [loadFailed, setLoadFailed] = useState(false);

  // Load thumbnail using Electron IPC
  useEffect(() => {
    if (!activePath) return;

    if (thumbnailCache.has(activePath)) {
      setThumbUrl(thumbnailCache.get(activePath));
      setLoadFailed(false);
      return;
    }

    let active = true;
    const clientApi = api || (typeof window !== 'undefined' ? window.electronAPI : null);
    const readFn = clientApi?.readImagePreview || clientApi?.duplicateReadPreview;

    if (readFn) {
      readFn(activePath)
        .then((res) => {
          if (!active) return;
          if (res?.ok && res?.dataUrl) {
            thumbnailCache.set(activePath, res.dataUrl);
            setThumbUrl(res.dataUrl);
            setLoadFailed(false);
          } else {
            // Fallback to original image thumbnail if output thumbnail reading fails
            if (activePath !== img?.absolutePath && thumbnailCache.has(img?.absolutePath)) {
              setThumbUrl(thumbnailCache.get(img.absolutePath));
              setLoadFailed(false);
            } else {
              setLoadFailed(true);
            }
          }
        })
        .catch(() => {
          if (active) {
            if (activePath !== img?.absolutePath && thumbnailCache.has(img?.absolutePath)) {
              setThumbUrl(thumbnailCache.get(img.absolutePath));
              setLoadFailed(false);
            } else {
              setLoadFailed(true);
            }
          }
        });
    }

    return () => {
      active = false;
    };
  }, [activePath, api]);

  // Resolution calculations
  const rawW = dims.w;
  const rawH = dims.h;
  let origRes = null;
  let targetRes = null;

  if (rawW && rawH) {
    if (isOutputShowing) {
      targetRes = `${rawW}×${rawH}`;
      origRes = `${Math.round(rawW / scale)}×${Math.round(rawH / scale)}`;
    } else {
      origRes = `${rawW}×${rawH}`;
      targetRes = `${rawW * scale}×${rawH * scale}`;
    }
  }

  // Format comparison
  const inputExt = getExtUpper(img.absolutePath || img.fileName);
  const targetExt = outputFormat === 'original'
    ? inputExt
    : (outputFormat === 'jpg' ? 'JPEG' : outputFormat.toUpperCase());

  // Size comparison
  const inputSizeStr = formatBytes(img.sizeBytes || img.size);
  const outputSizeStr = outputSize ? formatBytes(outputSize) : (isDone ? 'Đã lưu' : null);

  // Status-based styling
  let rowBg = 'hover:bg-surface-container-high/60';
  let borderHighlight = 'border-b border-outline-variant/10';

  if (error) {
    rowBg = 'bg-error/5 hover:bg-error/10';
    borderHighlight = 'border-b border-error/20';
  } else if (isProcessing) {
    rowBg = 'bg-primary/10 border-l-4 border-l-primary';
    borderHighlight = 'border-b border-primary/20';
  }

  return (
    <div
      data-active={isProcessing ? 'true' : undefined}
      onClick={() => onPreview?.(img)}
      className={`group relative flex items-center gap-3 px-3 py-2 text-xs transition-colors cursor-pointer select-none ${rowBg} ${borderHighlight}`}
    >
      {/* Mini Progress Bar on Active Row */}
      {isProcessing && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/20">
          <div
            className="h-full bg-primary transition-all duration-150 animate-pulse"
            style={{ width: `${Math.max(5, filePercent)}%` }}
          />
        </div>
      )}

      {/* Column 1: Checkbox & Index (#1) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-12 shrink-0 flex items-center gap-1.5"
      >
        {onToggleCheck && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleCheck(img.absolutePath)}
            disabled={isProcessing}
            className="w-3.5 h-3.5 rounded accent-primary cursor-pointer shrink-0"
          />
        )}
        <span className="font-mono text-[11px] text-on-surface-variant/70 font-semibold">
          #{index}
        </span>
      </div>

      {/* Column 2: Thumbnail & File Details */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        {/* Thumbnail (Aspect 3:4 portrait miniature) */}
        <div className="relative w-9 h-12 rounded-md bg-black/40 overflow-hidden shrink-0 border border-outline-variant/20">
          {thumbUrl && !loadFailed ? (
            <img
              src={thumbUrl}
              alt={img.fileName || ''}
              onLoad={(e) => {
                const nw = e.currentTarget.naturalWidth;
                const nh = e.currentTarget.naturalHeight;
                if (nw && nh && (!dims.w || dims.w !== nw)) {
                  setDims({ w: nw, h: nh });
                }
              }}
              onError={() => setLoadFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-on-surface-variant/40 bg-surface-container-high/40">
              <span className="material-symbols-outlined text-[16px]">photo</span>
            </div>
          )}
        </div>

        {/* Text Info */}
        <div className="min-w-0 truncate">
          <p
            className={`font-semibold truncate leading-tight ${
              error ? 'text-error' : isProcessing ? 'text-primary' : 'text-on-surface'
            }`}
            data-tooltip={img.fileName}
          >
            {img.fileName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-on-surface-variant/60 font-mono">
            <span className="font-semibold text-on-surface-variant/80">{targetExt}</span>
            {modelName && (
              <>
                <span>•</span>
                <span className="truncate max-w-[140px]">{modelName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Column 3: Resolution (Before ➔ After) */}
      <div className="w-44 shrink-0 font-mono text-[11px] text-left">
        {origRes && targetRes ? (
          <div className="flex items-center gap-1">
            <span className="text-on-surface-variant/60 text-[10px]">{origRes}</span>
            <span className="text-[9px] opacity-40">➔</span>
            <span
              className={`font-bold ${
                isDone
                  ? 'text-emerald-500 dark:text-emerald-400'
                  : isProcessing
                  ? 'text-primary'
                  : 'text-on-surface'
              }`}
            >
              {targetRes}
            </span>
          </div>
        ) : (
          <span className="text-on-surface-variant/40">-- × --</span>
        )}
      </div>

      {/* Column 4: File Size (Before ➔ After) */}
      <div className="w-36 shrink-0 font-mono text-[11px] text-left">
        {isDone && outputSizeStr ? (
          <div className="flex items-center gap-1">
            <span className="text-on-surface-variant/50 text-[10px]">{inputSizeStr}</span>
            <span className="text-[9px] opacity-40">➔</span>
            <span className="font-medium text-emerald-500 dark:text-emerald-400">
              {outputSizeStr}
            </span>
          </div>
        ) : isProcessing ? (
          <span className="text-primary text-[10px]">{inputSizeStr} ➔ ...</span>
        ) : (
          <span className="text-on-surface-variant/70 text-[10px]">{inputSizeStr}</span>
        )}
      </div>

      {/* Column 5: Status Badge & Scale Badge */}
      <div className="w-44 shrink-0 flex items-center justify-between gap-1.5">
        <div>
          {error ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/15 text-error font-bold text-[10px]">
              <span className="material-symbols-outlined text-[12px] leading-none">error</span>
              <span>Lỗi</span>
            </span>
          ) : isProcessing ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary font-bold text-[10px] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              <span>{filePercent > 0 ? `${filePercent}%` : 'Đang chạy'}</span>
            </span>
          ) : isDone ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 font-bold text-[10px]">
              <span className="material-symbols-outlined text-[12px] leading-none">check</span>
              <span>{duration ? `${duration.toFixed(2)}s` : 'Xong'}</span>
            </span>
          ) : isSkipped ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 font-medium text-[10px]">
              Bỏ qua
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant/50 text-[10px]">
              Chờ xử lý
            </span>
          )}
        </div>

        <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant/80 font-bold text-[9px] font-mono shrink-0">
          {scale}x
        </span>
      </div>

      {/* Column 6: Action Buttons (Error Bug, Remove) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-16 shrink-0 flex items-center justify-end gap-1"
      >
        {/* Bug Report Button (When failed) */}
        {error && onErrorDetail && (
          <button
            type="button"
            onClick={() => onErrorDetail(img, error)}
            className="p-1 rounded-md text-error hover:bg-error/15 transition-colors cursor-pointer"
            data-tooltip="Xem chi tiết lỗi"
            aria-label="Xem chi tiết lỗi"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">bug_report</span>
          </button>
        )}

        {/* Remove Button */}
        {onRemove && !isProcessing && (
          <button
            type="button"
            onClick={() => onRemove(img.absolutePath)}
            className="p-1 rounded-md text-on-surface-variant/40 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            data-tooltip="Xóa khỏi danh sách"
            aria-label="Xóa"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

