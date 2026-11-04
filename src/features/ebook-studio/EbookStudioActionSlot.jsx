import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const EbookStudioActionContext = createContext(null);
export const EbookStudioCenterContext = createContext(null);

/**
 * EbookStudioActionSlot
 * Render các nút hành động phụ vào rightSlot của StudioLayout.Toolbar
 * khi subtab đang active.
 */
export function EbookStudioActionSlot({ active = true, children, fallback = null }) {
  const target = useContext(EbookStudioActionContext);
  if (!active) {
    return null;
  }
  if (!target || typeof document === 'undefined') {
    return fallback;
  }
  return createPortal(children, target);
}

/**
 * EbookStudioCenterSlot
 * Render các nút hành động chính (Bắt đầu, Dừng, Gửi...) vào centerSlot chính giữa
 * của StudioLayout.Toolbar khi subtab đang active.
 */
export function EbookStudioCenterSlot({ active = true, children, fallback = null }) {
  const target = useContext(EbookStudioCenterContext);
  if (!active) {
    return null;
  }
  if (!target || typeof document === 'undefined') {
    return fallback;
  }
  return createPortal(children, target);
}

export default EbookStudioActionSlot;

