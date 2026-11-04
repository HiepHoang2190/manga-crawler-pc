import { useState, useRef, useCallback, useEffect } from 'react';

// --- Pure Clamp Helpers ---
export function clampLeftSidebarWidth(w, innerWidth, min = 200, max = 520) {
  const winW = typeof innerWidth === 'number' ? innerWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const maxW = Math.min(max, Math.floor(winW * 0.45));
  return Math.max(min, Math.min(w, Math.max(min, maxW)));
}

export function clampRightSidebarWidth(w, innerWidth, min = 260, max = 650) {
  const winW = typeof innerWidth === 'number' ? innerWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const maxW = Math.min(max, Math.floor(winW * 0.48));
  return Math.max(min, Math.min(w, Math.max(min, maxW)));
}

export function clampBottomDrawerHeight(h, innerHeight, min = 100, max = 550) {
  const winH = typeof innerHeight === 'number' ? innerHeight : (typeof window !== 'undefined' ? window.innerHeight : 800);
  const maxH = Math.min(max, Math.floor(winH * 0.6));
  return Math.max(min, Math.min(h, Math.max(min, maxH)));
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
  defaultRightWidth = 340,
  minRightWidth = 260,
  maxRightWidth = 650,
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

  // --- Clamp Callbacks ---
  const clampLeft = useCallback(
    (w) => clampLeftSidebarWidth(w, typeof window !== 'undefined' ? window.innerWidth : 1200, minLeftWidth, maxLeftWidth),
    [minLeftWidth, maxLeftWidth]
  );

  const clampRight = useCallback(
    (w) => clampRightSidebarWidth(w, typeof window !== 'undefined' ? window.innerWidth : 1200, minRightWidth, maxRightWidth),
    [minRightWidth, maxRightWidth]
  );

  const clampBottom = useCallback(
    (h) => clampBottomDrawerHeight(h, typeof window !== 'undefined' ? window.innerHeight : 800, minBottomHeight, maxBottomHeight),
    [minBottomHeight, maxBottomHeight]
  );

  // --- Initial State Loaders ---
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
    return defaultLeftWidth;
  });

  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof localStorage === 'undefined') return defaultRightWidth;
    try {
      const saved = localStorage.getItem(RIGHT_WIDTH_KEY);
      if (saved) {
        const num = parseInt(saved, 10);
        if (!isNaN(num)) return clampRight(num);
      }
    } catch { }
    return defaultRightWidth;
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

  // Keep refs for active drag handlers
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);

  const rightWidthRef = useRef(rightWidth);
  useEffect(() => {
    rightWidthRef.current = rightWidth;
  }, [rightWidth]);

  const bottomHeightRef = useRef(bottomHeight);
  useEffect(() => {
    bottomHeightRef.current = bottomHeight;
  }, [bottomHeight]);

  // Persist open/close toggles
  const toggleLeftSidebar = useCallback(() => {
    setShowLeftSidebar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LEFT_OPEN_KEY, String(next));
      } catch { }
      return next;
    });
  }, [LEFT_OPEN_KEY]);

  const toggleRightSidebar = useCallback(() => {
    setShowRightSidebar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RIGHT_OPEN_KEY, String(next));
      } catch { }
      return next;
    });
  }, [RIGHT_OPEN_KEY]);

  const toggleBottom = useCallback(() => {
    setIsBottomOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BOTTOM_OPEN_KEY, String(next));
      } catch { }
      return next;
    });
  }, [BOTTOM_OPEN_KEY]);

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
        setLeftWidth(next);
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
      };

      function onUp() {
        cleanup();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampLeft, LEFT_WIDTH_KEY]
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
      };

      function onUp() {
        cleanup();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampRight, RIGHT_WIDTH_KEY]
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
      };

      function onUp() {
        cleanup();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clampBottom, BOTTOM_HEIGHT_KEY]
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
