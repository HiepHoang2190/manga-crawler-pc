import { useState, useRef, useCallback } from 'react';

export const TOOLS_SIDEBAR_WIDTH_KEY = 'mangaToolsSidebarWidthPx';
export const TOOLS_SIDEBAR_WIDTH_DEFAULT = 380;
export const TOOLS_SIDEBAR_WIDTH_MIN = 280;
export const TOOLS_SIDEBAR_WIDTH_MAX = 800;

export function clampToolsSidebarWidth(px, innerWidth) {
  const winW = typeof innerWidth === 'number' ? innerWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const max = Math.min(TOOLS_SIDEBAR_WIDTH_MAX, Math.max(TOOLS_SIDEBAR_WIDTH_MIN + 200, winW - 360));
  return Math.max(TOOLS_SIDEBAR_WIDTH_MIN, Math.min(max, Math.round(px)));
}

export function loadToolsSidebarWidth() {
  if (typeof localStorage === 'undefined') return TOOLS_SIDEBAR_WIDTH_DEFAULT;
  try {
    const raw = localStorage.getItem(TOOLS_SIDEBAR_WIDTH_KEY);
    if (!raw) return TOOLS_SIDEBAR_WIDTH_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= TOOLS_SIDEBAR_WIDTH_MIN) {
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      return clampToolsSidebarWidth(n, winW);
    }
  } catch {
    /* ignore storage errors */
  }
  return TOOLS_SIDEBAR_WIDTH_DEFAULT;
}

export function useToolsSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(loadToolsSidebarWidth);

  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const handleSplitPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let lastW = startW;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      const next = clampToolsSidebarWidth(startW + delta, window.innerWidth);
      lastW = next;
      setSidebarWidth(next);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(TOOLS_SIDEBAR_WIDTH_KEY, String(lastW));
      } catch {
        /* ignore storage errors */
      }
    };

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  return {
    sidebarWidth,
    setSidebarWidth,
    handleSplitPointerDown,
  };
}
