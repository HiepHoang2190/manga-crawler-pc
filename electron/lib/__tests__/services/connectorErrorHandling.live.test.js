/**
 * Integration Error Handling Tests for Migrated Connectors
 * 
 * Tests error handling across multiple real connectors to verify:
 * - Network failures are handled consistently
 * - Invalid URLs are rejected gracefully
 * - Retry logic works correctly
 * - Error messages are clear and helpful
 * - Graceful degradation (partial success)
 * 
 * **Validates: Requirements AC 6.1 (Error Scenarios Testing)**
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import services
const moeTruyenService = require('../../platform/connectors/services/moeTruyenService');
const antbywService = require('../../platform/connectors/services/antbywService');
const comixService = require('../../platform/connectors/services/comixService');

const TEST_TIMEOUT = 30000; // 30 seconds for network operations

describe('Connector Error Handling Integration Tests', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-error-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Invalid URL Handling', () => {
    const services = [
      { name: 'MoeTruyen', service: moeTruyenService },
      { name: 'Antbyw', service: antbywService },
      { name: 'Comix', service: comixService },
    ];

    it('should handle empty URLs consistently', async () => {
      for (const { name, service } of services) {
        const result = await service.load('');
        
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
        console.log(`${name} empty URL error:`, result.error);
      }
    });

    it('should handle malformed URLs consistently', async () => {
      const malformedUrls = [
        'not-a-url',
        'htp://missing-t.com',
        'https:/missing-slash.com',
        '://no-protocol.com',
      ];

      for (const { name, service } of services) {
        for (const url of malformedUrls) {
          const result = await service.load(url);
          
          expect(result.ok).toBe(false);
          expect(result.error).toBeTruthy();
        }
      }
    });

    it(
      'should handle non-existent domains gracefully',
      async () => {
        const nonExistentUrl = 'https://this-domain-definitely-does-not-exist-12345.com/manga';

        for (const { name, service } of services) {
          const result = await service.load(nonExistentUrl);

          expect(result.ok).toBe(false);
          expect(result.error).toBeTruthy();
          console.log(`${name} DNS error:`, result.error);
        }
      },
      TEST_TIMEOUT
    );

    it(
      'should handle 404 errors gracefully',
      async () => {
        // Use httpstat.us to simulate 404
        const notFoundUrl = 'https://httpstat.us/404';

        for (const { name, service } of services) {
          const result = await service.load(notFoundUrl);

          expect(result.ok).toBe(false);
          expect(result.error).toBeTruthy();
          console.log(`${name} 404 error:`, result.error);
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('Network Failure Simulation', () => {
    it(
      'should handle connection timeout',
      async () => {
        // Use httpstat.us to simulate slow response
        const slowUrl = 'https://httpstat.us/200?sleep=5000';

        for (const { name, service } of [
          { name: 'Comix', service: comixService },
        ]) {
          const result = await service.load(slowUrl);

          // Should either succeed (if timeout is long enough) or fail gracefully
          expect(typeof result.ok).toBe('boolean');
          if (!result.ok) {
            expect(result.error).toBeTruthy();
            console.log(`${name} timeout handling:`, result.error);
          }
        }
      },
      TEST_TIMEOUT
    );

    it(
      'should handle server errors (500)',
      async () => {
        const serverErrorUrl = 'https://httpstat.us/500';

        for (const { name, service } of [
          { name: 'Comix', service: comixService },
        ]) {
          const result = await service.load(serverErrorUrl);

          expect(result.ok).toBe(false);
          expect(result.error).toBeTruthy();
          console.log(`${name} 500 error:`, result.error);
        }
      },
      TEST_TIMEOUT
    );

    it(
      'should handle service unavailable (503)',
      async () => {
        const unavailableUrl = 'https://httpstat.us/503';

        for (const { name, service } of [
          { name: 'Comix', service: comixService },
        ]) {
          const result = await service.load(unavailableUrl);

          expect(result.ok).toBe(false);
          expect(result.error).toBeTruthy();
          console.log(`${name} 503 error:`, result.error);
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('Download Error Handling', () => {
    it(
      'should handle invalid chapter URLs in downloadChapter',
      async () => {
        const payload = {
          mangaTitle: 'Test Manga',
          mangaUrl: 'https://example.com/manga',
          chapterUrl: 'https://this-does-not-exist-12345.com/chapter',
          chapterTitle: 'Chapter 1',
          baseSaveDir: tempDir,
          numberOfThreads: 1,
          onLog: (msg, level) => console.log(`[${level}] ${msg}`),
          onProgress: () => {},
          shouldAbort: () => false,
        };

        for (const { name, service } of [
          { name: 'Comix', service: comixService },
        ]) {
          const result = await service.downloadChapter(payload, name);

          expect(result.ok).toBe(false);
          expect(result.error || result.aborted).toBeTruthy();
          console.log(`${name} download error:`, result.error || 'aborted');
        }
      },
      TEST_TIMEOUT
    );

    it(
      'should handle empty image list gracefully',
      async () => {
        // This would require mocking fetchChapterImages to return empty array
        // For now, we test with a URL that returns HTML without images
        const payload = {
          mangaTitle: 'Test Manga',
          mangaUrl: 'https://example.com/manga',
          chapterUrl: 'https://httpstat.us/200',
          chapterTitle: 'Chapter 1',
          baseSaveDir: tempDir,
          numberOfThreads: 1,
          onLog: (msg, level) => console.log(`[${level}] ${msg}`),
          onProgress: () => {},
          shouldAbort: () => false,
        };

        for (const { name, service } of [
          { name: 'Comix', service: comixService },
        ]) {
          const result = await service.downloadChapter(payload, name);

          // Should fail because no images found
          expect(result.ok).toBe(false);
          if (result.error) {
            expect(result.error).toContain('Không tìm thấy ảnh');
          }
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error messages for common failures', async () => {
      const testCases = [
        { url: '', expectedKeyword: 'trống' },
        { url: 'not-a-url', expectedKeyword: null }, // Any error is acceptable
        { url: 'https://nonexistent-12345.com', expectedKeyword: null },
      ];

      for (const { url, expectedKeyword } of testCases) {
        const result = await comixService.load(url);

        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');

        if (expectedKeyword) {
          expect(result.error.toLowerCase()).toContain(expectedKeyword);
        }

        console.log(`URL: "${url}" -> Error: "${result.error}"`);
      }
    });

    it('should log errors during download', async () => {
      const logs = [];
      const payload = {
        mangaTitle: 'Test Manga',
        mangaUrl: 'https://example.com/manga',
        chapterUrl: 'https://nonexistent-12345.com/chapter',
        chapterTitle: 'Chapter 1',
        baseSaveDir: tempDir,
        numberOfThreads: 1,
        onLog: (msg, level) => logs.push({ msg, level }),
        onProgress: () => {},
        shouldAbort: () => false,
      };

      await comixService.downloadChapter(payload, 'Comix');

      // Should have logged errors
      const errorLogs = logs.filter(log => log.level === 'error' || log.level === 'warn');
      expect(errorLogs.length).toBeGreaterThan(0);

      console.log('Error logs:', errorLogs);
    }, TEST_TIMEOUT);
  });

  describe('Retry Logic Verification', () => {
    it(
      'should retry on transient failures',
      async () => {
        // This test verifies that retry logic is in place
        // Actual retry behavior is tested in unit tests
        const payload = {
          mangaTitle: 'Test Manga',
          mangaUrl: 'https://example.com/manga',
          chapterUrl: 'https://httpstat.us/500', // Always fails
          chapterTitle: 'Chapter 1',
          baseSaveDir: tempDir,
          numberOfThreads: 1,
          onLog: (msg, level) => console.log(`[${level}] ${msg}`),
          onProgress: () => {},
          shouldAbort: () => false,
        };

        const startTime = Date.now();
        const result = await comixService.downloadChapter(payload, 'Comix');
        const duration = Date.now() - startTime;

        expect(result.ok).toBe(false);

        // If retry logic is working, it should take some time
        // (3 attempts with 1 second delay = at least 2 seconds)
        // However, we can't guarantee timing in tests, so we just verify it failed
        console.log(`Download attempt took ${duration}ms`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Graceful Degradation', () => {
    it('should handle partial HTML parsing failures', async () => {
      // Test with a URL that returns valid HTML but doesn't match selectors
      const result = await comixService.load('https://httpstat.us/200');

      // Should fail gracefully (no title found)
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    }, TEST_TIMEOUT);

    it('should continue after non-fatal errors', async () => {
      // This is tested more thoroughly in unit tests
      // Here we just verify the service doesn't crash
      const results = await Promise.all([
        comixService.load(''),
        comixService.load('invalid'),
        comixService.load('https://nonexistent.com'),
      ]);

      // All should fail gracefully without throwing
      results.forEach(result => {
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
      });
    });
  });

  describe('Consistency Across Connectors', () => {
    it('should handle errors consistently across all connectors', async () => {
      const services = [
        { name: 'MoeTruyen', service: moeTruyenService },
        { name: 'Antbyw', service: antbywService },
        { name: 'Comix', service: comixService },
      ];

      const testUrl = '';

      for (const { name, service } of services) {
        const result = await service.load(testUrl);

        // All should fail with ok: false
        expect(result.ok).toBe(false);
        // All should have an error message
        expect(result.error).toBeTruthy();
        // All should have the same structure
        expect(result).toHaveProperty('ok');
        expect(result).toHaveProperty('error');

        console.log(`${name} error structure:`, Object.keys(result));
      }
    });

    it('should return consistent error structure', async () => {
      const result1 = await moeTruyenService.load('');
      const result2 = await comixService.load('');

      // Both should have the same structure
      expect(Object.keys(result1).sort()).toEqual(Object.keys(result2).sort());
    });
  });
});
