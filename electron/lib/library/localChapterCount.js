const fs = require('fs');
const path = require('path');
const { resolveMangaDir } = require('../download/connector/connectorPathUtils');
const { countImageChapterFoldersOnDisk } = require('../reader/loaders/loadOfflineMangaFromDisk');

/**
 * Đếm chương đọc được tại đúng thư mục truyện (đường dẫn tuyệt đối).
 */
function countCompletedChaptersAtPath(mangaDirAbs) {
  const mangaDir = path.resolve(String(mangaDirAbs || '').trim());
  if (!fs.existsSync(mangaDir)) return 0;
  const dbFile = path.join(mangaDir, 'download_db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const raw = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(raw);
      const chapters =
        parsed.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {};
      const completedDbCount = Object.values(chapters).filter(
        (ch) => ch && ch.status === 'completed'
      ).length;

      let entries;
      try {
        entries = fs.readdirSync(mangaDir, { withFileTypes: true });
      } catch {
        return completedDbCount;
      }

      const subdirs = entries.filter(
        (e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('._')
      );

      // If subdirectories on disk don't exceed completed DB count, no unindexed extras exist
      if (subdirs.length <= completedDbCount) {
        return completedDbCount;
      }

      // Check if extra subdirs actually contain images or archives
      const onDiskCount = countImageChapterFoldersOnDisk(mangaDir);
      return Math.max(completedDbCount, onDiskCount);
    } catch {
      return countImageChapterFoldersOnDisk(mangaDir);
    }
  }

  return countImageChapterFoldersOnDisk(mangaDir);
}

/**
 * Số chương đã hoàn thành theo download_db.json (khớp thư mục lưu khi tải).
 * Không có JSON hoặc không đọc được JSON: đếm thư mục chương có ảnh (legacy).
 */
function countCompletedChaptersOnDisk(baseSaveDir, mangaTitle) {
  const base = String(baseSaveDir || '').trim();
  if (!base) return 0;
  const mangaDir = resolveMangaDir(base, String(mangaTitle || '').trim());
  return countCompletedChaptersAtPath(mangaDir);
}

module.exports = { countCompletedChaptersOnDisk, countCompletedChaptersAtPath };
