import { useState, useRef, useCallback, useEffect } from 'react';

// --- Pure Clamp Helpers ---
export function clampLeftSidebarWidth(w, innerWidth, min = 200, max = 520, maxRatio = 0.45) {
  const winW = typeof innerWidth === 'number' ? innerWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const maxW = Math.min(max, Math.floor(winW * maxRatio));
  return Math.max(min, Math.min(w, Math.max(min, maxW)));
}

export function clampRightSidebarWidth(w, innerWidth, min = 260, max = 650, maxRatio = 0.48, maxAvailable = Infinity) {
  const winW = typeof innerWidth === 'number' ? innerWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const maxW = Math.min(max, Math.floor(winW * maxRatio), maxAvailable);
  return Math.max(min, Math.min(w, Math.max(min, maxW)));
}

export function clampBottomDrawerHeight(h, innerHeight, min = 100, max = 550) {
  const winH = typeof innerHeight === 'number' ? innerHeight : (typeof window !== 'undefined' ? window.innerHeight : 800);
  const maxH = Math.min(max, Math.floor(winH * 0.6));
  return Math.max(min, Math.min(h, Math.max(min, maxH)));
}

export const STUDIOLAYOUT_SYNC_EVENT = 'studiolayout:sync';

/**
 * Phát sự kiện đồng bộ layout qua CustomEvent cho các component cùng storagePrefix
 */
export function broadcastStudioLayoutSync(detail) {
  if (typeof window !== 'undefined' && detail) {
    try {
      window.dispatchEvent(new CustomEvent(STUDIOLAYOUT_SYNC_EVENT, { detail }));
    } catch {
      /* ignore */
    }
  }
}

/**
 * useStudioLayout — Hook điều phối layout chuẩn Workflow Studio
 * Quản lý trạng thái mở/đóng và co giãn kích thước cho Sidebar Trái, Phải và Drawer Đáy.
 */
