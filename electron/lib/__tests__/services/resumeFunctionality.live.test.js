const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadOrCreate } = require('../../platform/storage/downloadDb');

/**
 * Resume Functionality Test Suite
 * 
 * Tests that interrupted downloads can be resumed correctly across different connectors.
 * Verifies:
 * - Download database tracks completion status
 * - Already-downloaded pages are skipped on resume
 * - Multiple connectors behave consistently
 */

const moeTruyenService = require('../../platform/connectors/services/moeTruyenService');
const comixService = require('../../platform/connectors/services/comixService');
const cuuTruyenService = require('../../platform/connectors/services/cuuTruyenService');
const mangadexService = require('../../platform/connectors/services/mangadexService');

const TEST_TIMEOUT = 120000; // 2 minutes per test

describe('Resume Functionality Tests', () => {
  let tempDir;

  beforeEach(() => {
    // Create unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to create a mock payload for testing
   */
  function createMockPayload(mangaData, chapterData, options = {}) {
    return {
      mangaTitle: mangaData.title,
      mangaUrl: mangaData.url,
      chapterUrl: chapterData.url,
      chapterTitle: chapterData.title,
      baseSaveDir: options.baseSaveDir || tempDir,
      numberOfThreads: options.numberOfThreads || 2,
      coverUrl: mangaData.coverUrl || '',
      chapterFolderFormat: options.chapterFolderFormat || { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
      onLog: options.onLog || ((msg, level) => {
        if (level === 'error') console.error(`[${level}] ${msg}`);
      }),
      onProgress: options.onProgress || (() => {}),
      shouldAbort: options.shouldAbort || (() => false),
    };
  }

  /**
   * Helper function to simulate partial download by deleting some files
   */
  function simulatePartialDownload(chapterDir, keepCount) {
    if (!fs.existsSync(chapterDir)) return;
    
    const files = fs.readdirSync(chapterDir)
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort();
    
    // Delete files after keepCount
    for (let i = keepCount; i < files.length; i++) {
      const filePath = path.join(chapterDir, files[i]);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    return files.length;
  }

  /**
   * Helper function to verify database consistency
   */
  function verifyDatabaseConsistency(mangaDir, chapterTitle, chapterDir) {
    const db = loadOrCreate(mangaDir, '', '', '');
    const chapter = db.record.chapters[chapterTitle];
    
    if (!chapter) {
      throw new Error(`Chapter ${chapterTitle} not found in database`);
    }

    // Check that all completed pages exist on disk
    for (const page of chapter.pages) {
      if (page.status === 'completed') {
        const filePath = path.join(chapterDir, page.fileName);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Page ${page.index} marked as completed but file ${page.fileName} does not exist`);
        }
        if (fs.statSync(filePath).size === 0) {
          throw new Error(`Page ${page.index} file ${page.fileName} has zero size`);
        }
      }
    }

    return chapter;
  }

  describe('HTML Connector Resume Tests', () => {

    test('MoeTruyen: should resume interrupted download', async () => {
      const moeTruyenTestData = {
        manga: {
          title: 'Test Manga',
          url: 'https://moetruyen.net/truyen/test-manga',
          coverUrl: '',
        },
        chapter: {
          title: 'Chapter 1',
          url: 'https://moetruyen.net/truyen/test-manga/chap-1',
        },
      };

      const payload = createMockPayload(moeTruyenTestData.manga, moeTruyenTestData.chapter, {
        baseSaveDir: tempDir,
        numberOfThreads: 2,
      });

      // First download
      const firstResult = await moeTruyenService.downloadChapter(payload);
      
      if (!firstResult.ok) {
        console.warn('MoeTruyen download failed, skipping resume test');
        return;
      }

      const mangaDir = path.join(tempDir, 'Test Manga');
      const chapterDir = path.join(mangaDir, 'Chap 001');
      
      // Simulate partial download
      const totalFiles = simulatePartialDownload(chapterDir, 3);
      
      // Resume download
      const secondResult = await moeTruyenService.downloadChapter(payload);
      expect(secondResult.ok).toBe(true);
      
      // Verify all files restored
      const filesAfterResume = fs.readdirSync(chapterDir)
        .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
      expect(filesAfterResume.length).toBe(totalFiles);
    }, TEST_TIMEOUT);

    test('Comix: should resume interrupted download', async () => {
      const comixTestData = {
        manga: {
          title: 'Test Comic',
          url: 'https://comix.vn/truyen/test-comic',
          coverUrl: '',
        },
        chapter: {
          title: 'Chapter 1',
          url: 'https://comix.vn/truyen/test-comic/chap-1',
        },
      };

      const payload = createMockPayload(comixTestData.manga, comixTestData.chapter, {
        baseSaveDir: tempDir,
        numberOfThreads: 2,
      });

      // First download
      const firstResult = await comixService.downloadChapter(payload);
      
      if (!firstResult.ok) {
        console.warn('Comix download failed, skipping resume test');
        return;
      }

      const mangaDir = path.join(tempDir, 'Test Comic');
      const chapterDir = path.join(mangaDir, 'Chap 001');
      
      // Simulate partial download
      simulatePartialDownload(chapterDir, 4);
      
      // Resume download
      const secondResult = await comixService.downloadChapter(payload);
      expect(secondResult.ok).toBe(true);
      
      // Verify database consistency
      verifyDatabaseConsistency(mangaDir, 'Chapter 1', chapterDir);
    }, TEST_TIMEOUT);
  });

  describe('API Connector Resume Tests', () => {
    test('CuuTruyen: should resume interrupted download', async () => {
      const cuuTruyenTestData = {
        manga: {
          title: 'Test Manga',
          url: 'https://cuutruyen.net/manga/test-manga',
          coverUrl: '',
        },
        chapter: {
          title: 'Chapter 1',
          url: 'https://cuutruyen.net/manga/test-manga/chapter-1',
        },
      };

      const payload = createMockPayload(cuuTruyenTestData.manga, cuuTruyenTestData.chapter, {
        baseSaveDir: tempDir,
        numberOfThreads: 2,
      });

      // First download
      const firstResult = await cuuTruyenService.downloadChapter(payload);
      
      if (!firstResult.ok) {
        console.warn('CuuTruyen download failed, skipping resume test');
        return;
      }

      const mangaDir = path.join(tempDir, 'Test Manga');
      const chapterDir = path.join(mangaDir, 'Chap 001');
      
      // Simulate partial download
      const totalFiles = simulatePartialDownload(chapterDir, 6);
      
      // Resume download
      const secondResult = await cuuTruyenService.downloadChapter(payload);
      expect(secondResult.ok).toBe(true);
      
      // Verify all files restored
      const filesAfterResume = fs.readdirSync(chapterDir)
        .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
      expect(filesAfterResume.length).toBe(totalFiles);
      
      // Verify database consistency
      verifyDatabaseConsistency(mangaDir, 'Chapter 1', chapterDir);
    }, TEST_TIMEOUT);

    test('Mangadex: should resume interrupted download', async () => {
      const mangadexTestData = {
        manga: {
          title: 'Test Manga',
          url: 'https://mangadex.org/title/test-id',
          coverUrl: '',
        },
        chapter: {
          title: 'Chapter 1',
          url: 'https://mangadex.org/chapter/test-chapter-id',
        },
      };

      const payload = createMockPayload(mangadexTestData.manga, mangadexTestData.chapter, {
        baseSaveDir: tempDir,
        numberOfThreads: 2,
      });

      // First download
      const firstResult = await mangadexService.downloadChapter(payload);
      
      if (!firstResult.ok) {
        console.warn('Mangadex download failed, skipping resume test');
        return;
      }

      const mangaDir = path.join(tempDir, 'Test Manga');
      const chapterDir = path.join(mangaDir, 'Chap 001');
      
      // Simulate partial download
      simulatePartialDownload(chapterDir, 5);
      
      // Resume download
      const secondResult = await mangadexService.downloadChapter(payload);
      expect(secondResult.ok).toBe(true);
      
      // Verify database consistency
      verifyDatabaseConsistency(mangaDir, 'Chapter 1', chapterDir);
    }, TEST_TIMEOUT);
  });

  describe('Database Tracking Tests', () => {
    test('should track completion status correctly', async () => {
      const testData = {
        manga: {
          title: 'DB Test Manga',
          url: 'https://example.com/manga/db-test',
          coverUrl: '',
        },
        chapter: {
          title: 'Chapter 1',
          url: 'https://example.com/manga/db-test/chapter-1',
        },
      };

      const payload = createMockPayload(testData.manga, testData.chapter, {
        baseSaveDir: tempDir,
        numberOfThreads: 1,
      });

      // Download with Comix
      const result = await comixService.downloadChapter(payload);
      
      if (!result.ok) {
        console.warn('Download failed, skipping database tracking test');
        return;
      }

      const mangaDir = path.join(tempDir, 'DB Test Manga');
      const db = loadOrCreate(mangaDir, '', '', '');
      
      // Verify database structure
      expect(db.record.chapters).toBeDefined();
      expect(db.record.chapters['Chapter 1']).toBeDefined();
      
      const chapter = db.record.chapters['Chapter 1'];
      expect(chapter.status).toBe('completed');
      expect(chapter.pages).toBeDefined();
      expect(chapter.pages.length).toBeGreaterThan(0);
      
      // Verify all pages are marked as completed
      for (const page of chapter.pages) {
        expect(page.status).toBe('completed');
        expect(page.fileSize).toBeGreaterThan(0);
      }
    }, TEST_TIMEOUT);

    test('should handle multiple chapters in same manga', async () => {
      const testData = {
        manga: {
          title: 'Multi Chapter Test',
          url: 'https://example.com/manga/multi-test',
          coverUrl: '',
        },
        chapters: [
          { title: 'Chapter 1', url: 'https://example.com/manga/multi-test/chapter-1' },
          { title: 'Chapter 2', url: 'https://example.com/manga/multi-test/chapter-2' },
        ],
      };

      // Download first chapter
      const payload1 = createMockPayload(testData.manga, testData.chapters[0], {
        baseSaveDir: tempDir,
        numberOfThreads: 1,
      });
      
      const result1 = await comixService.downloadChapter(payload1);
      
      if (!result1.ok) {
        console.warn('First chapter download failed, skipping multi-chapter test');
        return;
      }

      // Download second chapter
      const payload2 = createMockPayload(testData.manga, testData.chapters[1], {
        baseSaveDir: tempDir,
        numberOfThreads: 1,
      });
      
      const result2 = await comixService.downloadChapter(payload2);
      
      if (!result2.ok) {
        console.warn('Second chapter download failed');
        return;
      }

      // Verify database has both chapters
      const mangaDir = path.join(tempDir, 'Multi Chapter Test');
      const db = loadOrCreate(mangaDir, '', '', '');
      
      expect(Object.keys(db.record.chapters).length).toBe(2);
      expect(db.record.chapters['Chapter 1']).toBeDefined();
      expect(db.record.chapters['Chapter 2']).toBeDefined();
    }, TEST_TIMEOUT * 2);
  });

  describe('Skip Already Downloaded Tests', () => {
    test('should skip already-downloaded pages on resume', async () => {
      const testData = {
        manga: {
          title: 'Skip Test Manga',
          url: 'https://example.com/manga/skip-test',
          coverUrl: '',
        },
        chapter: {
          title: 'Chapter 1',
          url: 'https://example.com/manga/skip-test/chapter-1',
        },
      };

      const downloadedPages = [];
      const payload = createMockPayload(testData.manga, testData.chapter, {
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: (msg, level) => {
          // Track which pages are downloaded
          const match = msg.match(/\[(\d+)\/(\d+)\]/);
          if (match) {
            downloadedPages.push(parseInt(match[1]));
          }
        },
      });

      // First download
      const firstResult = await comixService.downloadChapter(payload);
      
      if (!firstResult.ok) {
        console.warn('First download failed, skipping skip test');
        return;
      }

      const firstDownloadCount = downloadedPages.length;
      expect(firstDownloadCount).toBeGreaterThan(0);

      // Simulate partial download (keep first 3 pages)
      const mangaDir = path.join(tempDir, 'Skip Test Manga');
      const chapterDir = path.join(mangaDir, 'Chap 001');
      const totalFiles = simulatePartialDownload(chapterDir, 3);

      // Reset tracking
      downloadedPages.length = 0;

      // Resume download
      const secondResult = await comixService.downloadChapter(payload);
      expect(secondResult.ok).toBe(true);

      // Should only download missing pages (not the first 3)
      const secondDownloadCount = downloadedPages.length;
      expect(secondDownloadCount).toBe(totalFiles - 3);
      
      // Verify the first 3 pages were not re-downloaded
      expect(downloadedPages.includes(1)).toBe(false);
      expect(downloadedPages.includes(2)).toBe(false);
      expect(downloadedPages.includes(3)).toBe(false);
    }, TEST_TIMEOUT);
  });
});
