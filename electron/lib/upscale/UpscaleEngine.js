/**
 * UpscaleEngine — Core orchestrator for AI image upscale.
 *
 * Spawns NCNN-Vulkan CLI binaries (waifu2x, realesrgan, realcugan)
 * to upscale images with GPU acceleration via Vulkan API.
 *
 * Usage:
 *   const engine = new UpscaleEngine(resourcesPath, userDataPath);
 *   const result = await engine.upscaleImage({ input, output, engineId, modelId, scale, denoise });
 *   const results = await engine.upscaleBatch({ images, outputDir, engineId, modelId, scale, denoise, onProgress });
 *   engine.cancel();
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { BinaryManager } = require('./BinaryManager');
const { getEngineConfig, getModelConfig } = require('./engineConfigs');
const NcnnBatchRunner = require('./NcnnBatchRunner');
const imageOptimizer = require('./imageOptimizer');

class UpscaleEngine {
  /**
   * @param {string} resourcesPath — process.resourcesPath (packaged) or project resources/ (dev)
   * @param {string} userDataPath — app.getPath('userData') for model storage
   */
  constructor(resourcesPath, userDataPath) {
    this._binaryManager = new BinaryManager(resourcesPath, userDataPath);
    this._userDataPath = userDataPath || '';
    this._cancelled = false;
    this._childProcess = null;
    this._preparedEngines = new Set();
    this._ncnnBatchRunner = new NcnnBatchRunner(this._binaryManager);
  }

  /**
   * Get hardware acceleration metadata for current OS/architecture.
   * @returns {{ platform: string, arch: string, isAppleSilicon: boolean, hasCoreML: boolean, activeEngine: string, label: string, availableEngines: Array<{ id: string, label: string }> }}
   */
  getHardwareAccelerationInfo() {
    const isMacArm = process.platform === 'darwin' && process.arch === 'arm64';
    const availableEngines = [
      { id: 'ncnn', label: 'GPU Vulkan / Metal (NCNN Batch)' },
    ];

    return {
      platform: process.platform,
      arch: process.arch,
      isAppleSilicon: isMacArm,
      hasCoreML: false,
      activeEngine: 'ncnn',
      label: 'GPU Vulkan / Metal (NCNN Batch)',
      availableEngines,
    };
  }

  isCancelled() {
    return this._cancelled;
  }

  cancel() {
    this._cancelled = true;
    if (this._childProcess && !this._childProcess.killed) {
      try {
        this._childProcess.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
    }
    this._ncnnBatchRunner?.cancel();
  }

  /**
   * Reset cancel state for a new run.
   */
  reset() {
    this._cancelled = false;
    this._childProcess = null;
  }

  /**
   * Ensure binary has executable permissions & quarantine attribute removed once per engine.
   * @param {string} engineId
   */
  prepareBinary(engineId) {
    if (!engineId || this._preparedEngines.has(engineId)) return;
    this._binaryManager.ensureExecutable(engineId);
    this._binaryManager.removeQuarantine(engineId);
    this._preparedEngines.add(engineId);
  }

  /**
   * Parse percentage from NCNN carriage-return chunk.
   * @param {string} chunk
   * @returns {number|null} 0-100 or null if no percentage found
   */
  parseProgressChunk(chunk) {
    if (!chunk) return null;
    const matches = Array.from(String(chunk).matchAll(/(?:^|[\r\n])\s*(\d+(?:\.\d+)?)%/g));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const val = Math.min(100, Math.round(parseFloat(last[1])));
      return Number.isFinite(val) ? val : null;
    }
    return null;
  }

  /**
   * Resolve the model directory/name argument for the engine CLI.
   * @param {string} engineId
   * @param {string} modelId
   * @returns {{ modelArg: string, modelFlag: string }|null}
   */
  resolveModelArg(engineId, modelId) {
    const model = getModelConfig(modelId);
    if (!model || model.engineId !== engineId) return null;

    if (engineId === 'realesrgan') {
      // realesrgan uses -n <modelName> and -m <modelDir>
      return {
        modelFlag: '-n',
        modelArg: model.modelName,
      };
    }

    // waifu2x and realcugan use -m <modelDirPath>
    const binaryPath = this._binaryManager.resolveBinaryPath(engineId);
    if (!binaryPath) return null;
    const binaryDir = path.dirname(binaryPath);
    const modelDir = path.join(binaryDir, model.modelDirName);

    return {
      modelFlag: '-m',
      modelArg: modelDir,
    };
  }

  /**
   * Extract discovered GPUs from NCNN stderr diagnostic lines.
   * @param {string} stderrData
   * @returns {Array<{ id: number, name: string }>}
   */
  extractDiscoveredGpus(stderrData) {
    if (!stderrData) return [];
    const gpus = [];
    const matches = stderrData.matchAll(/\[(\d+)\s+([^\]]+)\]/g);
    for (const m of matches) {
      const id = parseInt(m[1], 10);
      const name = m[2].trim();
      if (!gpus.some((g) => g.id === id)) {
        gpus.push({ id, name });
      }
    }
    return gpus;
  }

  /**
   * Format a user-friendly error message from stderr and exit code,
   * filtering out NCNN benign device capability probe logs.
   * @param {string} stderrData
   * @param {number|null} code
   * @returns {string}
   */
  formatErrorMessage(stderrData, code) {
    const rawLines = (stderrData || '')
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        // Filter out NCNN progress percentage lines (e.g. " 25.00%")
        if (/^\d+(\.\d+)?%$/.test(l)) return false;
        // Filter out NCNN Vulkan device diagnostic lines (e.g. "[0 NVIDIA GeForce GTX 1050] queueC=2[8]...")
        if (/^\[\d+\s+[^\]]+\]\s+(queue[A-Z]|fp16|subgroup|int8|bf16|ops)/i.test(l)) return false;
        if (/^\[\d+\s+[^\]]+\]\s*$/i.test(l)) return false;
        return true;
      });
    const uniqueLines = Array.from(new Set(rawLines));
    const cleanStderr = uniqueLines.join('; ');

    let mainError = '';
    if (cleanStderr) {
      mainError = cleanStderr;
    } else {
      // Process crashed or exited without explicit error output on stderr (e.g. GPU out of VRAM, Access Violation)
      if (code === 3221225477 || code === -1073741819) {
        mainError = 'Tiến trình bị sập (Access Violation 0xC0000005) — thường do card đồ họa bị tràn bộ nhớ VRAM hoặc lỗi driver Vulkan.';
      } else if (code === 3221225781 || code === -1073741515) {
        mainError = 'Thiếu thư viện hệ thống (0xC0000135) — thiếu Visual C++ Redistributable hoặc vcomp140.dll.';
      } else if (code !== undefined && code !== null) {
        mainError = `Tiến trình kết thúc với mã lỗi ${code}`;
      } else {
        mainError = 'Tiến trình kết thúc bất thường';
      }
    }

    const hint = ' [Gợi ý: Thử giảm Tile Size (100px/200px), đổi sang GPU khác/CPU trong cài đặt, hoặc chọn model nhẹ hơn như UpRGB/Real-CUGAN SE]';
    return `${mainError}${hint}`;
  }

  /**
   * Build CLI arguments for the given engine/model/options.
   * @param {Object} opts
   * @returns {string[]}
   */
  buildArgs(opts) {
    const { engineId, modelId, input, output, scale = 2, denoise = -1, tileSize = 0, gpuId = 'auto' } = opts;
    const args = [];
    const engine = getEngineConfig(engineId);
    if (!engine) return args;

    // Normalize paths on Windows
    const normInput = process.platform === 'win32' ? path.normalize(input) : input;
    const normOutput = process.platform === 'win32' ? path.normalize(output) : output;

    // Input / Output
    args.push('-i', normInput, '-o', normOutput);

    // Scale
    args.push('-s', String(scale));

    // Engine-specific model & denoise
    if (engineId === 'realesrgan') {
      const model = getModelConfig(modelId);
      if (model?.modelName) {
        args.push('-n', model.modelName);
      }
      // realesrgan: -m is model dir (where .param/.bin live)
      const binaryPath = this._binaryManager.resolveBinaryPath(engineId);
      if (binaryPath) {
        const modelDir = path.join(path.dirname(binaryPath), 'models');
        args.push('-m', process.platform === 'win32' ? path.normalize(modelDir) : modelDir);
      }
    } else if (engineId === 'waifu2x') {
      const model = getModelConfig(modelId);
      if (model?.modelDirName) {
        const binaryPath = this._binaryManager.resolveBinaryPath(engineId);
        if (binaryPath) {
          const modelDir = path.join(path.dirname(binaryPath), model.modelDirName);
          args.push('-m', process.platform === 'win32' ? path.normalize(modelDir) : modelDir);
        }
      }
      // Denoise level
      if (engine.supportsDenoise) {
        args.push('-n', String(denoise));
      }
    } else if (engineId === 'realcugan') {
      const model = getModelConfig(modelId);
      if (model?.modelDirName) {
        const binaryPath = this._binaryManager.resolveBinaryPath(engineId);
        if (binaryPath) {
          const modelDir = path.join(path.dirname(binaryPath), model.modelDirName);
          args.push('-m', process.platform === 'win32' ? path.normalize(modelDir) : modelDir);
        }
      }
      // Denoise level
      if (engine.supportsDenoise) {
        let effectiveDenoise = denoise;
        if (modelId === 'realcugan-nose') {
          effectiveDenoise = 0;
        } else if (modelId === 'realcugan-pro' || scale > 2) {
          // realcugan-pro and realcugan-se (3x/4x) only support noise levels -1, 0, and 3
          if (denoise === 1 || denoise === 2) {
            effectiveDenoise = -1; // Fallback to conservative
          }
        }
        args.push('-n', String(effectiveDenoise));
      }
    }

    // Tile size (0 = auto)
    if (tileSize > 0) {
      args.push('-t', String(tileSize));
    }

    // Single proc thread: cuts VRAM usage in half on low-VRAM GPUs (waifu2x/cugan/esrgan default to 1:2:2)
    args.push('-j', '1:1:2');

    // GPU id: only pass -g if explicitly specified (not 'auto' and not empty)
    if (gpuId !== undefined && gpuId !== null && gpuId !== 'auto' && String(gpuId).trim() !== '') {
      args.push('-g', String(gpuId));
    }

    return args;
  }

  /**
   * Upscale a single image.
   * @param {Object} opts
   * @returns {Promise<{ success: boolean, outputPath: string, error?: string }>}
   */
  async upscaleImage(opts) {
    if (this._cancelled) {
      return { success: false, outputPath: '', error: 'Cancelled' };
    }

    const { engineId, input, output, onFileProgress } = opts;

    // Resolve binary
    const binaryPath = this._binaryManager.resolveBinaryPath(engineId);
    if (!binaryPath) {
      return { success: false, outputPath: '', error: `Unknown engine: ${engineId}` };
    }
    if (!this._binaryManager.isBinaryAvailable(engineId)) {
      return { success: false, outputPath: '', error: `Binary not found: ${binaryPath}` };
    }

    // Ensure executable permission & remove quarantine (macOS) — cached once per engine
    this.prepareBinary(engineId);

    // Ensure output directory exists
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Build CLI args
    const args = this.buildArgs(opts);

    return new Promise((resolve) => {
      const child = spawn(binaryPath, args, {
        cwd: path.dirname(binaryPath),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this._childProcess = child;
      let stderrData = '';
      let lastPercent = -1;
      let lastEmitTime = 0;

      child.stderr.on('data', (chunk) => {
        const str = chunk.toString();
        stderrData += str;
        const percent = this.parseProgressChunk(str);
        if (percent !== null && percent !== lastPercent) {
          lastPercent = percent;
          const now = Date.now();
          if (now - lastEmitTime >= 80 || percent === 100) {
            lastEmitTime = now;
            try {
              onFileProgress?.(percent);
            } catch {}
          }
        }
      });

      child.stdout.on('data', () => {
        // NCNN binaries output progress to stderr, stdout is usually empty
      });

      child.on('error', (err) => {
        this._childProcess = null;
        resolve({ success: false, outputPath: output, error: err.message });
      });

      child.on('close', async (code) => {
        this._childProcess = null;
        if (this._cancelled) {
          resolve({ success: false, outputPath: output, error: 'Cancelled' });
        } else if (code === 0) {
          // Still extract and cache any discovered GPUs from successful runs
          const gpus = this.extractDiscoveredGpus(stderrData);
          if (gpus.length > 0) {
            UpscaleEngine.discoveredGpus = gpus;
          }
          if (!fs.existsSync(output)) {
            const errorMsg = this.formatErrorMessage(stderrData, code) || 'Không thể tạo tệp ảnh đầu ra (lỗi định dạng ảnh gốc hoặc giải mã)';
            resolve({ success: false, outputPath: output, error: errorMsg });
          } else {
            if (opts.compress?.enabled) {
              try {
                const optResult = await imageOptimizer.optimizeUpscaledImage(output, output, opts.compress);
                if (optResult.success || optResult.fallbackCopied) {
                  resolve({
                    success: true,
                    outputPath: output,
                    outputSize: optResult.optimizedBytes,
                    savedPercent: optResult.savedPercent,
                  });
                  return;
                }
              } catch {}
            }
            resolve({ success: true, outputPath: output });
          }
        } else {
          const gpus = this.extractDiscoveredGpus(stderrData);
          if (gpus.length > 0) {
            UpscaleEngine.discoveredGpus = gpus;
          }
          const errorMsg = this.formatErrorMessage(stderrData, code);
          resolve({
            success: false,
            outputPath: output,
            error: errorMsg.length > 600 ? `${errorMsg.slice(0, 600)}...` : errorMsg,
          });
        }
      });
    });
  }

  /**
   * Upscale a batch of images.
   * @param {Object} opts
   * @param {Array<{input: string, output: string}>} opts.images — input/output pairs
   * @param {string} opts.engineId
   * @param {string} opts.modelId
   * @param {number} opts.scale
   * @param {number} opts.denoise
   * @param {number} opts.tileSize
   * @param {string|number} [opts.gpuId='auto']
   * @param {Function} opts.onProgress — (data: { current, total, currentFile, percent, filePercent, status, error, inputPath, outputPath }) => void
   * @returns {Promise<{ completed: number, failed: number, results: Array }>}
   */
  async upscaleBatch(opts) {
    const {
      images = [],
      engineId,
      modelId,
      scale,
      denoise,
      tileSize,
      gpuId = 'auto',
      engineMode = 'auto',
      compress = null,
      skipExisting = false,
      useBatchRunner = true,
      onProgress = () => {},
    } = opts;

    this.reset();
    if (engineId) {
      this.prepareBinary(engineId);
    }
    const total = images.length;
    const results = [];
    let completed = 0;
    let failed = 0;

    // Check which images are already completed vs pending
    const pendingImages = [];
    for (let i = 0; i < images.length; i++) {
      const { input, output } = images[i];
      const fileName = path.basename(input);

      if (skipExisting && fs.existsSync(output)) {
        try {
          const stat = fs.statSync(output);
          if (stat.size > 0) {
            completed++;
            results.push({ success: true, skipped: true, input, output, fileName });
            onProgress({
              current: completed,
              total,
              currentFile: fileName,
              inputPath: input,
              outputPath: output,
              percent: Math.round((completed / total) * 100),
              filePercent: 100,
              status: 'skipped',
            });
            continue;
          }
        } catch {}
      }

      pendingImages.push({
        input,
        output,
        fileName,
        absolutePath: input,
        originalIndex: i,
      });
    }

    if (pendingImages.length === 0) {
      return { completed, failed, total, cancelled: this._cancelled, results };
    }

    // Attempt high-speed batch runner if enabled and multiple files (or single file batch)
    if (useBatchRunner && pendingImages.length >= 1) {
      const targetOutputDir = path.dirname(pendingImages[0].output);
      const binaryPath = this._binaryManager.resolveBinaryPath(engineId);
      const hasNcnnBinary = binaryPath && fs.existsSync(binaryPath);

      // High-speed NCNN batch directory runner (loads model once, multi-threaded pipelines)
      if (hasNcnnBinary) {
        try {
          let modelDir = null;
          let modelName = null;
          const model = getModelConfig(modelId);
          if (engineId === 'realesrgan') {
            modelName = model?.modelName;
            modelDir = path.join(path.dirname(binaryPath), 'models');
          } else if (model?.modelDirName) {
            modelDir = path.join(path.dirname(binaryPath), model.modelDirName);
          }

          const ncnnResult = await this._ncnnBatchRunner.upscaleBatch(pendingImages, {
            binaryPath,
            engineId,
            modelId,
            modelDir,
            modelName,
            scale,
            denoise,
            tileSize,
            gpuId,
            compress,
            outputDir: targetOutputDir,
            onProgress: (p) => {
              const currentCompleted = completed + (p.current || 0);
              const overallPercent = Math.min(100, Math.round((currentCompleted / total) * 100));
              onProgress({
                ...p,
                current: currentCompleted,
                total,
                percent: overallPercent,
                filePercent: p.filePercent !== undefined ? p.filePercent : 100,
                status: p.status || 'processing',
              });
            },
          });

          if (ncnnResult.success) {
            completed += ncnnResult.processedCount;
            for (const item of pendingImages) {
              results.push({ success: true, input: item.input, output: item.output, fileName: item.fileName });
            }
            return { completed, failed, total, cancelled: this._cancelled, results };
          }
        } catch {
          // Fall back to per-image loop
        }
      }
    }

    // 3. Fallback per-image loop
    for (let i = 0; i < pendingImages.length; i++) {
      if (this._cancelled) break;

      const { input, output, fileName } = pendingImages[i];
      const curIndex = completed + i;

      onProgress({
        current: curIndex + 1,
        total,
        currentFile: fileName,
        inputPath: input,
        outputPath: output,
        percent: Math.round((curIndex / total) * 100),
        filePercent: 0,
        status: 'processing',
      });

      const result = await this.upscaleImage({
        engineId,
        modelId,
        input,
        output,
        scale,
        denoise,
        tileSize,
        gpuId,
        compress,
        onFileProgress: (filePercent) => {
          onProgress({
            current: curIndex + 1,
            total,
            currentFile: fileName,
            inputPath: input,
            outputPath: output,
            percent: Math.min(100, Math.round(((curIndex + (filePercent / 100)) / total) * 100)),
            filePercent,
            status: 'processing',
          });
        },
      });

      results.push({ ...result, input, fileName });
      if (result.success) {
        completed++;
      } else {
        failed++;
      }

      onProgress({
        current: curIndex + 1,
        total,
        currentFile: fileName,
        inputPath: input,
        outputPath: output,
        percent: Math.round(((curIndex + 1) / total) * 100),
        filePercent: 100,
        status: result.success ? 'done' : 'error',
        error: result.error,
      });
    }

    return { completed, failed, total, cancelled: this._cancelled, results };
  }
}

module.exports = { UpscaleEngine };
