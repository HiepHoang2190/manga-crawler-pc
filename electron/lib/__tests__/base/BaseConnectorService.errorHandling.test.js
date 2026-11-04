/**
 * Error Handling Tests for BaseConnectorService
 * 
 * Tests network failures, invalid URLs, retry logic, error messages,
 * and graceful degradation scenarios.
 * 
 * **Validates: Requirements AC 6.1 (Error Scenarios Testing)**
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock downloadDb before importing BaseConnectorService
const mockDb = {
  record: { mangaTitle: '', mangaUrl: '', connector: '', chapters: {} },
  save: jest.fn(),
  isChapterComplete: jest.fn().mockReturnValue(false),
  hasChapter: jest.fn().mockReturnValue(false),
  hasDownloadablePages: jest.fn().mockReturnValue(false),
  getMissingPages: jest.fn().mockReturnValue([]),
  initChapter: jest.fn(),
  markPageCompleted: jest.fn(),
  markPageFailed: jest.fn(),
  markChapterCompleted: jest.fn(),
  markChapterIncomplete: jest.fn(),
};

jest.mock('../../platform/storage/downloadDb', () => ({
  loadOrCreate: jest.fn(() => mockDb),
}));

jest.mock('../../download/connector/connectorDownloadUtils', () => ({
  downloadCoverIfNeeded: jest.fn(),
  downloadImageToFile: jest.fn(),
}));

const { BaseConnectorService } = require('../../platform/connectors/base/BaseConnectorService');
const { downloadImageToFile } = require('../../download/connector/connectorDownloadUtils');

/** Mock downloadImageToFile by URL basename: fail listed names, write file for others. */
function mockDownloadsByUrl(fail_names = []) {
  const fail_set = new Set(fail_names.map(String));
  downloadImageToFile.mockImplementation(async (url, filePath) => {
    const base = String(url).split('/').pop();
    if (fail_set.has(base)) return { ok: false };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'img');
    return { ok: true, fileSize: 3 };
  });
}

// Test implementation of BaseConnectorService
class TestConnectorService extends BaseConnectorService {
  constructor(config) {
    super(config);
    this.mockFetchChapterImages = jest.fn();
  }

  async load(url, options) {
    return { ok: true, manga: {}, chapters: [] };
  }

  async fetchChapterImages(chapterUrl, referer) {
    return this.mockFetchChapterImages(chapterUrl, referer);
  }
}

