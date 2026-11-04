const fs = require('fs');
const path = require('path');
const os = require('os');
const { TranslateCache } = require('../../translate/TranslateCache');

describe('TranslateCache', () => {
  let tmpDir;
  let cache;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-cache-test-'));
    cache = new TranslateCache(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('returns hit: false when cache is empty', () => {
    const dummyImage = Buffer.from('fake image data');
    const settings = {
      translationProvider: 'gemini',
      ocrProvider: 'cloud',
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
      enableInpainting: true,
      enableTypesetting: true,
    };
    const res = cache.get(dummyImage, settings);
    expect(res.hit).toBe(false);
  });

  test('caches and retrieves translation result', () => {
    const dummyImage = Buffer.from('fake image data 123');
    const dummyTranslated = Buffer.from('translated image bytes');
    const settings = {
      translationProvider: 'gemini',
      ocrProvider: 'cloud',
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
      enableInpainting: true,
      enableTypesetting: true,
    };
    const translations = [{ originalText: 'こんにちは', translatedText: 'Xin chào' }];
    const timings = { detection: 100, translation: 200 };

    cache.set(dummyImage, settings, dummyTranslated, translations, timings);

    const cached = cache.get(dummyImage, settings);
    expect(cached.hit).toBe(true);
    expect(cached.data.finalImage.toString()).toBe(dummyTranslated.toString());
    expect(cached.data.translations).toEqual(translations);
    expect(cached.data.timings).toEqual(timings);
  });

  test('clears cache and reports freed space', () => {
    const dummyImage = Buffer.from('fake image data for clearing');
    const dummyTranslated = Buffer.from('translated bytes');
    const settings = {
      translationProvider: 'gemini',
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
    };

    cache.set(dummyImage, settings, dummyTranslated, [], {});
    expect(cache.getDiskUsage()).toBeGreaterThan(0);

    const clearRes = cache.clear();
    expect(clearRes.deletedFiles).toBe(2); // .json + .png
    expect(clearRes.freedBytes).toBeGreaterThan(0);
    expect(cache.getDiskUsage()).toBe(0);
  });

  test('deleteImage removes cache entries for specific image buffer', () => {
    const dummyImage = Buffer.from('image-to-delete-cache');
    const dummyTranslated = Buffer.from('translated bytes');
    const settings = {
      translationProvider: 'gemini',
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
    };

    cache.set(dummyImage, settings, dummyTranslated, [], {});
    expect(cache.get(dummyImage, settings).hit).toBe(true);

    const deletedCount = cache.deleteImage(dummyImage);
    expect(deletedCount).toBe(2); // .json and .png
    expect(cache.get(dummyImage, settings).hit).toBe(false);
  });
});
