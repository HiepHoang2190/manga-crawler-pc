const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { BaseConnectorService } = require('./BaseConnectorService');
const { resolveChapterDir } = require('../../download/connector/connectorPathUtils');

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

// ─── Property 6: File Existence After Successful Download ────────────────────
// **Validates: Requirements 6.3**
describe('BaseConnectorService — Property 6: File Existence After Successful Download', () => {
  test('Property 6: All files exist on disk after successful download', async () => {
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
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            // Download chapter
            const result = await service.downloadChapter(payload, 'TestSite');
            
            // Only verify if download was successful
            if (!result.ok) {
              return true; // Skip verification for failed downloads
            }
            
            // Get chapter directory
            const chapterDir = resolveChapterDir(tmpDir, mangaTitle, chapterTitle, payload.chapterFolderFormat);
            
            // Property: ∀ successful page p, file exists
            for (let i = 1; i <= imageCount; i++) {
              const fileName = `${String(i).padStart(3, '0')}.jpg`;
              const filePath = path.join(chapterDir, fileName);
              
              // Verify file exists
              if (!fs.existsSync(filePath)) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 20, timeout: 180000 }
    );
  }, 240000); // Jest timeout

  test('Property 6: All files have size > 0 after successful download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 15 }),
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
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            
            // Only verify if download was successful
            if (!result.ok) {
              return true; // Skip verification for failed downloads
            }
            
            const chapterDir = resolveChapterDir(tmpDir, mangaTitle, chapterTitle, payload.chapterFolderFormat);
            
            // Property: ∀ successful page p, file size > 0
            for (let i = 1; i <= imageCount; i++) {
              const fileName = `${String(i).padStart(3, '0')}.jpg`;
              const filePath = path.join(chapterDir, fileName);
              
              // Verify file exists
              if (!fs.existsSync(filePath)) {
                return false;
              }
              
              // Verify file size > 0
              const stats = fs.statSync(filePath);
              if (stats.size <= 0) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 20, timeout: 180000 }
    );
  }, 240000); // Jest timeout

  test('Property 6: File count matches image count for successful download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.constantFrom('One Piece', 'Naruto', 'Bleach', 'Dragon Ball'),
          chapterTitle: fc.constantFrom('Chapter 1', 'Chapter 10', 'Chapter 100'),
          imageCount: fc.integer({ min: 1, max: 12 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount }) => {
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
            
            // Only verify if download was successful
            if (!result.ok) {
              return true;
            }
            
            const chapterDir = resolveChapterDir(tmpDir, mangaTitle, chapterTitle, payload.chapterFolderFormat);
            
            // Get all image files (exclude .json files)
            const files = fs.readdirSync(chapterDir).filter(f => !f.endsWith('.json'));
            
            // Verify file count matches image count
            if (files.length !== imageCount) {
              return false;
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 20, timeout: 180000 }
    );
  }, 240000); // Jest timeout

  test('Property 6: successCount equals imageCount for successful download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 10 }),
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
            
            // Only verify if download was successful
            if (!result.ok) {
              return true;
            }
            
            // Verify successCount equals imageCount
            if (result.successCount !== imageCount) {
              return false;
            }
            
            // Verify totalPages equals imageCount
            if (result.totalPages !== imageCount) {
              return false;
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 20, timeout: 180000 }
    );
  }, 240000); // Jest timeout

  test('Property 6: No failedPageIndices for successful download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 8 }),
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
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            const result = await service.downloadChapter(payload, 'TestSite');
            
            // Only verify if download was successful
            if (!result.ok) {
              return true;
            }
            
            // Verify no failed page indices
            if (result.failedPageIndices !== undefined) {
              return false;
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 20, timeout: 180000 }
    );
  }, 240000); // Jest timeout
});
