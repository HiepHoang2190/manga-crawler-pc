// e2e/helpers/fixtures.test.js
const fs = require('fs');
const path = require('path');
const { ensureSampleManga, cleanTempOutput, SAMPLE_MANGA_DIR, TEMP_OUTPUT_DIR } = require('./fixtures');

describe('E2E Fixtures Helper', () => {
  test('ensureSampleManga creates valid sample images and cbz archive', async () => {
    const { chapterDir, cbzPath } = await ensureSampleManga();
    expect(fs.existsSync(chapterDir)).toBe(true);
    const files = fs.readdirSync(chapterDir).filter(f => f.endsWith('.jpg'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(cbzPath)).toBe(true);
  });

  test('cleanTempOutput purges temp directory correctly', async () => {
    const testFile = path.join(TEMP_OUTPUT_DIR, 'dummy.txt');
    fs.mkdirSync(TEMP_OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(testFile, 'test');
    expect(fs.existsSync(testFile)).toBe(true);

    cleanTempOutput();
    expect(fs.existsSync(testFile)).toBe(false);
  });
});
