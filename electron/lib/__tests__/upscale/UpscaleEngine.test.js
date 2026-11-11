const { UpscaleEngine } = require('../../upscale/UpscaleEngine');

describe('UpscaleEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new UpscaleEngine('/fake/resources', '/fake/userData');
  });

  describe('buildArgs', () => {
    test('generates correct CLI args for waifu2x', () => {
      const args = engine.buildArgs({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        denoise: 1,
        tileSize: 0,
        gpuId: 0,
      });
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/in.png');
      expect(args).toContain('-o');
      expect(args).toContain('/tmp/out.png');
      expect(args).toContain('-s');
      expect(args).toContain('2');
      expect(args).toContain('-n');
      expect(args).toContain('1');
      expect(args).toContain('-g');
      expect(args).toContain('0');
    });

    test('generates correct CLI args for realesrgan', () => {
      const args = engine.buildArgs({
        engineId: 'realesrgan',
        modelId: 'realesrgan-x4plus-anime',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 4,
        tileSize: 0,
      });
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/in.png');
      expect(args).toContain('-o');
      expect(args).toContain('/tmp/out.png');
      expect(args).toContain('-n');
      expect(args).toContain('realesrgan-x4plus-anime');
      expect(args).toContain('-s');
      expect(args).toContain('4');
    });

    test('generates correct CLI args for mangajanai-2x-1600p', () => {
      const args = engine.buildArgs({
        engineId: 'realesrgan',
        modelId: 'mangajanai-2x-1600p',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        tileSize: 0,
      });
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/in.png');
      expect(args).toContain('-o');
      expect(args).toContain('/tmp/out.png');
      expect(args).toContain('-n');
      expect(args).toContain('mangajanai-2x-1600p');
      expect(args).toContain('-s');
      expect(args).toContain('2');
    });

    test('generates correct CLI args for mangajanai-4x-1600p and illustrationjanai-4x', () => {
      const argsManga = engine.buildArgs({
        engineId: 'realesrgan',
        modelId: 'mangajanai-4x-1600p',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 4,
      });
      expect(argsManga).toContain('-n');
      expect(argsManga).toContain('mangajanai-4x-1600p');
      expect(argsManga).toContain('-s');
      expect(argsManga).toContain('4');

      const argsIllus = engine.buildArgs({
        engineId: 'realesrgan',
        modelId: 'illustrationjanai-4x',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 4,
      });
      expect(argsIllus).toContain('-n');
      expect(argsIllus).toContain('illustrationjanai-4x');
      expect(argsIllus).toContain('-s');
      expect(argsIllus).toContain('4');
    });

    test('generates correct CLI args for realcugan', () => {
      const args = engine.buildArgs({
        engineId: 'realcugan',
        modelId: 'realcugan-se',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        denoise: 2,
        tileSize: 256,
      });
      expect(args).toContain('-s');
      expect(args).toContain('2');
      expect(args).toContain('-n');
      expect(args).toContain('2');
      expect(args).toContain('-t');
      expect(args).toContain('256');
    });
    test('forces denoise 0 for realcugan-nose model', () => {
      const args = engine.buildArgs({
        engineId: 'realcugan',
        modelId: 'realcugan-nose',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        denoise: 2,
      });
      const nIdx = args.indexOf('-n');
      expect(nIdx).toBeGreaterThan(-1);
      expect(args[nIdx + 1]).toBe('0');
    });

    test('maps unsupported denoise 1 or 2 to -1 for realcugan-pro', () => {
      const args1 = engine.buildArgs({
        engineId: 'realcugan',
        modelId: 'realcugan-pro',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        denoise: 1,
      });
      const nIdx1 = args1.indexOf('-n');
      expect(nIdx1).toBeGreaterThan(-1);
      expect(args1[nIdx1 + 1]).toBe('-1');

      const args3 = engine.buildArgs({
        engineId: 'realcugan',
        modelId: 'realcugan-pro',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        denoise: 3,
      });
      const nIdx3 = args3.indexOf('-n');
      expect(nIdx3).toBeGreaterThan(-1);
      expect(args3[nIdx3 + 1]).toBe('3');
    });

    test('maps unsupported denoise 1 or 2 to -1 for realcugan-se at scale 3', () => {
      const args = engine.buildArgs({
        engineId: 'realcugan',
        modelId: 'realcugan-se',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 3,
        denoise: 1,
      });
      const nIdx = args.indexOf('-n');
      expect(nIdx).toBeGreaterThan(-1);
      expect(args[nIdx + 1]).toBe('-1');
    });
    test('omits tile size when 0 (auto)', () => {
      const args = engine.buildArgs({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        tileSize: 0,
      });
      expect(args).not.toContain('-t');
    });

    test('returns empty array for unknown engine', () => {
      const args = engine.buildArgs({
        engineId: 'unknown',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
      });
      expect(args).toEqual([]);
    });
  });

  describe('cancel / isCancelled', () => {
    test('initially not cancelled', () => {
      expect(engine.isCancelled()).toBe(false);
    });

    test('cancel sets cancelled flag', () => {
      engine.cancel();
      expect(engine.isCancelled()).toBe(true);
    });

    test('reset clears cancelled flag', () => {
      engine.cancel();
      expect(engine.isCancelled()).toBe(true);
      engine.reset();
      expect(engine.isCancelled()).toBe(false);
    });
  });

  describe('upscaleImage', () => {
    test('returns error when cancelled', async () => {
      engine.cancel();
      const result = await engine.upscaleImage({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cancelled');
    });

    test('returns error for unknown engine', async () => {
      const result = await engine.upscaleImage({
        engineId: 'unknown',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown engine');
    });

    test('returns error when binary not found', async () => {
      jest.spyOn(engine._binaryManager, 'resolveBinaryPath').mockReturnValue('/fake/path/waifu2x');
      jest.spyOn(engine._binaryManager, 'isBinaryAvailable').mockReturnValue(false);
      const result = await engine.upscaleImage({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Binary not found');
    });
  });

  describe('upscaleBatch', () => {
    test('cancels mid-batch when cancel() is called', async () => {
      jest.spyOn(engine._binaryManager, 'resolveBinaryPath').mockReturnValue('/fake/path/waifu2x');
      jest.spyOn(engine._binaryManager, 'isBinaryAvailable').mockReturnValue(false);
      // Cancel after the first progress callback
      let cancelledAfterFirst = false;
      const result = await engine.upscaleBatch({
        images: [
          { input: '/tmp/1.png', output: '/tmp/out/1.png' },
          { input: '/tmp/2.png', output: '/tmp/out/2.png' },
          { input: '/tmp/3.png', output: '/tmp/out/3.png' },
        ],
        engineId: 'waifu2x',
        modelId: 'cunet',
        scale: 2,
        denoise: 1,
        onProgress: (data) => {
          // After first image completes, cancel
          if (data.current === 1 && data.status === 'error' && !cancelledAfterFirst) {
            cancelledAfterFirst = true;
            engine.cancel();
          }
        },
      });
      expect(result.cancelled).toBe(true);
      // Should not have processed all 3 images
      expect(result.results.length).toBeLessThan(3);
    });

    test('calls onProgress during batch', async () => {
      jest.spyOn(engine._binaryManager, 'resolveBinaryPath').mockReturnValue('/fake/path/waifu2x');
      jest.spyOn(engine._binaryManager, 'isBinaryAvailable').mockReturnValue(false);
      const progressCalls = [];
      // This will fail for each image (binary not found), but we test progress callback
      const result = await engine.upscaleBatch({
        images: [
          { input: '/tmp/1.png', output: '/tmp/out/1.png' },
          { input: '/tmp/2.png', output: '/tmp/out/2.png' },
        ],
        engineId: 'waifu2x',
        modelId: 'cunet',
        scale: 2,
        denoise: 1,
        onProgress: (data) => progressCalls.push(data),
      });
      // 2 images × 2 progress calls each (processing + done/error)
      expect(progressCalls.length).toBe(4);
      expect(result.total).toBe(2);
      expect(result.failed).toBe(2); // Both fail because binary doesn't exist
      expect(progressCalls[0].inputPath).toBe('/tmp/1.png');
      expect(progressCalls[1].inputPath).toBe('/tmp/1.png');
      expect(progressCalls[1].status).toBe('error');
      expect(progressCalls[1].error).toContain('Binary not found');
      expect(progressCalls[2].inputPath).toBe('/tmp/2.png');
      expect(progressCalls[3].inputPath).toBe('/tmp/2.png');
      expect(progressCalls[3].status).toBe('error');
    });

    test('prepareBinary only executes once per engine', () => {
      const spyEnsure = jest.spyOn(engine._binaryManager, 'ensureExecutable').mockReturnValue(true);
      const spyQuarantine = jest.spyOn(engine._binaryManager, 'removeQuarantine').mockReturnValue(true);

      engine.prepareBinary('waifu2x');
      engine.prepareBinary('waifu2x');
      engine.prepareBinary('waifu2x');

      expect(spyEnsure).toHaveBeenCalledTimes(1);
      expect(spyQuarantine).toHaveBeenCalledTimes(1);

      spyEnsure.mockRestore();
      spyQuarantine.mockRestore();
    });

    test('parseProgressChunk correctly parses percentages from NCNN carriage return chunks', () => {
      expect(engine.parseProgressChunk('  0.00%\r')).toBe(0);
      expect(engine.parseProgressChunk(' 25.50%\r 50.00%\r')).toBe(50);
      expect(engine.parseProgressChunk('100.00%\r')).toBe(100);
      expect(engine.parseProgressChunk('invalid stderr output\n')).toBeNull();
      expect(engine.parseProgressChunk('')).toBeNull();
    });

    test('cleanStderr filters out NCNN device diagnostic probing lines and formats crash code with recovery hints', () => {
      const ncnnDiagnosticStderr =
        '[0 NVIDIA GeForce GTX 1050]  queueC=2[8]  queueT=1[2]\n' +
        '[0 NVIDIA GeForce GTX 1050]  fp16-p/s/u/a=1/1/1/0  int8-p/s/u/a=1/1/1/1\n' +
        '[0 NVIDIA GeForce GTX 1050]  subgroup=32(32~32)  ops=1/1/1/1/1/1/1/1/1\n' +
        '[0 NVIDIA GeForce GTX 1050]  fp16-cm=0  int8-cm=0  bf16-cm=0  fp8-cm=0\n' +
        '[1 Intel(R) UHD Graphics 630]  queueC=0[1]  queueT=0[1]\n' +
        '[1 Intel(R) UHD Graphics 630]  fp16-p/s/u/a=1/1/1/1  int8-p/s/u/a=1/1/1/1\n' +
        '[1 Intel(R) UHD Graphics 630]  subgroup=32(32~32)  ops=1/1/1/1/1/1/1/0/0\n' +
        '[1 Intel(R) UHD Graphics 630]  fp16-cm=0  int8-cm=0  bf16-cm=0  fp8-cm=0\n';

      const errorMsg = engine.formatErrorMessage(ncnnDiagnosticStderr, 3221225477);
      // Must NOT contain raw queueC or fp16 as the error
      expect(errorMsg).not.toContain('queueC=');
      expect(errorMsg).not.toContain('fp16-p/s/u/a');
      // Must identify Access Violation / VRAM exhaustion
      expect(errorMsg).toContain('0xC0000005');
      // Must provide actionable hints
      expect(errorMsg).toContain('Tile Size');
    });

    test('extractAndCacheGpus extracts GPU devices from NCNN diagnostic output', () => {
      const ncnnDiagnosticStderr =
        '[0 NVIDIA GeForce GTX 1050]  queueC=2[8]  queueT=1[2]\n' +
        '[1 Intel(R) UHD Graphics 630]  queueC=0[1]  queueT=0[1]\n';

      const gpus = engine.extractDiscoveredGpus(ncnnDiagnosticStderr);
      expect(gpus).toHaveLength(2);
      expect(gpus[0]).toEqual({ id: 0, name: 'NVIDIA GeForce GTX 1050' });
      expect(gpus[1]).toEqual({ id: 1, name: 'Intel(R) UHD Graphics 630' });
    });

    test('buildArgs omits -g when gpuId is auto and adds -j 1:1:2', () => {
      const args = engine.buildArgs({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        gpuId: 'auto',
      });
      expect(args).not.toContain('-g');
      expect(args).toContain('-j');
      expect(args).toContain('1:1:2');
    });

    test('buildArgs passes -g when specific gpuId is given', () => {
      const argsGpu1 = engine.buildArgs({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        gpuId: 1,
      });
      const gIdx1 = argsGpu1.indexOf('-g');
      expect(gIdx1).toBeGreaterThan(-1);
      expect(argsGpu1[gIdx1 + 1]).toBe('1');

      const argsCpu = engine.buildArgs({
        engineId: 'waifu2x',
        modelId: 'cunet',
        input: '/tmp/in.png',
        output: '/tmp/out.png',
        scale: 2,
        gpuId: -1,
      });
      const gIdxCpu = argsCpu.indexOf('-g');
      expect(gIdxCpu).toBeGreaterThan(-1);
      expect(argsCpu[gIdxCpu + 1]).toBe('-1');
    });

    test('skips image without calling binary when skipExisting is true and output file exists', async () => {
      const fs = require('fs');
      const spyExists = jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.includes('existing'));
      const spyStat = jest.spyOn(fs, 'statSync').mockImplementation((p) => ({ size: 1024 }));
      const spyUpscaleImage = jest.spyOn(engine, 'upscaleImage');

      const progressCalls = [];
      const result = await engine.upscaleBatch({
        images: [
          { input: '/tmp/1.png', output: '/tmp/existing_out.png' },
        ],
        engineId: 'waifu2x',
        skipExisting: true,
        onProgress: (p) => progressCalls.push(p),
      });

      expect(spyUpscaleImage).not.toHaveBeenCalled();
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0].skipped).toBe(true);
      expect(progressCalls.some((p) => p.status === 'skipped')).toBe(true);

      spyExists.mockRestore();
      spyStat.mockRestore();
      spyUpscaleImage.mockRestore();
    });
  });

  describe('MangaJaNai Models Registry', () => {
    const { getModelConfig, getModelsByEngine } = require('../../upscale/engineConfigs');

    test('registers mangajanai-2x-1600p with correct scale and engine', () => {
      const cfg = getModelConfig('mangajanai-2x-1600p');
      expect(cfg).toBeDefined();
      expect(cfg.engineId).toBe('realesrgan');
      expect(cfg.scales).toEqual([2]);
      expect(cfg.modelName).toBe('mangajanai-2x-1600p');
    });

    test('registers mangajanai-4x-1600p with scale 4', () => {
      const cfg = getModelConfig('mangajanai-4x-1600p');
      expect(cfg).toBeDefined();
      expect(cfg.engineId).toBe('realesrgan');
      expect(cfg.scales).toEqual([4]);
      expect(cfg.modelName).toBe('mangajanai-4x-1600p');
    });

    test('registers illustrationjanai-4x with scale 4', () => {
      const cfg = getModelConfig('illustrationjanai-4x');
      expect(cfg).toBeDefined();
      expect(cfg.engineId).toBe('realesrgan');
      expect(cfg.scales).toEqual([4]);
      expect(cfg.modelName).toBe('illustrationjanai-4x');
    });

    test('includes MangaJaNai models in getModelsByEngine for realesrgan', () => {
      const models = getModelsByEngine('realesrgan');
      const ids = models.map((m) => m.id);
      expect(ids).toContain('mangajanai-2x-1600p');
      expect(ids).toContain('mangajanai-4x-1600p');
      expect(ids).toContain('illustrationjanai-4x');
    });
  });

  describe('Hardware Acceleration Dispatcher', () => {
    test('returns structured hardware acceleration info', () => {
      const info = engine.getHardwareAccelerationInfo();
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('arch');
      expect(info).toHaveProperty('isAppleSilicon');
      expect(info).toHaveProperty('hasCoreML');
      expect(info).toHaveProperty('activeEngine');
      expect(info).toHaveProperty('label');
    });

    test('routes batch to NcnnBatchRunner when NCNN binary exists', async () => {
      const spyResolveBinary = jest.spyOn(engine._binaryManager, 'resolveBinaryPath').mockReturnValue('/bin/ncnn');
      const fs = require('fs');
      const spyExists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const spyNcnnBatch = jest.spyOn(engine._ncnnBatchRunner, 'upscaleBatch').mockResolvedValue({
        success: true,
        processedCount: 2,
      });

      const result = await engine.upscaleBatch({
        images: [
          { input: '/tmp/1.png', output: '/tmp/out/1.png' },
          { input: '/tmp/2.png', output: '/tmp/out/2.png' },
        ],
        engineId: 'realcugan',
        modelId: 'realcugan-se',
        scale: 2,
      });

      expect(spyNcnnBatch).toHaveBeenCalled();
      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);

      spyResolveBinary.mockRestore();
      spyExists.mockRestore();
      spyNcnnBatch.mockRestore();
    });

    test('routes batch to NcnnBatchRunner and forwards compress options', async () => {
      const spyResolveBinary = jest.spyOn(engine._binaryManager, 'resolveBinaryPath').mockReturnValue('/bin/ncnn');
      const fs = require('fs');
      const spyExists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const spyNcnnBatch = jest.spyOn(engine._ncnnBatchRunner, 'upscaleBatch').mockResolvedValue({
        success: true,
        processedCount: 1,
      });

      const compressOptions = { enabled: true, resizeRatio: 0.8, quality: 85 };
      await engine.upscaleBatch({
        images: [{ input: '/tmp/1.png', output: '/tmp/out/1.png' }],
        engineId: 'realcugan',
        modelId: 'realcugan-se',
        scale: 2,
        compress: compressOptions,
      });

      expect(spyNcnnBatch).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ compress: compressOptions })
      );

      spyResolveBinary.mockRestore();
      spyExists.mockRestore();
      spyNcnnBatch.mockRestore();
    });
  });
});
