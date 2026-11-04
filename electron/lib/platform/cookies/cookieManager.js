'use strict';

const fs = require('fs');
const path = require('path');

// Registry is injected from main.js after all modules are loaded, avoiding circular deps.
let _registry = null;

function setRegistry(registry) {
  _registry = registry;
}

function getRegistry() {
  return _registry;
}

let store = {};
let cookieFilePath = null;

function _isLegacyAuthStoreKey(key) {
  return typeof key === 'string' && /_auth$/.test(key);
}

function _stripLegacyAuthKeys() {
  let removed = false;
  for (const key of Object.keys(store)) {
    if (_isLegacyAuthStoreKey(key)) {
      delete store[key];
      removed = true;
    }
  }
  return removed;
}

function init(userDataPath) {
  cookieFilePath = path.join(userDataPath, 'site-cookies.json');
  try {
    const raw = fs.readFileSync(cookieFilePath, 'utf8');
    store = JSON.parse(raw);
  } catch (err) {
    if (err instanceof SyntaxError || err.code === 'ENOENT') {
      store = {};
    } else {
      throw err;
    }
  }
  if (_stripLegacyAuthKeys()) {
    try {
      _writeDisk();
    } catch (err) {
      console.error('[CookieManager] Failed to strip leftover auth tokens:', err.message);
    }
  }
}

function get(siteId) {
  return store[siteId] || '';
}

function _cookieSendKey(siteId) {
  return `${siteId}_cookieSend`;
}

function isCookieSendEnabled(siteId) {
  const k = _cookieSendKey(siteId);
  if (Object.prototype.hasOwnProperty.call(store, k)) {
    return store[k] !== false;
  }
  return true;
}

/**
 * Cookie string actually sent with HTTP requests (respects send toggle).
 */
function getEffectiveCookie(siteId) {
  if (!isCookieSendEnabled(siteId)) return '';
  return get(siteId);
}

function _writeDisk() {
  if (!cookieFilePath) return;
  fs.writeFileSync(cookieFilePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Normalize cookie input từ user:
 * - Nếu là Cookie request header (một dòng, nhiều name=value; name2=value2) → giữ nguyên
 * - Nếu là Set-Cookie response header (có attributes như expires/path/domain) → strip attributes
 * - Hỗ trợ nhiều dòng Set-Cookie
 */
function parseSetCookieInput(raw) {
  const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // Nếu chỉ có 1 dòng, kiểm tra xem có phải Set-Cookie format không
  // Set-Cookie format: "name=val; expires=...; path=/; ..."
  // Cookie request format: "name=val; name2=val2; name3=val3"
  // Phân biệt: Set-Cookie có các attribute keywords sau dấu ";"
  const SET_COOKIE_ATTRS = /;\s*(expires|path|domain|max-age|samesite|secure|httponly)\b/i;

  if (lines.length === 1 && !SET_COOKIE_ATTRS.test(lines[0])) {
    // Đây là Cookie request header format → giữ nguyên
    return lines[0];
  }

  // Xử lý từng dòng như Set-Cookie header
  const pairs = [];
  for (const line of lines) {
    // Tách theo "; " lấy phần name=value đầu tiên, bỏ attributes
    const firstSegment = line.split(/;\s*/)[0].trim();
    if (!firstSegment || !firstSegment.includes('=')) continue;
    const key = firstSegment.split('=')[0].trim().toLowerCase();
    const ATTRS = ['expires', 'path', 'domain', 'max-age', 'samesite', 'secure', 'httponly'];
    if (!ATTRS.includes(key)) {
      pairs.push(firstSegment);
    }
  }

  return pairs.length > 0 ? pairs.join('; ') : raw;
}

function set(siteId, value) {
  // Strip newlines và parse Set-Cookie format nếu có
  const cleaned = parseSetCookieInput(String(value).trim()).replace(/[\r\n]/g, '').trim();

  // Empty after trim → treat as delete
  if (!cleaned) {
    return _delete(siteId);
  }

  // Validate siteId exists in registry
  const registry = getRegistry();
  if (!registry || !registry.get(siteId)) {
    return { ok: false, error: 'Unknown siteId' };
  }

  store[siteId] = cleaned;
  try {
    _writeDisk();
  } catch (err) {
    // Log error but NOT the cookie value
    console.error('[CookieManager] Failed to write cookie file:', err.message);
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

function setCookieSendEnabled(siteId, enabled) {
  const id = String(siteId || '').trim();
  if (!id) {
    return { ok: false, error: 'siteId phải là string không rỗng.' };
  }
  const registry = getRegistry();
  if (!registry || !registry.get(id)) {
    return { ok: false, error: 'Unknown siteId' };
  }
  store[_cookieSendKey(id)] = Boolean(enabled);
  try {
    _writeDisk();
  } catch (err) {
    console.error('[CookieManager] Failed to write cookie send flag:', err.message);
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

function _delete(siteId) {
  delete store[siteId];
  delete store[_cookieSendKey(siteId)];
  delete store[`${siteId}_auth`];
  try {
    _writeDisk();
  } catch (err) {
    console.error('[CookieManager] Failed to write cookie file:', err.message);
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

function getStatus() {
  const registry = getRegistry();
  const connectors = registry && registry.listConnectors ? registry.listConnectors() : [];
  const result = {};
  for (const c of connectors) {
    const val = store[c.id];
    result[c.id] = val ? val.length : false;
    result[c.id + '_cookieSend'] = isCookieSendEnabled(c.id);
  }
  return result;
}

// Export delete under its proper name
module.exports = {
  init,
  get,
  getEffectiveCookie,
  isCookieSendEnabled,
  set,
  setCookieSendEnabled,
  delete: _delete,
  getStatus,
  setRegistry,
  // Expose for testing: reset internal state
  _reset() {
    store = {};
    cookieFilePath = null;
  },
};
