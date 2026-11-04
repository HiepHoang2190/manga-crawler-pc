import React, { useState, useEffect, useMemo } from 'react';
import { useBranding } from '../../context/BrandingContext';
import { useI18n } from '../../context/I18nContext';

/**
 * Xử lý ảnh biểu tượng thành chuẩn icon bo tròn:
 * - Hình tròn (Circle - Mặc định): Khớp 100% với phong cách huy hiệu tròn của icon Manga Crawler & Electron
 * - Bo góc vuông (Squircle): Chuẩn khung bo góc Apple macOS
 * - Cắt cúp chính xác bằng clip path, không bao giờ tràn ra ngoài khung hình icon
 * - Căn lề an toàn để icon thoáng đãng, sắc nét trên TitleBar, Dock macOS và Taskbar Windows
 */
function processIconToShape(srcDataUrl, shape = 'circle', mode = 'cover') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) {
        resolve({ dataUrl: srcDataUrl, width: w, height: h });
        return;
      }

      const S = 512; // Kích thước canvas icon chuẩn (khớp 100% với public/data/icon.png 512x512)
      const P = 4;   // Đệm an toàn mỏng 4px mép viền (khớp với icon.png mặc định)
      const W = S - 2 * P; // Vùng icon chính 504px
      const cx = S / 2;
      const cy = S / 2;
      const radius = W / 2; // Bán kính hình tròn 252px (khớp với 253.5px của icon.png)

      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: srcDataUrl, width: w, height: h });
        return;
      }

      ctx.clearRect(0, 0, S, S);

      // Tạo đường cắt theo hình dáng đã chọn
      ctx.beginPath();
      if (shape === 'squircle') {
        const R = Math.round(W * 0.2237); // ~112px squircle
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(P, P, W, W, R);
        } else {
          ctx.moveTo(P + R, P);
          ctx.lineTo(P + W - R, P);
          ctx.arcTo(P + W, P, P + W, P + R, R);
          ctx.lineTo(P + W, P + W - R);
          ctx.arcTo(P + W, P + W - R, P + W, R);
          ctx.lineTo(P + R, P + W);
          ctx.arcTo(P, P + W, P, P + W - R, R);
          ctx.lineTo(P, P + R);
          ctx.arcTo(P, P, P + R, P, R);
          ctx.closePath();
        }
      } else {
        // 'circle' (Mặc định - Khớp 100% với huy hiệu tròn của Manga Crawler & Electron)
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
      }

      // Giới hạn vùng vẽ bên trong khung đã cắt
      ctx.save();
      ctx.clip();

      let drawW;
      let drawH;
      let drawX;
      let drawY;

      if (mode === 'contain') {
        // Thu nhỏ toàn bộ ảnh vừa vặn trong khung
        const scale = Math.min(W / w, W / h);
        drawW = w * scale;
        drawH = h * scale;
        drawX = P + (W - drawW) / 2;
        drawY = P + (W - drawH) / 2;
      } else {
        // 'cover' (Mặc định): Căn giữa và lấp đầy khung hình tròn
        const scale = Math.max(W / w, W / h);
        drawW = w * scale;
        drawH = h * scale;
        drawX = P + (W - drawW) / 2;
        drawY = P + (W - drawH) / 2;
      }

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();

      // Viền mờ định hình mép khung đồng bộ với icon Manga Crawler mặc định
      ctx.beginPath();
      if (shape === 'squircle') {
        const R = Math.round(W * 0.2237);
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(P + 0.5, P + 0.5, W - 1, W - 1, R);
        } else {
          ctx.moveTo(P + 0.5 + R, P + 0.5);
          ctx.lineTo(P + W - 0.5 - R, P + 0.5);
          ctx.arcTo(P + W - 0.5, P + 0.5, P + W - 0.5, P + 0.5 + R, R);
          ctx.lineTo(P + W - 0.5, P + W - 0.5 - R);
          ctx.arcTo(P + W - 0.5, P + W - 0.5 - R, P + W - 0.5, R);
          ctx.lineTo(P + 0.5 + R, P + W - 0.5);
          ctx.arcTo(P + 0.5, P + W - 0.5, P + W - 0.5 - R, R);
          ctx.lineTo(P + 0.5, P + 0.5 + R);
          ctx.arcTo(P + 0.5, P + 0.5, P + 0.5 + R, P + 0.5, R);
          ctx.closePath();
        }
        ctx.strokeStyle = 'rgba(20, 32, 48, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(20, 32, 48, 0.25)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      try {
        const squareDataUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl: squareDataUrl, width: w, height: h });
      } catch (_) {
        resolve({ dataUrl: srcDataUrl, width: w, height: h });
      }
    };
    img.onerror = () => {
      reject(new Error('settings.branding.errorDecodeFailed'));
    };
    img.src = srcDataUrl;
  });
}

