'use strict';

/**
 * Simple logger utility for production-safe logging
 * Automatically disables debug logs in production builds
 */

const isDev = process.env.NODE_ENV !== 'production' && !process.env.ELECTRON_IS_PACKAGED;

const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

/**
 * Log an error message (always shown)
 * @param {string} message
 * @param {any} data
 */
function error(message, data) {
  console.error(`[ERROR] ${message}`, data !== undefined ? data : '');
}

/**
 * Log a warning message (always shown)
 * @param {string} message
 * @param {any} data
 */
function warn(message, data) {
  console.warn(`[WARN] ${message}`, data !== undefined ? data : '');
}

/**
 * Log an info message (always shown)
 * @param {string} message
 * @param {any} data
 */
function info(message, data) {
  console.info(`[INFO] ${message}`, data !== undefined ? data : '');
}

/**
 * Log a debug message (only in development)
 * @param {string} message
 * @param {any} data
 */
function debug(message, data) {
  if (isDev) {
    console.log(`[DEBUG] ${message}`, data !== undefined ? data : '');
  }
}

/**
 * Create a namespaced logger
 * @param {string} namespace
 * @returns {object} Logger instance with namespace
 */
function createLogger(namespace) {
  return {
    error: (msg, data) => error(`[${namespace}] ${msg}`, data),
    warn: (msg, data) => warn(`[${namespace}] ${msg}`, data),
    info: (msg, data) => info(`[${namespace}] ${msg}`, data),
    debug: (msg, data) => debug(`[${namespace}] ${msg}`, data),
  };
}

module.exports = {
  error,
  warn,
  info,
  debug,
  createLogger,
  LogLevel,
  isDev,
};
