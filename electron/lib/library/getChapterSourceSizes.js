'use strict';

/**
 * Per-chapter source size (image bytes on disk) for Send to Kindle selection UI.
 * Estimate only — converted EPUB/PDF size may differ.
 */

const fs = require('fs');
const path = require('path');

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
 * @param {string} absoluteMangaDir
 * @param {Array<{ title?: string, folderBasename?: string }>} chapters
 * @returns {Promise<Array<{ title: string, folderBasename: string, sizeBytes: number }>>}
 */
async function getChapterSourceSizes(absoluteMangaDir, chapters) {
  const mangaDir = String(absoluteMangaDir || '').trim();
  const list = Array.isArray(chapters) ? chapters : [];
  const out = [];
  for (const c of list) {
    const title = String(c?.title || '').trim();
    const folderBasename = String(c?.folderBasename || '').trim();
    let sizeBytes = 0;
    if (mangaDir && folderBasename) {
      sizeBytes = await folderSizeBytes(path.join(mangaDir, folderBasename));
    }
    out.push({ title, folderBasename, sizeBytes });
  }
  return out;
}

/**
 * Compact MB label for UI (source estimate).
 * @param {number} bytes
 * @returns {string}
 */
function formatSourceSizeMb(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0';
  const mb = n / (1024 * 1024);
  if (mb < 0.1) return '<0.1';
  if (mb < 10) return mb.toFixed(1);
  return String(Math.round(mb));
}

module.exports = {
  folderSizeBytes,
  getChapterSourceSizes,
  formatSourceSizeMb,
};
