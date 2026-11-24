import { createContext, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';

const StudioToolbarSlotContext = createContext(null);

export function StudioToolbarSlotProvider({
  primaryEl = null,
  rightEl = null,
  leftSidebarEl = null,
  children,
}) {
  const value = useMemo(
    () => ({ primaryEl, rightEl, leftSidebarEl }),
    [primaryEl, rightEl, leftSidebarEl]
  );
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

export function StudioLeftSidebarSlot({ children }) {
  const ctx = useContext(StudioToolbarSlotContext);
  if (ctx === null || !ctx.leftSidebarEl) return null;
  return createPortal(children, ctx.leftSidebarEl);
}

export function useHasLeftSidebarSlot() {
  const ctx = useContext(StudioToolbarSlotContext);
  return Boolean(ctx?.leftSidebarEl);
}
