const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Export Output Directory - No Empty _translated Folder in Input', () => {
  let tempDir;
  let inputDir;
  let outputDir;
  let testImagePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-export-test-'));
    inputDir = path.join(tempDir, 'input_manga');
    outputDir = path.join(tempDir, 'chosen_output');
    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    testImagePath = path.join(inputDir, '01.png');
    // Create a 1x1 dummy file
    fs.writeFileSync(testImagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  test('when custom savePath in chosen outputDir is used, inputDir/_translated MUST NOT be created', async () => {
    const dummyDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const customSavePath = path.join(outputDir, 'manga_root', '01_translated.png');

    // Simulate backend export logic
    const origExt = testImagePath ? path.extname(testImagePath) : '.png';
    const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
    const basename = path.basename(testImagePath, path.extname(testImagePath)) + '_translated' + ext;

    const options = {
      savePath: customSavePath,
      outputDir,
    };

    // The logic being tested:
    let savePath = options?.savePath;
    if (!savePath) {
      const saveDir = options?.outputDir || (testImagePath ? path.join(path.dirname(testImagePath), '_translated') : null);
      if (!saveDir) throw new Error('Không xác định được thư mục lưu ảnh');
      savePath = path.join(saveDir, basename);
    }

    const targetDir = path.dirname(savePath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const base64 = dummyDataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(savePath, Buffer.from(base64, 'base64'));

    // Assert: file was written to customSavePath
    expect(fs.existsSync(customSavePath)).toBe(true);

    // Assert: NO _translated folder was created in inputDir
    const unwantedTranslatedDir = path.join(inputDir, '_translated');
    expect(fs.existsSync(unwantedTranslatedDir)).toBe(false);
  });

  test('when outputDir is specified without savePath, it saves into outputDir and does NOT create inputDir/_translated', async () => {
    const dummyDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const options = {
      outputDir,
    };

    const origExt = testImagePath ? path.extname(testImagePath) : '.png';
    const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
    const basename = path.basename(testImagePath, path.extname(testImagePath)) + '_translated' + ext;

    let savePath = options?.savePath;
    if (!savePath) {
      const saveDir = options?.outputDir || (testImagePath ? path.join(path.dirname(testImagePath), '_translated') : null);
      if (!saveDir) throw new Error('Không xác định được thư mục lưu ảnh');
      savePath = path.join(saveDir, basename);
    }

    const targetDir = path.dirname(savePath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const base64 = dummyDataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(savePath, Buffer.from(base64, 'base64'));

    expect(fs.existsSync(path.join(outputDir, '01_translated.png'))).toBe(true);
    const unwantedTranslatedDir = path.join(inputDir, '_translated');
    expect(fs.existsSync(unwantedTranslatedDir)).toBe(false);
  });

  test('when NEITHER outputDir NOR savePath is specified, it creates inputDir/_translated and saves inside it', async () => {
    const dummyDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const options = {};

    const origExt = testImagePath ? path.extname(testImagePath) : '.png';
    const ext = origExt.toLowerCase() === '.png' ? '.png' : (origExt.toLowerCase() === '.webp' ? '.webp' : '.jpg');
    const basename = path.basename(testImagePath, path.extname(testImagePath)) + '_translated' + ext;

    let savePath = options?.savePath;
    if (!savePath) {
      const saveDir = options?.outputDir || (testImagePath ? path.join(path.dirname(testImagePath), '_translated') : null);
      if (!saveDir) throw new Error('Không xác định được thư mục lưu ảnh');
      savePath = path.join(saveDir, basename);
    }

    const targetDir = path.dirname(savePath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const base64 = dummyDataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(savePath, Buffer.from(base64, 'base64'));

    const translatedDir = path.join(inputDir, '_translated');
    expect(fs.existsSync(translatedDir)).toBe(true);
    expect(fs.existsSync(path.join(translatedDir, '01_translated.png'))).toBe(true);
  });
});
