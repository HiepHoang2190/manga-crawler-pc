'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveDefaultCacheFilePath() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'library-scan-cache.json');
    }
  } catch {
    /* not in electron main */
  }
  return path.join(os.tmpdir(), 'manga-crawler-library-scan-cache.json');
}

class LibraryScanCache {
  constructor(options = {}) {
    this.filePath = options.filePath || resolveDefaultCacheFilePath();
    this.map = new Map();
    this.flushTimer = null;
    this.loaded = false;
  }

  loadFromDisk() {
    this.loaded = true;
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object' && val.item) {
            this.map.set(key, val);
          }
        }
      }
    } catch {
      /* ignore corrupted cache */
    }
  }

  ensureLoaded() {
    if (!this.loaded) {
      this.loadFromDisk();
    }
  }

  get(mangaDirAbs, currentDirMtimeMs, currentDbMtimeMs) {
    this.ensureLoaded();
    const key = path.resolve(String(mangaDirAbs || '').trim());
    const cached = this.map.get(key);
    if (!cached) return null;

    if (
      cached.dirMtimeMs === currentDirMtimeMs &&
      cached.dbMtimeMs === currentDbMtimeMs
    ) {
      return cached.item ? { ...cached.item } : null;
    }
    return null;
  }

  set(mangaDirAbs, dirMtimeMs, dbMtimeMs, item) {
    this.ensureLoaded();
    const key = path.resolve(String(mangaDirAbs || '').trim());
    this.map.set(key, {
      dirMtimeMs,
      dbMtimeMs,
      item: item ? { ...item } : item,
    });
    this.scheduleFlush();
  }

  invalidate(mangaDirAbs) {
    this.ensureLoaded();
    const key = path.resolve(String(mangaDirAbs || '').trim());
    this.map.delete(key);
    this.scheduleFlush();
  }

  clear() {
    this.ensureLoaded();
    this.map.clear();
    this.scheduleFlush();
  }

  scheduleFlush(delayMs = 500) {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, delayMs);
    if (typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  flushNow() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj = Object.fromEntries(this.map.entries());
      const tmpFile = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(obj), 'utf8');
      fs.renameSync(tmpFile, this.filePath);
    } catch {
      /* ignore flush failure */
    }
  }
}

const defaultInstance = new LibraryScanCache();

module.exports = {
  LibraryScanCache,
  defaultLibraryScanCache: defaultInstance,
};
