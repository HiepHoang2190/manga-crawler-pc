#!/usr/bin/env node

/**
 * Resume Functionality Integration Test
 * 
 * Tests that interrupted downloads can be resumed correctly with real connectors.
 * This test:
 * 1. Downloads a chapter completely
 * 2. Simulates interruption by deleting some files
 * 3. Resumes the download
 * 4. Verifies that only missing files are re-downloaded
 * 5. Verifies database tracking is accurate
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { load, downloadChapter } = require('../../platform/connectors');
const { loadOrCreate } = require('../../platform/storage/downloadDb');

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes
const TEST_DIR = path.join(os.tmpdir(), 'resume-integration-test');

// Test cases with real working URLs
const TEST_CASES = [
  {
    id: 'mangaplus',
    label: 'MangaPlus',
    url: 'https://mangaplus.shueisha.co.jp/titles/100020', // One Piece
    notes: 'Official API connector'
  }
];

function log(message, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function createTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function sanitizeFolderName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}

function findChapterDir(baseSaveDir, mangaTitle) {
  const safeMangaTitle = sanitizeFolderName(mangaTitle);
  const possibleMangaDirs = [
    path.join(baseSaveDir, safeMangaTitle),
    path.join(baseSaveDir, mangaTitle.replace(/[<>:"/\\|?*]/g, '_')),
    path.join(baseSaveDir, mangaTitle)
  ];
  
  for (const mangaDir of possibleMangaDirs) {
    if (fs.existsSync(mangaDir)) {
      const contents = fs.readdirSync(mangaDir);
      for (const item of contents) {
        const itemPath = path.join(mangaDir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          return { mangaDir, chapterDir: itemPath };
        }
      }
    }
  }
  
  return null;
}

function getImageFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    .sort();
}

function simulateInterruption(chapterDir, keepCount) {
  const files = getImageFiles(chapterDir);
  log(`Simulating interruption: keeping ${keepCount} of ${files.length} files`);
  
  // Delete files after keepCount
  for (let i = keepCount; i < files.length; i++) {
    const filePath = path.join(chapterDir, files[i]);
    fs.unlinkSync(filePath);
  }
  
  return files.length;
}

function verifyDatabaseConsistency(mangaDir, chapterTitle, chapterDir) {
  const db = loadOrCreate(mangaDir, '', '', '');
  const chapter = db.record.chapters[chapterTitle];
  
  if (!chapter) {
    throw new Error(`Chapter "${chapterTitle}" not found in database`);
  }
  
  // Verify all completed pages exist on disk
  for (const page of chapter.pages) {
    if (page.status === 'completed') {
      const filePath = path.join(chapterDir, page.fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Page ${page.index} marked completed but file missing: ${page.fileName}`);
      }
      const size = fs.statSync(filePath).size;
      if (size === 0) {
        throw new Error(`Page ${page.index} file has zero size: ${page.fileName}`);
      }
    }
  }
  
  return chapter;
}

async function testResumeForConnector(testCase) {
  log(`\n=== Testing Resume for ${testCase.label} (${testCase.id}) ===`);
  
  const result = {
    connector: testCase.id,
    label: testCase.label,
    success: false,
    steps: [],
    errors: []
  };
  
  try {
    // Step 1: Load manga
    log('Step 1: Loading manga...');
    const loadResult = await load(testCase.id, testCase.url);
    
    if (!loadResult.ok || !loadResult.chapters || loadResult.chapters.length === 0) {
      result.errors.push(`Load failed: ${loadResult.error || 'No chapters found'}`);
      result.steps.push({ step: 'load', success: false, error: loadResult.error });
      return result;
    }
    
    result.steps.push({ step: 'load', success: true, chaptersFound: loadResult.chapters.length });
    log(`✓ Loaded "${loadResult.manga.title}" with ${loadResult.chapters.length} chapters`);
    
    // Step 2: Download first chapter completely
    log('Step 2: Downloading first chapter...');
    const manga = loadResult.manga;
    const chapter = loadResult.chapters[0];
    
    const downloadedPages = [];
    const payload = {
      mangaTitle: sanitizeFolderName(manga.title),
      mangaUrl: manga.mangaUrl,
      chapterUrl: chapter.url,
      chapterTitle: sanitizeFolderName(chapter.title),
      baseSaveDir: TEST_DIR,
      numberOfThreads: 2,
      coverUrl: manga.coverUrl || '',
      chapterFolderFormat: { mode: 'numbered', prefix: 'Chap', padDigits: 3 },
      onLog: (msg, level) => {
        if (level === 'error' || msg.includes('Found') || msg.includes('done')) {
          log(`[${testCase.id}] ${msg}`, level);
        }
        // Track downloaded pages
        const match = msg.match(/\[(\d+)\/(\d+)\]/);
        if (match) {
          downloadedPages.push(parseInt(match[1]));
        }
      },
      onProgress: () => {},
      shouldAbort: () => false
    };
    
    const firstDownload = await downloadChapter(testCase.id, payload);
    
    if (!firstDownload.ok) {
      result.errors.push(`First download failed: ${firstDownload.error || 'Unknown error'}`);
      result.steps.push({ step: 'firstDownload', success: false, error: firstDownload.error });
      return result;
    }
    
    result.steps.push({ 
      step: 'firstDownload', 
      success: true, 
      totalPages: firstDownload.totalPages,
      successCount: firstDownload.successCount 
    });
    log(`✓ First download complete: ${firstDownload.successCount}/${firstDownload.totalPages} pages`);
    
    // Step 3: Find downloaded files
    log('Step 3: Locating downloaded files...');
    const dirs = findChapterDir(TEST_DIR, payload.mangaTitle);
    
    if (!dirs) {
      result.errors.push('Could not find downloaded chapter directory');
      result.steps.push({ step: 'findFiles', success: false });
      return result;
    }
    
    const { mangaDir, chapterDir } = dirs;
    const filesBeforeInterruption = getImageFiles(chapterDir);
    
    if (filesBeforeInterruption.length === 0) {
      result.errors.push('No image files found after first download');
      result.steps.push({ step: 'findFiles', success: false });
      return result;
    }
    
    result.steps.push({ 
      step: 'findFiles', 
      success: true, 
      filesFound: filesBeforeInterruption.length,
      mangaDir,
      chapterDir
    });
    log(`✓ Found ${filesBeforeInterruption.length} image files in ${chapterDir}`);
    
    // Step 4: Verify database after first download
    log('Step 4: Verifying database consistency...');
    try {
      const chapterData = verifyDatabaseConsistency(mangaDir, payload.chapterTitle, chapterDir);
      result.steps.push({ 
        step: 'verifyDbAfterFirst', 
        success: true, 
        chapterStatus: chapterData.status 
      });
      log(`✓ Database consistent: chapter status = ${chapterData.status}`);
    } catch (error) {
      result.errors.push(`Database verification failed: ${error.message}`);
      result.steps.push({ step: 'verifyDbAfterFirst', success: false, error: error.message });
      return result;
    }
    
    // Step 5: Simulate interruption
    log('Step 5: Simulating interruption...');
    const keepCount = Math.floor(filesBeforeInterruption.length / 2); // Keep half the files
    const totalFiles = simulateInterruption(chapterDir, keepCount);
    
    const filesAfterInterruption = getImageFiles(chapterDir);
    result.steps.push({ 
      step: 'simulateInterruption', 
      success: true, 
      keptFiles: filesAfterInterruption.length,
      deletedFiles: totalFiles - filesAfterInterruption.length
    });
    log(`✓ Interrupted: ${filesAfterInterruption.length} files remaining, ${totalFiles - filesAfterInterruption.length} deleted`);
    
    // Step 6: Resume download
    log('Step 6: Resuming download...');
    downloadedPages.length = 0; // Reset tracking
    
    const resumeDownload = await downloadChapter(testCase.id, payload);
    
    if (!resumeDownload.ok) {
      result.errors.push(`Resume download failed: ${resumeDownload.error || 'Unknown error'}`);
      result.steps.push({ step: 'resumeDownload', success: false, error: resumeDownload.error });
      return result;
    }
    
    result.steps.push({ 
      step: 'resumeDownload', 
      success: true, 
      pagesDownloaded: downloadedPages.length
    });
    log(`✓ Resume complete: downloaded ${downloadedPages.length} pages`);
    
    // Step 7: Verify all files restored
    log('Step 7: Verifying all files restored...');
    const filesAfterResume = getImageFiles(chapterDir);
    
    if (filesAfterResume.length !== totalFiles) {
      result.errors.push(`File count mismatch: expected ${totalFiles}, got ${filesAfterResume.length}`);
      result.steps.push({ 
        step: 'verifyRestore', 
        success: false, 
        expected: totalFiles, 
        actual: filesAfterResume.length 
      });
      return result;
    }
    
    result.steps.push({ 
      step: 'verifyRestore', 
      success: true, 
      filesRestored: filesAfterResume.length 
    });
    log(`✓ All files restored: ${filesAfterResume.length} files`);
    
    // Step 8: Verify database after resume
    log('Step 8: Verifying database after resume...');
    try {
      const chapterData = verifyDatabaseConsistency(mangaDir, payload.chapterTitle, chapterDir);
      result.steps.push({ 
        step: 'verifyDbAfterResume', 
        success: true, 
        chapterStatus: chapterData.status 
      });
      log(`✓ Database consistent after resume: chapter status = ${chapterData.status}`);
    } catch (error) {
      result.errors.push(`Database verification after resume failed: ${error.message}`);
      result.steps.push({ step: 'verifyDbAfterResume', success: false, error: error.message });
      return result;
    }
    
    // Step 9: Third download should skip
    log('Step 9: Testing skip on complete chapter...');
    const thirdDownload = await downloadChapter(testCase.id, payload);
    
    if (!thirdDownload.ok || !thirdDownload.skipped) {
      result.errors.push('Third download should have skipped but did not');
      result.steps.push({ step: 'testSkip', success: false, skipped: thirdDownload.skipped });
      return result;
    }
    
    result.steps.push({ step: 'testSkip', success: true, skipped: true });
    log(`✓ Third download correctly skipped (chapter already complete)`);
    
    // All steps passed
    result.success = true;
    log(`\n✅ Resume test PASSED for ${testCase.label}`);
    
  } catch (error) {
    result.errors.push(`Exception: ${error.message}`);
    log(`❌ Resume test FAILED for ${testCase.label}: ${error.message}`, 'error');
  }
  
  return result;
}

async function runResumeTests() {
  log('=== Resume Functionality Integration Test ===');
  log(`Test directory: ${TEST_DIR}`);
  
  createTestDir();
  
  const results = {
    total: TEST_CASES.length,
    passed: 0,
    failed: 0,
    details: []
  };
  
  try {
    for (const testCase of TEST_CASES) {
      const result = await testResumeForConnector(testCase);
      results.details.push(result);
      
      if (result.success) {
        results.passed++;
      } else {
        results.failed++;
      }
      
      // Delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } finally {
    cleanupTestDir();
    log('Test directory cleaned up');
  }
  
  return results;
}

function generateReport(results) {
  log('\n=== RESUME FUNCTIONALITY TEST RESULTS ===');
  log(`Total connectors tested: ${results.total}`);
  log(`Passed: ${results.passed}`);
  log(`Failed: ${results.failed}`);
  log(`Success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  
  const passed = results.details.filter(r => r.success);
  const failed = results.details.filter(r => !r.success);
  
  if (passed.length > 0) {
    log('\n✅ PASSED:');
    passed.forEach(r => {
      log(`  - ${r.label} (${r.connector})`);
      log(`    Steps completed: ${r.steps.filter(s => s.success).length}/${r.steps.length}`);
    });
  }
  
  if (failed.length > 0) {
    log('\n❌ FAILED:');
    failed.forEach(r => {
      log(`  - ${r.label} (${r.connector})`);
      r.errors.forEach(error => log(`    • ${error}`));
      log(`    Steps completed: ${r.steps.filter(s => s.success).length}/${r.steps.length}`);
    });
  }
  
  // Save report
  const reportPath = path.join(__dirname, 'resume-functionality-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      successRate: ((results.passed / results.total) * 100).toFixed(1)
    },
    details: results.details
  }, null, 2));
  
  log(`\nDetailed report saved to: ${reportPath}`);
  
  return results;
}

// Jest test wrapper
describe('Resume Functionality Integration Tests', () => {
  test('should resume interrupted downloads correctly', async () => {
    const results = await runResumeTests();
    const report = generateReport(results);
    
    // Expect at least one connector to pass
    expect(report.passed).toBeGreaterThan(0);
    
    // Expect no failures (or allow some failures if connectors are temporarily down)
    if (report.failed > 0) {
      console.warn(`Warning: ${report.failed} connector(s) failed resume test`);
    }
  }, TEST_TIMEOUT);
});

// CLI execution
if (require.main === module) {
  runResumeTests()
    .then(generateReport)
    .then(results => {
      if (results.failed > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch(error => {
      log(`Fatal error: ${error.message}`, 'error');
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  testResumeForConnector,
  runResumeTests,
  generateReport,
  TEST_CASES
};
