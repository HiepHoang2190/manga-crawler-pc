const fs = require('fs');
const path = require('path');
const os = require('os');
const { ModelManager } = require('../../translate/ModelManager');

describe('ModelManager Concurrent Downloads', () => {
  let tmpDir;
  let mm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-concurrent-test-'));
    mm = new ModelManager(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('deduplicates simultaneous downloads for the same model', async () => {
    let callCount = 0;
    // Mock the internal _executeDownloadModel
    mm._executeDownloadModel = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { success: true };
    };

    // Trigger two downloads for same model at once
    const p1 = mm.downloadModel('comic-text-detector');
    const p2 = mm.downloadModel('comic-text-detector');

    await Promise.all([p1, p2]);
    expect(callCount).toBe(1); // deduplicated!
  });

  test('executes downloads for different models in parallel', async () => {
    const started = [];
    mm._executeDownloadModel = async (modelId) => {
      started.push(modelId);
      await new Promise((r) => setTimeout(r, 50));
      return { success: true };
    };

    const p1 = mm.downloadModel('comic-text-detector');
    const p2 = mm.downloadModel('manga-ocr-base');

    expect(started).toContain('comic-text-detector');
    expect(started).toContain('manga-ocr-base');

    await Promise.all([p1, p2]);
    expect(started.length).toBe(2);
  });
});
