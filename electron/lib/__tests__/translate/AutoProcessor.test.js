const fs = require('fs');
const path = require('path');
const os = require('os');
const AutoProcessor = require('../../translate/AutoProcessor');

describe('AutoProcessor', () => {
  let tmpRoot;
  let inputDir;
  let outputDir;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-proc-test-'));
    inputDir = path.join(tmpRoot, 'input');
    outputDir = path.join(tmpRoot, 'output');

    // Tạo cấu trúc thư mục lồng nhau
    // input/
    //   Chapter 01/
    //     01.jpg
    //     02.png
    //   Chapter 02/
    //     01.jpg
    //   notes.txt (không phải ảnh, phải bỏ qua)
    fs.mkdirSync(path.join(inputDir, 'Chapter 01'), { recursive: true });
    fs.mkdirSync(path.join(inputDir, 'Chapter 02'), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(path.join(inputDir, 'Chapter 01', '01.jpg'), 'fake-jpg-1');
    fs.writeFileSync(path.join(inputDir, 'Chapter 01', '02.png'), 'fake-png-2');
    fs.writeFileSync(path.join(inputDir, 'Chapter 02', '01.jpg'), 'fake-jpg-3');
    fs.writeFileSync(path.join(inputDir, 'notes.txt'), 'some text');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpRoot)) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  test('scanImagesRecursive finds only valid image files in natural order', () => {
    const images = AutoProcessor.scanImagesRecursive(inputDir);
    expect(images).toHaveLength(3);
    expect(images[0]).toContain(path.join('Chapter 01', '01.jpg'));
    expect(images[1]).toContain(path.join('Chapter 01', '02.png'));
    expect(images[2]).toContain(path.join('Chapter 02', '01.jpg'));
  });

  test('computeDestinationPath preserves manga root folder when outputDir is general folder (e.g. xxx_translated)', () => {
    const mangaDir = '/path/to/Dragon Ball';
    const outDir = '/path/to/xxx_translated';
    const filePath = '/path/to/Dragon Ball/chapter 1/01.jpg';

    const dest = AutoProcessor.computeDestinationPath(mangaDir, outDir, filePath);
    expect(dest).toBe(path.join('/path/to/xxx_translated', 'Dragon Ball', 'chapter 1', '01.jpg'));
  });

  test('computeDestinationPath does not duplicate folder when outputDir is already manga name or manga_translated', () => {
    const mangaDir = '/path/to/Dragon Ball';
    const outDirTranslated = '/path/to/Dragon Ball_translated';
    const outDirSame = '/path/to/Dragon Ball';
    const filePath = '/path/to/Dragon Ball/chapter 1/01.jpg';

    const destTranslated = AutoProcessor.computeDestinationPath(mangaDir, outDirTranslated, filePath);
    expect(destTranslated).toBe(path.join('/path/to/Dragon Ball_translated', 'chapter 1', '01.jpg'));

    const destSame = AutoProcessor.computeDestinationPath(mangaDir, outDirSame, filePath);
    expect(destSame).toBe(path.join('/path/to/Dragon Ball', 'chapter 1', '01.jpg'));
  });

  test('process recursively translates images into outputDir preserving manga root folder', async () => {
    const mockPipeline = {
      translatePage: jest.fn().mockImplementation(async (buf) => ({
        finalImage: Buffer.from(`translated-${buf.toString()}`),
        cleanImage: buf,
      })),
      cancel: jest.fn(),
    };

    const processor = new AutoProcessor(mockPipeline);
    const progressUpdates = [];

    const result = await processor.process(
      inputDir,
      outputDir,
      { autoProcessing: { skipExisting: true } },
      (p) => progressUpdates.push(p)
    );

    expect(result.status).toBe('completed');
    expect(result.stats.total).toBe(3);
    expect(result.stats.success).toBe(3);
    expect(result.stats.skipped).toBe(0);

    // Kiểm tra file đầu ra đã được tạo với cấu trúc: outputDir / <inputName> / Chapter 01 / 01.jpg
    const inputName = path.basename(inputDir);
    expect(fs.existsSync(path.join(outputDir, inputName, 'Chapter 01', '01.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, inputName, 'Chapter 01', '02.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, inputName, 'Chapter 02', '01.jpg'))).toBe(true);

    const content1 = fs.readFileSync(path.join(outputDir, inputName, 'Chapter 01', '01.jpg'), 'utf-8');
    expect(content1).toBe('translated-fake-jpg-1');

    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  test('skipExisting avoids re-translating already existing output files', async () => {
    const inputName = path.basename(inputDir);
    // Tạo sẵn 1 file tại output
    const preExistingDest = path.join(outputDir, inputName, 'Chapter 01', '01.jpg');
    fs.mkdirSync(path.dirname(preExistingDest), { recursive: true });
    fs.writeFileSync(preExistingDest, Buffer.alloc(1500, 'a')); // file > 500 bytes

    const mockPipeline = {
      translatePage: jest.fn().mockImplementation(async (buf) => ({
        finalImage: Buffer.from('new-result'),
      })),
    };

    const processor = new AutoProcessor(mockPipeline);
    const result = await processor.process(
      inputDir,
      outputDir,
      { autoProcessing: { skipExisting: true } },
      () => {}
    );

    expect(result.stats.total).toBe(3);
    expect(result.stats.skipped).toBe(1);
    expect(result.stats.success).toBe(2);
    expect(mockPipeline.translatePage).toHaveBeenCalledTimes(2);
  });

  test('cancel() stops further processing', async () => {
    const mockPipeline = {
      translatePage: jest.fn().mockImplementation(async () => {
        processor.cancel();
        return { finalImage: Buffer.from('res') };
      }),
      cancel: jest.fn(),
    };

    const processor = new AutoProcessor(mockPipeline);
    const result = await processor.process(
      inputDir,
      outputDir,
      {},
      () => {}
    );

    expect(result.status).toBe('cancelled');
    expect(result.stats.success).toBe(0);
    expect(mockPipeline.translatePage).toHaveBeenCalledTimes(1);
  });
});
