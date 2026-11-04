const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { BaseConnectorService } = require('./BaseConnectorService');

// Mock concrete implementation for testing
class MockConnectorService extends BaseConnectorService {
  constructor(config, mockImages) {
    super(config);
    this.mockImages = mockImages || [];
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

// ─── Property 4: Progress Bounds ─────────────────────────────────────────────
// **Validates: Requirements 6.3**
describe('BaseConnectorService — Property 4: Progress Bounds', () => {
  test('Property 4: Progress current value is always between 0 and total (0 ≤ current ≤ total)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 20 }),
          threads: fc.integer({ min: 1, max: 5 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount, threads }) => {
          const tmpDir = createTempDir();
          
          try {
            // Generate mock images
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/image${i + 1}.jpg`,
              ext: 'jpg',
            }));
            
            const service = new MockConnectorService(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages
            );
            
            // Track all progress reports
            const progressReports = [];
            
            const payload = {
              mangaTitle,
              mangaUrl: 'https://example.com/manga/test',
              chapterUrl: 'https://example.com/chapter/1',
              chapterTitle,
              baseSaveDir: tmpDir,
              numberOfThreads: threads,
              coverUrl: 'https://example.com/cover.jpg',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: (progress) => {
                progressReports.push(progress);
              },
              shouldAbort: () => false,
            };
            
            // Download chapter
            const result = await service.downloadChapter(payload, 'TestSite');
            
            // Verify download succeeded
            if (!result.ok) {
              return false;
            }
            
            // Verify we received progress reports
            if (progressReports.length === 0) {
              return false;
            }
            
            // Property: ∀ progress report, 0 ≤ current ≤ total
            for (const report of progressReports) {
              // Check that current is non-negative
              if (report.current < 0) {
                return false;
              }
              
              // Check that current does not exceed total
              if (report.current > report.total) {
                return false;
              }
              
              // Check that total matches expected image count
              if (report.total !== imageCount) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 }
    );
  }, 240000); // Jest timeout

  test('Property 4: Progress is monotonically increasing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.constantFrom('One Piece', 'Naruto', 'Bleach'),
          chapterTitle: fc.constantFrom('Chapter 1', 'Chapter 10', 'Chapter 100'),
          imageCount: fc.integer({ min: 3, max: 15 }),
          threads: fc.integer({ min: 1, max: 5 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount, threads }) => {
          const tmpDir = createTempDir();
          
          try {
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/${mangaTitle}/ch${chapterTitle}/img${i + 1}.jpg`,
              ext: 'jpg',
            }));
            
            const service = new MockConnectorService(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages
            );
            
            const progressReports = [];
            
            const payload = {
              mangaTitle,
              mangaUrl: 'https://example.com/manga/test',
              chapterUrl: 'https://example.com/chapter/1',
              chapterTitle,
              baseSaveDir: tmpDir,
              numberOfThreads: threads,
              coverUrl: 'https://example.com/cover.jpg',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: (progress) => {
                progressReports.push(progress);
              },
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            if (!result.ok) return false;
            
            // Verify progress is monotonically increasing
            for (let i = 1; i < progressReports.length; i++) {
              const prev = progressReports[i - 1];
              const curr = progressReports[i];
              
              // Current should be >= previous (monotonically increasing)
              if (curr.current < prev.current) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 }
    );
  }, 180000); // Jest timeout

  test('Property 4: Final progress current equals total on successful download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 12 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount }) => {
          const tmpDir = createTempDir();
          
          try {
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/image${i + 1}.jpg`,
              ext: 'jpg',
            }));
            
            const service = new MockConnectorService(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages
            );
            
            const progressReports = [];
            
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
              onProgress: (progress) => {
                progressReports.push(progress);
              },
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            if (!result.ok) return false;
            
            // Verify we have progress reports
            if (progressReports.length === 0) return false;
            
            // Get the last progress report
            const finalReport = progressReports[progressReports.length - 1];
            
            // Final current should equal total
            if (finalReport.current !== finalReport.total) {
              return false;
            }
            
            // Final current should equal image count
            if (finalReport.current !== imageCount) {
              return false;
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 }
    );
  }, 180000); // Jest timeout

  test('Property 4: Initial progress starts at 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.constantFrom('Test Manga A', 'Test Manga B', 'Test Manga C'),
          chapterTitle: fc.constantFrom('Ch 1', 'Ch 2', 'Ch 3'),
          imageCount: fc.integer({ min: 2, max: 10 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount }) => {
          const tmpDir = createTempDir();
          
          try {
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/img${i}.jpg`,
              ext: 'jpg',
            }));
            
            const service = new MockConnectorService(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages
            );
            
            const progressReports = [];
            
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
              onProgress: (progress) => {
                progressReports.push(progress);
              },
              shouldAbort: () => false,
            };
            
            await service.downloadChapter(payload, 'TestSite');
            
            // Verify we have progress reports
            if (progressReports.length === 0) return false;
            
            // First progress report should have current = 0
            const firstReport = progressReports[0];
            if (firstReport.current !== 0) {
              return false;
            }
            
            // First report should have correct total
            if (firstReport.total !== imageCount) {
              return false;
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 }
    );
  }, 180000); // Jest timeout

  test('Property 4: Progress total remains constant throughout download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 2, max: 15 }),
          threads: fc.integer({ min: 1, max: 5 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount, threads }) => {
          const tmpDir = createTempDir();
          
          try {
            const mockImages = Array.from({ length: imageCount }, (_, i) => ({
              imageUrl: `https://example.com/image${i + 1}.jpg`,
              ext: 'jpg',
            }));
            
            const service = new MockConnectorService(
              {
                domain: 'https://example.com/',
                label: 'TestSite',
                siteId: 'testsite',
              },
              mockImages
            );
            
            const progressReports = [];
            
            const payload = {
              mangaTitle,
              mangaUrl: 'https://example.com/manga/test',
              chapterUrl: 'https://example.com/chapter/1',
              chapterTitle,
              baseSaveDir: tmpDir,
              numberOfThreads: threads,
              coverUrl: '',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: (progress) => {
                progressReports.push(progress);
              },
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            if (!result.ok) return false;
            
            // Verify we have progress reports
            if (progressReports.length === 0) return false;
            
            // Verify total is constant across all reports
            const expectedTotal = imageCount;
            for (const report of progressReports) {
              if (report.total !== expectedTotal) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 }
    );
  }, 180000); // Jest timeout
});
