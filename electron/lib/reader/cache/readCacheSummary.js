const fs = require('fs');
const path = require('path');
const { session } = require('electron');

/**
 * @param {string} dir
 * @returns {Promise<number>}
 */
async function folderSizeBytes(dir) {
  const root = String(dir || '').trim();
  if (!root) return 0;
  let bytes = 0;
  async function walk(current) {
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          await walk(p);
        } else if (entry.isFile()) {
          const st = await fs.promises.stat(p);
          bytes += st.size;
        }
      } catch {
        /* skip unreadable */
      }
    }
  }
  try {
    const st = await fs.promises.stat(root);
    if (!st.isDirectory()) return 0;
  } catch {
    return 0;
  }
  await walk(root);
  return bytes;
}

/**
 * @returns {Promise<number>}
 */
function httpCacheSizeBytes() {
  return new Promise((resolve) => {
    try {
      session.defaultSession.getCacheSize((size) => resolve(Number(size) || 0));
    } catch {
      resolve(0);
    }
  });
}

/**
 * @param {{ hiddenAbsolutePaths?: string[], tempRoot?: string }} opts
 */
async function getReadCacheSummary(opts = {}) {
  const hidden = Array.isArray(opts.hiddenAbsolutePaths) ? opts.hiddenAbsolutePaths : [];
  let hiddenBytes = 0;
  let hiddenCount = 0;
  for (const raw of hidden) {
    const p = String(raw || '').trim();
    if (!p) continue;
    const sz = await folderSizeBytes(p);
    if (sz <= 0) continue;
    hiddenBytes += sz;
    hiddenCount += 1;
  }
  const httpCacheBytes = await httpCacheSizeBytes();
  const tempRoot = String(opts.tempRoot || '').trim();
  const tempBytes = tempRoot ? await folderSizeBytes(tempRoot) : 0;
  return {
    bytes: hiddenBytes + httpCacheBytes + tempBytes,
    hiddenCount,
    hiddenBytes,
    httpCacheBytes,
    tempBytes,
  };
}

/**
 * @param {{ hiddenAbsolutePaths?: string[], tempRoot?: string }} opts
 */
async function clearReadCache(opts = {}) {
  const hidden = Array.isArray(opts.hiddenAbsolutePaths) ? opts.hiddenAbsolutePaths : [];
  for (const raw of hidden) {
    const p = String(raw || '').trim();
    if (!p) continue;
    try {
      await fs.promises.rm(p, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
  await new Promise((resolve) => {
    try {
      session.defaultSession.clearCache(() => resolve());
    } catch {
      resolve();
    }
  });
  const tempRoot = String(opts.tempRoot || '').trim();
  if (tempRoot) {
    try {
      await fs.promises.rm(tempRoot, { recursive: true, force: true });
      await fs.promises.mkdir(tempRoot, { recursive: true });
    } catch {
      /* best-effort */
    }
  }
  return { ok: true };
}

module.exports = {
  folderSizeBytes,
  getReadCacheSummary,
  clearReadCache,
};
