const fs = require('fs');
const path = require('path');

const DB_FILENAME = 'download_db.json';

function nowIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class DownloadDatabase {
  constructor(mangaDir) {
    this.mangaDir = mangaDir;
    this.dbFile = path.join(mangaDir, DB_FILENAME);
    this.record = {
      mangaTitle: '',
      mangaUrl: '',
      connector: '',
      lastUpdated: '',
      chapters: {},
    };
  }

  readFromDisk() {
    if (!fs.existsSync(this.dbFile)) return;
    try {
      const raw = fs.readFileSync(this.dbFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.record = {
          mangaTitle: parsed.mangaTitle || '',
          mangaUrl: parsed.mangaUrl || '',
          connector: parsed.connector || '',
          lastUpdated: parsed.lastUpdated || '',
          chapters: parsed.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {},
        };
      }
    } catch {
      this.record.chapters = {};
    }
  }

  save() {
    try {
      this.record.lastUpdated = nowIso();
      const tempFile = path.join(this.mangaDir, `${DB_FILENAME}.tmp`);
      fs.mkdirSync(this.mangaDir, { recursive: true });
      fs.writeFileSync(tempFile, JSON.stringify(this.record, null, 2), 'utf8');
      const target = path.join(this.mangaDir, DB_FILENAME);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      fs.renameSync(tempFile, target);
    } catch {
      /* ignore */
    }
  }

  initChapter(chapterTitle, chapterUrl, expectedCount, pages, options = {}) {
    const existing = this.record.chapters[chapterTitle];
    const force_reinit = Boolean(options && options.force);
    if (existing && existing.status === 'completed' && !force_reinit) return;

    this.record.chapters[chapterTitle] = {
      url: chapterUrl,
      status: 'downloading',
      expectedFileCount: expectedCount,
      downloadedAt: '',
      pages: pages || [],
    };
    this.save();
  }

  /**
   * True when chapter has at least one non-skipped page in the manifest.
   * Empty/null pages must not be treated as "fully downloaded".
   * @param {string} chapterTitle
   * @returns {boolean}
   */
  hasDownloadablePages(chapterTitle) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter || !Array.isArray(chapter.pages) || chapter.pages.length === 0) return false;
    return chapter.pages.some((page) => page && page.status !== 'skipped');
  }

  markPageCompleted(chapterTitle, pageIndex, fileSize) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter || !chapter.pages) return;
    for (const page of chapter.pages) {
      if (page.index === pageIndex) {
        page.status = 'completed';
        page.fileSize = fileSize;
        break;
      }
    }
    this.save();
  }

  markPageFailed(chapterTitle, pageIndex) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter || !chapter.pages) return;
    for (const page of chapter.pages) {
      if (page.index === pageIndex) {
        page.status = 'failed';
        break;
      }
    }
    this.save();
  }

  markChapterCompleted(chapterTitle) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter) return;
    chapter.status = 'completed';
    chapter.downloadedAt = nowIso();
    this.save();
  }

  markChapterIncomplete(chapterTitle) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter) return;
    chapter.status = 'incomplete';
    this.save();
  }

  getMissingPages(chapterTitle, chapterDir) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter || !chapter.pages) return [];
    const missing = [];
    for (const page of chapter.pages) {
      if (page.status === 'skipped') continue;
      if (page.status !== 'completed') {
        missing.push(page);
      } else {
        const fp = path.join(chapterDir, page.fileName);
        if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) {
          page.status = 'pending';
          missing.push(page);
        }
      }
    }
    return missing;
  }

  isChapterComplete(chapterTitle, chapterDir) {
    const chapter = this.record.chapters[chapterTitle];
    if (!chapter || chapter.status !== 'completed') return false;
    if (!this.hasDownloadablePages(chapterTitle)) return false;
    let completed_file_count = 0;
    for (const page of chapter.pages) {
      if (page.status === 'skipped') continue;
      if (page.status !== 'completed') return false;
      const fp = path.join(chapterDir, page.fileName);
      if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) return false;
      completed_file_count += 1;
    }
    return completed_file_count > 0;
  }

  hasChapter(chapterTitle) {
    return Object.prototype.hasOwnProperty.call(this.record.chapters, chapterTitle);
  }
}

function loadOrCreate(mangaDir, mangaTitle, mangaUrl, connector) {
  const db = new DownloadDatabase(mangaDir);
  if (fs.existsSync(db.dbFile)) {
    db.readFromDisk();
  } else {
    db.record = {
      mangaTitle,
      mangaUrl,
      connector,
      lastUpdated: '',
      chapters: {},
    };
  }
  return db;
}

module.exports = { DownloadDatabase, loadOrCreate };
