const fs = require('fs');
const path = require('path');
const os = require('os');
const { ModelManager, MODEL_REGISTRY } = require('../../translate/ModelManager');

describe('ModelManager Import and Location', () => {
  let tmpDir;
  let mm;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-test-'));
    mm = new ModelManager(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('listRegisteredModels includes installDir and per-file install status', () => {
    const models = mm.listRegisteredModels();
    expect(models.length).toBeGreaterThan(0);

    const detector = models.find((m) => m.id === 'comic-text-detector');
    expect(detector).toBeDefined();
    expect(detector.installDir).toBe(path.join(tmpDir, 'comic-text-detector'));
    expect(detector.installed).toBe(false);
    expect(detector.files.length).toBe(1);
    expect(detector.files[0].url).toContain('huggingface.co');
    expect(detector.files[0].filename).toBe('detector.onnx');
    expect(detector.files[0].installed).toBe(false);
    expect(detector.files[0].filePath).toBe(path.join(tmpDir, 'comic-text-detector', 'detector.onnx'));
  });

  test('importModelFile successfully imports single-file model and supports model.onnx fallback', async () => {
    const dummySrc = path.join(tmpDir, 'test-downloaded.onnx');
    fs.writeFileSync(dummySrc, 'ONNX_MODEL_BYTES_MOCK');

    const result = await mm.importModelFile('comic-text-detector', dummySrc);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('detector.onnx');
    expect(result.installed).toBe(true);
    expect(fs.existsSync(result.destPath)).toBe(true);
    expect(fs.readFileSync(result.destPath, 'utf8')).toBe('ONNX_MODEL_BYTES_MOCK');

    // ModelManager now recognizes it as installed
    expect(mm.isModelInstalled('comic-text-detector')).toBe(true);

    const models = mm.listRegisteredModels();
    const detector = models.find((m) => m.id === 'comic-text-detector');
    expect(detector.installed).toBe(true);
    expect(detector.files[0].installed).toBe(true);
    expect(detector.diskSize).toBeGreaterThan(0);

    // Also test backward compatibility: if model.onnx exists instead
    fs.rmSync(result.destPath);
    const legacyPath = path.join(tmpDir, 'comic-text-detector', 'model.onnx');
    fs.writeFileSync(legacyPath, 'LEGACY_BYTES');
    expect(mm.isModelInstalled('comic-text-detector')).toBe(true);
    expect(mm.getModelPath('comic-text-detector')).toBe(legacyPath);
  });

  test('importModelFile handles multi-file model files individually', async () => {
    const encoderSrc = path.join(tmpDir, 'my-encoder.onnx');
    const decoderSrc = path.join(tmpDir, 'my-decoder.onnx');
    fs.writeFileSync(encoderSrc, 'ENCODER_BYTES');
    fs.writeFileSync(decoderSrc, 'DECODER_BYTES');

    // Import encoder first
    const r1 = await mm.importModelFile('manga-ocr-base', encoderSrc, 'encoder.onnx');
    expect(r1.success).toBe(true);
    expect(r1.installed).toBe(false); // only 1 of 2 installed

    let models = mm.listRegisteredModels();
    let ocr = models.find((m) => m.id === 'manga-ocr-base');
    expect(ocr.installed).toBe(false);
    expect(ocr.files.find((f) => f.filename === 'encoder.onnx').installed).toBe(true);
    expect(ocr.files.find((f) => f.filename === 'decoder.onnx').installed).toBe(false);

    // Import decoder
    const r2 = await mm.importModelFile('manga-ocr-base', decoderSrc, 'decoder.onnx');
    expect(r2.success).toBe(true);
    expect(r2.installed).toBe(true); // both installed

    models = mm.listRegisteredModels();
    ocr = models.find((m) => m.id === 'manga-ocr-base');
    expect(ocr.installed).toBe(true);
    expect(ocr.files.every((f) => f.installed)).toBe(true);
  });

  test('importModelFile auto-detects destination filename for multi-file models when matched', async () => {
    const encFile = path.join(tmpDir, 'manga-ocr-encoder.onnx');
    fs.writeFileSync(encFile, 'ENCODER');

    const res = await mm.importModelFile('manga-ocr-base', encFile);
    expect(res.filename).toBe('encoder.onnx');
  });

  test('importModelFile throws error on non-existent file or unknown model', async () => {
    await expect(mm.importModelFile('unknown-model', 'dummy.onnx')).rejects.toThrow();
    await expect(mm.importModelFile('comic-text-detector', '/non/existent/path.onnx')).rejects.toThrow();
  });

  test('resolves aliases correctly (koharu-rf-detr -> comic-text-detector, paddleocr -> manga-ocr-base, lama -> lama-inpainting)', async () => {
    // 1. Setup comic-text-detector in base folder
    const detectorDir = path.join(tmpDir, 'comic-text-detector');
    fs.mkdirSync(detectorDir, { recursive: true });
    fs.writeFileSync(path.join(detectorDir, 'detector.onnx'), 'DETECTOR_BYTES');

    // Check alias koharu-rf-detr
    expect(mm.isModelInstalled('koharu-rf-detr')).toBe(true);
    expect(mm.getModelPath('koharu-rf-detr')).toBe(path.join(detectorDir, 'detector.onnx'));
    // ensureModel should not throw or attempt download
    await expect(mm.ensureModel('koharu-rf-detr')).resolves.toBeUndefined();

    // Check alias yolov5-manga
    expect(mm.isModelInstalled('yolov5-manga')).toBe(true);
    expect(mm.getModelPath('yolov5-manga')).toBe(path.join(detectorDir, 'detector.onnx'));

    // 2. Setup manga-ocr-base
    const ocrDir = path.join(tmpDir, 'manga-ocr-base');
    fs.mkdirSync(ocrDir, { recursive: true });
    fs.writeFileSync(path.join(ocrDir, 'encoder.onnx'), 'ENC');
    fs.writeFileSync(path.join(ocrDir, 'decoder.onnx'), 'DEC');
    fs.writeFileSync(path.join(ocrDir, 'vocab.txt'), 'VOCAB');

    expect(mm.isModelInstalled('paddleocr-vl-1.6')).toBe(true);
    const paths = mm.getModelPaths('paddleocr-vl-1.6');
    expect(paths['encoder.onnx']).toBe(path.join(ocrDir, 'encoder.onnx'));
    expect(paths['decoder.onnx']).toBe(path.join(ocrDir, 'decoder.onnx'));
    expect(paths['vocab.txt']).toBe(path.join(ocrDir, 'vocab.txt'));

    // 3. Setup lama-inpainting
    const lamaDir = path.join(tmpDir, 'lama-inpainting');
    fs.mkdirSync(lamaDir, { recursive: true });
    fs.writeFileSync(path.join(lamaDir, 'lama_fp32.onnx'), 'LAMA');

    expect(mm.isModelInstalled('lama')).toBe(true);
    expect(mm.getModelPath('lama')).toBe(path.join(lamaDir, 'lama_fp32.onnx'));

    // 4. listRegisteredModels should only list non-alias models
    const list = mm.listRegisteredModels();
    expect(list.some((m) => m.id === 'koharu-rf-detr')).toBe(false);
    expect(list.some((m) => m.id === 'comic-text-detector')).toBe(true);
  });
});

