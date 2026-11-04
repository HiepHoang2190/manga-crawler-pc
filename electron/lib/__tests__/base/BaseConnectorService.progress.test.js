const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BaseConnectorService } = require('./BaseConnectorService');
const { HtmlConnectorService } = require('./HtmlConnectorService');
const { ApiConnectorService } = require('./ApiConnectorService');

/**
 * Progress Tracking Accuracy Tests
 * 
 * **Validates: Requirements AC 6.2, AC 4.2**
 * 
 * Tests verify:
 * - Progress callbacks are invoked correctly during downloads
 * - Progress.current is monotonically increasing
 * - Progress.current ≤ progress.total at all times
 * - Final progress matches total page count
 * - Progress tracking works with multiple connector types and thread counts
 * - Progress tracking works correctly with resume functionality
 */

// Mock concrete implementation for testing
class TestConnectorService extends BaseConnectorService {
  constructor(config, mockImages = []) {
    super(config);
    this.mockImages = mockImages;
  }

  async load(url, options) {
    return {
      ok: true,
      manga: {
        title: 'Test Manga',
        coverUrl: 'https://example.com/cover.jpg',
        mangaUrl: url,
        mangaId: 'test-123',
        siteId: this.config.siteId,
        sourceLabel: this.config.label,
      },
      chapters: [{ url: 'https://example.com/chapter/1', title: 'Chapter 1' }],
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    return this.mockImages;
  }

  async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo) {
    // Simulate download by creating a file
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from('fake image data'));
    return { ok: true, fileSize: 100 };
  }
}

