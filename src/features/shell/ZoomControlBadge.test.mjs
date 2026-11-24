import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(dirname, '../../..', rel), 'utf8');

describe('StatusBar Zoom Indicator, Popover, HUD Toast & Electron Sync', () => {
  test('ZoomControlBadge.jsx follows portal, SectionTitle, bordered icon buttons, data-tooltip, and double-click reset standards', () => {
    const code = read('src/features/shell/ZoomControlBadge.jsx');
    expect(code).toContain('createPortal');
    expect(code).toContain('SectionTitle');
    expect(code).toContain('data-testid="status-zoom-btn"');
    expect(code).toContain('data-testid="status-zoom-popover"');
    expect(code).toContain('onDoubleClick');
    expect(code).toContain('border border-outline-variant/20 bg-surface-container-highest');
    expect(code).toContain("e.key === 'Escape'");
    expect(code).toContain('triggerRef.current?.focus()');
    expect(code).toContain('updatePopoverPosition');
    expect(code).toContain('zIndex: 220');
    expect(code).toContain('if (!isDefault) onResetZoom?.();');
    expect(code).not.toContain('setOpen(false);\n    };\n    document.addEventListener(\'pointerdown\', handlePointerDown);\n    window.addEventListener(\'keydown\', handleKeyDown);\n    window.addEventListener(\'resize\', handleResize)');
    expect(code).not.toMatch(/\btitle\s*=/);
    expect(code).not.toContain('underline');
  });

  test('ZoomHudToast.jsx provides transient non-blocking HUD with 1-click 100% reset button', () => {
    const code = read('src/features/shell/ZoomHudToast.jsx');
    expect(code).toContain('data-testid="zoom-hud-toast"');
    expect(code).toContain('isDefaultZoom');
    expect(code).toContain('formatZoomPercent');
    expect(code).toContain('onResetZoom');
    expect(code).toContain('100%');
    expect(code).not.toMatch(/\btitle\s*=/);
  });

  test('StatusBar.jsx mounts ZoomControlBadge next to SystemResourceBadge', () => {
    const code = read('src/features/shell/StatusBar.jsx');
    expect(code).toContain("import ZoomControlBadge from './ZoomControlBadge.jsx'");
    expect(code).toContain('<ZoomControlBadge');
    expect(code).toContain('zoomFactor');
    expect(code).toContain('onResetZoom');
  });

  test('ShellLayout.jsx wires zoom state, HUD toast, resize sync, conflict-free shortcuts, and Command Palette actions', () => {
    const code = read('src/features/shell/ShellLayout.jsx');
    expect(code).toContain("import ZoomHudToast from './ZoomHudToast.jsx'");
    expect(code).toContain('detectAppZoomShortcut');
    expect(code).toContain('getZoomFactorSync');
    expect(code).toContain('onZoomChanged');
    expect(code).toContain('if (e.defaultPrevented) return;');
    expect(code).toContain('if (readerOpen) return;');
    expect(code).toContain("menuView === 'translate'");
    expect(code).toContain('zoomSeqRef');
    expect(code).toContain('zoomHydratedRef');
    expect(code).toContain("source === 'init'");
    expect(code).toContain('zoomHudHoveredRef.current = false');
    expect(code).toContain('if (e.defaultPrevented || readerOpen) return;');
    expect(code).toContain('action:zoom-in');
    expect(code).toContain('action:zoom-out');
    expect(code).toContain('action:zoom-reset');
  });

  test('Electron main, ipc/window, preload, and windowZoomUtils wire zoomFactor persistence & channels', () => {
    const utils = read('electron/lib/windowZoomUtils.js');
    expect(utils).toContain('clampZoomFactor');
    expect(utils).toContain('stepZoomFactor');
    expect(utils).toContain('isDefaultZoom');

    const winIpc = read('electron/ipc/window.js');
    expect(winIpc).toContain("'window:getZoomFactor'");
    expect(winIpc).toContain("'window:setZoomFactor'");
    expect(winIpc).toContain("'window:stepZoom'");
    expect(winIpc).toContain("'window:resetZoom'");
    expect(winIpc).toContain("'window:zoomChanged'");

    const preload = read('electron/preload.js');
    expect(preload).toContain('webFrame');
    expect(preload).toContain('getZoomFactorSync');
    expect(preload).toContain('getZoomFactor');
    expect(preload).toContain('setZoomFactor');
    expect(preload).toContain('stepZoom');
    expect(preload).toContain('resetZoom');
    expect(preload).toContain('onZoomChanged');

    const main = read('electron/main.js');
    expect(main).toContain('setZoomFactor');
    expect(main).toContain("'zoom-changed'");
  });
});