export function useStudioLayout({
  storagePrefix = 'studio_layout',
  defaultLeftWidth = 260,
  minLeftWidth = 200,
  maxLeftWidth = 520,
  maxLeftRatio = 0.45,
  defaultRightWidth = 340,
  minRightWidth = 260,
  maxRightWidth = 650,
  maxRightRatio = 0.48,
  minCenterWidth = 0,
  defaultBottomHeight = 220,
  minBottomHeight = 100,
  maxBottomHeight = 550,
  defaultLeftOpen = true,
  defaultRightOpen = true,
  defaultBottomOpen = false,
} = {}) {
  const LEFT_WIDTH_KEY = `${storagePrefix}_left_width_v1`;
  const RIGHT_WIDTH_KEY = `${storagePrefix}_right_width_v1`;
  const BOTTOM_HEIGHT_KEY = `${storagePrefix}_bottom_height_v1`;
  const LEFT_OPEN_KEY = `${storagePrefix}_left_open_v1`;
  const RIGHT_OPEN_KEY = `${storagePrefix}_right_open_v1`;
  const BOTTOM_OPEN_KEY = `${storagePrefix}_bottom_open_v1`;

  // --- Clamp Left & Bottom Callbacks ---
  const clampLeft = useCallback(
    (w) => clampLeftSidebarWidth(w, typeof window !== 'undefined' ? window.innerWidth : 1200, minLeftWidth, maxLeftWidth, maxLeftRatio),
    [minLeftWidth, maxLeftWidth, maxLeftRatio]
  );

  const clampBottom = useCallback(
    (h) => clampBottomDrawerHeight(h, typeof window !== 'undefined' ? window.innerHeight : 800, minBottomHeight, maxBottomHeight),
    [minBottomHeight, maxBottomHeight]
  );

  // --- Initial State Loaders (Left / Open states initialized before clampRight) ---
  const [showLeftSidebar, setShowLeftSidebar] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultLeftOpen;
    try {
      const saved = localStorage.getItem(LEFT_OPEN_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return defaultLeftOpen;
  });

  const [showRightSidebar, setShowRightSidebar] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultRightOpen;
    try {
      const saved = localStorage.getItem(RIGHT_OPEN_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return defaultRightOpen;
  });

  const [isBottomOpen, setIsBottomOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultBottomOpen;
    try {
      const saved = localStorage.getItem(BOTTOM_OPEN_KEY);
      if (saved !== null) return saved === 'true';
    } catch { }
    return defaultBottomOpen;
  });

  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultLeftWidth;
    try {
      const saved = localStorage.getItem(LEFT_WIDTH_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num)) return clampLeft(num);
      }
    } catch { }
    return clampLeft(defaultLeftWidth);
  });

  // Keep refs for active drag handlers, dynamic center-width clamp, and pure toggle computation
  const instanceIdRef = useRef(Symbol('studioLayout'));
  const showLeftSidebarRef = useRef(showLeftSidebar);
  useEffect(() => {
    showLeftSidebarRef.current = showLeftSidebar;
  }, [showLeftSidebar]);

  const showRightSidebarRef = useRef(showRightSidebar);
  useEffect(() => {
    showRightSidebarRef.current = showRightSidebar;
  }, [showRightSidebar]);

  const isBottomOpenRef = useRef(isBottomOpen);
  useEffect(() => {
    isBottomOpenRef.current = isBottomOpen;
  }, [isBottomOpen]);

  const leftWidthRef = useRef(leftWidth);
  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);

  const clampRight = useCallback(
    (w) => {
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const occupiedLeft = showLeftSidebarRef.current ? leftWidthRef.current : 0;
      const maxAvailable = minCenterWidth > 0 ? winW - occupiedLeft - minCenterWidth : Infinity;
      return clampRightSidebarWidth(w, winW, minRightWidth, maxRightWidth, maxRightRatio, maxAvailable);
    },
    [minRightWidth, maxRightWidth, maxRightRatio, minCenterWidth]
  );

  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultRightWidth;
    try {
      const saved = localStorage.getItem(RIGHT_WIDTH_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num)) return clampRight(num);
      }
    } catch { }
    return clampRight(defaultRightWidth);
  });

  const [bottomHeight, setBottomHeight] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultBottomHeight;
    try {
      const saved = localStorage.getItem(BOTTOM_HEIGHT_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num)) return clampBottom(num);
      }
    } catch { }
    return defaultBottomHeight;
  });

  const rightWidthRef = useRef(rightWidth);
  useEffect(() => {
    rightWidthRef.current = rightWidth;
  }, [rightWidth]);

  const bottomHeightRef = useRef(bottomHeight);
  useEffect(() => {
    bottomHeightRef.current = bottomHeight;
  }, [bottomHeight]);

  // Re-clamp widths/height smoothly when the window resizes (e.g., exiting fullscreen)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleWindowResize = () => {
      const nextLeft = clampLeft(leftWidthRef.current);
      if (nextLeft !== leftWidthRef.current) {
        leftWidthRef.current = nextLeft;
        setLeftWidth(nextLeft);
      }
      const nextRight = clampRight(rightWidthRef.current);
      if (nextRight !== rightWidthRef.current) {
        rightWidthRef.current = nextRight;
        setRightWidth(nextRight);
      }
      const nextBottom = clampBottom(bottomHeightRef.current);
      if (nextBottom !== bottomHeightRef.current) {
        bottomHeightRef.current = nextBottom;
        setBottomHeight(nextBottom);
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [clampLeft, clampRight, clampBottom]);

  // Synchronize state across other instances sharing the same storagePrefix
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleSync = (e) => {
      const detail = e?.detail;
      if (!detail || detail.prefix !== storagePrefix) return;
      if (detail.sourceId && detail.sourceId === instanceIdRef.current) return;
      if (detail.type === 'leftWidth' && typeof detail.value === 'number') {
        setLeftWidth(clampLeft(detail.value));
      } else if (detail.type === 'rightWidth' && typeof detail.value === 'number') {
        setRightWidth(clampRight(detail.value));
      } else if (detail.type === 'bottomHeight' && typeof detail.value === 'number') {
        setBottomHeight(clampBottom(detail.value));
      } else if (detail.type === 'showLeftSidebar' && typeof detail.value === 'boolean') {
        showLeftSidebarRef.current = detail.value;
        setShowLeftSidebar(detail.value);
      } else if (detail.type === 'showRightSidebar' && typeof detail.value === 'boolean') {
        showRightSidebarRef.current = detail.value;
        setShowRightSidebar(detail.value);
      } else if (detail.type === 'isBottomOpen' && typeof detail.value === 'boolean') {
        isBottomOpenRef.current = detail.value;
        setIsBottomOpen(detail.value);
      }
    };
    window.addEventListener(STUDIOLAYOUT_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(STUDIOLAYOUT_SYNC_EVENT, handleSync);
  }, [storagePrefix, clampLeft, clampRight, clampBottom]);

  // Persist open/close toggles outside React state updaters to avoid re-entrant sync double-toggle
  const toggleLeftSidebar = useCallback(() => {
    const next = !showLeftSidebarRef.current;
    showLeftSidebarRef.current = next;
    setShowLeftSidebar(next);
    try {
      localStorage.setItem(LEFT_OPEN_KEY, String(next));
    } catch { }
    broadcastStudioLayoutSync({
      prefix: storagePrefix,
      type: 'showLeftSidebar',
      value: next,
      sourceId: instanceIdRef.current,
    });
  }, [LEFT_OPEN_KEY, storagePrefix]);

  const toggleRightSidebar = useCallback(() => {
    const next = !showRightSidebarRef.current;
    showRightSidebarRef.current = next;
    setShowRightSidebar(next);
    try {
      localStorage.setItem(RIGHT_OPEN_KEY, String(next));
    } catch { }
    broadcastStudioLayoutSync({
      prefix: storagePrefix,
      type: 'showRightSidebar',
      value: next,
      sourceId: instanceIdRef.current,
    });
  }, [RIGHT_OPEN_KEY, storagePrefix]);

  const toggleBottom = useCallback(() => {
    const next = !isBottomOpenRef.current;
    isBottomOpenRef.current = next;
    setIsBottomOpen(next);
    try {
      localStorage.setItem(BOTTOM_OPEN_KEY, String(next));
    } catch { }
    broadcastStudioLayoutSync({
      prefix: storagePrefix,
      type: 'isBottomOpen',
      value: next,
      sourceId: instanceIdRef.current,
    });
  }, [BOTTOM_OPEN_KEY, storagePrefix]);

  // --- Left Sidebar Resize Handler ---
  const handleLeftResizeStart = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftWidthRef.current;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }

      let lastW = startW;
      const onMove = (ev) => {
        const delta = ev.clientX - startX;
        const next = clampLeft(startW + delta);
        lastW = next;
        leftWidthRef.current = next;
        setLeftWidth(next);
        if (minCenterWidth > 0 && showRightSidebarRef.current) {
          const clampedRight = clampRight(rightWidthRef.current);
          if (clampedRight < rightWidthRef.current) {
            rightWidthRef.current = clampedRight;
            setRightWidth(clampedRight);
          }
        }
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (typeof document !== 'undefined') {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
        try {
          localStorage.setItem(LEFT_WIDTH_KEY, String(lastW));
        } catch { }
        broadcastStudioLayoutSync({ prefix: storagePrefix, type: 'leftWidth', value: lastW, sourceId: instanceIdRef.current });
      };

      function onUp() {
        cleanup();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampLeft, clampRight, minCenterWidth, LEFT_WIDTH_KEY, storagePrefix]
  );

  // --- Right Sidebar Resize Handler ---
  const handleRightResizeStart = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightWidthRef.current;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }

      let lastW = startW;
      const onMove = (ev) => {
        const delta = startX - ev.clientX;
        const next = clampRight(startW + delta);
        lastW = next;
        rightWidthRef.current = next;
        setRightWidth(next);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (typeof document !== 'undefined') {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
        try {
          localStorage.setItem(RIGHT_WIDTH_KEY, String(lastW));
        } catch { }
        broadcastStudioLayoutSync({ prefix: storagePrefix, type: 'rightWidth', value: lastW, sourceId: instanceIdRef.current });
      };

      function onUp() {
        cleanup();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampRight, RIGHT_WIDTH_KEY, storagePrefix]
  );

  // --- Bottom Drawer Resize Handler ---
  const handleBottomResizeStart = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startY = e.clientY;
      const startH = bottomHeightRef.current;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
      }

      let lastH = startH;
      const onMove = (ev) => {
        const delta = startY - ev.clientY;
        const next = clampBottom(startH + delta);
        lastH = next;
        setBottomHeight(next);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (typeof document !== 'undefined') {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
        try {
          localStorage.setItem(BOTTOM_HEIGHT_KEY, String(lastH));
        } catch { }
        broadcastStudioLayoutSync({ prefix: storagePrefix, type: 'bottomHeight', value: lastH, sourceId: instanceIdRef.current });
      };

      function onUp() {
        cleanup();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampBottom, BOTTOM_HEIGHT_KEY, storagePrefix]
  );

  return {
    // Left Sidebar
    showLeftSidebar,
    setShowLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    setLeftWidth,
    handleLeftResizeStart,

    // Right Sidebar
    showRightSidebar,
    setShowRightSidebar,
    toggleRightSidebar,
    rightWidth,
    setRightWidth,
    handleRightResizeStart,

    // Bottom Drawer
    isBottomOpen,
    setIsBottomOpen,
    toggleBottom,
    bottomHeight,
    setBottomHeight,
    handleBottomResizeStart,
  };
}
