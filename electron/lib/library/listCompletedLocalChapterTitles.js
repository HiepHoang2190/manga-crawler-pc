const fs = require('fs');
const path = require('path');
const { resolveMangaDir } = require('../download/connector/connectorPathUtils');
const { scanChaptersFromImageFoldersOnly } = require('../reader/loaders/loadOfflineMangaFromDisk');

const DB_FILENAME = 'download_db.json';

/**
 * Tiêu đề chương đã tải xong trên đĩa — dùng cho frontier «chỉ chương mới» (khớp mobile).
 * @param {string} baseSaveDir
 * @param {string} mangaTitle
 * @returns {string[]}
 */
function listCompletedLocalChapterTitles(baseSaveDir, mangaTitle) {
  const base = String(baseSaveDir || '').trim();
  const mt = String(mangaTitle || '').trim();
  if (!base || !mt) return [];

  const mangaDir = resolveMangaDir(base, mt);
  if (!fs.existsSync(mangaDir)) return [];

  const titles = [];
  const dbFile = path.join(mangaDir, DB_FILENAME);
  if (fs.existsSync(dbFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      const chapters =
        parsed?.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {};
      for (const [key, entry] of Object.entries(chapters)) {
        if (entry && entry.status === 'completed') {
          const t = String(key || '').trim();
          if (t) titles.push(t);
        }
      }
    } catch {
      /* fall through to folder scan */
    }
  }

  if (titles.length > 0) return titles;

  const scanned = scanChaptersFromImageFoldersOnly(mangaDir);
  for (const ch of scanned) {
    const t = String(ch?.title || ch?.folderBasename || '').trim();
    if (t) titles.push(t);
  }
  return titles;
}

module.exports = { listCompletedLocalChapterTitles };
