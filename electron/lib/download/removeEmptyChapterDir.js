'use strict';

const fs = require('fs');
const path = require('path');

/**
 * True when a directory entry is ignorable junk (macOS metadata), not real download content.
 * @param {string} name
 * @returns {boolean}
 */
function isIgnorableDirEntry(name) {
  const n = String(name || '');
  if (n === '.DS_Store' || n.startsWith('._')) return true;
  const lower = n.toLowerCase();
  return lower === 'thumbs.db' || lower === 'desktop.ini';
}

/**
 * Remove a chapter directory only when it has no real download content.
 * Keeps folders that contain any file (even empty) so resume/partial downloads stay intact.
 * Treats .DS_Store / AppleDouble (._*) as empty junk and removes them with the folder.
 *
 * @param {string} chapterDir - Absolute path to the chapter folder
 * @returns {boolean} true if the directory was removed
 */
function removeEmptyChapterDir(chapterDir) {
  const target = String(chapterDir || '').trim();
  if (!target) return false;

  let st;
  try {
    if (!fs.existsSync(target)) return false;
    st = fs.statSync(target);
  } catch {
    return false;
  }
  if (!st.isDirectory()) return false;

  let entries;
  try {
    entries = fs.readdirSync(target);
  } catch {
    return false;
  }

  const real_entries = entries.filter((name) => !isIgnorableDirEntry(name));
  if (real_entries.length > 0) return false;

  try {
    for (const name of entries) {
      fs.rmSync(path.join(target, name), { recursive: true, force: true });
    }
    fs.rmdirSync(target);
    return true;
  } catch {
    return false;
  }
}

module.exports = { removeEmptyChapterDir, isIgnorableDirEntry };
