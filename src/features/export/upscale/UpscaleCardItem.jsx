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

export default function UpscaleCardItem({
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
  onToggleCheck,
  onPreview,
  onRemove,
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

  // Load thumbnail using Electron IPC readImagePreview or duplicateReadPreview
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
      // Current image being displayed is already the upscaled output
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
  const outputSizeStr = outputSize
    ? formatBytes(outputSize)
    : (isDone ? 'Đã lưu' : null);

  // Styling based on card status
  let cardBorder = 'border-outline-variant/20 hover:border-outline-variant/50';
  let cardBg = 'bg-surface-container-low/80';

  if (error) {
    cardBorder = 'border-error/50';
    cardBg = 'bg-error/5';
  } else if (isProcessing) {
    cardBorder = 'border-2 border-primary ring-2 ring-primary/20';
    cardBg = 'bg-primary/5 shadow-md shadow-primary/10 scale-[1.01]';
  } else if (isDone) {
    cardBorder = 'border-emerald-500/40 hover:border-emerald-500/60';
  }

  return (
    <div
      data-active={isProcessing ? 'true' : undefined}
      style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
      className={`group relative aspect-[4/3] w-full rounded-2xl border ${cardBorder} ${cardBg} transition-all duration-200 overflow-hidden select-none text-xs shadow-sm`}
    >
      {/* ─── 1. Full-Bleed Background Image (65% visible above overlay) ─── */}
      <div
        onClick={() => onPreview?.(img)}
        className="absolute inset-0 w-full h-full cursor-pointer"
        data-tooltip="Bấm để xem trước ảnh phóng to"
      >
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
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant/40 gap-1 bg-surface-container-high/40">
            <span className="material-symbols-outlined text-[28px]">
              {loadFailed ? 'broken_image' : 'photo'}
            </span>
            <span className="text-[10px]">{loadFailed ? 'Lỗi ảnh' : 'Đang tải...'}</span>
          </div>
        )}
      </div>

      {/* ─── 2. Top-Left Waifu2x Index Badge (Authentic Circular Badge) ─── */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck?.(img.absolutePath);
        }}
        data-tooltip={isChecked ? 'Bỏ chọn ảnh' : 'Chọn ảnh'}
        className={`absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-full flex items-center justify-center font-semibold text-xs transition-all cursor-pointer shadow-sm select-none backdrop-blur-md ${
          isChecked
            ? 'bg-white/90 dark:bg-black/75 text-slate-900 dark:text-white hover:scale-105'
            : 'bg-black/40 text-white/40 hover:text-white'
        }`}
      >
        <span>{index}</span>
      </div>

      {/* ─── 3. Top-Right Quick Actions (Clean Hover Only, No Clutter) ─── */}
      {onRemove && !isProcessing && (
        <div className="absolute top-2.5 right-2.5 z-20">
          <button
            type="button"
            data-tooltip="Xóa khỏi danh sách"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(img.absolutePath);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-full bg-black/60 hover:bg-error text-white backdrop-blur-md transition-all cursor-pointer shadow-sm flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[13px] leading-none">close</span>
          </button>
        </div>
      )}

      {/* ─── 4. Frosted Glass Metadata & Progress Overlay (100% Authentic Waifu2x) ─── */}
      <div
        onClick={() => onPreview?.(img)}
        style={{
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          backdropFilter: 'blur(16px) saturate(180%)',
        }}
        className="absolute -bottom-1 -inset-x-1 z-10 bg-white/65 dark:bg-black/65 px-3.5 pb-3 pt-2 space-y-0.5 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer select-none"
      >
        {/* Row 1: Dimensions (waifu2x crop icon) */}
        <div className="flex items-center gap-2 text-xs font-mono leading-tight">
          <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2v14a2 2 0 0 0 2 2h14" />
            <path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
          <span className="font-bold text-slate-900 dark:text-white text-xs tracking-tight shrink-0">
            {targetRes || '-- × --'}
          </span>
          {origRes && origRes !== targetRes && (
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-normal shrink-0">
              {origRes}
            </span>
          )}
        </div>

        {/* Row 2: Format (waifu2x description icon) */}
        <div className="flex items-center gap-2 text-xs font-mono leading-tight">
          <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="font-bold text-slate-900 dark:text-white text-xs uppercase">
            {targetExt}
          </span>
          {inputExt && inputExt !== targetExt && (
            <span className="text-slate-500 dark:text-slate-400 text-[11px] uppercase font-normal">{inputExt}</span>
          )}
        </div>

        {/* Row 3: File Size (waifu2x SD storage icon with contacts) */}
        <div className="flex items-center gap-2 text-xs font-mono leading-tight">
          <svg data-icon="sd_storage" className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="8" y1="5" x2="8" y2="8" />
            <line x1="12" y1="5" x2="12" y2="8" />
            <line x1="16" y1="5" x2="16" y2="8" />
          </svg>
          <span className="font-bold text-slate-900 dark:text-white text-xs">
            {isDone && outputSizeStr ? outputSizeStr : inputSizeStr}
          </span>
        </div>

        {/* Row 4: Status Indicator (Waifu2x Cyan Arc / Spinner or State) */}
        <div className="pt-0.5 flex items-center justify-between">
          {isProcessing ? (
            <div className="flex items-center gap-2 text-xs text-teal-600 dark:text-teal-400 font-medium truncate">
              <svg className="w-3.5 h-3.5 animate-spin shrink-0 text-teal-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
                <path className="opacity-90" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M12 3a9 9 0 0 1 9 9" />
              </svg>
              <span className="truncate tracking-tight font-medium">
                {filePercent > 0 ? `Processing, pass ${Math.min(5, Math.max(1, Math.ceil(filePercent / 20)))}/5` : 'Processing, pass 1/5'}
              </span>
            </div>
          ) : isDone ? (
            <div className="flex items-center justify-between w-full text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <div className="flex items-center gap-1.5 truncate">
                <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="8 12 11 15 16 9" />
                </svg>
                <span className="truncate font-medium">Hoàn thành</span>
              </div>
              {duration && <span className="text-[11px] font-mono opacity-80 shrink-0">~{duration.toFixed(1)}s</span>}
            </div>
          ) : error ? (
            <div className="flex items-center gap-1.5 text-xs text-error font-medium truncate" data-tooltip={error}>
              <span className="material-symbols-outlined text-[15px] shrink-0 leading-none">error</span>
              <span className="truncate">Thất bại</span>
            </div>
          ) : isSkipped ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
              <span className="material-symbols-outlined text-[15px] shrink-0 leading-none">skip_next</span>
              <span className="truncate">Đã bỏ qua</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
              </svg>
              <span className="truncate">Chờ xử lý</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
