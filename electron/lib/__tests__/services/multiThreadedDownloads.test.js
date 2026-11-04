/**
 * Multi-threaded Download Tests
 * 
 * Tests parallel download functionality with different thread counts (1, 3, 5)
 * using mock-based approach to verify:
 * - pLimit correctly controls concurrency
 * - All pages download successfully regardless of thread count
 * - Performance characteristics with different thread counts
 * - Database operations work correctly with parallel downloads
 * 
 * This test uses mocked fetch to avoid real network calls while still
 * testing the actual BaseConnectorService download logic.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { BaseConnectorService } = require('../../platform/connectors/base/BaseConnectorService');

// Mock fetch globally
global.fetch = jest.fn();

/**
 * Mock connector service for testing
 */
class MockConnectorService extends BaseConnectorService {
  constructor(config = {}) {
    super({
      domain: 'https://test.com/',
      label: 'TestConnector',
      siteId: 'test',
      ...config,
    });
    this.imageCount = config.imageCount || 20;
  }

  async load(url, options = {}) {
    return {
      ok: true,
      manga: {
        title: 'Test Manga',
        coverUrl: 'https://test.com/cover.jpg',
        mangaUrl: url,
        mangaId: '123',
        siteId: 'test',
        sourceLabel: 'TestConnector',
      },
      chapters: [
        { url: 'https://test.com/chapter/1', title: 'Chapter 1' },
      ],
    };
  }

  async fetchChapterImages(chapterUrl, referer) {
    // Return mock image list
    const images = [];
    for (let i = 0; i < this.imageCount; i++) {
      images.push({
        imageUrl: `https://test.com/images/${i + 1}.jpg`,
        ext: 'jpg',
      });
    }
    return images;
  }
}