describe('BaseConnectorService - Progress Tracking Accuracy', () => {
  let tempDir;
  let service;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Progress callback invocation', () => {
    it('should invoke progress callback for each downloaded page', async () => {
      const mockImages = [
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/2.jpg', ext: 'jpg' },
        { imageUrl: 'https://example.com/3.jpg', ext: 'jpg' },
      ];

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      const result = await service.downloadChapter(payload);

      expect(result.ok).toBe(true);
      // Should have initial call (current: 0) + 3 page downloads
      expect(progressCalls.length).toBeGreaterThanOrEqual(4);
      
      // Verify initial progress
      expect(progressCalls[0]).toMatchObject({
        mangaTitle: 'Test Manga',
        chapterTitle: 'Chapter 1',
        current: 0,
        total: 3,
      });
    });

    it('should include correct metadata in progress callbacks', async () => {
      const mockImages = [
        { imageUrl: 'https://example.com/1.jpg', ext: 'jpg' },
      ];

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      await service.downloadChapter(payload);

      // All progress calls should have the same metadata
      progressCalls.forEach((call) => {
        expect(call).toHaveProperty('mangaTitle', 'Test Manga');
        expect(call).toHaveProperty('chapterTitle', 'Chapter 1');
        expect(call).toHaveProperty('chapterUrl', 'https://example.com/chapter/1');
        expect(call).toHaveProperty('current');
        expect(call).toHaveProperty('total');
      });
    });
  });

  describe('Progress monotonicity', () => {
    it('should have monotonically increasing progress.current', async () => {
      const mockImages = Array.from({ length: 10 }, (_, i) => ({
        imageUrl: `https://example.com/${i + 1}.jpg`,
        ext: 'jpg',
      }));

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1, // Single thread to ensure sequential
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      await service.downloadChapter(payload);

      // Verify monotonicity: each current should be >= previous
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i].current).toBeGreaterThanOrEqual(progressCalls[i - 1].current);
      }
    });

    it('should maintain monotonicity with multiple threads', async () => {
      const mockImages = Array.from({ length: 20 }, (_, i) => ({
        imageUrl: `https://example.com/${i + 1}.jpg`,
        ext: 'jpg',
      }));

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 5, // Multiple threads
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      await service.downloadChapter(payload);

      // Even with parallel downloads, progress should never decrease
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i].current).toBeGreaterThanOrEqual(progressCalls[i - 1].current);
      }
    });
  });

  describe('Progress bounds', () => {
    it('should ensure progress.current ≤ progress.total at all times', async () => {
      const mockImages = Array.from({ length: 15 }, (_, i) => ({
        imageUrl: `https://example.com/${i + 1}.jpg`,
        ext: 'jpg',
      }));

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 3,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      await service.downloadChapter(payload);

      // Verify bounds: current should never exceed total
      progressCalls.forEach((call, index) => {
        expect(call.current).toBeLessThanOrEqual(call.total);
        expect(call.current).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have consistent total across all progress calls', async () => {
      const mockImages = Array.from({ length: 8 }, (_, i) => ({
        imageUrl: `https://example.com/${i + 1}.jpg`,
        ext: 'jpg',
      }));

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 2,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      await service.downloadChapter(payload);

      // All progress calls should have the same total
      const expectedTotal = mockImages.length;
      progressCalls.forEach((call) => {
        expect(call.total).toBe(expectedTotal);
      });
    });
  });

  describe('Final progress accuracy', () => {
    it('should have final progress.current equal to total page count', async () => {
      const mockImages = Array.from({ length: 12 }, (_, i) => ({
        imageUrl: `https://example.com/${i + 1}.jpg`,
        ext: 'jpg',
      }));

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const progressCalls = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 3,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      const result = await service.downloadChapter(payload);

      expect(result.ok).toBe(true);
      expect(result.totalPages).toBe(mockImages.length);

      // Find the last progress call (highest current value)
      const finalProgress = progressCalls.reduce((max, call) =>
        call.current > max.current ? call : max
      );

      expect(finalProgress.current).toBe(mockImages.length);
      expect(finalProgress.total).toBe(mockImages.length);
    });
  });

  describe('Progress with different thread counts', () => {
    const testThreadCounts = [1, 2, 3, 5];

    testThreadCounts.forEach((threadCount) => {
      it(`should track progress correctly with ${threadCount} thread(s)`, async () => {
        const mockImages = Array.from({ length: 10 }, (_, i) => ({
          imageUrl: `https://example.com/${i + 1}.jpg`,
          ext: 'jpg',
        }));

        service = new TestConnectorService(
          { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
          mockImages
        );

        const progressCalls = [];
        const payload = {
          mangaTitle: 'Test Manga',
          mangaUrl: 'https://example.com/manga/1',
          chapterUrl: 'https://example.com/chapter/1',
          chapterTitle: 'Chapter 1',
          baseSaveDir: tempDir,
          numberOfThreads: threadCount,
          onProgress: (progress) => progressCalls.push({ ...progress }),
          onLog: () => {},
        };

        const result = await service.downloadChapter(payload);

        expect(result.ok).toBe(true);
        expect(result.totalPages).toBe(10);

        // Verify progress properties
        progressCalls.forEach((call) => {
          expect(call.current).toBeGreaterThanOrEqual(0);
          expect(call.current).toBeLessThanOrEqual(call.total);
          expect(call.total).toBe(10);
        });

        // Verify final progress
        const finalProgress = progressCalls[progressCalls.length - 1];
        expect(finalProgress.current).toBe(10);
      });
    });
  });

  describe('Progress with resume functionality', () => {
    it('should track progress correctly when resuming a partial download', async () => {
      const mockImages = Array.from({ length: 6 }, (_, i) => ({
        imageUrl: `https://example.com/${i + 1}.jpg`,
        ext: 'jpg',
      }));

      service = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );

      const payload = {
        mangaTitle: 'Test Manga Resume',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onProgress: () => {},
        onLog: () => {},
      };

      // First download: complete 3 pages then abort
      let abortAfter = 3;
      let downloadCount = 0;
      
      const serviceWithAbort = new TestConnectorService(
        { domain: 'https://example.com/', label: 'Test', siteId: 'test' },
        mockImages
      );
      
      serviceWithAbort.downloadImageWithRetry = async (imageUrl, filePath, headers, maxAttempts, imageInfo) => {
        downloadCount++;
        if (downloadCount <= abortAfter) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, Buffer.from('fake image data'));
          return { ok: true, fileSize: 100 };
        }
        return { ok: false };
      };

      const firstResult = await serviceWithAbort.downloadChapter({
        ...payload,
        shouldAbort: () => downloadCount > abortAfter,
      });

      expect(firstResult.ok).toBe(false);

      // Second download: resume and complete
      const progressCalls = [];
      const resumeResult = await service.downloadChapter({
        ...payload,
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });

      expect(resumeResult.ok).toBe(true);

      // Progress should only track remaining pages
      const remainingPages = mockImages.length - abortAfter;
      expect(progressCalls[0].total).toBe(remainingPages);

      // Verify monotonicity
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i].current).toBeGreaterThanOrEqual(progressCalls[i - 1].current);
      }

      // Verify final progress
      const finalProgress = progressCalls[progressCalls.length - 1];
      expect(finalProgress.current).toBe(remainingPages);
      expect(finalProgress.total).toBe(remainingPages);
    });
  });

  describe('Progress with different connector types', () => {
    it('should track progress correctly with HtmlConnectorService', async () => {
      // Mock HtmlConnectorService
      class TestHtmlService extends HtmlConnectorService {
        constructor() {
          super({
            domain: 'https://example.com/',
            label: 'TestHtml',
            siteId: 'testhtml',
            selectors: {
              chapterLinks: 'a.chapter',
              title: 'h1.title',
              cover: 'img.cover',
            },
          });
        }

        async fetchChapterImages(chapterUrl, referer) {
          return Array.from({ length: 5 }, (_, i) => ({
            imageUrl: `https://example.com/${i + 1}.jpg`,
            ext: 'jpg',
          }));
        }

        async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, Buffer.from('fake image data'));
          return { ok: true, fileSize: 100 };
        }
      }

      const htmlService = new TestHtmlService();
      const progressCalls = [];

      const payload = {
        mangaTitle: 'HTML Test Manga',
        mangaUrl: 'https://example.com/manga/1',
        chapterUrl: 'https://example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 2,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      const result = await htmlService.downloadChapter(payload);

      expect(result.ok).toBe(true);
      expect(result.totalPages).toBe(5);

      // Verify progress tracking
      progressCalls.forEach((call) => {
        expect(call.current).toBeGreaterThanOrEqual(0);
        expect(call.current).toBeLessThanOrEqual(call.total);
      });
    });

    it('should track progress correctly with ApiConnectorService', async () => {
      // Mock API client
      const mockApiClient = {
        async load(url, options) {
          return {
            ok: true,
            manga: {
              title: 'API Test Manga',
              coverUrl: 'https://example.com/cover.jpg',
              mangaUrl: url,
              mangaId: 'api-123',
              siteId: 'testapi',
              sourceLabel: 'TestAPI',
            },
            chapters: [],
          };
        },
        async fetchChapterImages(chapterUrl) {
          return Array.from({ length: 7 }, (_, i) => ({
            imageUrl: `https://api.example.com/${i + 1}.jpg`,
            ext: 'jpg',
          }));
        },
      };

      class TestApiService extends ApiConnectorService {
        constructor() {
          super({
            domain: 'https://api.example.com/',
            label: 'TestAPI',
            siteId: 'testapi',
            apiClient: mockApiClient,
          });
        }

        async downloadImageWithRetry(imageUrl, filePath, headers, maxAttempts, imageInfo) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, Buffer.from('fake image data'));
          return { ok: true, fileSize: 100 };
        }
      }

      const apiService = new TestApiService();
      const progressCalls = [];

      const payload = {
        mangaTitle: 'API Test Manga',
        mangaUrl: 'https://api.example.com/manga/1',
        chapterUrl: 'https://api.example.com/chapter/1',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 3,
        onProgress: (progress) => progressCalls.push({ ...progress }),
        onLog: () => {},
      };

      const result = await apiService.downloadChapter(payload);

      expect(result.ok).toBe(true);
      expect(result.totalPages).toBe(7);

      // Verify progress tracking
      progressCalls.forEach((call) => {
        expect(call.current).toBeGreaterThanOrEqual(0);
        expect(call.current).toBeLessThanOrEqual(call.total);
      });

      // Verify final progress
      const finalProgress = progressCalls[progressCalls.length - 1];
      expect(finalProgress.current).toBe(7);
    });
  });
});
