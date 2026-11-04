'use strict';

const crop = require('./actions/crop');
const desaturate = require('./actions/desaturate');
const deskew = require('./actions/deskew');
const splitPage = require('./actions/splitPage');

const ACTIONS = { crop, desaturate, deskew, splitPage };

function getAction(type) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, type) ? ACTIONS[type] : null;
}

function listActionTypes() {
  return Object.keys(ACTIONS);
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((a) => a && getAction(a.type))
    .map((a, index) => {
      const def = getAction(a.type);
      return {
        id: String(a.id || `act_${index}`),
        type: a.type,
        enabled: a.enabled !== false,
        params: def.validate({ ...def.defaults, ...(a.params || {}) }),
      };
    });
}

function resolveStepParams(action, override) {
  const def = getAction(action.type);
  const enabled = typeof override?.enabled === 'boolean' ? override.enabled : action.enabled !== false;
  const params = def.validate({ ...def.defaults, ...(action.params || {}), ...(override?.params || {}) });
  return { enabled, params };
}

module.exports = { getAction, listActionTypes, normalizeActions, resolveStepParams };
