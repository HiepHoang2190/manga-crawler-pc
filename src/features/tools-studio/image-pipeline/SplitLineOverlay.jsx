// src/features/tools-studio/image-pipeline/SplitLineOverlay.jsx
import { useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';

const clampRatio = (v) => Math.max(0.05, Math.min(0.95, v));

export default function SplitLineOverlay({ imageSrc, topRatio, bottomRatio, onChange, hidden = false, disabled = false }) {
  const { t } = useI18n();
  const wrapRef = useRef(null);
  const dragRef = useRef(null);

  const ratioFromEvent = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return clampRatio((e.clientX - rect.left) / rect.width);
  };

  const startDrag = (handle) => (e) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { handle, startRatio: ratioFromEvent(e), top: topRatio, bottom: bottomRatio };
  };

  const onMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const r = ratioFromEvent(e);
    if (drag.handle === 'top') onChange({ topRatio: r, bottomRatio });
    else if (drag.handle === 'bottom') onChange({ topRatio, bottomRatio: r });
    else {
      const delta = r - drag.startRatio;
      onChange({ topRatio: clampRatio(drag.top + delta), bottomRatio: clampRatio(drag.bottom + delta) });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleClass =
    'absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-on-primary bg-primary shadow cursor-ew-resize touch-none';

  return (
    <div ref={wrapRef} className="relative inline-block max-h-full max-w-full select-none" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <img src={imageSrc} alt="" draggable={false} className="block max-h-[calc(100vh-180px)] max-w-full object-contain" />
      {!hidden && (
        <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1={topRatio * 100} y1="0" x2={bottomRatio * 100} y2="100" stroke="var(--color-primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          <div
            className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-move touch-none"
            style={{ left: `${((topRatio + bottomRatio) / 2) * 100}%` }}
            onPointerDown={startDrag('line')}
          />
          <div
            role="slider"
            aria-valuenow={Math.round(topRatio * 100)}
            aria-label={t('imagePipeline.modal.splitHandleTop')}
            data-tooltip={t('imagePipeline.modal.splitHandleTop')}
            className={`${handleClass} -top-2`}
            style={{ left: `${topRatio * 100}%` }}
            onPointerDown={startDrag('top')}
          />
          <div
            role="slider"
            aria-valuenow={Math.round(bottomRatio * 100)}
            aria-label={t('imagePipeline.modal.splitHandleBottom')}
            data-tooltip={t('imagePipeline.modal.splitHandleBottom')}
            className={`${handleClass} -bottom-2`}
            style={{ left: `${bottomRatio * 100}%` }}
            onPointerDown={startDrag('bottom')}
          />
        </>
      )}
    </div>
  );
}
