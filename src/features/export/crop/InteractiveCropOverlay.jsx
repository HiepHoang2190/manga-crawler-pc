import React, { useRef, useState, useEffect, useCallback } from 'react';
import { resizeBox, moveBox, clampBox } from './cropGeometry';

export default function InteractiveCropOverlay({
  imageSrc,
  originalWidth,
  originalHeight,
  cropBox,
  onChangeCropBox,
  showOriginal = false,
  disabled = false,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  const [renderedDims, setRenderedDims] = useState({ width: 0, height: 0 });
  const dragStateRef = useRef(null);

  // Measure rendered image dimensions inside container
  const updateRenderedDims = useCallback(() => {
    if (!imgRef.current) return;
    const { clientWidth, clientHeight } = imgRef.current;
    if (clientWidth > 0 && clientHeight > 0) {
      setRenderedDims({ width: clientWidth, height: clientHeight });
    }
  }, []);

  useEffect(() => {
    updateRenderedDims();
    window.addEventListener('resize', updateRenderedDims);
    return () => window.removeEventListener('resize', updateRenderedDims);
  }, [updateRenderedDims]);

  const scaleX = originalWidth > 0 && renderedDims.width > 0 ? renderedDims.width / originalWidth : 1;
  const scaleY = originalHeight > 0 && renderedDims.height > 0 ? renderedDims.height / originalHeight : 1;

  const validBox = clampBox(cropBox, originalWidth, originalHeight);

  // Scaled dimensions for UI display
  const dispLeft = Math.round(validBox.left * scaleX);
  const dispTop = Math.round(validBox.top * scaleY);
  const dispWidth = Math.round(validBox.width * scaleX);
  const dispHeight = Math.round(validBox.height * scaleY);
  const dispRight = dispLeft + dispWidth;
  const dispBottom = dispTop + dispHeight;

  // Pointer drag handling
  const handlePointerDown = (e, type, handle = null) => {
    if (disabled || showOriginal || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    dragStateRef.current = {
      type, // 'move' or 'resize'
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialBox: { ...validBox },
    };

    const handlePointerMove = (moveEvt) => {
      if (!dragStateRef.current) return;
      const { type: dType, handle: dHandle, startX, startY, initialBox } = dragStateRef.current;

      const deltaX = (moveEvt.clientX - startX) / scaleX;
      const deltaY = (moveEvt.clientY - startY) / scaleY;

      let newBox;
      if (dType === 'move') {
        newBox = moveBox(initialBox, deltaX, deltaY, originalWidth, originalHeight);
      } else if (dType === 'resize') {
        newBox = resizeBox(initialBox, dHandle, deltaX, deltaY, originalWidth, originalHeight);
      }

      if (newBox && onChangeCropBox) {
        onChangeCropBox(newBox);
      }
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handles = [
    { id: 'nw', cursor: 'nwse-resize', style: { top: -6, left: -6 } },
    { id: 'n', cursor: 'ns-resize', style: { top: -6, left: '50%', transform: 'translateX(-50%)' } },
    { id: 'ne', cursor: 'nesw-resize', style: { top: -6, right: -6 } },
    { id: 'e', cursor: 'ew-resize', style: { top: '50%', right: -6, transform: 'translateY(-50%)' } },
    { id: 'se', cursor: 'nwse-resize', style: { bottom: -6, right: -6 } },
    { id: 's', cursor: 'ns-resize', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' } },
    { id: 'sw', cursor: 'nesw-resize', style: { bottom: -6, left: -6 } },
    { id: 'w', cursor: 'ew-resize', style: { top: '50%', left: -6, transform: 'translateY(-50%)' } },
  ];

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center justify-center select-none max-h-[calc(100vh-170px)] max-w-[92vw]"
    >
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Crop Target"
        onLoad={updateRenderedDims}
        draggable={false}
        className="max-h-[calc(100vh-170px)] w-auto max-w-full object-contain rounded shadow-2xl pointer-events-none"
      />

      {/* Dimmed Masks and Interactive Box when not in Show Original mode */}
      {renderedDims.width > 0 && renderedDims.height > 0 && !showOriginal && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ width: renderedDims.width, height: renderedDims.height }}
        >
          {/* Top Mask */}
          <div
            className="absolute bg-black/65 transition-colors"
            style={{ top: 0, left: 0, right: 0, height: dispTop }}
          />
          {/* Bottom Mask */}
          <div
            className="absolute bg-black/65 transition-colors"
            style={{ top: dispBottom, left: 0, right: 0, bottom: 0 }}
          />
          {/* Left Mask */}
          <div
            className="absolute bg-black/65 transition-colors"
            style={{ top: dispTop, left: 0, width: dispLeft, height: dispHeight }}
          />
          {/* Right Mask */}
          <div
            className="absolute bg-black/65 transition-colors"
            style={{ top: dispTop, left: dispRight, right: 0, height: dispHeight }}
          />

          {/* Interactive Bounding Box */}
          <div
            className="absolute border-2 border-cyan-400 bg-cyan-400/5 shadow-[0_0_15px_rgba(34,211,238,0.4)] pointer-events-auto cursor-move transition-[border-color,background-color]"
            style={{
              left: dispLeft,
              top: dispTop,
              width: dispWidth,
              height: dispHeight,
            }}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
            title="Kéo chuột để di chuyển vùng cắt"
          >
            {/* Grid 3x3 helper lines inside crop box */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-25">
              <div className="border-r border-b border-cyan-200" />
              <div className="border-r border-b border-cyan-200" />
              <div className="border-b border-cyan-200" />
              <div className="border-r border-b border-cyan-200" />
              <div className="border-r border-b border-cyan-200" />
              <div className="border-b border-cyan-200" />
              <div className="border-r border-cyan-200" />
              <div className="border-r border-cyan-200" />
              <div />
            </div>

            {/* 8 Resize Handles */}
            {handles.map((h) => (
              <div
                key={h.id}
                onPointerDown={(e) => handlePointerDown(e, 'resize', h.id)}
                className="absolute w-3.5 h-3.5 bg-cyan-400 border-2 border-zinc-900 rounded-sm shadow-md hover:scale-125 active:scale-150 transition-transform pointer-events-auto z-10"
                style={{ ...h.style, cursor: h.cursor }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
