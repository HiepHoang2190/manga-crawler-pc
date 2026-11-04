// src/features/tools-studio/image-pipeline/PipelinePreviewModal.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import InteractiveCropOverlay from '../../export/crop/InteractiveCropOverlay';
import usePipelinePreview from './usePipelinePreview';
import SplitLineOverlay from './SplitLineOverlay';
import { StepOverlay } from './PipelinePreviewPanel';
import { ACTION_TYPES } from './actionTypes';
import { formatBytes } from './imageListModel';
import {
  setOverride, clearOverride, clearOverrideParam, confirmOverride, toBackendOverrides, pxBoxToRatio, ratioBoxToPx,
} from './overrides';

const HISTORY_GAP_MS = 400;

export default function PipelinePreviewModal({
  api, images, index, onIndexChange, onClose, actions, stackActions, overrides, onOverridesChange, output, initialStepIndex = null,
}) {
  const { t } = useI18n();
  const image = images[index];
  const filePath = image?.absolutePath;
  const [view, setView] = useState(() => (Number.isInteger(initialStepIndex) ? initialStepIndex : 'final'));
  const [frameIndex, setFrameIndex] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const historyRef = useRef({});

  const stepIndex = Number.isInteger(view) ? view : null;
  const stepAction = stepIndex !== null ? stackActions[stepIndex] : null;
  const fileMap = useMemo(() => overrides[filePath] || {}, [overrides, filePath]);
  const backendFileOverrides = useMemo(() => toBackendOverrides(fileMap), [fileMap]);
  const entry = stepAction ? fileMap[stepAction.id] : null;
  const splitBefore = stepIndex !== null && stackActions.slice(0, stepIndex).some((a) => a.enabled && a.type === 'splitPage');

  const request = useMemo(() => {
    if (view === 'source') return { mode: 'stepInput', upToStep: 0 };
    if (stepIndex === null) return showOriginal ? { mode: 'stepInput', upToStep: 0 } : { mode: 'final', upToStep: null };
    if (stepAction?.type === 'deskew') return { mode: showOriginal ? 'stepInput' : 'stepOutput', upToStep: stepIndex };
    return { mode: 'stepInput', upToStep: stepIndex };
  }, [view, stepIndex, stepAction, showOriginal]);

  const { loading, data, error } = usePipelinePreview({
    api,
    filePath,
    fileIndex: index,
    actions,
    fileOverrides: backendFileOverrides,
    upToStep: actions.length ? request.upToStep : null,
    mode: actions.length ? request.mode : 'final',
    frameIndex: splitBefore ? frameIndex ?? 0 : null,
    output,
  });

  useEffect(() => {
    setFrameIndex(null);
  }, [filePath, view]);

  const commit = useCallback(
    (updater) => {
      onOverridesChange((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        const h = historyRef.current[filePath] || { past: [], future: [], last: 0 };
        const now = Date.now();
        if (now - h.last > HISTORY_GAP_MS) h.past.push(prev[filePath] || null);
        h.future = [];
        h.last = now;
        historyRef.current[filePath] = h;
        return next;
      });
    },
    [onOverridesChange, filePath]
  );

  const restore = useCallback(
    (direction) => {
      const h = historyRef.current[filePath];
      if (!h) return;
      const from = direction === 'undo' ? h.past : h.future;
      const to = direction === 'undo' ? h.future : h.past;
      if (from.length === 0) return;
      const snapshot = from.pop();
      to.push(overrides[filePath] || null);
      h.last = 0;
      onOverridesChange((prev) => {
        const next = { ...prev };
        if (snapshot) next[filePath] = snapshot;
        else delete next[filePath];
        return next;
      });
    },
    [onOverridesChange, filePath, overrides]
  );

  const stepKeys = useMemo(() => ['source', ...stackActions.map((_, i) => i), 'final'], [stackActions]);

  useEffect(() => {
    const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1);
      else if (e.key === '[' || e.key === ']') {
        const pos = stepKeys.indexOf(view);
        const nextPos = Math.max(0, Math.min(stepKeys.length - 1, pos + (e.key === ']' ? 1 : -1)));
        setView(stepKeys[nextPos]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        restore(e.shiftKey ? 'redo' : 'undo');
      } else if (e.code === 'Space') {
        e.preventDefault();
        setShowOriginal(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') setShowOriginal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onClose, onIndexChange, index, images.length, stepKeys, view, restore]);

  if (!image) return null;

  const frame = data?.frames?.[0];
  const autoInfo = data?.stepInfo?.frames?.[0];
  const singleFrame = data?.frames?.length === 1;

  const renderCanvas = () => {
    if (!data?.dataUrl) return null;
    if (stepAction?.type === 'crop' && singleFrame && frame) {
      const ratio = entry?.params?.boxRatio || autoInfo?.boxRatio || { left: 0, top: 0, width: 1, height: 1 };
      return (
        <InteractiveCropOverlay
          imageSrc={data.dataUrl}
          originalWidth={frame.width}
          originalHeight={frame.height}
          cropBox={ratioBoxToPx(ratio, frame.width, frame.height)}
          showOriginal={showOriginal}
          onChangeCropBox={(box) => commit((prev) => setOverride(prev, filePath, stepAction.id, { params: { boxRatio: pxBoxToRatio(box, frame.width, frame.height) } }))}
        />
      );
    }
    if (stepAction?.type === 'splitPage' && singleFrame) {
      const custom = entry?.params?.customSplit;
      const topRatio = custom?.topRatio ?? autoInfo?.topRatio ?? 0.5;
      const bottomRatio = custom?.bottomRatio ?? autoInfo?.bottomRatio ?? topRatio;
      return (
        <SplitLineOverlay
          imageSrc={data.dataUrl}
          topRatio={topRatio}
          bottomRatio={bottomRatio}
          hidden={showOriginal}
          onChange={(customSplit) => commit((prev) => setOverride(prev, filePath, stepAction.id, { params: { customSplit, force: 'split' } }))}
        />
      );
    }
    return (
      <div className="relative inline-block max-h-full max-w-full">
        <img src={data.dataUrl} alt={image.relativePath} draggable={false} className="block max-h-[calc(100vh-180px)] max-w-full object-contain" />
        {stepAction?.type === 'deskew' && !showOriginal && (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_calc(10%-1px),var(--color-primary)_10%,transparent_calc(10%+1px))] bg-[length:100%_10%] opacity-40" />
        )}
        {stepAction && stepAction.type !== 'deskew' && !showOriginal && singleFrame && <StepOverlay stepType={stepAction.type} stepInfo={data.stepInfo} />}
      </div>
    );
  };

  const renderStepControls = () => {
    if (!stepAction) return <p className="text-xs text-on-surface-variant">{t('imagePipeline.modal.noToolForStep')}</p>;
    const skip = entry?.enabled === false;
    const hasCustom = Boolean(entry);
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant/15 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">
            {t('imagePipeline.modal.thisImage')}
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${
              hasCustom
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                : 'border-outline-variant/20 bg-surface-container-highest/40 text-on-surface-variant/60'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">{hasCustom ? 'tune' : 'check_circle'}</span>
            <span>{hasCustom ? t('imagePipeline.modal.statusCustom') : t('imagePipeline.modal.statusDefault')}</span>
          </span>
        </div>

        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high/60 p-2.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">info</span>
          <p className="flex-1 min-w-0">{t('imagePipeline.modal.scopeHint')}</p>
        </div>

        {entry?.stale && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-300">
            <div className="flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0">warning</span>
              <p className="flex-1 min-w-0">{t('imagePipeline.modal.staleNotice')}</p>
            </div>
            <button
              type="button"
              onClick={() => commit((prev) => confirmOverride(prev, filePath, stepAction.id))}
              className="rounded-md bg-amber-500/20 px-2 py-1 font-semibold text-amber-700 dark:text-amber-200 cursor-pointer hover:bg-amber-500/30 transition-colors"
            >
              {t('imagePipeline.modal.confirm')}
            </button>
          </div>
        )}

        {splitBefore && (
          <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
            {t('imagePipeline.modal.afterSplitNotice')}
          </p>
        )}

        {stepAction?.type === 'crop' && autoInfo?.skipped && !entry && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-[11px] leading-relaxed text-primary flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">info</span>
            <p className="flex-1 min-w-0">{t('imagePipeline.crop.skippedNotice')}</p>
          </div>
        )}

        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-highest/40 p-2.5 space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-on-surface font-medium cursor-pointer">
            <input
              type="checkbox"
              className="rounded accent-primary"
              checked={skip}
              onChange={(e) => commit((prev) => setOverride(prev, filePath, stepAction.id, { enabled: !e.target.checked }))}
            />
            <span>{t('imagePipeline.modal.skipStep')}</span>
          </label>
          <p className="text-[11px] text-on-surface-variant/70 pl-5 leading-normal">
            {t('imagePipeline.modal.skipStepHint')}
          </p>
        </div>

        {stepAction.type === 'deskew' && (
          <div className="space-y-2 rounded-lg border border-outline-variant/20 bg-surface-container-highest/40 p-2.5">
            <div className="flex items-start gap-1.5 text-[11px] text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-primary shrink-0">straighten</span>
              <p className="flex-1 min-w-0">{t('imagePipeline.modal.deskewHint')}</p>
            </div>
            <label className="block space-y-1 text-xs text-on-surface">
              <span>{t('imagePipeline.modal.angle', { value: (entry?.params?.angle ?? autoInfo?.angle ?? 0).toFixed(1) })}</span>
              <input
                type="range"
                min={-15}
                max={15}
                step={0.1}
                value={entry?.params?.angle ?? autoInfo?.angle ?? 0}
                onChange={(e) => commit((prev) => setOverride(prev, filePath, stepAction.id, { params: { angle: Number(e.target.value) } }))}
                className="w-full accent-primary"
              />
            </label>
            {entry?.params?.angle !== undefined && (
              <button
                type="button"
                onClick={() =>
                  commit((prev) => {
                    const next = clearOverrideParam(prev, filePath, stepAction.id, 'angle');
                    const entryAfter = next[filePath]?.[stepAction.id];
                    if (entryAfter && (!entryAfter.params || Object.keys(entryAfter.params).length === 0) && entryAfter.enabled === undefined) {
                      return clearOverride(prev, filePath, stepAction.id);
                    }
                    return next;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                <span>{t('imagePipeline.modal.useDetected', { value: autoInfo?.manual ? '—' : (autoInfo?.angle ?? 0).toFixed(1) })}</span>
              </button>
            )}
          </div>
        )}

        {stepAction.type === 'crop' && (
          <div className="space-y-2 rounded-lg border border-outline-variant/20 bg-surface-container-highest/40 p-2.5 text-[11px] text-on-surface-variant">
            <div className="flex items-start gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary shrink-0">crop</span>
              <p className="flex-1 min-w-0">{t('imagePipeline.modal.cropHint')}</p>
            </div>
            {entry?.params?.boxRatio && (
              <button
                type="button"
                onClick={() =>
                  commit((prev) => {
                    const next = clearOverrideParam(prev, filePath, stepAction.id, 'boxRatio');
                    const entryAfter = next[filePath]?.[stepAction.id];
                    if (entryAfter && (!entryAfter.params || Object.keys(entryAfter.params).length === 0) && entryAfter.enabled === undefined) {
                      return clearOverride(prev, filePath, stepAction.id);
                    }
                    return next;
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                <span>{t('imagePipeline.modal.useAutoCrop')}</span>
              </button>
            )}
          </div>
        )}

        {stepAction.type === 'splitPage' && (
          <div className="space-y-2 rounded-lg border border-outline-variant/20 bg-surface-container-highest/40 p-2.5">
            <div className="flex items-start gap-1.5 text-[11px] text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-primary shrink-0">vertical_split</span>
              <p className="flex-1 min-w-0">{t('imagePipeline.modal.splitHint')}</p>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {[
                { key: 'auto', label: t('imagePipeline.modal.splitAuto') },
                { key: 'split', label: t('imagePipeline.modal.splitForce') },
                { key: 'keep', label: t('imagePipeline.modal.splitKeep') },
              ].map((opt) => {
                const current = entry?.params?.force || 'auto';
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      commit((prev) => {
                        if (opt.key === 'auto') return clearOverrideParam(clearOverrideParam(prev, filePath, stepAction.id, 'force'), filePath, stepAction.id, 'customSplit');
                        return setOverride(prev, filePath, stepAction.id, { params: { force: opt.key } });
                      })
                    }
                    className={`rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ${
                      current === opt.key
                        ? 'border-primary bg-primary/15 text-primary font-semibold'
                        : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {entry && (
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={() => commit((prev) => clearOverride(prev, filePath, stepAction.id))}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-high/60 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">restart_alt</span>
              <span>{t('imagePipeline.modal.resetToGlobal')}</span>
            </button>
            <p className="text-center text-[10px] text-on-surface-variant/60 leading-normal">
              {t('imagePipeline.modal.resetHint')}
            </p>
          </div>
        )}
      </div>
    );
  };

  const stepLabel = (key) => {
    if (key === 'source') return t('imagePipeline.modal.source');
    if (key === 'final') return t('imagePipeline.modal.result');
    return t(ACTION_TYPES[stackActions[key].type].labelKey);
  };

  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30 cursor-pointer transition-colors';

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex flex-col bg-surface text-on-surface select-none overflow-hidden animate-in fade-in-0 duration-150">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-low/70 backdrop-blur px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onIndexChange(index - 1)} data-tooltip={t('imagePipeline.modal.prev')} aria-label={t('imagePipeline.modal.prev')}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="truncate text-sm font-medium text-on-surface">{image.relativePath}</span>
          <span className="shrink-0 text-xs text-on-surface-variant/70">{index + 1}/{images.length}</span>
          <button type="button" className={iconBtn} disabled={index === images.length - 1} onClick={() => onIndexChange(index + 1)} data-tooltip={t('imagePipeline.modal.next')} aria-label={t('imagePipeline.modal.next')}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className={iconBtn} onClick={() => restore('undo')} data-tooltip={t('imagePipeline.modal.undo')} aria-label={t('imagePipeline.modal.undo')}>
            <span className="material-symbols-outlined text-[18px]">undo</span>
          </button>
          <button type="button" className={iconBtn} onClick={() => restore('redo')} data-tooltip={t('imagePipeline.modal.redo')} aria-label={t('imagePipeline.modal.redo')}>
            <span className="material-symbols-outlined text-[18px]">redo</span>
          </button>
          <button type="button" className={iconBtn} onClick={onClose} data-tooltip={t('imagePipeline.modal.close')} aria-label={t('imagePipeline.modal.close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 space-y-1 overflow-y-auto border-r border-outline-variant/20 bg-surface-container-lowest/60 p-2 custom-scrollbar mr-1.5">
          {stepKeys.map((key) => {
            const action = Number.isInteger(key) ? stackActions[key] : null;
            const ov = action ? fileMap[action.id] : null;
            const active = view === key;
            return (
              <button
                key={String(key)}
                type="button"
                onClick={() => setView(key)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs cursor-pointer transition-colors ${
                  active
                    ? 'border border-primary/30 bg-primary/15 text-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                } ${action && !action.enabled ? 'opacity-40' : ''}`}
                data-tooltip={action && !action.enabled ? t('imagePipeline.modal.stepDisabled') : undefined}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {key === 'source' ? 'image' : key === 'final' ? 'task_alt' : ACTION_TYPES[action.type].icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{stepLabel(key)}</span>
                {ov && (
                  <span
                    className={`material-symbols-outlined shrink-0 text-[15px] ${
                      ov.stale ? 'text-amber-400' : 'text-cyan-400'
                    }`}
                    data-tooltip={ov.stale ? t('imagePipeline.badge.stale') : t('imagePipeline.modal.manualDot')}
                    aria-label={ov.stale ? t('imagePipeline.badge.stale') : t('imagePipeline.modal.manualDot')}
                  >
                    {ov.stale ? 'warning' : 'tune'}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-4 bg-surface-container-lowest/40">
          {splitBefore && (
            <div className="flex items-center gap-1 rounded-lg bg-surface-container-highest/60 p-1 text-xs">
              {[0, 1].map((i) => {
                const suffix = i === 0 ? '-a' : '-b';
                const base = image?.relativePath ? image.relativePath.replace(/\.[^/.]+$/, '') : '';
                const ext = image?.relativePath ? image.relativePath.slice(base.length) : '';
                const expectedName = base ? `${base}${suffix}${ext}` : '';
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFrameIndex(i)}
                    data-tooltip={expectedName ? `${t(i === 0 ? 'imagePipeline.modal.frameATooltip' : 'imagePipeline.modal.frameBTooltip')}: ${expectedName}` : undefined}
                    aria-label={i === 0 ? t('imagePipeline.modal.frameA') : t('imagePipeline.modal.frameB')}
                    className={`rounded-md px-2.5 py-1 cursor-pointer transition-colors ${
                      (frameIndex ?? 0) === i ? 'bg-primary text-on-primary font-semibold shadow-xs' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {i === 0 ? t('imagePipeline.modal.frameA') : t('imagePipeline.modal.frameB')}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center">{renderCanvas()}</div>
          {loading && !showOriginal && <span className="material-symbols-outlined absolute right-4 top-4 animate-spin text-primary">progress_activity</span>}
          {error && !loading && <p className="text-sm text-error">{t('imagePipeline.preview.failed')}</p>}
          <div className="flex items-center gap-3 text-[11px] text-on-surface-variant/70">
            <span>{t('imagePipeline.modal.shortcuts')}</span>
            {data?.estimatedBytes != null && <span className="font-mono text-primary">{t('imagePipeline.preview.estimated', { size: formatBytes(data.estimatedBytes) })}</span>}
          </div>
        </main>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-outline-variant/20 bg-surface-container-lowest/60 p-4 custom-scrollbar mr-1.5">{renderStepControls()}</aside>
      </div>
    </div>,
    document.body
  );
}
