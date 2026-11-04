const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DownloadDatabase, loadOrCreate } = require('../../platform/storage/downloadDb');

describe('downloadDb', () => {
  let tempDir;
  let mangaDir;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'downloaddb-test-'));
    mangaDir = path.join(tempDir, 'Test Manga');
    fs.mkdirSync(mangaDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('DownloadDatabase constructor', () => {
    it('should create database instance with manga directory', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(db.mangaDir).toBe(mangaDir);
      expect(db.dbFile).toBe(path.join(mangaDir, 'download_db.json'));
    });

    it('should initialize empty record structure', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(db.record).toEqual({
        mangaTitle: '',
        mangaUrl: '',
        connector: '',
        lastUpdated: '',
        chapters: {},
      });
    });
  });

  describe('readFromDisk', () => {
    it('should read existing database file', () => {
      const dbData = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/test',
        connector: 'TestConnector',
        lastUpdated: '2024-01-01T12:00:00',
        chapters: {
          'Chapter 1': {
            url: 'https://example.com/chapter/1',
            status: 'completed',
            expectedFileCount: 10,
            downloadedAt: '2024-01-01T12:00:00',
            pages: [],
          },
        },
      };

      fs.writeFileSync(
        path.join(mangaDir, 'download_db.json'),
        JSON.stringify(dbData, null, 2),
        'utf8'
      );

      const db = new DownloadDatabase(mangaDir);
      db.readFromDisk();

      expect(db.record.mangaTitle).toBe('Test Manga');
      expect(db.record.mangaUrl).toBe('https://example.com/manga/test');
      expect(db.record.connector).toBe('TestConnector');
      expect(db.record.chapters['Chapter 1']).toBeDefined();
      expect(db.record.chapters['Chapter 1'].status).toBe('completed');
    });

    it('should handle non-existent database file', () => {
      const db = new DownloadDatabase(mangaDir);
      db.readFromDisk();

      expect(db.record).toEqual({
        mangaTitle: '',
        mangaUrl: '',
        connector: '',
        lastUpdated: '',
        chapters: {},
      });
    });

    it('should handle corrupted JSON file', () => {
      fs.writeFileSync(
        path.join(mangaDir, 'download_db.json'),
        'invalid json {{{',
        'utf8'
      );

      const db = new DownloadDatabase(mangaDir);
      db.readFromDisk();

      expect(db.record.chapters).toEqual({});
    });

    it('should handle malformed database structure', () => {
      fs.writeFileSync(
        path.join(mangaDir, 'download_db.json'),
        JSON.stringify({ invalid: 'structure' }),
        'utf8'
      );

      const db = new DownloadDatabase(mangaDir);
      db.readFromDisk();

      expect(db.record.mangaTitle).toBe('');
      expect(db.record.chapters).toEqual({});
    });
  });

  describe('save', () => {
    it('should save database to disk', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.mangaTitle = 'Test Manga';
      db.record.mangaUrl = 'https://example.com/manga/test';
      db.record.connector = 'TestConnector';
      db.save();

      const dbFile = path.join(mangaDir, 'download_db.json');
      expect(fs.existsSync(dbFile)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      expect(saved.mangaTitle).toBe('Test Manga');
      expect(saved.mangaUrl).toBe('https://example.com/manga/test');
      expect(saved.connector).toBe('TestConnector');
      expect(saved.lastUpdated).toBeTruthy();
    });

    it('should update lastUpdated timestamp on save', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.mangaTitle = 'Test Manga';
      
      db.save();
      const firstSave = db.record.lastUpdated;
      
      // Wait a bit to ensure timestamp changes
      const start = Date.now();
      while (Date.now() - start < 1100) {
        // Wait for at least 1 second
      }
      
      db.save();
      const secondSave = db.record.lastUpdated;
      
      expect(secondSave).not.toBe(firstSave);
    });

    it('should create manga directory if it does not exist', () => {
      const newMangaDir = path.join(tempDir, 'New Manga');
      const db = new DownloadDatabase(newMangaDir);
      db.record.mangaTitle = 'New Manga';
      db.save();

      expect(fs.existsSync(newMangaDir)).toBe(true);
      expect(fs.existsSync(path.join(newMangaDir, 'download_db.json'))).toBe(true);
    });

    it('should use atomic write with temp file', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.mangaTitle = 'Test Manga';
      db.save();

      // Temp file should not exist after save
      const tempFile = path.join(mangaDir, 'download_db.json.tmp');
      expect(fs.existsSync(tempFile)).toBe(false);

      // Final file should exist
      const dbFile = path.join(mangaDir, 'download_db.json');
      expect(fs.existsSync(dbFile)).toBe(true);
    });
  });

  describe('initChapter', () => {
    it('should initialize new chapter in database', () => {
      const db = new DownloadDatabase(mangaDir);
      const pages = [
        { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
      ];

      db.initChapter('Chapter 1', 'https://example.com/chapter/1', 2, pages);

      expect(db.record.chapters['Chapter 1']).toBeDefined();
      expect(db.record.chapters['Chapter 1'].url).toBe('https://example.com/chapter/1');
      expect(db.record.chapters['Chapter 1'].status).toBe('downloading');
      expect(db.record.chapters['Chapter 1'].expectedFileCount).toBe(2);
      expect(db.record.chapters['Chapter 1'].pages).toEqual(pages);
    });

    it('should not overwrite completed chapter', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [],
      };

      db.initChapter('Chapter 1', 'https://example.com/chapter/1', 2, []);

      expect(db.record.chapters['Chapter 1'].status).toBe('completed');
      expect(db.record.chapters['Chapter 1'].downloadedAt).toBe('2024-01-01T12:00:00');
    });

    it('should overwrite incomplete chapter', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'incomplete',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [],
      };

      const newPages = [
        { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
      ];

      db.initChapter('Chapter 1', 'https://example.com/chapter/1', 1, newPages);

      expect(db.record.chapters['Chapter 1'].status).toBe('downloading');
      expect(db.record.chapters['Chapter 1'].pages).toEqual(newPages);
    });

    it('should persist chapter to disk', () => {
      const db = new DownloadDatabase(mangaDir);
      db.initChapter('Chapter 1', 'https://example.com/chapter/1', 2, []);

      const dbFile = path.join(mangaDir, 'download_db.json');
      const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      expect(saved.chapters['Chapter 1']).toBeDefined();
    });
  });

  describe('markPageCompleted', () => {
    it('should mark page as completed with file size', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
        ],
      };

      db.markPageCompleted('Chapter 1', 1, 12345);

      expect(db.record.chapters['Chapter 1'].pages[0].status).toBe('completed');
      expect(db.record.chapters['Chapter 1'].pages[0].fileSize).toBe(12345);
      expect(db.record.chapters['Chapter 1'].pages[1].status).toBe('pending');
    });

    it('should handle non-existent chapter', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(() => db.markPageCompleted('Chapter 1', 1, 12345)).not.toThrow();
    });

    it('should handle chapter without pages', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 0,
        downloadedAt: '',
        pages: null,
      };

      expect(() => db.markPageCompleted('Chapter 1', 1, 12345)).not.toThrow();
    });

    it('should persist changes to disk', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 1,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        ],
      };

      db.markPageCompleted('Chapter 1', 1, 12345);

      const dbFile = path.join(mangaDir, 'download_db.json');
      const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      expect(saved.chapters['Chapter 1'].pages[0].status).toBe('completed');
      expect(saved.chapters['Chapter 1'].pages[0].fileSize).toBe(12345);
    });
  });

  describe('markPageFailed', () => {
    it('should mark page as failed', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
        ],
      };

      db.markPageFailed('Chapter 1', 1);

      expect(db.record.chapters['Chapter 1'].pages[0].status).toBe('failed');
      expect(db.record.chapters['Chapter 1'].pages[1].status).toBe('pending');
    });

    it('should handle non-existent chapter', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(() => db.markPageFailed('Chapter 1', 1)).not.toThrow();
    });

    it('should persist changes to disk', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 1,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        ],
      };

      db.markPageFailed('Chapter 1', 1);

      const dbFile = path.join(mangaDir, 'download_db.json');
      const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      expect(saved.chapters['Chapter 1'].pages[0].status).toBe('failed');
    });
  });

  describe('markChapterCompleted', () => {
    it('should mark chapter as completed with timestamp', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [],
      };

      db.markChapterCompleted('Chapter 1');

      expect(db.record.chapters['Chapter 1'].status).toBe('completed');
      expect(db.record.chapters['Chapter 1'].downloadedAt).toBeTruthy();
    });

    it('should handle non-existent chapter', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(() => db.markChapterCompleted('Chapter 1')).not.toThrow();
    });

    it('should persist changes to disk', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [],
      };

      db.markChapterCompleted('Chapter 1');

      const dbFile = path.join(mangaDir, 'download_db.json');
      const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      expect(saved.chapters['Chapter 1'].status).toBe('completed');
      expect(saved.chapters['Chapter 1'].downloadedAt).toBeTruthy();
    });
  });

  describe('markChapterIncomplete', () => {
    it('should mark chapter as incomplete', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [],
      };

      db.markChapterIncomplete('Chapter 1');

      expect(db.record.chapters['Chapter 1'].status).toBe('incomplete');
    });

    it('should handle non-existent chapter', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(() => db.markChapterIncomplete('Chapter 1')).not.toThrow();
    });

    it('should persist changes to disk', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [],
      };

      db.markChapterIncomplete('Chapter 1');

      const dbFile = path.join(mangaDir, 'download_db.json');
      const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      expect(saved.chapters['Chapter 1'].status).toBe('incomplete');
    });
  });

  describe('getMissingPages', () => {
    it('should return pages with non-completed status', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 3,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
          { index: 3, fileName: '003.jpg', sourceUrl: 'https://example.com/3.jpg', status: 'failed' },
        ],
      };

      // Create file for completed page
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data');

      const missing = db.getMissingPages('Chapter 1', chapterDir);

      expect(missing.length).toBe(2);
      expect(missing[0].index).toBe(2);
      expect(missing[1].index).toBe(3);
    });

    it('should return completed pages with missing files', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'completed' },
        ],
      };

      // Only create file for first page
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data');

      const missing = db.getMissingPages('Chapter 1', chapterDir);

      expect(missing.length).toBe(1);
      expect(missing[0].index).toBe(2);
      expect(missing[0].status).toBe('pending'); // Status should be reset to pending
    });

    it('should return completed pages with zero-size files', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'completed' },
        ],
      };

      // Create files, one with data, one empty
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), '');

      const missing = db.getMissingPages('Chapter 1', chapterDir);

      expect(missing.length).toBe(1);
      expect(missing[0].index).toBe(2);
    });

    it('should skip pages with skipped status', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 3,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'skipped' },
          { index: 3, fileName: '003.jpg', sourceUrl: 'https://example.com/3.jpg', status: 'pending' },
        ],
      };

      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data');

      const missing = db.getMissingPages('Chapter 1', chapterDir);

      expect(missing.length).toBe(1);
      expect(missing[0].index).toBe(3);
    });

    it('should return empty array for non-existent chapter', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      const db = new DownloadDatabase(mangaDir);

      const missing = db.getMissingPages('Chapter 1', chapterDir);

      expect(missing).toEqual([]);
    });

    it('should return empty array for chapter without pages', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 0,
        downloadedAt: '',
        pages: null,
      };

      const missing = db.getMissingPages('Chapter 1', chapterDir);

      expect(missing).toEqual([]);
    });

    it('should return empty array for empty pages array (caller must use hasDownloadablePages)', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 10,
        downloadedAt: '',
        pages: [],
      };

      expect(db.getMissingPages('Chapter 1', chapterDir)).toEqual([]);
      expect(db.hasDownloadablePages('Chapter 1')).toBe(false);
    });
  });

  describe('isChapterComplete', () => {
    it('should return true when chapter is completed and all files exist', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'completed' },
        ],
      };

      // Create files
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), 'data2');

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(true);
    });

    it('should return false when chapter status is not completed', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'downloading',
        expectedFileCount: 2,
        downloadedAt: '',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'completed' },
        ],
      };

      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), 'data2');

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(false);
    });

    it('should return false when files are missing', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'completed' },
        ],
      };

      // Only create first file
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(false);
    });

    it('should return false when files have zero size', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'completed' },
        ],
      };

      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), ''); // Empty file

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(false);
    });

    it('should return false when page status is not completed', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'failed' },
        ],
      };

      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), 'data2');

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(false);
    });

    it('should skip pages with skipped status', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'skipped' },
        ],
      };

      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(true);
    });

    it('should return false for non-existent chapter', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      const db = new DownloadDatabase(mangaDir);

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(false);
    });

    it('should return false for chapter without pages', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 0,
        downloadedAt: '2024-01-01T12:00:00',
        pages: null,
      };

      const isComplete = db.isChapterComplete('Chapter 1', chapterDir);

      expect(isComplete).toBe(false);
    });

    it('should return false for completed chapter with empty pages array (no files)', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 10,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [],
      };

      expect(db.isChapterComplete('Chapter 1', chapterDir)).toBe(false);
    });
  });

  describe('hasDownloadablePages', () => {
    it('should be false for empty or null pages', () => {
      const db = new DownloadDatabase(mangaDir);
      expect(db.hasDownloadablePages('Missing')).toBe(false);
      db.record.chapters['A'] = { pages: null };
      expect(db.hasDownloadablePages('A')).toBe(false);
      db.record.chapters['B'] = { pages: [] };
      expect(db.hasDownloadablePages('B')).toBe(false);
    });

    it('should be true when at least one non-skipped page exists', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['C'] = {
        pages: [
          { index: 1, status: 'skipped' },
          { index: 2, status: 'pending' },
        ],
      };
      expect(db.hasDownloadablePages('C')).toBe(true);
    });
  });

  describe('hasChapter', () => {
    it('should return true when chapter exists', () => {
      const db = new DownloadDatabase(mangaDir);
      db.record.chapters['Chapter 1'] = {
        url: 'https://example.com/chapter/1',
        status: 'completed',
        expectedFileCount: 2,
        downloadedAt: '2024-01-01T12:00:00',
        pages: [],
      };

      expect(db.hasChapter('Chapter 1')).toBe(true);
    });

    it('should return false when chapter does not exist', () => {
      const db = new DownloadDatabase(mangaDir);

      expect(db.hasChapter('Chapter 1')).toBe(false);
    });
  });

  describe('loadOrCreate', () => {
    it('should load existing database', () => {
      const dbData = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/test',
        connector: 'TestConnector',
        lastUpdated: '2024-01-01T12:00:00',
        chapters: {
          'Chapter 1': {
            url: 'https://example.com/chapter/1',
            status: 'completed',
            expectedFileCount: 10,
            downloadedAt: '2024-01-01T12:00:00',
            pages: [],
          },
        },
      };

      fs.writeFileSync(
        path.join(mangaDir, 'download_db.json'),
        JSON.stringify(dbData, null, 2),
        'utf8'
      );

      const db = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');

      expect(db.record.mangaTitle).toBe('Test Manga');
      expect(db.record.mangaUrl).toBe('https://example.com/manga/test');
      expect(db.record.connector).toBe('TestConnector');
      expect(db.record.chapters['Chapter 1']).toBeDefined();
    });

    it('should create new database if file does not exist', () => {
      const db = loadOrCreate(mangaDir, 'New Manga', 'https://example.com/manga/new', 'NewConnector');

      expect(db.record.mangaTitle).toBe('New Manga');
      expect(db.record.mangaUrl).toBe('https://example.com/manga/new');
      expect(db.record.connector).toBe('NewConnector');
      expect(db.record.chapters).toEqual({});
    });

    it('should return DownloadDatabase instance', () => {
      const db = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');

      expect(db).toBeInstanceOf(DownloadDatabase);
      expect(db.mangaDir).toBe(mangaDir);
    });
  });

  describe('database persistence across multiple operations', () => {
    it('should maintain state across multiple downloads', () => {
      const chapterDir1 = path.join(mangaDir, 'Chapter 1');
      const chapterDir2 = path.join(mangaDir, 'Chapter 2');
      fs.mkdirSync(chapterDir1, { recursive: true });
      fs.mkdirSync(chapterDir2, { recursive: true });

      // First download
      const db1 = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      db1.initChapter('Chapter 1', 'https://example.com/chapter/1', 2, [
        { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
      ]);
      db1.markPageCompleted('Chapter 1', 1, 12345);
      db1.markPageCompleted('Chapter 1', 2, 67890);
      db1.markChapterCompleted('Chapter 1');

      // Create files
      fs.writeFileSync(path.join(chapterDir1, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir1, '002.jpg'), 'data2');

      // Second download (load existing DB)
      const db2 = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      expect(db2.record.chapters['Chapter 1']).toBeDefined();
      expect(db2.record.chapters['Chapter 1'].status).toBe('completed');

      db2.initChapter('Chapter 2', 'https://example.com/chapter/2', 2, [
        { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
      ]);
      db2.markPageCompleted('Chapter 2', 1, 11111);
      db2.markPageCompleted('Chapter 2', 2, 22222);
      db2.markChapterCompleted('Chapter 2');

      // Create files
      fs.writeFileSync(path.join(chapterDir2, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir2, '002.jpg'), 'data2');

      // Verify both chapters exist
      const db3 = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      expect(db3.record.chapters['Chapter 1']).toBeDefined();
      expect(db3.record.chapters['Chapter 2']).toBeDefined();
      expect(db3.isChapterComplete('Chapter 1', chapterDir1)).toBe(true);
      expect(db3.isChapterComplete('Chapter 2', chapterDir2)).toBe(true);
    });

    it('should support resume functionality', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      // Initial download (partial)
      const db1 = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      db1.initChapter('Chapter 1', 'https://example.com/chapter/1', 3, [
        { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
        { index: 3, fileName: '003.jpg', sourceUrl: 'https://example.com/3.jpg', status: 'pending' },
      ]);
      db1.markPageCompleted('Chapter 1', 1, 12345);
      db1.markPageCompleted('Chapter 1', 2, 67890);
      db1.markPageFailed('Chapter 1', 3);
      db1.markChapterIncomplete('Chapter 1');

      // Create files for completed pages
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), 'data2');

      // Resume download
      const db2 = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      const missing = db2.getMissingPages('Chapter 1', chapterDir);

      expect(missing.length).toBe(1);
      expect(missing[0].index).toBe(3);
      expect(missing[0].status).toBe('failed');

      // Complete the missing page
      db2.markPageCompleted('Chapter 1', 3, 99999);
      fs.writeFileSync(path.join(chapterDir, '003.jpg'), 'data3');
      db2.markChapterCompleted('Chapter 1');

      // Verify completion
      const db3 = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      expect(db3.isChapterComplete('Chapter 1', chapterDir)).toBe(true);
    });

    it('should verify database state matches file system state', () => {
      const chapterDir = path.join(mangaDir, 'Chapter 1');
      fs.mkdirSync(chapterDir, { recursive: true });

      const db = loadOrCreate(mangaDir, 'Test Manga', 'https://example.com/manga/test', 'TestConnector');
      db.initChapter('Chapter 1', 'https://example.com/chapter/1', 3, [
        { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'pending' },
        { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'pending' },
        { index: 3, fileName: '003.jpg', sourceUrl: 'https://example.com/3.jpg', status: 'pending' },
      ]);

      // Mark all as completed in DB
      db.markPageCompleted('Chapter 1', 1, 12345);
      db.markPageCompleted('Chapter 1', 2, 67890);
      db.markPageCompleted('Chapter 1', 3, 99999);
      db.markChapterCompleted('Chapter 1');

      // But only create 2 files on disk
      fs.writeFileSync(path.join(chapterDir, '001.jpg'), 'data1');
      fs.writeFileSync(path.join(chapterDir, '002.jpg'), 'data2');

      // Verify DB detects mismatch
      expect(db.isChapterComplete('Chapter 1', chapterDir)).toBe(false);

      // getMissingPages should detect the missing file
      const missing = db.getMissingPages('Chapter 1', chapterDir);
      expect(missing.length).toBe(1);
      expect(missing[0].index).toBe(3);
    });
  });
});