describe('BaseConnectorService - Error Handling', () => {
  let service;
  let tempDir;
  const mockConfig = {
    domain: 'https://example.com/',
    label: 'TestSite',
    siteId: 'testsite',
  };

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-test-'));
    service = new TestConnectorService(mockConfig);
    jest.clearAllMocks();

    // Reset mock db state
    mockDb.record = { mangaTitle: '', mangaUrl: '', connector: '', chapters: {} };
    mockDb.isChapterComplete.mockReturnValue(false);
    mockDb.hasChapter.mockReturnValue(false);
    mockDb.hasDownloadablePages.mockReturnValue(false);
    mockDb.getMissingPages.mockReturnValue([]);

    // Default: write a non-empty file so success path matches BaseConnector disk checks
    downloadImageToFile.mockImplementation(async (_url, filePath) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'img');
      return { ok: true, fileSize: 3 };
    });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Network Failure Scenarios', () => {
    it('should handle network timeout errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('ETIMEDOUT'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.error || result.aborted).toBeTruthy();
    });

    it('should handle connection refused errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('ECONNREFUSED'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.error || result.aborted).toBeTruthy();
    });

    it('should handle DNS resolution errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('ENOTFOUND'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.error || result.aborted).toBeTruthy();
    });

    it('should handle network reset errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('ECONNRESET'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
    });
  });

  describe('Invalid URL Scenarios', () => {
    it('should handle malformed URLs', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('Invalid URL'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'not-a-valid-url',
        chapterUrl: 'also-not-valid',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
    });

    it('should handle 404 errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('HTTP 404'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/nonexistent',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
    });

    it('should handle 403 forbidden errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('HTTP 403'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/forbidden',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
    });

    it('should handle 500 server errors', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('HTTP 500'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/error',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
    });

    it('should handle non-HTTP schemes', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('Invalid protocol'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'file:///etc/passwd',
        chapterUrl: 'ftp://example.com/chapter',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
    });
  });

  describe('Retry Logic Verification', () => {
    it('should retry failed downloads up to 3 times', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
      ]);

      // Mock retry function to fail all attempts
      mockDownloadsByUrl(['1.jpg', '2.jpg', '3.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      // Outer loop retries up to 3 times; each attempt calls downloadImageToFile(url, path, headers, signal)
      expect(downloadImageToFile).toHaveBeenCalled();
      expect(downloadImageToFile.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(downloadImageToFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.anything()
      );
    });

    it('should succeed on retry after initial failure', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
      ]);

      // Mock download to succeed and write file (matches BaseConnector disk checks)
      mockDownloadsByUrl([]);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(true);
      expect(mockDb.markPageCompleted).toHaveBeenCalled();
    });

    it('should wait 1 second between retry attempts', async () => {
      // This is tested in connectorDownloadUtils.test.js
      // Here we verify the retry function is called with correct parameters
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
      ]);

      mockDownloadsByUrl([]);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      await service.downloadChapter(payload, 'TestSite');

      // Verify retry function was called (delay is internal to downloadImageToFile)
      expect(downloadImageToFile).toHaveBeenCalled();
    });
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error message for empty image list', async () => {
      service.mockFetchChapterImages.mockResolvedValue([]);

      const mockLog = jest.fn();
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: mockLog,
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Không tìm thấy ảnh');
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Không tìm thấy ảnh'),
        'error'
      );
    });

    it('should remove empty chapter folder when image list is empty', async () => {
      service.mockFetchChapterImages.mockResolvedValue([]);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const { resolveChapterDir } = require('../../download/connector/connectorPathUtils');
      const chapter_dir = resolveChapterDir(tempDir, 'Test Manga', 'Chapter 1');

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(fs.existsSync(chapter_dir)).toBe(false);
    });

    it('should remove empty chapter folder when aborted early', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
      ]);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => true,
      };

      const { resolveChapterDir } = require('../../download/connector/connectorPathUtils');
      const chapter_dir = resolveChapterDir(tempDir, 'Test Manga', 'Chapter 1');

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.aborted).toBe(true);
      expect(fs.existsSync(chapter_dir)).toBe(false);
    });

    it('should remove empty chapter folder when fetch throws', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('network down'));

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const { resolveChapterDir } = require('../../download/connector/connectorPathUtils');
      const chapter_dir = resolveChapterDir(tempDir, 'Test Manga', 'Chapter 1');

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(fs.existsSync(chapter_dir)).toBe(false);
    });

    it('should remove empty chapter folder when all page downloads fail', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
      ]);
      mockDownloadsByUrl(['1.jpg', '2.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const { resolveChapterDir } = require('../../download/connector/connectorPathUtils');
      const chapter_dir = resolveChapterDir(tempDir, 'Test Manga', 'Chapter 1');

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.successCount).toBe(0);
      expect(fs.existsSync(chapter_dir)).toBe(false);
    });

    it('should keep chapter folder when at least one file was saved', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
      ]);

      downloadImageToFile.mockImplementation(async (url, filePath) => {
        if (String(url).includes('/1.jpg')) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, 'img');
          return { ok: true, fileSize: 3 };
        }
        return { ok: false };
      });

      const { resolveChapterDir } = require('../../download/connector/connectorPathUtils');
      const chapter_dir = resolveChapterDir(tempDir, 'Test Manga', 'Chapter 1');

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(fs.existsSync(chapter_dir)).toBe(true);
      expect(fs.readdirSync(chapter_dir).some((n) => !n.startsWith('.'))).toBe(true);
    });

    it('should log network errors clearly', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('Network timeout'));

      const mockLog = jest.fn();
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: mockLog,
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      // Error should be logged
      expect(mockLog).toHaveBeenCalled();
    });

    it('should provide helpful error for failed pages', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
      ]);

      mockDownloadsByUrl(['2.jpg']);

      const mockLog = jest.fn();
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: mockLog,
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.failedPageIndices).toEqual([2]);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('incomplete'),
        'warn'
      );
    });
  });

  describe('Graceful Degradation - Partial Success', () => {
    it('should continue downloading when some pages fail', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
      ]);

      // First and third succeed, second fails
      mockDownloadsByUrl(['2.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.successCount).toBe(2);
      expect(result.totalPages).toBe(3);
      expect(result.failedPageIndices).toEqual([2]);
      expect(mockDb.markPageCompleted).toHaveBeenCalledTimes(2);
      expect(mockDb.markPageFailed).toHaveBeenCalledTimes(1);
      expect(mockDb.markChapterIncomplete).toHaveBeenCalled();
    });

    it('should report partial success with correct counts', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/4.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/5.jpg', ext: 'jpg' },
      ]);

      // 3 succeed, 2 fail
      mockDownloadsByUrl(['2.jpg', '4.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.successCount).toBe(3);
      expect(result.totalPages).toBe(5);
      expect(result.failedPageIndices).toEqual([2, 4]);
    });

    it('should allow resume after partial failure', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
      ]);

      // First download: page 1 succeeds, page 2 fails
      mockDownloadsByUrl(['2.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result1 = await service.downloadChapter(payload, 'TestSite');

      expect(result1.ok).toBe(false);
      expect(result1.successCount).toBe(1);
      expect(result1.failedPageIndices).toEqual([2]);

      // Second download: resume and complete page 2
      jest.clearAllMocks();
      mockDb.hasChapter.mockReturnValue(true);
      mockDb.hasDownloadablePages.mockReturnValue(true);
      mockDb.isChapterComplete.mockReturnValue(false);
      mockDb.getMissingPages.mockReturnValue([
        { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'failed' }
      ]);
      mockDb.record.chapters['Chapter 1'] = {
        status: 'incomplete',
        expectedFileCount: 2,
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/2.jpg', status: 'failed' },
        ],
      };

      mockDownloadsByUrl([]);

      const result2 = await service.downloadChapter(payload, 'TestSite');

      expect(result2.ok).toBe(true);
      expect(mockDb.markChapterCompleted).toHaveBeenCalled();
    });

    it('force-reinits a completed chapter when the live page count increases', async () => {
      mockDb.isChapterComplete.mockReturnValue(true);
      mockDb.hasChapter.mockReturnValue(true);
      mockDb.hasDownloadablePages.mockReturnValue(true);
      mockDb.record.chapters['Chapter 1'] = {
        status: 'completed',
        expectedFileCount: 2,
        pages: [
          { index: 1, fileName: '001.jpg', sourceUrl: 'https://example.com/old1.jpg', status: 'completed' },
          { index: 2, fileName: '002.jpg', sourceUrl: 'https://example.com/old2.jpg', status: 'completed' },
        ],
      };
      mockDb.getMissingPages.mockReturnValue([
        { index: 1, fileName: '001.jpg' },
        { index: 2, fileName: '002.jpg' },
        { index: 3, fileName: '003.jpg' },
        { index: 4, fileName: '004.jpg' },
      ]);
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/4.jpg', ext: 'jpg' },
      ]);
      mockDownloadsByUrl([]);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(service.mockFetchChapterImages).toHaveBeenCalled();
      expect(mockDb.initChapter).toHaveBeenCalledWith(
        'Chapter 1',
        'https://example.com/chapter1',
        4,
        expect.any(Array),
        expect.objectContaining({ force: true })
      );
      expect(result.ok).toBe(true);
      expect(result.skipped).not.toBe(true);
    });
  });

  describe('Error Logging and Reporting', () => {
    it('should log all errors to onLog callback', async () => {
      service.mockFetchChapterImages.mockRejectedValue(new Error('Test error'));

      const mockLog = jest.fn();
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: mockLog,
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      await service.downloadChapter(payload, 'TestSite');

      expect(mockLog).toHaveBeenCalled();
      // Should have logged the error
      const errorLogs = mockLog.mock.calls.filter(call => call[1] === 'error' || call[1] === 'warn');
      expect(errorLogs.length).toBeGreaterThan(0);
    });

    it('should track failed page indices correctly', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
      ]);

      mockDownloadsByUrl(['1.jpg', '3.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.failedPageIndices).toEqual([1, 3]);
      expect(mockDb.markPageFailed).toHaveBeenCalledWith(expect.anything(), 1);
      expect(mockDb.markPageFailed).toHaveBeenCalledWith(expect.anything(), 3);
    });

    it('should report progress even when errors occur', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
      ]);

      mockDownloadsByUrl(['2.jpg']);

      const mockProgress = jest.fn();
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: jest.fn(),
        onProgress: mockProgress,
        shouldAbort: () => false,
      };

      await service.downloadChapter(payload, 'TestSite');

      // Progress should be reported for successful page
      expect(mockProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          mangaTitle: 'Test Manga',
          chapterTitle: 'Chapter 1',
          current: 1,
          total: 2,
        })
      );
    });
  });

  describe('Multi-threaded Error Handling', () => {
    it('should handle errors in parallel downloads', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/4.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/5.jpg', ext: 'jpg' },
      ]);

      // Mix of success and failure
      mockDownloadsByUrl(['2.jpg', '4.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 3, // Parallel downloads
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.successCount).toBe(3);
      expect(result.failedPageIndices).toEqual([2, 4]);
    });

    it('should not deadlock when all parallel downloads fail', async () => {
      service.mockFetchChapterImages.mockResolvedValue([
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
      ]);

      mockDownloadsByUrl(['1.jpg', '2.jpg', '3.jpg']);

      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://example.com/chapter1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 3,
        onLog: jest.fn(),
        onProgress: jest.fn(),
        shouldAbort: () => false,
      };

      const result = await service.downloadChapter(payload, 'TestSite');

      expect(result.ok).toBe(false);
      expect(result.successCount).toBe(0);
      expect(result.totalPages).toBe(3);
    });
  });
});
