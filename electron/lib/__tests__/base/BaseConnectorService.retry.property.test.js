const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { BaseConnectorService } = require('./BaseConnectorService');

// Mock concrete implementation for testing with retry tracking
class MockConnectorServiceWithRetryTracking extends BaseConnectorService {
  constructor(config, mockImages, failureConfig = {}) {
    super(config);
    this.mockImages = mockImages || [];
    this.failureConfig = failureConfig; // { pageIndex: failCount }
    this.retryAttempts = {}; // Track retry attempts per page
  }

  async load(url, options) {
    return {
      ok: true,
      manga: {
        title: 'Test Manga',
        coverUrl: 'https://example.com/cover.jpg',
        mangaUrl: url,
        mangaId: 'test-manga',
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
    // Track retry attempts for this image
    if (!this.retryAttempts[imageUrl]) {
      this.retryAttempts[imageUrl] = 0;
    }
    this.retryAttempts[imageUrl]++;

    // Check if this page should fail based on configuration
    const pageIndex = imageInfo?.index || 1;
    const shouldFail = this.failureConfig[pageIndex] || 0;
    
    // Fail for the configured number of attempts
    if (this.retryAttempts[imageUrl] <= shouldFail) {
      return { ok: false };
    }

    // Create a deterministic fake image based on the URL
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const fakeImageData = Buffer.from(hash.repeat(100), 'utf8');
    
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fakeImageData);
    
    return { ok: true, fileSize: fakeImageData.length };
  }
}

// Helper to create a temporary directory
function createTempDir() {
  const tmpDir = path.join(os.tmpdir(), `manga-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

// Helper to clean up a directory
function cleanupDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Property 5: Retry Count Limit ───────────────────────────────────────────
// **Validates: Requirements 6.3**
describe('BaseConnectorService — Property 5: Retry Count Limit', () => {
  test('Property 5: Maximum 3 retry attempts per page download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 10 }),
          // Generate failure configuration: some pages fail 1-2 times before succeeding
          failurePattern: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 10 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount, failurePattern }) => {
          const tmpDir = createTempDir();
          
          try {
            // Generate mock images
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/image${i + 1}.jpg`,
              ext: 'jpg',
              index: i + 1,
            }));
            
            // Build failure config from pattern
            const failureConfig = {};
            for (let i = 0; i < Math.min(imageCount, failurePattern.length); i++) {
              failureConfig[i + 1] = failurePattern[i];
            }
            
            const service = new MockConnectorServiceWithRetryTracking(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages,
              failureConfig
            );
            
            const payload = {
              mangaTitle,
              mangaUrl: 'https://example.com/manga/test',
              chapterUrl: 'https://example.com/chapter/1',
              chapterTitle,
              baseSaveDir: tmpDir,
              numberOfThreads: 1,
              coverUrl: 'https://example.com/cover.jpg',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            // Download chapter
            await service.downloadChapter(payload, 'TestSite');
            
            // Property: ∀ page p, retry attempts ≤ 3
            for (const imageUrl in service.retryAttempts) {
              const attempts = service.retryAttempts[imageUrl];
              
              // Verify retry count never exceeds 3
              if (attempts > 3) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 10, timeout: 180000 }
    );
  }, 240000); // Jest timeout

  test('Property 5: Retry count is exactly as expected for configured failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.constantFrom('One Piece', 'Naruto', 'Bleach'),
          chapterTitle: fc.constantFrom('Chapter 1', 'Chapter 10'),
          imageCount: fc.integer({ min: 2, max: 5 }),
          failBeforeSuccess: fc.integer({ min: 0, max: 2 }), // 0, 1, or 2 failures before success
        }),
        async ({ mangaTitle, chapterTitle, imageCount, failBeforeSuccess }) => {
          const tmpDir = createTempDir();
          
          try {
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/image${i + 1}.jpg`,
              ext: 'jpg',
              index: i + 1,
            }));
            
            // All pages fail the same number of times before succeeding
            const failureConfig = {};
            for (let i = 1; i <= imageCount; i++) {
              failureConfig[i] = failBeforeSuccess;
            }
            
            const service = new MockConnectorServiceWithRetryTracking(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages,
              failureConfig
            );
            
            const payload = {
              mangaTitle,
              mangaUrl: 'https://example.com/manga/test',
              chapterUrl: 'https://example.com/chapter/1',
              chapterTitle,
              baseSaveDir: tmpDir,
              numberOfThreads: 1,
              coverUrl: '',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            
            // Should succeed since we configured failures < 3
            if (!result.ok) return false;
            
            // Verify each page was retried exactly failBeforeSuccess + 1 times
            for (const imageUrl in service.retryAttempts) {
              const attempts = service.retryAttempts[imageUrl];
              const expected = failBeforeSuccess + 1; // failures + 1 success
              
              if (attempts !== expected) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 10, timeout: 180000 }
    );
  }, 240000); // Jest timeout

  test('Property 5: Pages that fail 3 times are marked as failed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 2, max: 8 }),
          failingPageIndex: fc.integer({ min: 1, max: 8 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount, failingPageIndex }) => {
          // Skip if failing page index is out of range
          if (failingPageIndex > imageCount) return true;
          
          const tmpDir = createTempDir();
          
          try {
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/image${i + 1}.jpg`,
              ext: 'jpg',
              index: i + 1,
            }));
            
            // Configure one page to fail all 3 attempts
            const failureConfig = {};
            failureConfig[failingPageIndex] = 999; // Fail forever
            
            const service = new MockConnectorServiceWithRetryTracking(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages,
              failureConfig
            );
            
            const payload = {
              mangaTitle,
              mangaUrl: 'https://example.com/manga/test',
              chapterUrl: 'https://example.com/chapter/1',
              chapterTitle,
              baseSaveDir: tmpDir,
              numberOfThreads: 1,
              coverUrl: '',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            
            // Should not be fully successful
            if (result.ok) return false;
            
            // Should have failed page indices
            if (!result.failedPageIndices || result.failedPageIndices.length === 0) return false;
            
            // The failing page should be in the failed list
            if (!result.failedPageIndices.includes(failingPageIndex)) return false;
            
            // Verify the failing page was attempted exactly 3 times
            const failingImageUrl = `https://example.com/image${failingPageIndex}.jpg`;
            if (service.retryAttempts[failingImageUrl] !== 3) return false;
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 10, timeout: 180000 }
    );
  }, 240000); // Jest timeout
});
