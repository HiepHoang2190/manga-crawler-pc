import { createContext, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';

const StudioToolbarSlotContext = createContext(null);

export function StudioToolbarSlotProvider({ primaryEl = null, rightEl = null, children }) {
  const value = useMemo(() => ({ primaryEl, rightEl }), [primaryEl, rightEl]);
  return (
    <StudioToolbarSlotContext.Provider value={value}>
      {children}
    </StudioToolbarSlotContext.Provider>
  );
}

export function StudioPrimaryActionSlot({ children }) {
  const ctx = useContext(StudioToolbarSlotContext);
  if (ctx === null) return children;
  if (!ctx.primaryEl) return null;
  return createPortal(children, ctx.primaryEl);
}

export function StudioRightToolbarSlot({ children }) {
  const ctx = useContext(StudioToolbarSlotContext);
  if (ctx === null) return children;
  if (!ctx.rightEl) return null;
  return createPortal(children, ctx.rightEl);
}
