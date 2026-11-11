import { useState, useRef, useEffect, useCallback } from 'react';
import { computeOptimalTextBox } from './mangaStudioCanvasRender';

/**
 * useMangaStudioCanvasInteractions — Hook điều phối toàn bộ Tương tác Chuột & Viewport trên Canvas
 * - Zoom & Pan (Spacebar to Pan, Middle-mouse click, Mouse wheel, Ctrl+Wheel mượt mà, Fit to Screen, 100%)
 * - Layer Drag & Drop (di chuyển vị trí bong bóng thoại / khung text box / chốt pin Koharu)
 * - 8 Resize Handles (co giãn kích thước khung text box 4 góc và 4 cạnh)
 * - Tự động đồng bộ kích thước ảnh tự nhiên (naturalWidth, naturalHeight)
 */
export function useMangaStudioCanvasInteractions({
  activePage,
  activePageIndex = 0,
  pages = [],
  setPages,
  selectedLayerId,
  setSelectedLayerId,
  setExpandedLayerId,
  setIsTextGroupCollapsed,
  setActiveRightTab,
  setShowRightSidebar,
  updateSelectedLayer,
  onUpdatePages,
  activeTool = 'select',
  layerTextareaRef,
}) {
  // Canvas zoom & pan state
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const spacePressedRef = useRef(false);

  // Layer drag & resize interaction state
  const [interaction, setInteraction] = useState(null);
  const canvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const imageRef = useRef(null);

  const containerW = (activePage?.width && activePage.width > 100)
    ? activePage.width
    : (imageRef.current?.naturalWidth || 800);
  const containerH = (activePage?.height && activePage.height > 100)
    ? activePage.height
    : (imageRef.current?.naturalHeight || 1200);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const containerWRef = useRef(containerW);
  containerWRef.current = containerW;
  const containerHRef = useRef(containerH);
  containerHRef.current = containerH;

  // Helper to clamp pan offset so manga page never scrolls away into endless void
  const clampPan = useCallback((targetPan, targetZoom = zoom, margin = 40) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return targetPan;

    const vW = canvasEl.clientWidth;
    const vH = canvasEl.clientHeight;
    if (!vW || !vH) return targetPan;

    const s = targetZoom / 100;
    const sW = containerW * s;
    const sH = containerH * s;

    let maxX = 0;
    let minX = 0;
    if (sW > vW) {
      maxX = (sW - vW) / 2 + margin;
      minX = -maxX;
    } else {
      maxX = Math.max(0, (vW - sW) / 2);
      minX = -maxX;
    }

    let maxY = 0;
    let minY = 0;
    if (sH > vH) {
      maxY = (sH - vH) / 2 + margin;
      minY = -maxY;
    } else {
      maxY = Math.max(0, (vH - sH) / 2);
      minY = -maxY;
    }

    return {
      x: Math.max(minX, Math.min(maxX, Math.round(targetPan.x))),
      y: Math.max(minY, Math.min(maxY, Math.round(targetPan.y))),
    };
  }, [containerW, containerH, zoom]);

  // Auto-fit image to screen viewport
  const handleFitToScreen = useCallback((targetW, targetH) => {
    if (!canvasRef.current) return;
    const viewportW = canvasRef.current.clientWidth - 96;
    const viewportH = canvasRef.current.clientHeight - 96;
    const imgW = targetW || activePage?.width || 800;
    const imgH = targetH || activePage?.height || 1200;
    if (viewportW > 100 && viewportH > 100 && imgW > 0 && imgH > 0) {
      const fitScale = Math.min(viewportW / imgW, viewportH / imgH);
      const fitZoom = Math.max(25, Math.min(200, Math.round(fitScale * 100)));
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }
  }, [activePage?.width, activePage?.height]);

  // Read natural image dimensions once image is loaded & auto-fit
  const handleImageLoaded = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalWidth && naturalHeight) {
      setPages?.((prev) =>
        prev.map((p, i) =>
          i === activePageIndex
            ? { ...p, width: naturalWidth, height: naturalHeight }
            : p
        )
      );
      handleFitToScreen(naturalWidth, naturalHeight);
    }
  }, [activePageIndex, handleFitToScreen, setPages]);

  // Synchronize dimensions if cached
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      const { naturalWidth, naturalHeight } = imageRef.current;
      if (naturalWidth > 100 && naturalHeight > 100) {
        if (!activePage?.width || activePage.width !== naturalWidth || !activePage?.height || activePage.height !== naturalHeight) {
          setPages?.((prev) =>
            prev.map((p, i) =>
              i === activePageIndex
                ? { ...p, width: naturalWidth, height: naturalHeight }
                : p
            )
          );
        }
      }
    }
  }, [activePageIndex, activePage?.width, activePage?.height, activePage?.dataUrl, activePage?.originalDataUrl, setPages]);

  // Zoom controls
  const handleZoomChange = useCallback((newZoom) => {
    const clampedZoom = Math.max(20, Math.min(400, newZoom));
    setZoom(clampedZoom);
    zoomRef.current = clampedZoom;
    setPan((prev) => {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return prev;
      const vW = canvasEl.clientWidth;
      const vH = canvasEl.clientHeight;
      const s = clampedZoom / 100;
      const sW = containerW * s;
      const sH = containerH * s;
      if (sW <= vW && sH <= vH) {
        return { x: 0, y: 0 };
      }
      return clampPan(prev, clampedZoom, 40);
    });
  }, [containerW, containerH, clampPan]);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse & Touch interaction for Drag / Resize
  const handleMouseDownOnLayer = useCallback((e, layer, target = 'bubble') => {
    if (activeTool === 'hand' || isSpacePressed || spacePressedRef.current || e.button === 1) {
      if (activeTool === 'hand' || e.button === 1 || isSpacePressed || spacePressedRef.current) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    e.stopPropagation();
    setSelectedLayerId?.(layer.id);
    setExpandedLayerId?.(layer.id);
    setIsTextGroupCollapsed?.(false);
    setActiveRightTab?.('properties');
    setShowRightSidebar?.(true);

    const bubbleBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4
      ? [...layer.bbox]
      : [0, 0, 100, 100];
    const textBbox = computeOptimalTextBox(bubbleBbox, layer.textBbox, layer.hasBubble !== false, layer.isCustomTextBox);

    setInteraction({
      type: 'drag',
      target, // 'bubble' | 'textBox' | 'top-pin'
      startX: e.clientX,
      startY: e.clientY,
      origBubbleBbox: bubbleBbox,
      origTextBbox: textBbox,
    });
  }, [activeTool, isSpacePressed, setSelectedLayerId, setExpandedLayerId, setIsTextGroupCollapsed, setActiveRightTab, setShowRightSidebar]);

  const handleDoubleClickOnLayer = useCallback((e, layer) => {
    e.stopPropagation();
    if (activeTool === 'hand' || isSpacePressed || spacePressedRef.current) return;
    setSelectedLayerId?.(layer.id);
    setExpandedLayerId?.(layer.id);
    setIsTextGroupCollapsed?.(false);
    setActiveRightTab?.('properties');
    setShowRightSidebar?.(true);
    setTimeout(() => {
      layerTextareaRef?.current?.focus();
      layerTextareaRef?.current?.select();
    }, 50);
  }, [activeTool, isSpacePressed, setSelectedLayerId, setExpandedLayerId, setIsTextGroupCollapsed, setActiveRightTab, setShowRightSidebar, layerTextareaRef]);

  const handleMouseDownOnHandle = useCallback((e, layer, handle, target = 'textBox') => {
    e.stopPropagation();
    if (activeTool === 'hand' || isSpacePressed || spacePressedRef.current) return;
    setSelectedLayerId?.(layer.id);

    const bubbleBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4
      ? [...layer.bbox]
      : [0, 0, 100, 100];
    const textBbox = computeOptimalTextBox(bubbleBbox, layer.textBbox, layer.hasBubble !== false, layer.isCustomTextBox);

    setInteraction({
      type: 'resize',
      target, // 'textBox' | 'bubble'
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origBubbleBbox: bubbleBbox,
      origTextBbox: textBbox,
    });
  }, [activeTool, isSpacePressed, setSelectedLayerId]);

  // Mouse move handler on canvas for drag & resize & pan
  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;
      setPan((prev) => clampPan({ x: prev.x + deltaX, y: prev.y + deltaY }, zoom, 80));
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!interaction || !selectedLayerId || !activePage) return;

    const scale = zoom / 100;
    const dx = (e.clientX - interaction.startX) / scale;
    const dy = (e.clientY - interaction.startY) / scale;
    const pageW = activePage.width || 1200;
    const pageH = activePage.height || 1600;

    const [bx, by, bw, bh] = interaction.origBubbleBbox;
    const [tx, ty, tw, th] = interaction.origTextBbox;

    if (interaction.type === 'drag') {
      const newTx = Math.max(0, Math.min(pageW - tw, Math.round(tx + dx)));
      const newTy = Math.max(0, Math.min(pageH - th, Math.round(ty + dy)));

      updateSelectedLayer?.({
        textBbox: [newTx, newTy, tw, th],
        isCustomTextBox: true,
      });
    } else if (interaction.type === 'resize') {
      const h = interaction.handle;
      let x = tx, y = ty, w = tw, height = th;
      if (h.includes('e')) w = Math.max(20, Math.round(tw + dx));
      if (h.includes('s')) height = Math.max(20, Math.round(th + dy));
      if (h.includes('w')) {
        const potentialW = Math.max(20, Math.round(tw - dx));
        x = tx + (tw - potentialW);
        w = potentialW;
      }
      if (h.includes('n')) {
        const potentialH = Math.max(20, Math.round(th - dy));
        y = ty + (th - potentialH);
        height = potentialH;
      }
      updateSelectedLayer?.({
        textBbox: [x, y, w, height],
        isCustomTextBox: true,
      });
    }
  }, [isPanning, interaction, selectedLayerId, activePage, zoom, updateSelectedLayer, clampPan]);

  const handleMouseUp = useCallback(() => {
    if (interaction) {
      onUpdatePages?.(pages);
    }
    setInteraction(null);
    setIsPanning(false);
  }, [interaction, pages, onUpdatePages]);

  // Canvas Pan start
  const handleCanvasMouseDown = useCallback((e) => {
    if (activeTool === 'hand' || e.button === 1 || isSpacePressed || spacePressedRef.current) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
    } else {
      setSelectedLayerId?.(null);
    }
  }, [activeTool, isSpacePressed, setSelectedLayerId]);

  // Mouse wheel: Pan vertically / horizontally & Ctrl+Wheel zoom
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.max(20, Math.min(400, Math.round(zoomRef.current * factor)));
        setZoom(newZoom);
        zoomRef.current = newZoom;

        const el = canvasRef.current;
        if (el) {
          const vW = el.clientWidth;
          const vH = el.clientHeight;
          const s = newZoom / 100;
          const sW = containerWRef.current * s;
          const sH = containerHRef.current * s;

          setPan((prev) => {
            if (sW <= vW && sH <= vH) {
              return { x: 0, y: 0 };
            }
            let maxX = (sW > vW) ? (sW - vW) / 2 + 40 : Math.max(0, (vW - sW) / 2);
            let minX = -maxX;
            let maxY = (sH > vH) ? (sH - vH) / 2 + 40 : Math.max(0, (vH - sH) / 2);
            let minY = -maxY;
            return {
              x: Math.max(minX, Math.min(maxX, prev.x)),
              y: Math.max(minY, Math.min(maxY, prev.y)),
            };
          });
        }
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;

        const el = canvasRef.current;
        const vW = el ? el.clientWidth : 800;
        const vH = el ? el.clientHeight : 600;
        const s = zoomRef.current / 100;
        const sW = containerWRef.current * s;
        const sH = containerHRef.current * s;

        const effectiveDx = (sW > vW) ? dx : 0;
        const effectiveDy = (sH > vH) ? dy : 0;

        if (effectiveDx === 0 && effectiveDy === 0) {
          setPan((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
          return;
        }

        const margin = 40;
        let maxX = (sW > vW) ? (sW - vW) / 2 + margin : Math.max(0, (vW - sW) / 2);
        let minX = -maxX;
        let maxY = (sH > vH) ? (sH - vH) / 2 + margin : Math.max(0, (vH - sH) / 2);
        let minY = -maxY;

        setPan((prev) => ({
          x: Math.max(minX, Math.min(maxX, Math.round(prev.x - effectiveDx))),
          y: Math.max(minY, Math.min(maxY, Math.round(prev.y - effectiveDy))),
        }));
      }
    };

    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    return () => canvasEl.removeEventListener('wheel', onWheel);
  }, []);

  return {
    zoom,
    setZoom,
    pan,
    setPan,
    isPanning,
    isSpacePressed,
    setIsSpacePressed,
    spacePressedRef,
    interaction,
    containerW,
    containerH,
    canvasRef,
    imageContainerRef,
    imageRef,
    clampPan,
    handleFitToScreen,
    handleImageLoaded,
    handleZoomChange,
    handleResetZoom,
    handleMouseDownOnLayer,
    handleDoubleClickOnLayer,
    handleMouseDownOnHandle,
    handleMouseMove,
    handleMouseUp,
    handleCanvasMouseDown,
  };
}

