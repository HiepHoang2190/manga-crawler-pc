import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const ToolsStudioActionContext = createContext(null);
export const ToolsStudioCenterContext = createContext(null);

/**
 * ToolsStudioActionSlot
 * Render các nút hành động (TemplateToolbar, Toggle...) vào rightSlot của StudioLayout.Toolbar
 * khi tab đang active.
 */
export function ToolsStudioActionSlot({ active = true, children }) {
  const target = useContext(ToolsStudioActionContext);
  if (!active || !target || typeof document === 'undefined') {
    return null;
  }
  return createPortal(children, target);
}

/**
 * ToolsStudioCenterSlot
 * Render các nút chính (Bắt đầu, Dừng) vào centerSlot chính giữa của StudioLayout.Toolbar
 * khi tab đang active.
 */
export function ToolsStudioCenterSlot({ active = true, children }) {
  const target = useContext(ToolsStudioCenterContext);
  if (!active || !target || typeof document === 'undefined') {
    return null;
  }
  return createPortal(children, target);
}

export default ToolsStudioActionSlot;

