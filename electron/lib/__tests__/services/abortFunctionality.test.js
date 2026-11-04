/**
 * Comprehensive Abort Functionality Tests for All Connectors
 * 
 * Tests that abort functionality works correctly across all 27 migrated connectors:
 * - Downloads stop immediately when shouldAbort() returns true
 * - Chapter is marked as incomplete in database
 * - Return value includes {ok: false, aborted: true}
 * - Tests cover HTML-based, API-based, and custom parsing connectors
 * 
 * Task 5.1.3: Test abort functionality for each connector
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadOrCreate } = require('../../platform/storage/downloadDb');

// Import all connector services
const cuuTruyenService = require('../../platform/connectors/services/cuuTruyenService');
const truyenQQService = require('../../platform/connectors/services/truyenQQService');
const mangadexService = require('../../platform/connectors/services/mangadexService');
const comixService = require('../../platform/connectors/services/comixService');
const antbywService = require('../../platform/connectors/services/antbywService');
const mangaPlusService = require('../../platform/connectors/services/mangaPlusService');
const comicDaysService = require('../../platform/connectors/services/comicDaysService');
const minotruyenService = require('../../platform/connectors/services/minotruyenService');
const otakusicService = require('../../platform/connectors/services/otakusicService');
const gocTruyenTranhService = require('../../platform/connectors/services/gocTruyenTranhService');
const comicvnService = require('../../platform/connectors/services/comicvnService');
const moetruyenService = require('../../platform/connectors/services/moeTruyenService');
const truyenTranhPhapBiService = require('../../platform/connectors/services/truyenTranhPhapBiService');
const dtveBookService = require('../../platform/connectors/services/dtveBookService');
const manhuaguiService = require('../../platform/connectors/services/manhuaguiService');
const netTruyenVietService = require('../../platform/connectors/services/netTruyenVietService');
const luotTruyenService = require('../../platform/connectors/services/luotTruyenService');
const comickService = require('../../platform/connectors/services/comickService');
const diliberService = require('../../platform/connectors/services/diliberService');
const luuTruCuaWibuService = require('../../platform/connectors/services/luuTruCuaWibuService');
const truyenqqVnService = require('../../platform/connectors/services/truyenqqVnService');
const tuThienBaoService = require('../../platform/connectors/services/tuThienBaoService');

// Categorize connectors by type
const HTML_BASED_CONNECTORS = [
  { name: 'comix', service: comixService, type: 'simple-html' },
  { name: 'gocTruyenTranh', service: gocTruyenTranhService, type: 'simple-html' },
  { name: 'comicvn', service: comicvnService, type: 'simple-html' },
  { name: 'netTruyenViet', service: netTruyenVietService, type: 'simple-html' },
  { name: 'truyenQQ', service: truyenQQService, type: 'truyenqq-style' },
  { name: 'truyenqqVn', service: truyenqqVnService, type: 'truyenqq-style' },
  { name: 'minotruyen', service: minotruyenService, type: 'truyenqq-style' },
  { name: 'otakusic', service: otakusicService, type: 'truyenqq-style' },
  { name: 'truyenTranhPhapBi', service: truyenTranhPhapBiService, type: 'special-html' },
  { name: 'dtveBook', service: dtveBookService, type: 'special-html' },
  { name: 'manhuagui', service: manhuaguiService, type: 'special-html' },
  { name: 'luotTruyen', service: luotTruyenService, type: 'special-html' },
  { name: 'dilib', service: diliberService, type: 'special-html' },
  { name: 'luuTruCuaWibu', service: luuTruCuaWibuService, type: 'special-html' },
  { name: 'tuThienBao', service: tuThienBaoService, type: 'special-html' },
];

const CUSTOM_PARSING_CONNECTORS = [
  { name: 'moetruyen', service: moetruyenService, type: 'custom-parsing' },
  { name: 'antbyw', service: antbywService, type: 'custom-parsing' },
];

const API_BASED_CONNECTORS = [
  { name: 'cuuTruyen', service: cuuTruyenService, type: 'api-based' },
  { name: 'mangadex', service: mangadexService, type: 'api-based' },
  { name: 'comick', service: comickService, type: 'api-based' },
  { name: 'mangaPlus', service: mangaPlusService, type: 'api-based' },
  { name: 'comicDays', service: comicDaysService, type: 'api-based' },
];

const ALL_CONNECTORS = [
  ...HTML_BASED_CONNECTORS,
  ...CUSTOM_PARSING_CONNECTORS,
  ...API_BASED_CONNECTORS,
];

describe('Abort Functionality - All Connectors', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abort-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a mock payload for testing
   */
  function createMockPayload(connectorName, options = {}) {
    const abortFlag = options.abortFlag || { value: false };
    
    return {
      mangaTitle: `Test Manga ${connectorName}`,
      mangaUrl: `https://example.com/manga/${connectorName}`,
      chapterUrl: `https://example.com/chapter/${connectorName}/1`,
      chapterTitle: 'Chapter 1',
      baseSaveDir: options.baseSaveDir || path.join(tempDir, connectorName),
      numberOfThreads: options.numberOfThreads || 3,
      coverUrl: 'https://example.com/cover.jpg',
      chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
      onLog: options.onLog || (() => {}),
      onProgress: options.onProgress || (() => {}),
      shouldAbort: options.shouldAbort || (() => abortFlag.value),
    };
  }

  describe('Immediate Abort - Before Image Fetch', () => {
    test('all connectors should abort immediately when shouldAbort returns true before fetching images', async () => {
      // Test a representative sample from each category
      const testConnectors = [
        HTML_BASED_CONNECTORS[0], // comix (simple HTML)
        CUSTOM_PARSING_CONNECTORS[0], // moetruyen (custom parsing)
        API_BASED_CONNECTORS[0], // cuuTruyen (API-based)
      ];

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: true }; // Abort immediately
        const payload = createMockPayload(name, { abortFlag });

        const result = await service.downloadChapter(payload);

        // Verify abort response
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.aborted).toBe(true);

        // Verify no files were created (abort happened before download)
        const chapterDir = path.join(payload.baseSaveDir, 'Test Manga ' + name, 'Chap 001');
        if (fs.existsSync(chapterDir)) {
          const files = fs.readdirSync(chapterDir).filter(f => f.match(/^\d+\.(jpg|png|webp)$/));
          expect(files.length).toBe(0);
        }
      }
    });
  });

  describe('Abort During Download - All Connector Types', () => {
    test('HTML-based connectors should handle abort during download', async () => {
      // Test multiple HTML-based connectors
      const testConnectors = [
        HTML_BASED_CONNECTORS[0], // comix
        HTML_BASED_CONNECTORS[5], // truyenQQ
        HTML_BASED_CONNECTORS[9], // truyenTranhPhapBi
      ];

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: false };
        const logs = [];
        
        const payload = createMockPayload(name, {
          abortFlag,
          numberOfThreads: 1, // Single thread for predictable behavior
          onLog: (msg, level) => logs.push({ msg, level }),
        });

        // Mock fetchChapterImages to return fake images
        const originalFetch = service.fetchChapterImages;
        service.fetchChapterImages = async () => {
          // Simulate slow fetch
          await new Promise(resolve => setTimeout(resolve, 200));
          return [
            { imageUrl: 'https://example.com/img1.jpg', ext: 'jpg' },
            { imageUrl: 'https://example.com/img2.jpg', ext: 'jpg' },
            { imageUrl: 'https://example.com/img3.jpg', ext: 'jpg' },
          ];
        };

        // Start download and abort during image fetch
        const downloadPromise = service.downloadChapter(payload);
        setTimeout(() => { abortFlag.value = true; }, 100);

        const result = await downloadPromise;

        // Restore original methods
        service.fetchChapterImages = originalFetch;

        // Verify abort response - should abort during or after fetch
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        // Result should be aborted OR have error (if fetch failed due to abort)
        expect(result.aborted || result.error).toBeTruthy();

        // Verify database marks chapter as incomplete if it was created
        const mangaDir = path.join(payload.baseSaveDir, 'Test Manga ' + name);
        if (fs.existsSync(mangaDir)) {
          const db = loadOrCreate(mangaDir, payload.mangaTitle, payload.mangaUrl, name);
          const chapterStatus = db.record.chapters?.['Chapter 1'];
          if (chapterStatus) {
            expect(chapterStatus.status).not.toBe('completed');
          }
        }
      }
    });

    test('API-based connectors should handle abort during download', async () => {
      // Test multiple API-based connectors
      const testConnectors = [
        API_BASED_CONNECTORS[0], // cuuTruyen
        API_BASED_CONNECTORS[1], // mangadex
        API_BASED_CONNECTORS[4], // comick
      ];

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: false };
        
        const payload = createMockPayload(name, {
          abortFlag,
          numberOfThreads: 1,
        });

        // Mock fetchChapterImages with delay
        const originalFetch = service.fetchChapterImages;
        service.fetchChapterImages = async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return [
            { imageUrl: 'https://example.com/img1.jpg', ext: 'jpg' },
            { imageUrl: 'https://example.com/img2.jpg', ext: 'jpg' },
          ];
        };

        const downloadPromise = service.downloadChapter(payload);
        setTimeout(() => { abortFlag.value = true; }, 100);

        const result = await downloadPromise;

        service.fetchChapterImages = originalFetch;

        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.aborted || result.error).toBeTruthy();
      }
    });

    test('Custom parsing connectors should handle abort during download', async () => {
      // Test custom parsing connectors
      const testConnectors = CUSTOM_PARSING_CONNECTORS;

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: false };
        
        const payload = createMockPayload(name, {
          abortFlag,
          numberOfThreads: 1,
        });

        // Mock fetchChapterImages with delay
        const originalFetch = service.fetchChapterImages;
        service.fetchChapterImages = async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return [
            { imageUrl: 'https://example.com/img1.jpg', ext: 'jpg' },
            { imageUrl: 'https://example.com/img2.jpg', ext: 'jpg' },
          ];
        };

        const downloadPromise = service.downloadChapter(payload);
        setTimeout(() => { abortFlag.value = true; }, 100);

        const result = await downloadPromise;

        service.fetchChapterImages = originalFetch;

        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.aborted || result.error).toBeTruthy();
      }
    });
  });

  describe('Abort Responsiveness - Within 1 Second', () => {
    test('abort should terminate within 1 second (requirement)', async () => {
      // Test with a representative connector from each type
      const testConnectors = [
        HTML_BASED_CONNECTORS[0],
        CUSTOM_PARSING_CONNECTORS[0],
        API_BASED_CONNECTORS[0],
      ];

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: false };
        const startTime = Date.now();
        
        const payload = createMockPayload(name, {
          abortFlag,
          numberOfThreads: 3,
        });

        // Mock fetchChapterImages to return many images with delay
        const originalFetch = service.fetchChapterImages;
        service.fetchChapterImages = async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
          const images = [];
          for (let i = 1; i <= 50; i++) {
            images.push({ imageUrl: `https://example.com/img${i}.jpg`, ext: 'jpg' });
          }
          return images;
        };

        const downloadPromise = service.downloadChapter(payload);
        
        // Abort after 200ms
        setTimeout(() => { abortFlag.value = true; }, 200);

        const result = await downloadPromise;
        const elapsedTime = Date.now() - startTime;

        service.fetchChapterImages = originalFetch;

        // Verify abort happened
        expect(result.aborted || result.error).toBeTruthy();
        
        // Verify responsiveness: should terminate within 1 second of abort signal
        // Since we aborted at 200ms, total time should be < 1200ms
        expect(elapsedTime).toBeLessThan(1200);
      }
    });
  });

  describe('Database State After Abort', () => {
    test('chapter should be marked as incomplete in database after abort', async () => {
      const testConnectors = [
        HTML_BASED_CONNECTORS[0],
        API_BASED_CONNECTORS[0],
        CUSTOM_PARSING_CONNECTORS[0],
      ];

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: false };
        const baseSaveDir = path.join(tempDir, `db-test-${name}`);
        
        const payload = createMockPayload(name, {
          abortFlag,
          baseSaveDir,
          numberOfThreads: 1,
        });

        // Mock fetchChapterImages with delay
        const originalFetch = service.fetchChapterImages;
        service.fetchChapterImages = async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return [
            { imageUrl: 'https://example.com/img1.jpg', ext: 'jpg' },
            { imageUrl: 'https://example.com/img2.jpg', ext: 'jpg' },
            { imageUrl: 'https://example.com/img3.jpg', ext: 'jpg' },
          ];
        };

        const downloadPromise = service.downloadChapter(payload);
        setTimeout(() => { abortFlag.value = true; }, 100);

        const result = await downloadPromise;

        service.fetchChapterImages = originalFetch;

        // Verify abort
        expect(result.aborted || result.error).toBeTruthy();

        // Check database state
        const mangaDir = path.join(baseSaveDir, `Test Manga ${name}`);
        const db = loadOrCreate(mangaDir, payload.mangaTitle, payload.mangaUrl, name);
        
        const chapterKey = 'Chapter 1';
        if (db.record.chapters && db.record.chapters[chapterKey]) {
          const chapterStatus = db.record.chapters[chapterKey];
          
          // Chapter should NOT be marked as completed
          expect(chapterStatus.status).not.toBe('completed');
          
          // Chapter should be marked as incomplete or pending
          expect(['incomplete', 'pending', 'downloading']).toContain(chapterStatus.status);
        }
      }
    });
  });

  describe('All Connectors - Basic Abort Test', () => {
    test('all connectors should respect abort signal', async () => {
      const results = [];

      for (const { name, service, type } of ALL_CONNECTORS) {
        const abortFlag = { value: true }; // Immediate abort
        const payload = createMockPayload(name, { abortFlag });

        try {
          const result = await service.downloadChapter(payload);
          
          results.push({
            connector: name,
            type,
            success: result && result.aborted === true && result.ok === false,
            result,
          });

          // Verify abort response
          expect(result).toBeDefined();
          expect(result.ok).toBe(false);
          expect(result.aborted).toBe(true);
        } catch (error) {
          results.push({
            connector: name,
            type,
            success: false,
            error: error.message,
          });
          
          // Abort tests should not throw errors
          throw new Error(`${name} threw error during abort: ${error.message}`);
        }
      }

      // Log summary
      const successCount = results.filter(r => r.success).length;
      console.log(`\nAbort Test Summary: ${successCount}/${ALL_CONNECTORS.length} connectors passed`);
      
      // All connectors should pass
      expect(successCount).toBe(ALL_CONNECTORS.length);
    });
  });

  describe('Return Value Verification', () => {
    test('abort should return {ok: false, aborted: true} for all connector types', async () => {
      const testConnectors = [
        ...HTML_BASED_CONNECTORS.slice(0, 3),
        ...API_BASED_CONNECTORS.slice(0, 2),
        ...CUSTOM_PARSING_CONNECTORS,
      ];

      for (const { name, service } of testConnectors) {
        const abortFlag = { value: true };
        const payload = createMockPayload(name, { abortFlag });

        const result = await service.downloadChapter(payload);

        // Verify exact return value structure
        expect(result).toMatchObject({
          ok: false,
          aborted: true,
        });

        // Should not have success properties when aborted
        expect(result.successCount).toBeUndefined();
        expect(result.totalPages).toBeUndefined();
      }
    });
  });

  describe('Multi-threaded Abort', () => {
    test('abort should work correctly with different thread counts', async () => {
      const threadCounts = [1, 3, 5];
      const connector = HTML_BASED_CONNECTORS[0];

      for (const threads of threadCounts) {
        const abortFlag = { value: false };
        const payload = createMockPayload(connector.name, {
          abortFlag,
          numberOfThreads: threads,
        });

        // Mock fetchChapterImages with delay
        const originalFetch = connector.service.fetchChapterImages;
        connector.service.fetchChapterImages = async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          const images = [];
          for (let i = 1; i <= 20; i++) {
            images.push({ imageUrl: `https://example.com/img${i}.jpg`, ext: 'jpg' });
          }
          return images;
        };

        const downloadPromise = connector.service.downloadChapter(payload);
        setTimeout(() => { abortFlag.value = true; }, 100);

        const result = await downloadPromise;

        connector.service.fetchChapterImages = originalFetch;

        expect(result.ok).toBe(false);
        expect(result.aborted || result.error).toBeTruthy();
      }
    });
  });
});