export default function BrandingSettingsSection({
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
} = {}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const handleToggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const {
    appName,
    defaultAppName,
    iconType,
    showTitleBarIcon = true,
    customIconDataUrl,
    defaultAppDataUrl,
    defaultElectronDataUrl,
    setBranding,
    resetBranding,
    pickIconFile,
  } = useBranding();

  const { t } = useI18n();

  const resolveErrorMessage = (rawError) => {
    if (!rawError) return '';
    const errStr = String(rawError);
    if (errStr.startsWith('settings.branding.error')) {
      return t(errStr);
    }
    return t('settings.branding.errorGeneric');
  };

  // Local draft states
  const [draftName, setDraftName] = useState(appName);
  const [draftIconType, setDraftIconType] = useState(iconType);
  const [draftShowTitleBarIcon, setDraftShowTitleBarIcon] = useState(showTitleBarIcon);
  const [draftCustomDataUrl, setDraftCustomDataUrl] = useState(customIconDataUrl);
  const [rawSourceDataUrl, setRawSourceDataUrl] = useState(null);
  const [shapeStyle, setShapeStyle] = useState('circle'); // 'circle' | 'squircle'
  const [cropMode, setCropMode] = useState('cover'); // 'cover' | 'contain'

  const [fileMeta, setFileMeta] = useState(null);
  const [fileNotice, setFileNotice] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  // Sync draft state when context values update from external source
  useEffect(() => {
    setDraftName(appName);
  }, [appName]);

  useEffect(() => {
    setDraftIconType(iconType);
  }, [iconType]);

  useEffect(() => {
    setDraftShowTitleBarIcon(showTitleBarIcon);
  }, [showTitleBarIcon]);

  useEffect(() => {
    setDraftCustomDataUrl(customIconDataUrl);
  }, [customIconDataUrl]);

  // Check if draft has unsaved changes
  const hasChanges = useMemo(() => {
    if (draftName !== appName) return true;
    if (draftIconType !== iconType) return true;
    if (draftShowTitleBarIcon !== showTitleBarIcon) return true;
    if (draftIconType === 'custom' && draftCustomDataUrl !== customIconDataUrl) return true;
    return false;
  }, [draftName, appName, draftIconType, iconType, draftShowTitleBarIcon, showTitleBarIcon, draftCustomDataUrl, customIconDataUrl]);

  // Compute live preview icon source
  const previewIconSrc = useMemo(() => {
    if (draftIconType === 'custom' && draftCustomDataUrl) {
      return draftCustomDataUrl;
    }
    if (draftIconType === 'electron') {
      return defaultElectronDataUrl || '/data/electron-icon.png';
    }
    return defaultAppDataUrl || '/data/icon.png';
  }, [draftIconType, draftCustomDataUrl, defaultElectronDataUrl, defaultAppDataUrl]);

  const handlePickCustomFile = async () => {
    setErrorMsg('');
    setFileNotice('');
    try {
      const res = await pickIconFile();
      if (!res || res.canceled) {
        return;
      }
      if (!res.ok || res.error) {
        setErrorMsg(resolveErrorMessage(res.error));
        return;
      }
      if (res.dataUrl) {
        setRawSourceDataUrl(res.dataUrl);

        // Tự động xử lý ảnh thành hình tròn hoàn chỉnh chuẩn Manga Crawler
        const processed = await processIconToShape(res.dataUrl, shapeStyle, cropMode);

        const displayWidth = res.width || processed.width;
        const displayHeight = res.height || processed.height;

        setDraftCustomDataUrl(processed.dataUrl);
        setDraftIconType('custom');
        setFileMeta({
          name: res.fileName,
          width: displayWidth,
          height: displayHeight,
        });

        setFileNotice(
          t('settings.branding.fileSelectedSuccess', {
            name: res.fileName,
            width: displayWidth,
            height: displayHeight,
          })
        );
      }
    } catch (err) {
      console.error('[BrandingSettingsSection] Error picking image:', err);
      setErrorMsg(resolveErrorMessage(err?.message));
    }
  };

  const reprocessImage = async (newShape, newMode) => {
    const sourceToUse = rawSourceDataUrl || draftCustomDataUrl;
    if (sourceToUse) {
      try {
        const processed = await processIconToShape(sourceToUse, newShape, newMode);
        setDraftCustomDataUrl(processed.dataUrl);
      } catch (err) {
        console.error('[reprocessImage]', err);
      }
    }
  };

  const handleShapeChange = async (newShape) => {
    if (newShape === shapeStyle) return;
    setShapeStyle(newShape);
    await reprocessImage(newShape, cropMode);
  };

  const handleModeChange = async (newMode) => {
    if (newMode === cropMode) return;
    setCropMode(newMode);
    await reprocessImage(shapeStyle, newMode);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await setBranding({
        appName: draftName,
        iconType: draftIconType,
        showTitleBarIcon: draftShowTitleBarIcon,
        customIconDataUrl: draftIconType === 'custom' ? draftCustomDataUrl : undefined,
      });
      if (res?.ok) {
        setFileNotice('');
        setToastMsg(t('settings.branding.saved'));
        setTimeout(() => setToastMsg(''), 3000);
      } else {
        setErrorMsg(resolveErrorMessage(res?.error || 'settings.branding.errorSaveFailed'));
      }
    } catch (err) {
      setErrorMsg(resolveErrorMessage(err?.message));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    setIsSaving(true);
    setShowResetModal(false);
    setErrorMsg('');
    setFileNotice('');
    setFileMeta(null);
    setRawSourceDataUrl(null);
    setShapeStyle('circle');
    setCropMode('cover');
    try {
      const res = await resetBranding();
      if (res?.ok) {
        setDraftName(defaultAppName);
        setDraftIconType('app');
        setDraftShowTitleBarIcon(true);
        setDraftCustomDataUrl(null);
        setToastMsg(t('settings.branding.saved'));
        setTimeout(() => setToastMsg(''), 3000);
      } else {
        setErrorMsg(resolveErrorMessage(res?.error || 'settings.branding.errorGeneric'));
      }
    } catch (err) {
      setErrorMsg(resolveErrorMessage(err?.message));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      className={`rounded-2xl border border-outline-variant/15 bg-surface-container-low/60 shadow-xs transition-all duration-200 ${
        isCollapsed ? 'p-4' : 'p-5 space-y-5'
      }`}
    >
      {/* Header */}
      <div
        onClick={handleToggle}
        className={`flex items-center justify-between gap-3 select-none cursor-pointer transition-colors group ${
          isCollapsed ? '' : 'pb-3 border-b border-outline-variant/10'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0 transition-transform duration-150 group-hover:scale-105">
            <span className="material-symbols-outlined text-[20px]">branding_watermark</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-on-surface tracking-tight truncate group-hover:text-primary transition-colors">
              {t('settings.section.branding')}
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">
              {t('settings.branding.hint')}
            </p>
          </div>
        </div>

        {/* Collapse / Expand Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          title={isCollapsed ? t('settings.expandSection') : t('settings.collapseSection')}
          aria-label={isCollapsed ? t('settings.expandSection') : t('settings.collapseSection')}
          className="size-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-150 cursor-pointer shrink-0"
        >
          <span
            className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
              isCollapsed ? 'rotate-0 text-on-surface-variant' : 'text-primary'
            }`}
          >
            {isCollapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Live Preview Container */}
      <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
            {t('settings.branding.previewTitle')}
          </span>
          {hasChanges && (
            <span className="text-[11px] font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {t('settings.branding.unsaved')}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest/80 overflow-hidden shadow-inner">
          <div className="h-10 px-3.5 flex items-center justify-between bg-surface-container-low/90 border-b border-outline-variant/15 select-none">
            {/* TitleBar Brand Mockup (Khớp 100% TitleBar thực tế của ứng dụng) */}
            <div className="flex items-center gap-2.5 max-w-[75%] truncate">
              {draftShowTitleBarIcon && (
                <img
                  src={previewIconSrc}
                  alt="Preview Icon"
                  className="w-5 h-5 object-contain rounded-full shrink-0 transition-transform duration-200"
                />
              )}
              {draftName.trim() === '' ? (
                <span className="text-[11px] italic text-on-surface-variant/40 font-normal">
                  ({t('settings.branding.appNamePlaceholder')})
                </span>
              ) : (
                <span className="text-xs font-bold text-on-surface truncate tracking-tight">
                  {draftName}
                </span>
              )}
            </div>

            {/* Window Controls Mockup (- □ ✕) */}
            <div className="flex items-center gap-0.5 text-on-surface-variant/60">
              <div className="size-6 rounded-md flex items-center justify-center">
                <span className="material-symbols-outlined text-[15px] leading-none">minimize</span>
              </div>
              <div className="size-6 rounded-md flex items-center justify-center">
                <span className="material-symbols-outlined text-[13px] leading-none">crop_square</span>
              </div>
              <div className="size-6 rounded-md flex items-center justify-center">
                <span className="material-symbols-outlined text-[15px] leading-none">close</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* App Name Input */}
      <div className="space-y-2 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
          {t('settings.branding.appNameLabel')}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('settings.branding.appNamePlaceholder')}
            className="flex-1 h-10 px-3.5 rounded-xl bg-surface-container-highest border border-outline-variant/25 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
          />
          <button
            type="button"
            onClick={() => setDraftName(defaultAppName)}
            title={t('settings.branding.defaultBtn')}
            className="h-10 px-3 rounded-xl border border-outline-variant/20 bg-surface-container-high hover:bg-surface-bright text-xs font-medium text-on-surface transition-colors cursor-pointer shrink-0"
          >
            {t('settings.branding.defaultBtn')}
          </button>
          <button
            type="button"
            onClick={() => setDraftName('')}
            title={t('settings.branding.blankBtn')}
            className="h-10 px-3 rounded-xl border border-outline-variant/20 bg-surface-container-high hover:bg-surface-bright text-xs font-medium text-on-surface transition-colors cursor-pointer shrink-0"
          >
            {t('settings.branding.blankBtn')}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant/70 leading-relaxed">
          {t('settings.branding.appNameHelp')}
        </p>
      </div>

      {/* Toggle Show TitleBar Icon */}
      <div className="p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
        <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
          <div className="space-y-0.5 min-w-0 flex-1">
            <span className="text-xs font-bold text-on-surface block tracking-tight">
              {t('settings.branding.showTitleBarIconLabel')}
            </span>
            <p className="text-xs text-on-surface-variant/70 leading-relaxed">
              {t('settings.branding.showTitleBarIconHelp')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draftShowTitleBarIcon}
            onClick={() => setDraftShowTitleBarIcon((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              draftShowTitleBarIcon ? 'bg-primary' : 'bg-outline-variant/40'
            }`}
          >
            <span
              className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                draftShowTitleBarIcon ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Icon Type Selection */}
      <div className="space-y-3 p-3.5 rounded-xl bg-surface-container-highest/40 border border-outline-variant/10">
        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
          {t('settings.branding.iconLabel')}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 1. Manga Crawler Default */}
          <button
            type="button"
            onClick={() => setDraftIconType('app')}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 select-none ${
              draftIconType === 'app'
                ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-xs'
                : 'border-outline-variant/25 bg-surface-container-highest/50 hover:bg-surface-container-highest/80 hover:border-outline-variant/50'
            }`}
          >
            <div className="size-10 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 p-1 flex items-center justify-center shrink-0">
              <img
                src={defaultAppDataUrl || '/data/icon.png'}
                alt="Manga Crawler"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-on-surface truncate">
                {t('settings.branding.iconDefaultApp')}
              </p>
              <p className="text-[11px] text-on-surface-variant/70 truncate">
                {t('settings.branding.iconDefaultAppSub')}
              </p>
            </div>
            {draftIconType === 'app' && (
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                check_circle
              </span>
            )}
          </button>

          {/* 2. Electron Atom Default */}
          <button
            type="button"
            onClick={() => setDraftIconType('electron')}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 select-none ${
              draftIconType === 'electron'
                ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-xs'
                : 'border-outline-variant/25 bg-surface-container-highest/50 hover:bg-surface-container-highest/80 hover:border-outline-variant/50'
            }`}
          >
            <div className="size-10 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 p-1 flex items-center justify-center shrink-0">
              <img
                src={defaultElectronDataUrl || '/data/electron-icon.png'}
                alt="Electron"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-on-surface truncate">
                {t('settings.branding.iconDefaultElectron')}
              </p>
              <p className="text-[11px] text-on-surface-variant/70 truncate">
                {t('settings.branding.iconDefaultElectronSub')}
              </p>
            </div>
            {draftIconType === 'electron' && (
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                check_circle
              </span>
            )}
          </button>

          {/* 3. Custom Upload */}
          <button
            type="button"
            onClick={() => setDraftIconType('custom')}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 select-none ${
              draftIconType === 'custom'
                ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-xs'
                : 'border-outline-variant/25 bg-surface-container-highest/50 hover:bg-surface-container-highest/80 hover:border-outline-variant/50'
            }`}
          >
            <div className="size-10 rounded-xl bg-surface-container-lowest/80 border border-outline-variant/20 p-1 flex items-center justify-center shrink-0 overflow-hidden">
              {draftCustomDataUrl ? (
                <img
                  src={draftCustomDataUrl}
                  alt="Custom"
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="material-symbols-outlined text-outline-variant text-[22px]">
                  image
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-on-surface truncate">
                {t('settings.branding.iconCustom')}
              </p>
              <p className="text-[11px] text-on-surface-variant/70 truncate">
                {t('settings.branding.iconCustomSub')}
              </p>
            </div>
            {draftIconType === 'custom' && (
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                check_circle
              </span>
            )}
          </button>
        </div>

        {/* Custom Icon Action, Preview & Guidance */}
        {draftIconType === 'custom' && (
          <div className="space-y-4 pt-2 p-4 rounded-xl bg-surface-container-highest/60 border border-outline-variant/15">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-14 rounded-2xl bg-surface-container-lowest/90 border border-outline-variant/20 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                  {draftCustomDataUrl ? (
                    <img
                      src={draftCustomDataUrl}
                      alt="Custom Preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-outline-variant text-[28px]">
                      add_photo_alternate
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-on-surface">
                    {draftCustomDataUrl ? (fileMeta?.name ? fileMeta.name : t('settings.branding.customSelected')) : t('settings.branding.customNotSelected')}
                  </p>
                  <p className="text-[11px] text-on-surface-variant/70">
                    {t('settings.branding.uploadHelp')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePickCustomFile}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">upload_file</span>
                <span>{t('settings.branding.uploadBtn')}</span>
              </button>
            </div>

            {/* Shape Style & Fit Mode Controls */}
            {draftCustomDataUrl && (
              <div className="space-y-3 pt-3 border-t border-outline-variant/15">
                {/* Shape Style */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                    {t('settings.branding.shapeLabel')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleShapeChange('circle')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        shapeStyle === 'circle'
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/10 shadow-xs'
                          : 'border-outline-variant/20 bg-surface-container-high/40 hover:bg-surface-container-high/80'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${shapeStyle === 'circle' ? 'text-primary' : 'text-on-surface-variant'}`}>
                        radio_button_checked
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${shapeStyle === 'circle' ? 'text-primary' : 'text-on-surface'}`}>
                          {t('settings.branding.shapeCircle')}
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 leading-tight mt-0.5">
                          {t('settings.branding.shapeCircleSub')}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShapeChange('squircle')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        shapeStyle === 'squircle'
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/10 shadow-xs'
                          : 'border-outline-variant/20 bg-surface-container-high/40 hover:bg-surface-container-high/80'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${shapeStyle === 'squircle' ? 'text-primary' : 'text-on-surface-variant'}`}>
                        check_box_outline_blank
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${shapeStyle === 'squircle' ? 'text-primary' : 'text-on-surface'}`}>
                          {t('settings.branding.shapeSquircle')}
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 leading-tight mt-0.5">
                          {t('settings.branding.shapeSquircleSub')}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Fit Mode */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
                    {t('settings.branding.fitModeLabel')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleModeChange('cover')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        cropMode === 'cover'
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/10 shadow-xs'
                          : 'border-outline-variant/20 bg-surface-container-high/40 hover:bg-surface-container-high/80'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${cropMode === 'cover' ? 'text-primary' : 'text-on-surface-variant'}`}>
                        crop_free
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${cropMode === 'cover' ? 'text-primary' : 'text-on-surface'}`}>
                          {t('settings.branding.fitModeCover')}
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 leading-tight mt-0.5">
                          {t('settings.branding.fitModeCoverSub')}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleModeChange('contain')}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        cropMode === 'contain'
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/10 shadow-xs'
                          : 'border-outline-variant/20 bg-surface-container-high/40 hover:bg-surface-container-high/80'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${cropMode === 'contain' ? 'text-primary' : 'text-on-surface-variant'}`}>
                        fit_screen
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold ${cropMode === 'contain' ? 'text-primary' : 'text-on-surface'}`}>
                          {t('settings.branding.fitModeContain')}
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 leading-tight mt-0.5">
                          {t('settings.branding.fitModeContainSub')}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Validation & Feedback Notices */}
            {fileNotice && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined text-[16px] shrink-0">check_circle</span>
                <span>{fileNotice}</span>
              </div>
            )}

            {draftCustomDataUrl && (
              <p className="text-[11px] text-on-surface-variant/70 italic">
                {t('settings.branding.previewUpdatedNotice')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Global Toast & Error Messages */}
      {toastMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-200">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-600 dark:text-red-400">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setShowResetModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">restart_alt</span>
          <span>{t('settings.branding.resetBtn')}</span>
        </button>

        <button
          type="button"
          disabled={isSaving || !hasChanges}
          onClick={handleSave}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer ${
            hasChanges
              ? 'bg-primary text-on-primary shadow-xs hover:bg-primary/90'
              : 'bg-surface-container-highest text-on-surface-variant/50 border border-outline-variant/15 pointer-events-none'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">save</span>
          <span>{isSaving ? t('settings.branding.saving') : t('settings.branding.saveBtn')}</span>
        </button>
      </div>
        </>
      )}

      {/* Custom Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <span className="material-symbols-outlined text-[28px]">warning</span>
              <h3 className="text-base font-bold text-on-surface">
                {t('settings.branding.resetBtn')}
              </h3>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {t('settings.branding.resetConfirm')}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 cursor-pointer transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 cursor-pointer shadow-xs transition-colors"
              >
                {t('settings.branding.resetBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
