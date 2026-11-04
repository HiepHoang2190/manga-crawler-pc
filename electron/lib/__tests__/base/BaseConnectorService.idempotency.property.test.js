const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { BaseConnectorService } = require('./BaseConnectorService');
const { loadOrCreate } = require('../../platform/storage/downloadDb');
const { resolveMangaDir, resolveChapterDir } = require('../../download/connector/connectorPathUtils');
const { formatChapterTitle } = require('../../shared/mangaUtils');

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

// Helper to get all files in a directory recursively
function getAllFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

// Helper to compute file hash
function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

// ─── Property 1: Download Idempotency ─────────────────────────────────────────
// **Validates: Requirements 6.3**
describe('BaseConnectorService — Property 1: Download Idempotency', () => {
  test('Property 1: Downloading same chapter twice produces same result (skips if complete)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random chapter configurations
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 10 }),
        }),
        async ({ mangaTitle, chapterTitle, imageCount }) => {
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
              numberOfThreads: 1,
              coverUrl: 'https://example.com/cover.jpg',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            // First download
            const result1 = await service.downloadChapter(payload, 'TestSite');
            
            // Verify first download succeeded
            if (!result1.ok) {
              return false;
            }
            
            // Get all files after first download
            const filesAfterFirst = getAllFiles(tmpDir);
            const fileHashesAfterFirst = {};
            for (const file of filesAfterFirst) {
              if (file.endsWith('.json')) continue; // Skip DB file for hash comparison
              fileHashesAfterFirst[path.basename(file)] = getFileHash(file);
            }
            
            // Second download (should skip)
            const result2 = await service.downloadChapter(payload, 'TestSite');
            
            // Verify second download returned skipped
            if (!result2.ok || !result2.skipped) {
              return false;
            }
            
            // Get all files after second download
            const filesAfterSecond = getAllFiles(tmpDir);
            const fileHashesAfterSecond = {};
            for (const file of filesAfterSecond) {
              if (file.endsWith('.json')) continue; // Skip DB file for hash comparison
              fileHashesAfterSecond[path.basename(file)] = getFileHash(file);
            }
            
            // Verify same number of files
            if (Object.keys(fileHashesAfterFirst).length !== Object.keys(fileHashesAfterSecond).length) {
              return false;
            }
            
            // Verify all files have identical hashes
            for (const fileName in fileHashesAfterFirst) {
              if (fileHashesAfterFirst[fileName] !== fileHashesAfterSecond[fileName]) {
                return false;
              }
            }
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 } // Reduced runs for integration test
    );
  }, 180000); // Jest timeout

  test('Property 1: Multiple downloads produce identical file contents', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.constantFrom('One Piece', 'Naruto', 'Bleach'),
          chapterTitle: fc.constantFrom('Chapter 1', 'Chapter 10', 'Chapter 100'),
          imageCount: fc.integer({ min: 2, max: 5 }),
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
              coverUrl: 'https://example.com/cover.jpg',
              chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
              onLog: () => {},
              onProgress: () => {},
              shouldAbort: () => false,
            };
            
            // First download
            const result1 = await service.downloadChapter(payload, 'TestSite');
            if (!result1.ok) return false;
            
            // Collect file hashes
            const files1 = getAllFiles(tmpDir).filter(f => !f.endsWith('.json'));
            const hashes1 = files1.map(f => getFileHash(f)).sort();
            
            // Second download
            const result2 = await service.downloadChapter(payload, 'TestSite');
            if (!result2.ok || !result2.skipped) return false;
            
            // Collect file hashes again
            const files2 = getAllFiles(tmpDir).filter(f => !f.endsWith('.json'));
            const hashes2 = files2.map(f => getFileHash(f)).sort();
            
            // Verify identical hashes
            if (hashes1.length !== hashes2.length) return false;
            for (let i = 0; i < hashes1.length; i++) {
              if (hashes1[i] !== hashes2[i]) return false;
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

  test('Property 2: Database state matches file system after download', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          imageCount: fc.integer({ min: 1, max: 8 }),
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
            
            // Download chapter
            const result = await service.downloadChapter(payload, 'TestSite');
            if (!result.ok) return false;
            
            // Load database
            const mangaDir = resolveMangaDir(tmpDir, mangaTitle);
            const db = loadOrCreate(mangaDir, mangaTitle, payload.mangaUrl, 'TestSite');
            
            // Format chapter title for DB lookup
            const dbChapterTitle = formatChapterTitle(chapterTitle);
            
            // Verify chapter exists in DB
            if (!db.hasChapter(dbChapterTitle)) return false;
            
            // Verify chapter is marked complete
            const chapter = db.record.chapters[dbChapterTitle];
            if (chapter.status !== 'completed') return false;
            
            // Verify all pages are marked complete
            if (!chapter.pages || chapter.pages.length !== imageCount) return false;
            for (const page of chapter.pages) {
              if (page.status !== 'completed') return false;
              if (!page.fileSize || page.fileSize <= 0) return false;
            }
            
            // Verify files exist on disk
            const chapterDir = resolveChapterDir(tmpDir, mangaTitle, chapterTitle, payload.chapterFolderFormat);
            const imageFiles = fs.readdirSync(chapterDir).filter(f => !f.endsWith('.json'));
            
            if (imageFiles.length !== imageCount) return false;
            
            return true;
          } finally {
            cleanupDir(tmpDir);
          }
        }
      ),
      { numRuns: 100, timeout: 120000 } // Reduced runs to avoid timeout
    );
  }, 180000); // Jest timeout - longer for this test

  test('Property 2: Second download preserves database state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.constantFrom('Test Manga A', 'Test Manga B'),
          chapterTitle: fc.constantFrom('Ch 1', 'Ch 2', 'Ch 3'),
          imageCount: fc.integer({ min: 2, max: 6 }),
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
            
            // First download
            await service.downloadChapter(payload, 'TestSite');
            
            // Read DB state after first download
            const mangaDir = resolveMangaDir(tmpDir, mangaTitle);
            const db1 = loadOrCreate(mangaDir, mangaTitle, payload.mangaUrl, 'TestSite');
            const dbChapterTitle = formatChapterTitle(chapterTitle);
            const chapter1 = JSON.parse(JSON.stringify(db1.record.chapters[dbChapterTitle]));
            
            // Second download
            await service.downloadChapter(payload, 'TestSite');
            
            // Read DB state after second download
            const db2 = loadOrCreate(mangaDir, mangaTitle, payload.mangaUrl, 'TestSite');
            const chapter2 = db2.record.chapters[dbChapterTitle];
            
            // Verify chapter status unchanged
            if (chapter1.status !== chapter2.status) return false;
            
            // Verify page count unchanged
            if (chapter1.pages.length !== chapter2.pages.length) return false;
            
            // Verify all pages still marked complete
            for (let i = 0; i < chapter2.pages.length; i++) {
              if (chapter2.pages[i].status !== 'completed') return false;
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

// ─── Property 3: File Naming Consistency ──────────────────────────────────────
// **Validates: Requirements 6.3**
describe('BaseConnectorService — Property 3: File Naming Consistency', () => {
  test('Property 3: Downloaded files follow consistent naming pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mangaTitle: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          chapterTitle: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
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
            
            // Download chapter
            const result = await service.downloadChapter(payload, 'TestSite');
            if (!result.ok) return false;
            
            // Get chapter directory
            const chapterDir = resolveChapterDir(tmpDir, mangaTitle, chapterTitle, payload.chapterFolderFormat);
            
            // Get all image files
            const files = fs.readdirSync(chapterDir).filter(f => !f.endsWith('.json')).sort();
            
            // Verify file count
            if (files.length !== imageCount) return false;
            
            // Verify naming pattern: 001.jpg, 002.jpg, etc.
            for (let i = 0; i < files.length; i++) {
              const expectedName = `${String(i + 1).padStart(3, '0')}.jpg`;
              if (files[i] !== expectedName) return false;
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
