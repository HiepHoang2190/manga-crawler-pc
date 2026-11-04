'use strict';

/**
 * Forwards plugin sandbox console.* to the renderer (Latest updates — plugin console strip).
 * Registered from main once BrowserWindow exists.
 */

/** @type {null | ((payload: { pluginId: string, level: string, line: string, t: number }) => void)} */
let send_payload = null;

/**
 * @param {null | ((payload: { pluginId: string, level: string, line: string, t: number }) => void)} fn
 */
function setPluginConsoleSender(fn) {
  send_payload = typeof fn === 'function' ? fn : null;
}

/**
 * @param {unknown[]} args
 * @returns {string}
 */
function formatPluginConsoleArgs(args) {
  const list = Array.isArray(args) ? args : [];
  return list
    .map((a) => {
      if (a === null || a === undefined) return String(a);
      if (typeof a === 'string') return a;
      if (typeof a === 'number' || typeof a === 'boolean' || typeof a === 'bigint') return String(a);
      if (a instanceof Error) return a.stack || a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

/**
 * @param {string} pluginId
 * @param {'info'|'warn'|'error'} level
 * @param {unknown[]} args
 */
function emitPluginConsole(pluginId, level, args) {
  if (!send_payload) return;
  const id = String(pluginId || '').trim() || 'plugin';
  const lev = level === 'error' || level === 'warn' ? level : 'info';
  const line = formatPluginConsoleArgs(args);
  try {
    send_payload({ pluginId: id, level: lev, line, t: Date.now() });
  } catch {
    /* ignore */
  }
}

module.exports = {
  setPluginConsoleSender,
  emitPluginConsole,
  formatPluginConsoleArgs,
};
