import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import usePipelinePreview from './usePipelinePreview';
import { formatBytes } from './imageListModel';

export function StepOverlay({ stepType, stepInfo }) {
  const info = stepInfo?.frames?.[0];
  if (!info || info.skipped) return null;
  if (stepType === 'crop' && info.boxRatio) {
    const b = info.boxRatio;
    return (
      <div
        className="pointer-events-none absolute border-2 border-dashed border-primary"
        style={{ left: `${b.left * 100}%`, top: `${b.top * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
      />
    );
  }
  if (stepType === 'splitPage' && info.willSplit) {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          x1={info.topRatio * 100}
          y1="0"
          x2={info.bottomRatio * 100}
          y2="100"
          stroke="var(--color-primary)"
          strokeWidth="0.6"
          strokeDasharray="2 1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  return null;
}

export default function PipelinePreviewPanel({ api, image, actions = [], stackActions, fileOverrides, selectedStepIndex, output, onOpenFull }) {
  const { t } = useI18n();
  const [mode, setMode] = useState('final');
  const [showOriginal, setShowOriginal] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [originalData, setOriginalData] = useState(null);
  const originalCacheRef = useRef({});

  const hasStep = Number.isInteger(selectedStepIndex) && selectedStepIndex >= 0;
  const previewMode = hasStep ? mode : 'final';
  const previewStep = hasStep && previewMode === 'stepInput' ? selectedStepIndex : null;

  const { loading, data, error } = usePipelinePreview({
    api,
    filePath: image?.absolutePath,
    fileIndex: image?.index,
    actions,
    fileOverrides,
    upToStep: previewStep,
    mode: previewMode,
    output,
  });

  useEffect(() => {
    if (!image?.absolutePath || !api?.pipelinePreview) {
      setOriginalData(null);
      return undefined;
    }
    const path = image.absolutePath;
    if (originalCacheRef.current[path]) {
      setOriginalData(originalCacheRef.current[path]);
      return undefined;
    }
    if (actions.length === 0) {
      return undefined;
    }
    let cancelled = false;
    api
      .pipelinePreview({
        filePath: path,
        actions: [],
        upToStep: 0,
        mode: 'stepInput',
      })
      .then((res) => {
        if (!cancelled && res?.ok) {
          originalCacheRef.current[path] = res;
          setOriginalData(res);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [image?.absolutePath, api, actions.length]);

  const activeData = showOriginal
    ? (originalData || (actions.length === 0 ? data : null) || originalCacheRef.current[image?.absolutePath] || data)
    : data;

  useEffect(() => {
    if (!image) setHovered(false);
  }, [image]);

  useEffect(() => {
    if (!hovered || !image) return undefined;
    const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const down = (e) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault();
        setShowOriginal(true);
      }
    };
    const up = (e) => {
      if (e.code === 'Space') setShowOriginal(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      setShowOriginal(false);
    };
  }, [hovered, image]);

  if (!image) {
    return <p className="p-4 text-center text-xs text-on-surface-variant">{t('imagePipeline.preview.noImage')}</p>;
  }

  const stepType = hasStep ? stackActions[selectedStepIndex]?.type : null;
  const showOverlay = !showOriginal && previewMode === 'stepInput' && activeData?.frames?.length === 1;

  return (
    <div className="flex h-full flex-col gap-2 p-3" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-container-highest/60 p-1 text-[11px]">
          {['stepInput', 'final'].map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === 'stepInput' && !hasStep}
              onClick={() => setMode(m)}
              className={`rounded-md px-2 py-1 font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                previewMode === m && !showOriginal ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {m === 'stepInput' ? t('imagePipeline.preview.stepInput') : t('imagePipeline.preview.final')}
            </button>
          ))}
        </div>
        {onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-highest hover:text-primary transition-colors cursor-pointer"
            data-tooltip={t('imagePipeline.preview.openFull')}
            aria-label={t('imagePipeline.preview.openFull')}
          >
            <span className="material-symbols-outlined text-[18px]">open_in_full</span>
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest">
        {activeData?.dataUrl && (
          <div className="relative inline-block max-h-full max-w-full" onDoubleClick={onOpenFull}>
            <img src={activeData.dataUrl} alt={image.relativePath} className="block max-h-[calc(100vh-260px)] max-w-full object-contain select-none" draggable={false} />
            {showOverlay && <StepOverlay stepType={stepType} stepInfo={activeData.stepInfo} />}
          </div>
        )}
        {loading && (
          <span className="material-symbols-outlined absolute right-2 top-2 animate-spin text-[18px] text-primary">progress_activity</span>
        )}
        {error && !loading && <p className="p-4 text-center text-xs text-error">{t('imagePipeline.preview.failed')}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
        <span className="truncate">{image.relativePath}</span>
        {activeData?.estimatedBytes != null && previewMode === 'final' && !showOriginal && (
          <span className="shrink-0 font-mono text-primary">{t('imagePipeline.preview.estimated', { size: formatBytes(activeData.estimatedBytes) })}</span>
        )}
      </div>
    </div>
  );
}
