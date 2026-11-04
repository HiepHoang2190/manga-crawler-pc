export default function ResizeSplitter({
  onPointerDown,
  ariaLabel = 'Kéo để thay đổi kích thước',
  title, // preserved for API backwards-compatibility
  variant = 'edge', // 'edge' (zero-width border overlay) | 'gap' (slim w-3 spacer between separated cards) | 'overlay' (anchored to container edge)
  side = 'right', // 'right' (-right-1.5) | 'left' (-left-1.5) | 'gap'
  className = '',
}) {
  // Grip pill component with 3 tactile indicator dots
  const renderGripPill = () => (
    <div className="relative z-10 w-1 h-10 rounded-full bg-outline-variant/40 group-hover:bg-primary group-hover:w-1.5 group-active:bg-primary group-active:w-1.5 transition-all duration-150 flex flex-col items-center justify-center gap-1 pointer-events-none">
      <span className="w-0.5 h-0.5 rounded-full bg-surface-container-lowest/80 group-hover:bg-on-primary group-active:bg-on-primary transition-colors" />
      <span className="w-0.5 h-0.5 rounded-full bg-surface-container-lowest/80 group-hover:bg-on-primary group-active:bg-on-primary transition-colors" />
      <span className="w-0.5 h-0.5 rounded-full bg-surface-container-lowest/80 group-hover:bg-on-primary group-active:bg-on-primary transition-colors" />
    </div>
  );

  // Variant 1: Gap spacer with vertical track line (for separated cards like Convert tab)
  if (variant === 'gap' || side === 'gap') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        className={`group relative z-30 flex w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center ${className}`}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-outline-variant/20 pointer-events-none" />
        {renderGripPill()}
      </div>
    );
  }

  // Variant 2: Overlay handle attached directly to a relative container edge
  if (variant === 'overlay') {
    const posClass = side === 'left' ? '-left-1.5' : '-right-1.5';
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        className={`absolute ${posClass} top-0 bottom-0 z-40 w-3 cursor-col-resize select-none touch-none group flex items-center justify-center ${className}`}
      >
        {renderGripPill()}
      </div>
    );
  }

  // Variant 3: Default 'edge' - Zero-width flex divider positioned right on top of border-r
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className={`relative z-30 flex w-0 h-full self-stretch shrink-0 select-none touch-none items-center justify-center ${className}`}
    >
      <div
        onPointerDown={onPointerDown}
        className="absolute -left-1.5 top-0 bottom-0 z-40 w-3 cursor-col-resize select-none touch-none group flex items-center justify-center"
      >
        {renderGripPill()}
      </div>
    </div>
  );
}
