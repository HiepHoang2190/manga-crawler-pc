const { getEngineConfig, getAllModels, getModelConfig, getModelsByEngine, getAllEngines } = require('../../upscale/engineConfigs');

describe('engineConfigs', () => {
  test('getEngineConfig returns config for known engines', () => {
    const cfg = getEngineConfig('waifu2x');
    expect(cfg).toBeDefined();
    expect(cfg.binaryName).toBe('waifu2x-ncnn-vulkan');
    expect(cfg.license).toBe('MIT');
    expect(cfg.supportsDenoise).toBe(true);
  });

  test('getEngineConfig returns config for realesrgan', () => {
    const cfg = getEngineConfig('realesrgan');
    expect(cfg).toBeDefined();
    expect(cfg.binaryName).toBe('realesrgan-ncnn-vulkan');
    expect(cfg.supportsDenoise).toBe(false);
  });

  test('getEngineConfig returns config for realcugan', () => {
    const cfg = getEngineConfig('realcugan');
    expect(cfg).toBeDefined();
    expect(cfg.binaryName).toBe('realcugan-ncnn-vulkan');
    expect(cfg.supportsDenoise).toBe(true);
  });

  test('getEngineConfig returns null for unknown engine', () => {
    expect(getEngineConfig('unknown')).toBeNull();
  });

  test('getAllEngines returns all 3 engines', () => {
    const engines = getAllEngines();
    expect(engines).toHaveLength(3);
    const ids = engines.map((e) => e.id);
    expect(ids).toContain('waifu2x');
    expect(ids).toContain('realesrgan');
    expect(ids).toContain('realcugan');
  });

  test('getAllModels returns array of all models across engines', () => {
    const models = getAllModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThanOrEqual(6);
    expect(models.every((m) => m.id && m.engineId && m.label)).toBe(true);
  });

  test('getModelConfig returns config for known model', () => {
    const m = getModelConfig('cunet');
    expect(m).toBeDefined();
    expect(m.engineId).toBe('waifu2x');
    expect(m.scales).toContain(2);
    expect(m.estimatedSizeMB).toBeGreaterThan(0);
  });

  test('getModelConfig returns null for unknown model', () => {
    expect(getModelConfig('nonexistent')).toBeNull();
  });

  test('getModelsByEngine filters correctly', () => {
    const waifu2xModels = getModelsByEngine('waifu2x');
    expect(waifu2xModels.length).toBeGreaterThanOrEqual(3);
    expect(waifu2xModels.every((m) => m.engineId === 'waifu2x')).toBe(true);

    const esrganModels = getModelsByEngine('realesrgan');
    expect(esrganModels.length).toBeGreaterThanOrEqual(2);
    expect(esrganModels.every((m) => m.engineId === 'realesrgan')).toBe(true);
  });

  test('all models reference valid engines', () => {
    const models = getAllModels();
    const engineIds = getAllEngines().map((e) => e.id);
    for (const m of models) {
      expect(engineIds).toContain(m.engineId);
    }
  });

  test('all models have valid scale arrays', () => {
    const models = getAllModels();
    for (const m of models) {
      expect(Array.isArray(m.scales)).toBe(true);
      expect(m.scales.length).toBeGreaterThan(0);
      expect(m.scales.every((s) => typeof s === 'number' && s > 0)).toBe(true);
    }
  });

  test('realesrgan models use modelName instead of modelDirName', () => {
    const esrganModels = getModelsByEngine('realesrgan');
    for (const m of esrganModels) {
      expect(m.modelName).toBeDefined();
      expect(typeof m.modelName).toBe('string');
    }
  });

  test('all models have valid suffixTag for output filename formatting', () => {
    const models = getAllModels();
    for (const m of models) {
      expect(m.suffixTag).toBeDefined();
      expect(typeof m.suffixTag).toBe('string');
      expect(m.suffixTag.length).toBeGreaterThan(0);
    }
  });

  test('realcugan-nose only supports scale 2x to avoid binary crash', () => {
    const nose = getModelConfig('realcugan-nose');
    expect(nose).toBeDefined();
    expect(nose.scales).toEqual([2]);
  });
});
