import { useEffect, useLayoutEffect, useState, useRef } from 'react';

export default function GlobalTooltip() {
  const [tooltip, setTooltip] = useState({
    visible: false,
    text: '',
    target: null,
  });

  const [coords, setCoords] = useState({
    left: 0,
    top: 0,
    placeAbove: false,
    horizontalAnchor: 'center',
    ready: false,
  });

  const tooltipRef = useRef(null);
  const timerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    const handleMouseOver = (e) => {
      const target = e.target.closest('[data-tooltip], [title]');
      if (!target) return;

      // Triệt tiêu title mặc định của trình duyệt để không hiển thị tooltip hệ thống
      if (target.hasAttribute('title')) {
        const nativeTitle = target.getAttribute('title');
        if (nativeTitle && nativeTitle.trim()) {
          target._savedTitle = nativeTitle;
          if (!target.getAttribute('data-tooltip')) {
            target.setAttribute('data-tooltip', nativeTitle);
          }
        }
        target.removeAttribute('title');
      }

      const text = target.getAttribute('data-tooltip');
      if (text && text.trim()) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
          setTooltip({
            visible: true,
            text: text.trim(),
            target,
          });
        }, 40);
      }
    };

    const handleMouseOut = (e) => {
      const target = e.target.closest('[data-tooltip]') || (e.target?._savedTitle ? e.target : null);
      if (target) {
        // Nếu chuột di chuyển vào phần tử con của target thì không ẩn
        if (e.relatedTarget && target.contains(e.relatedTarget)) {
          return;
        }

        if (target._savedTitle) {
          target.setAttribute('title', target._savedTitle);
          delete target._savedTitle;
        }

        if (timerRef.current) clearTimeout(timerRef.current);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          setTooltip((prev) => ({ ...prev, visible: false }));
          setCoords((prev) => ({ ...prev, ready: false }));
        }, 30);
      }
    };

    const handleDismiss = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setTooltip((prev) => {
        if (prev.target?._savedTitle) {
          prev.target.setAttribute('title', prev.target._savedTitle);
          delete prev.target._savedTitle;
        }
        return { ...prev, visible: false };
      });
      setCoords((prev) => ({ ...prev, ready: false }));
    };

    window.addEventListener('mouseover', handleMouseOver);
    window.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('mousedown', handleDismiss, true);
    window.addEventListener('pointerdown', handleDismiss, true);
    window.addEventListener('dragstart', handleDismiss);

    return () => {
      window.removeEventListener('mouseover', handleMouseOver);
      window.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('mousedown', handleDismiss, true);
      window.removeEventListener('pointerdown', handleDismiss, true);
      window.removeEventListener('dragstart', handleDismiss);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip.visible || !tooltip.target || !tooltipRef.current) return;

    const targetRect = tooltip.target.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const tooltipW = tooltipRect.width;
    const tooltipH = tooltipRect.height;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    const spaceBelow = screenH - targetRect.bottom;
    const spaceAbove = targetRect.top;

    // Flip to top if space below is too small to fit the tooltip (+ padding) and space above is larger
    const placeAbove = spaceBelow < tooltipH + 12 && spaceAbove > spaceBelow;

    let top = placeAbove
      ? targetRect.top - tooltipH - 8
      : targetRect.bottom + 8;

    // Clamp top inside viewport with 8px margin so it NEVER clips off screen
    top = Math.max(8, Math.min(top, screenH - tooltipH - 8));

    const targetCenter = targetRect.left + targetRect.width / 2;
    const margin = 16; // minimum comfortable padding from screen edges

    // Check if target element is on the right or left side of the screen
    const isRightHalf = targetCenter > screenW * 0.55;
    const isLeftHalf = targetCenter < screenW * 0.45;

    let left;
    let horizontalAnchor = 'center';

    if (isRightHalf) {
      // For elements on the right side:
      // Align tooltip's right edge with target's right edge so it extends leftward into open space
      const rightAlignedLeft = targetRect.right - tooltipW;
      if (rightAlignedLeft >= margin) {
        left = rightAlignedLeft;
        horizontalAnchor = 'right';
      } else {
        left = targetCenter - tooltipW / 2;
        horizontalAnchor = 'center';
      }
    } else if (isLeftHalf) {
      // For elements on the left side:
      // Align tooltip's left edge with target's left edge so it extends rightward
      const leftAlignedLeft = targetRect.left;
      if (leftAlignedLeft + tooltipW <= screenW - margin) {
        left = leftAlignedLeft;
        horizontalAnchor = 'left';
      } else {
        left = targetCenter - tooltipW / 2;
        horizontalAnchor = 'center';
      }
    } else {
      // Centered on target
      left = targetCenter - tooltipW / 2;
      horizontalAnchor = 'center';
    }

    // Strict safety clamp inside viewport with generous margin
    left = Math.max(margin, Math.min(left, screenW - tooltipW - margin));

    setCoords({
      left,
      top,
      placeAbove,
      horizontalAnchor,
      ready: true,
    });
  }, [tooltip.visible, tooltip.target, tooltip.text]);

  return (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`pointer-events-none fixed z-[9999] w-max max-w-[280px] sm:max-w-[340px] whitespace-normal rounded-xl bg-surface-container-highest/95 backdrop-blur-md px-3 py-2 text-xs font-medium leading-relaxed text-on-surface shadow-2xl border border-outline-variant/25 transition-all duration-150 ease-out ${
        tooltip.visible && coords.ready ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        left: coords.left,
        top: coords.top,
        transformOrigin: `${coords.placeAbove ? 'bottom' : 'top'} ${coords.horizontalAnchor}`,
        visibility: tooltip.visible ? 'visible' : 'hidden',
      }}
    >
      {tooltip.text}
    </div>
  );
}