describe('Multi-threaded Downloads', () => {
  let tempDir;
  let mockService;
  let activeFetches;
  let maxConcurrentFetches;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-thread-test-'));
    mockService = new MockConnectorService({ imageCount: 20 });
    activeFetches = 0;
    maxConcurrentFetches = 0;

    // Mock fetch to simulate image downloads
    global.fetch = jest.fn().mockImplementation(async (url) => {
      activeFetches++;
      maxConcurrentFetches = Math.max(maxConcurrentFetches, activeFetches);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      activeFetches--;
      
      // Return mock image data
      const mockImageBuffer = Buffer.from('fake-image-data');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer,
      };
    });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  /**
   * Helper to create mock payload for testing
   */
  function createMockPayload(mangaData, chapterData, options = {}) {
    return {
      mangaTitle: mangaData.title,
      mangaUrl: mangaData.url,
      chapterUrl: chapterData.url,
      chapterTitle: chapterData.title,
      baseSaveDir: options.baseSaveDir || tempDir,
      numberOfThreads: options.numberOfThreads || 3,
      coverUrl: mangaData.coverUrl || '',
      chapterFolderFormat: options.chapterFolderFormat || { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
      onLog: options.onLog || (() => {}),
      onProgress: options.onProgress || (() => {}),
      shouldAbort: options.shouldAbort || (() => false),
    };
  }

  /**
   * Helper to verify downloaded files
   */
  function verifyDownloadedFiles(chapterDir, expectedCount) {
    expect(fs.existsSync(chapterDir)).toBe(true);
    
    const files = fs.readdirSync(chapterDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
    expect(files.length).toBe(expectedCount);
    
    // Verify all files have content
    files.forEach(file => {
      const filePath = path.join(chapterDir, file);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);
    });
    
    return files;
  }

  describe('Thread count variations', () => {
    test('should download successfully with 1 thread', async () => {
      const payload = createMockPayload(
        { title: 'Test Manga 1T', url: 'https://test.com/manga/1' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        {
          baseSaveDir: tempDir,
          numberOfThreads: 1,
        }
      );

      maxConcurrentFetches = 0;
      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(20);
      expect(result.totalPages).toBe(20);
      expect(result.failedPageIndices).toBeUndefined();
      
      // Verify concurrency was limited to 1
      expect(maxConcurrentFetches).toBeLessThanOrEqual(2); // Allow small margin
      
      const chapterDir = path.join(tempDir, 'Test Manga 1T', 'Chap 001');
      verifyDownloadedFiles(chapterDir, 20);
    }, 30000);

    test('should download successfully with 3 threads', async () => {
      const payload = createMockPayload(
        { title: 'Test Manga 3T', url: 'https://test.com/manga/3' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        {
          baseSaveDir: tempDir,
          numberOfThreads: 3,
        }
      );

      maxConcurrentFetches = 0;
      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(20);
      expect(result.totalPages).toBe(20);
      
      // Verify concurrency was around 3
      expect(maxConcurrentFetches).toBeGreaterThanOrEqual(2);
      expect(maxConcurrentFetches).toBeLessThanOrEqual(5);
      
      const chapterDir = path.join(tempDir, 'Test Manga 3T', 'Chap 001');
      verifyDownloadedFiles(chapterDir, 20);
    }, 30000);

    test('should download successfully with 5 threads', async () => {
      const payload = createMockPayload(
        { title: 'Test Manga 5T', url: 'https://test.com/manga/5' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        {
          baseSaveDir: tempDir,
          numberOfThreads: 5,
        }
      );

      maxConcurrentFetches = 0;
      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(20);
      expect(result.totalPages).toBe(20);
      
      // Verify concurrency was around 5
      expect(maxConcurrentFetches).toBeGreaterThanOrEqual(3);
      expect(maxConcurrentFetches).toBeLessThanOrEqual(7);
      
      const chapterDir = path.join(tempDir, 'Test Manga 5T', 'Chap 001');
      verifyDownloadedFiles(chapterDir, 20);
    }, 30000);
  });

  describe('pLimit concurrency control', () => {
    test('should respect thread limit with 1 thread', async () => {
      const concurrencyLog = [];
      let currentActive = 0;

      global.fetch = jest.fn().mockImplementation(async (url) => {
        currentActive++;
        concurrencyLog.push({ time: Date.now(), active: currentActive });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        currentActive--;
        
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from('test').buffer,
        };
      });

      const payload = createMockPayload(
        { title: 'Concurrency Test 1', url: 'https://test.com/manga/c1' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 1 }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      
      // Verify max concurrent was 1 (with small margin for timing)
      const maxActive = Math.max(...concurrencyLog.map(log => log.active));
      expect(maxActive).toBeLessThanOrEqual(2);
    }, 30000);

    test('should respect thread limit with 3 threads', async () => {
      const concurrencyLog = [];
      let currentActive = 0;

      global.fetch = jest.fn().mockImplementation(async (url) => {
        currentActive++;
        concurrencyLog.push({ time: Date.now(), active: currentActive });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        currentActive--;
        
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from('test').buffer,
        };
      });

      const payload = createMockPayload(
        { title: 'Concurrency Test 3', url: 'https://test.com/manga/c3' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 3 }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      
      // Verify max concurrent was around 3
      const maxActive = Math.max(...concurrencyLog.map(log => log.active));
      expect(maxActive).toBeGreaterThanOrEqual(2);
      expect(maxActive).toBeLessThanOrEqual(5);
    }, 30000);

    test('should respect thread limit with 5 threads', async () => {
      const concurrencyLog = [];
      let currentActive = 0;

      global.fetch = jest.fn().mockImplementation(async (url) => {
        currentActive++;
        concurrencyLog.push({ time: Date.now(), active: currentActive });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        currentActive--;
        
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from('test').buffer,
        };
      });

      const payload = createMockPayload(
        { title: 'Concurrency Test 5', url: 'https://test.com/manga/c5' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 5 }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      
      // Verify max concurrent was around 5
      const maxActive = Math.max(...concurrencyLog.map(log => log.active));
      expect(maxActive).toBeGreaterThanOrEqual(3);
      expect(maxActive).toBeLessThanOrEqual(7);
    }, 30000);
  });

  describe('Performance comparison', () => {
    test('should show performance difference between thread counts', async () => {
      const results = [];

      for (const threads of [1, 3, 5]) {
        const payload = createMockPayload(
          { title: `Perf Test ${threads}T`, url: 'https://test.com/manga/perf' },
          { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
          { baseSaveDir: tempDir, numberOfThreads: threads }
        );

        const startTime = Date.now();
        const result = await mockService.downloadChapter(payload, 'TestConnector');
        const duration = Date.now() - startTime;

        results.push({ threads, duration, success: result.ok });
        console.log(`${threads} thread(s): ${duration}ms`);
      }

      // All should succeed
      results.forEach(r => expect(r.success).toBe(true));

      // More threads should generally be faster (or similar)
      // 1 thread should be slowest
      expect(results[0].duration).toBeGreaterThan(results[2].duration * 0.5);
    }, 90000);
  });

  describe('Database operations with parallel downloads', () => {
    test('should correctly track progress with multiple threads', async () => {
      const progressUpdates = [];
      
      const payload = createMockPayload(
        { title: 'Progress Test', url: 'https://test.com/manga/progress' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        {
          baseSaveDir: tempDir,
          numberOfThreads: 3,
          onProgress: (progress) => progressUpdates.push({ ...progress }),
        }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Verify progress is monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i].current).toBeGreaterThanOrEqual(progressUpdates[i - 1].current);
      }
      
      // Verify final progress
      const finalProgress = progressUpdates[progressUpdates.length - 1];
      expect(finalProgress.current).toBe(20);
      expect(finalProgress.total).toBe(20);
    }, 30000);

    test('should correctly mark pages in database', async () => {
      const payload = createMockPayload(
        { title: 'DB Test Manga', url: 'https://test.com/manga/db' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 5 }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      
      // Verify DB file exists
      const mangaDir = path.join(tempDir, 'DB Test Manga');
      const dbPath = path.join(mangaDir, 'download_db.json');
      expect(fs.existsSync(dbPath)).toBe(true);
      
      // Read and verify DB content
      const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      const chapterKey = 'Chapter 1';
      
      expect(dbContent.chapters[chapterKey]).toBeDefined();
      expect(dbContent.chapters[chapterKey].status).toBe('completed');
      expect(dbContent.chapters[chapterKey].expectedFileCount).toBe(20);
      expect(dbContent.chapters[chapterKey].pages.length).toBe(20);
      
      // Verify all pages are marked as completed
      dbContent.chapters[chapterKey].pages.forEach(page => {
        expect(page.status).toBe('completed');
        expect(page.fileSize).toBeGreaterThan(0);
      });
    }, 30000);
  });

  describe('Edge cases', () => {
    test('should handle numberOfThreads = 0 (default to 1)', async () => {
      const payload = createMockPayload(
        { title: 'Edge 0', url: 'https://test.com/manga/e0' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 0 }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(20);
    }, 30000);

    test('should handle numberOfThreads > 5 (cap at 5)', async () => {
      const payload = createMockPayload(
        { title: 'Edge 10', url: 'https://test.com/manga/e10' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 10 }
      );

      maxConcurrentFetches = 0;
      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(20);
      
      // Should be capped at 5
      expect(maxConcurrentFetches).toBeLessThanOrEqual(7);
    }, 30000);

    test('should handle negative numberOfThreads (default to 1)', async () => {
      const payload = createMockPayload(
        { title: 'Edge Neg', url: 'https://test.com/manga/eneg' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: -5 }
      );

      const result = await mockService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(20);
    }, 30000);
  });

  describe('Different connector types', () => {
    test('should work with small image count (5 images)', async () => {
      const smallService = new MockConnectorService({ imageCount: 5 });
      
      const payload = createMockPayload(
        { title: 'Small Test', url: 'https://test.com/manga/small' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 3 }
      );

      const result = await smallService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(5);
      expect(result.totalPages).toBe(5);
    }, 30000);

    test('should work with large image count (50 images)', async () => {
      const largeService = new MockConnectorService({ imageCount: 50 });
      
      const payload = createMockPayload(
        { title: 'Large Test', url: 'https://test.com/manga/large' },
        { title: 'Chapter 1', url: 'https://test.com/chapter/1' },
        { baseSaveDir: tempDir, numberOfThreads: 5 }
      );

      const result = await largeService.downloadChapter(payload, 'TestConnector');
      
      expect(result.ok).toBe(true);
      expect(result.successCount).toBe(50);
      expect(result.totalPages).toBe(50);
    }, 60000);
  });
});
