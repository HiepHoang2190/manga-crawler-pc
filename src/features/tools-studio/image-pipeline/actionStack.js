// src/features/tools-studio/image-pipeline/actionStack.js
import { createAction } from './actionTypes.js';

export const initialStackState = { actions: [], selectedId: null };

function mapAction(state, id, fn) {
  if (!state.actions.some((a) => a.id === id)) return state;
  return { ...state, actions: state.actions.map((a) => (a.id === id ? fn(a) : a)) };
}

export function actionStackReducer(state, event) {
  switch (event.type) {
    case 'load': {
      const actions = (event.actions || []).map((a) => ({
        ...a,
        collapsed: a.collapsed !== undefined ? Boolean(a.collapsed) : true,
        params: structuredClone(a.params || {}),
      }));
      return { actions, selectedId: actions[0]?.id ?? null };
    }
    case 'add': {
      const action = { ...createAction(event.actionType), collapsed: false };
      return { actions: [...state.actions, action], selectedId: action.id };
    }
    case 'remove': {
      if (!state.actions.some((a) => a.id === event.id)) return state;
      const actions = state.actions.filter((a) => a.id !== event.id);
      const selectedId = state.selectedId === event.id ? actions[0]?.id ?? null : state.selectedId;
      return { actions, selectedId };
    }
    case 'clear':
      return { actions: [], selectedId: null };
    case 'move': {
      const index = state.actions.findIndex((a) => a.id === event.id);
      const target = index + event.delta;
      if (index < 0 || target < 0 || target >= state.actions.length) return state;
      const actions = [...state.actions];
      const [item] = actions.splice(index, 1);
      actions.splice(target, 0, item);
      return { ...state, actions };
    }
    case 'toggleEnabled':
      return mapAction(state, event.id, (a) => ({ ...a, enabled: !a.enabled }));
    case 'toggleCollapsed':
      return mapAction(state, event.id, (a) => ({ ...a, collapsed: !a.collapsed }));
    case 'setParams':
      return mapAction(state, event.id, (a) => ({ ...a, params: { ...a.params, ...event.params } }));
    case 'select': {
      const target = state.actions.find((a) => a.id === event.id);
      if (!target) return state;
      const nextCollapsed = state.selectedId === event.id ? !target.collapsed : false;
      return {
        ...state,
        selectedId: event.id,
        actions: state.actions.map((a) => (a.id === event.id ? { ...a, collapsed: nextCollapsed } : a)),
      };
    }
    default:
      return state;
  }
}

export function countEnabled(actions) {
  return actions.filter((a) => a.enabled).length;
}
