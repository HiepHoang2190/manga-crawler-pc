/**
 * Persist bulk-scan sessions under Electron userData (survives restarts;
 * not tied to renderer localStorage origin / quota).
 */
const fs = require('fs');
const path = require('path');

const FILENAME = 'bulk-scan-sessions.json';

function storePath(userDataPath) {
  return path.join(String(userDataPath || ''), FILENAME);
}

function readAll(userDataPath) {
  try {
    const raw = fs.readFileSync(storePath(userDataPath), 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeAll(userDataPath, sessions) {
  const dir = String(userDataPath || '');
  if (!dir) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath(dir), JSON.stringify(sessions || {}, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} userDataPath
 * @param {string} siteId
 * @param {{ scannedAt?: string, items?: array, selectedUrls?: string[] }} session
 * @returns {{ ok: boolean, sessions?: object, error?: string }}
 */
function saveSession(userDataPath, siteId, session) {
  const id = String(siteId || '').trim();
  if (!id) return { ok: false, error: 'Missing siteId' };
  const all = readAll(userDataPath);
  const nextItems = Array.isArray(session?.items) ? session.items : [];
  const prevItems = Array.isArray(all[id]?.items) ? all[id].items : [];
  if (!nextItems.length && prevItems.length) {
    return { ok: false, error: 'Refusing to overwrite non-empty session with empty items', sessions: all };
  }
  all[id] = {
    scannedAt: session?.scannedAt || new Date().toISOString(),
    items: nextItems,
    selectedUrls: Array.isArray(session?.selectedUrls) ? session.selectedUrls : [],
  };
  if (!writeAll(userDataPath, all)) {
    return { ok: false, error: 'Failed to write bulk-scan-sessions.json' };
  }
  return { ok: true, sessions: all };
}

module.exports = {
  FILENAME,
  storePath,
  readAll,
  writeAll,
  saveSession,
};
