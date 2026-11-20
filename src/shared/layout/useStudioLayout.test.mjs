import { jest } from '@jest/globals';
import {
  clampLeftSidebarWidth,
  clampRightSidebarWidth,
  clampBottomDrawerHeight,
  useStudioLayout,
  STUDIOLAYOUT_SYNC_EVENT,
  broadcastStudioLayoutSync,
} from './useStudioLayout.js';

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
});
