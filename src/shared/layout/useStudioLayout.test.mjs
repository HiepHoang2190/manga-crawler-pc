import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import {
  clampLeftSidebarWidth,
  clampRightSidebarWidth,
  clampBottomDrawerHeight,
  useStudioLayout,
  STUDIOLAYOUT_SYNC_EVENT,
  broadcastStudioLayoutSync,
} from './useStudioLayout.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('useStudioLayout pure helpers and exports', () => {
  test('clampLeftSidebarWidth clamps within bounds', () => {
    // With window width 1200, max is Math.min(520, 1200 * 0.45) = 520
    expect(clampLeftSidebarWidth(150, 1200)).toBe(200); // min
    expect(clampLeftSidebarWidth(300, 1200)).toBe(300); // inside
    expect(clampLeftSidebarWidth(600, 1200)).toBe(520); // max

    // With smaller window 800, max is Math.min(520, 800 * 0.45) = 360
    expect(clampLeftSidebarWidth(450, 800)).toBe(360);
  });

  test('clampRightSidebarWidth clamps within bounds', () => {
    // With window width 1200, max is Math.min(650, 1200 * 0.48) = 576
    expect(clampRightSidebarWidth(200, 1200)).toBe(260); // min
    expect(clampRightSidebarWidth(400, 1200)).toBe(400); // inside
    expect(clampRightSidebarWidth(700, 1200)).toBe(576); // max
  });

  test('clampRightSidebarWidth supports custom max, maxRatio, and maxAvailable for fullscreen previews', () => {
    // 1920px fullscreen with max=1600, maxRatio=0.65 -> 1248
    expect(clampRightSidebarWidth(1400, 1920, 260, 1600, 0.65, Infinity)).toBe(1248);
    // 2560px ultrawide hits max=1600
    expect(clampRightSidebarWidth(2000, 2560, 260, 1600, 0.65, Infinity)).toBe(1600);
    // 1440px with 380px left sidebar and 280px minCenter -> maxAvailable = 780
    expect(clampRightSidebarWidth(1000, 1440, 260, 1600, 0.65, 780)).toBe(780);
    // Very narrow maxAvailable still respects min=260 safely
    expect(clampRightSidebarWidth(300, 600, 260, 1600, 0.65, 100)).toBe(260);
  });

  test('clampBottomDrawerHeight clamps within bounds', () => {
    // With window height 800, max is Math.min(550, 800 * 0.6) = 480
    expect(clampBottomDrawerHeight(50, 800)).toBe(100); // min
    expect(clampBottomDrawerHeight(300, 800)).toBe(300); // inside
    expect(clampBottomDrawerHeight(600, 800)).toBe(480); // max
  });

  test('useStudioLayout is exported as a function', () => {
    expect(typeof useStudioLayout).toBe('function');
  });

  test('exports STUDIOLAYOUT_SYNC_EVENT constant and broadcastStudioLayoutSync', () => {
    expect(STUDIOLAYOUT_SYNC_EVENT).toBe('studiolayout:sync');
    expect(typeof broadcastStudioLayoutSync).toBe('function');

    const origWindow = globalThis.window;
    const mockWindow = new EventTarget();
    globalThis.window = mockWindow;

    const listener = jest.fn();
    mockWindow.addEventListener(STUDIOLAYOUT_SYNC_EVENT, listener);

    broadcastStudioLayoutSync({
      prefix: 'test_prefix',
      type: 'leftWidth',
      value: 320,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event.detail).toEqual({
      prefix: 'test_prefix',
      type: 'leftWidth',
      value: 320,
    });

    mockWindow.removeEventListener(STUDIOLAYOUT_SYNC_EVENT, listener);
    globalThis.window = origWindow;
  });

  test('toggles do not call broadcastStudioLayoutSync inside setState updaters and deduplicate self sourceId', () => {
    const src = fs.readFileSync(path.join(dirname, 'useStudioLayout.js'), 'utf8');
    expect(src).toContain('instanceIdRef');
    expect(src).toContain('detail.sourceId === instanceIdRef.current');
    expect(src).toContain('showLeftSidebarRef');
    expect(src).toContain('showRightSidebarRef');
    expect(src).toContain('isBottomOpenRef');

    for (const setter of ['setShowLeftSidebar', 'setShowRightSidebar', 'setIsBottomOpen']) {
      expect(src).not.toMatch(new RegExp(`${setter}\\(\\(prev\\)\\s*=>[\\s\\S]{0,220}broadcastStudioLayoutSync`));
    }
  });

  test('useStudioLayout supports maxRightRatio, minCenterWidth, and window resize re-clamping', () => {
    const src = fs.readFileSync(path.join(dirname, 'useStudioLayout.js'), 'utf8');
    expect(src).toContain('maxLeftRatio');
    expect(src).toContain('maxRightRatio');
    expect(src).toContain('minCenterWidth');
    expect(src).toMatch(/window\.addEventListener\(['"]resize['"]/);
  });
});
