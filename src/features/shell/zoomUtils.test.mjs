import { createRequire } from 'node:module';
import {
  MIN_ZOOM_FACTOR,
  MAX_ZOOM_FACTOR,
  DEFAULT_ZOOM_FACTOR,
  ZOOM_STEPS,
  ZOOM_QUICK_PRESETS,
  clampZoomFactor,
  stepZoomFactor,
  isDefaultZoom,
  formatZoomPercent,
  detectAppZoomShortcut,
} from './zoomUtils.mjs';

const require = createRequire(import.meta.url);
const cjsZoomUtils = require('../../../electron/lib/windowZoomUtils.js');

describe('app zoom utilities', () => {
  test('exposes canonical zoom bounds and step tables matching electron/lib/windowZoomUtils.js', () => {
    expect(MIN_ZOOM_FACTOR).toBe(0.5);
    expect(MAX_ZOOM_FACTOR).toBe(2.0);
    expect(DEFAULT_ZOOM_FACTOR).toBe(1.0);
    expect(ZOOM_STEPS).toEqual([0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0]);
    expect(ZOOM_QUICK_PRESETS).toEqual([0.75, 0.9, 1.0, 1.1, 1.25, 1.5]);

    expect(cjsZoomUtils.MIN_ZOOM_FACTOR).toBe(MIN_ZOOM_FACTOR);
    expect(cjsZoomUtils.MAX_ZOOM_FACTOR).toBe(MAX_ZOOM_FACTOR);
    expect(cjsZoomUtils.DEFAULT_ZOOM_FACTOR).toBe(DEFAULT_ZOOM_FACTOR);
    expect(cjsZoomUtils.ZOOM_STEPS).toEqual(ZOOM_STEPS);
    expect(cjsZoomUtils.clampZoomFactor(0.1)).toBe(0.5);
    expect(cjsZoomUtils.stepZoomFactor(1.0, 'in')).toBe(1.1);
    expect(cjsZoomUtils.stepZoomFactor(1.0, 'out')).toBe(0.9);
    expect(cjsZoomUtils.isDefaultZoom(1.002)).toBe(true);
    expect(cjsZoomUtils.isDefaultZoom(1.1)).toBe(false);
  });

  test('clampZoomFactor handles invalid, extreme, and floating-point values', () => {
    expect(clampZoomFactor(undefined)).toBe(1.0);
    expect(clampZoomFactor(NaN)).toBe(1.0);
    expect(clampZoomFactor(0.1)).toBe(0.5);
    expect(clampZoomFactor(4.5)).toBe(2.0);
    expect(clampZoomFactor(1.1000000000000003)).toBe(1.1);
  });

  test('stepZoomFactor steps cleanly in and out along ZOOM_STEPS', () => {
    expect(stepZoomFactor(1.0, 'in')).toBe(1.1);
    expect(stepZoomFactor(1.1, 'in')).toBe(1.25);
    expect(stepZoomFactor(1.0, 'out')).toBe(0.9);
    expect(stepZoomFactor(0.9, 'out')).toBe(0.8);
    expect(stepZoomFactor(0.5, 'out')).toBe(0.5);
    expect(stepZoomFactor(2.0, 'in')).toBe(2.0);
    // Near-exact float between steps (e.g., Chromium getZoomFactor() float drift)
    expect(stepZoomFactor(1.0004, 'in')).toBe(1.1);
    expect(stepZoomFactor(1.0004, 'out')).toBe(0.9);
  });

  test('isDefaultZoom & formatZoomPercent handle float tolerance cleanly', () => {
    expect(isDefaultZoom(1)).toBe(true);
    expect(isDefaultZoom(1.002)).toBe(true);
    expect(isDefaultZoom(1.1)).toBe(false);
    expect(formatZoomPercent(1)).toBe('100%');
    expect(formatZoomPercent(0.67)).toBe('67%');
    expect(formatZoomPercent(1.25)).toBe('125%');
  });

  test('detectAppZoomShortcut matches zoom shortcuts cleanly and rejects conflicts', () => {
    expect(detectAppZoomShortcut({ metaKey: true, key: '=' })).toBe('in');
    expect(detectAppZoomShortcut({ ctrlKey: true, shiftKey: true, key: '+', code: 'Equal' })).toBe('in');
    expect(detectAppZoomShortcut({ metaKey: true, key: '', code: 'NumpadAdd' })).toBe('in');
    expect(detectAppZoomShortcut({ ctrlKey: true, key: '-' })).toBe('out');
    expect(detectAppZoomShortcut({ metaKey: true, key: '', code: 'NumpadSubtract' })).toBe('out');
    expect(detectAppZoomShortcut({ metaKey: true, key: '0' })).toBe('reset');
    expect(detectAppZoomShortcut({ ctrlKey: true, key: '', code: 'Numpad0' })).toBe('reset');

    // Rejected cases
    expect(detectAppZoomShortcut({ metaKey: true, key: '0', defaultPrevented: true })).toBeNull();
    expect(detectAppZoomShortcut({ metaKey: true, altKey: true, key: '=' })).toBeNull();
    expect(detectAppZoomShortcut({ key: '+' })).toBeNull();
    expect(detectAppZoomShortcut({ metaKey: true, shiftKey: true, key: ')', code: 'Digit0' })).toBeNull();
    expect(detectAppZoomShortcut({ metaKey: true, key: 'k' })).toBeNull();
  });
});
