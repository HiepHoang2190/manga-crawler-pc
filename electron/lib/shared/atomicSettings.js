const fs = require('fs');
const path = require('path');

/**
 * Cached, atomic JSON settings store using temp-file + rename writes.
 * Prevents settings corruption on abrupt termination and avoids redundant sync disk reads.
 */
function createSettingsStore(resolveFilePath) {
  let cachedSettings = null;
  let writeSeq = 0;

  function getPath() {
    return typeof resolveFilePath === 'function' ? resolveFilePath() : String(resolveFilePath || '');
  }

  function readSettings() {
    if (cachedSettings !== null) {
      return { ...cachedSettings };
    }
    const targetPath = getPath();
    if (!targetPath) {
      cachedSettings = {};
      return {};
    }
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      const parsed = JSON.parse(raw);
      cachedSettings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      cachedSettings = {};
    }
    return { ...cachedSettings };
  }

  function writeSettings(partial) {
    const targetPath = getPath();
    if (!targetPath) return {};
    const current = readSettings();
    const next = { ...current, ...(partial && typeof partial === 'object' ? partial : {}) };
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });

    writeSeq += 1;
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.${writeSeq}.tmp`;
    const serialized = JSON.stringify(next, null, 2);
    try {
      fs.writeFileSync(tmpPath, serialized, 'utf8');
      fs.renameSync(tmpPath, targetPath);
    } catch {
      // Fallback for locked file handles on Windows
      try {
        if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
      } catch {
        /* ignore */
      }
      fs.writeFileSync(targetPath, serialized, 'utf8');
    }

    cachedSettings = next;
    return { ...next };
  }

  function invalidateCache() {
    cachedSettings = null;
  }

  return {
    readSettings,
    writeSettings,
    invalidateCache,
  };
}

module.exports = { createSettingsStore };
