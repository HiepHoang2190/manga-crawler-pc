// src/features/tools-studio/image-pipeline/actionStack.test.mjs
import { createRequire } from 'module';
import { ACTION_TYPES, ACTION_TYPE_ORDER, createAction } from './actionTypes.js';
import { actionStackReducer, initialStackState, countEnabled } from './actionStack.js';

const require = createRequire(import.meta.url);

describe('actionTypes', () => {
  test('renderer defaults mirror backend defaults', () => {
    const { getAction, listActionTypes } = require('../../../../electron/lib/export/image/pipeline/actionRegistry.js');
    expect(ACTION_TYPE_ORDER).toEqual(listActionTypes());
    for (const type of ACTION_TYPE_ORDER) {
      expect(ACTION_TYPES[type].defaults).toEqual(getAction(type).defaults);
    }
  });

  test('createAction clones defaults and generates unique ids', () => {
    const a = createAction('crop');
    const b = createAction('crop');
    expect(a.id).not.toBe(b.id);
    a.params.edges.top = false;
    expect(ACTION_TYPES.crop.defaults.edges.top).toBe(true);
    expect(() => createAction('nope')).toThrow();
  });
});

describe('actionStackReducer', () => {
  const load = () => actionStackReducer(initialStackState, {
    type: 'load',
    actions: [createAction('deskew'), createAction('crop'), createAction('splitPage')],
  });

  test('load defaults to collapsed and selects first; add auto-expands the new action', () => {
    const s = load();
    expect(s.selectedId).toBe(s.actions[0].id);
    expect(s.actions.every((a) => a.collapsed === true)).toBe(true);

    const s2 = actionStackReducer(s, { type: 'add', actionType: 'crop' });
    expect(s2.actions).toHaveLength(4);
    expect(s2.selectedId).toBe(s2.actions[3].id);
    expect(s2.actions[3].collapsed).toBe(false);

    // select expands the selected action
    const s3 = actionStackReducer(s2, { type: 'select', id: s2.actions[1].id });
    expect(s3.selectedId).toBe(s2.actions[1].id);
    expect(s3.actions[1].collapsed).toBe(false);

    // selecting the already-selected action toggles it to collapsed
    const s4 = actionStackReducer(s3, { type: 'select', id: s2.actions[1].id });
    expect(s4.selectedId).toBe(s2.actions[1].id);
    expect(s4.actions[1].collapsed).toBe(true);

    // selecting it again toggles it back to expanded
    const s5 = actionStackReducer(s4, { type: 'select', id: s2.actions[1].id });
    expect(s5.selectedId).toBe(s2.actions[1].id);
    expect(s5.actions[1].collapsed).toBe(false);
  });

  test('move swaps neighbours and ignores out-of-range moves', () => {
    const s = load();
    const [d, c] = s.actions;
    const moved = actionStackReducer(s, { type: 'move', id: c.id, delta: -1 });
    expect(moved.actions.map((a) => a.id).slice(0, 2)).toEqual([c.id, d.id]);
    expect(actionStackReducer(s, { type: 'move', id: d.id, delta: -1 })).toBe(s);
  });

  test('toggle, setParams, remove, clear', () => {
    const s = load();
    const id = s.actions[1].id;
    const toggled = actionStackReducer(s, { type: 'toggleEnabled', id });
    expect(countEnabled(toggled.actions)).toBe(2);
    const set = actionStackReducer(toggled, { type: 'setParams', id, params: { tolerance: 33 } });
    expect(set.actions[1].params.tolerance).toBe(33);
    expect(set.actions[1].params.cropMode).toBe('autoTrim');
    const removed = actionStackReducer({ ...set, selectedId: id }, { type: 'remove', id });
    expect(removed.actions).toHaveLength(2);
    expect(removed.selectedId).toBe(removed.actions[0].id);
    expect(actionStackReducer(removed, { type: 'clear' })).toEqual({ actions: [], selectedId: null });
  });
});
