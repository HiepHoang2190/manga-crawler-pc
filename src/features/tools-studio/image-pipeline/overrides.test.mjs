// src/features/tools-studio/image-pipeline/overrides.test.mjs
import {
  setOverride, clearOverride, clearOverrideParam, confirmOverride, markDownstreamStale, markDownstreamStaleAll,
  markReorderStale, removeActionOverrides, removeFileOverrides, toBackendOverrides, toBackendOverridesAll,
  hasManual, hasStale, pxBoxToRatio, ratioBoxToPx,
} from './overrides.js';

const actions = [{ id: 'k' }, { id: 'c' }, { id: 's' }];

describe('overrides', () => {
  test('setOverride merges params and clears stale', () => {
    let o = setOverride({}, '/a.png', 'c', { params: { boxRatio: { left: 0.1 } } });
    o = setOverride(o, '/a.png', 'c', { params: { tolerance: 5 } });
    expect(o['/a.png'].c.params).toEqual({ boxRatio: { left: 0.1 }, tolerance: 5 });
    o = markDownstreamStale(o, '/a.png', actions, 'k');
    expect(o['/a.png'].c.stale).toBe(true);
    expect(confirmOverride(o, '/a.png', 'c')['/a.png'].c.stale).toBe(false);
    expect(setOverride(o, '/a.png', 'c', { enabled: false })['/a.png'].c.stale).toBe(false);
  });

  test('markDownstreamStale only marks later steps', () => {
    let o = setOverride({}, '/a.png', 'k', { params: { angle: 2 } });
    o = setOverride(o, '/a.png', 's', { params: { force: 'keep' } });
    const next = markDownstreamStale(o, '/a.png', actions, 'c');
    expect(next['/a.png'].k.stale).toBe(false);
    expect(next['/a.png'].s.stale).toBe(true);
    expect(markDownstreamStale(next, '/a.png', actions, 's')).toBe(next);
  });

  test('markDownstreamStaleAll and reorder', () => {
    let o = setOverride({}, '/a.png', 's', { params: {} });
    o = setOverride(o, '/b.png', 'c', { params: {} });
    const all = markDownstreamStaleAll(o, actions, 'k');
    expect(hasStale(all, '/a.png') && hasStale(all, '/b.png')).toBe(true);
    const re = markReorderStale(o, actions, [{ id: 'c' }, { id: 'k' }, { id: 's' }]);
    expect(re['/b.png'].c.stale).toBe(true);
    expect(re['/a.png'].s.stale).toBe(false);
  });

  test('clear helpers drop empty maps', () => {
    let o = setOverride({}, '/a.png', 'k', { params: { angle: 2 } });
    expect(clearOverride(o, '/a.png', 'k')).toEqual({});
    expect(clearOverrideParam(o, '/a.png', 'k', 'angle')['/a.png'].k.params).toEqual({});
    o = setOverride(o, '/b.png', 'k', { enabled: false });
    expect(Object.keys(removeActionOverrides(o, 'k'))).toEqual([]);
    expect(Object.keys(removeFileOverrides(o, '/a.png'))).toEqual(['/b.png']);
  });

  test('backend shape and flags', () => {
    const o = setOverride({}, '/a.png', 'k', { enabled: false, params: { angle: 1 } });
    expect(toBackendOverrides(o['/a.png'])).toEqual({ k: { enabled: false, params: { angle: 1 } } });
    expect(toBackendOverridesAll(o)).toEqual({ '/a.png': { k: { enabled: false, params: { angle: 1 } } } });
    expect(hasManual(o, '/a.png')).toBe(true);
    expect(hasManual(o, '/b.png')).toBe(false);
  });

  test('box conversions round-trip', () => {
    const ratio = pxBoxToRatio({ left: 50, top: 100, width: 200, height: 300 }, 500, 1000);
    expect(ratio).toEqual({ left: 0.1, top: 0.1, width: 0.4, height: 0.3 });
    expect(ratioBoxToPx(ratio, 500, 1000)).toEqual({ left: 50, top: 100, width: 200, height: 300 });
  });
});
