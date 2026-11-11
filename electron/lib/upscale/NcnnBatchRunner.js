/**
 * NcnnBatchRunner — High-throughput batch processor for NCNN-Vulkan engines.
 *
 * Runs realcugan-ncnn-vulkan, realesrgan-ncnn-vulkan, and waifu2x-ncnn-vulkan
 * in native directory mode (-i <dir> -o <dir> -v).
 * Initializes GPU & VRAM once per batch, eliminating per-image process spawn latency.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const imageOptimizer = require('./imageOptimizer');

class NcnnBatchRunner {
  constructor(binaryManager = null) {
    this._binaryManager = binaryManager;
    this._cancelled = false;
    this._childProcess = null;
    this._activeStagingDirs = new Set();
  }

  /**
   * Cancel ongoing batch execution.
   */
  cancel() {
    this._cancelled = true;
    if (this._childProcess && !this._childProcess.killed) {
      try {
        this._childProcess.kill('SIGTERM');
      } catch {}
    }
    // Clean up active staging directories
    for (const dir of this._activeStagingDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    this._activeStagingDirs.clear();
  }

  /**
   * Build CLI arguments for NCNN batch directory execution.
   * @param {Object} opts
   * @returns {string[]}
   */
  buildBatchArgs(opts) {
    const {
      engineId,
      modelId,
      modelDir,
      modelName,
      inputDir,
      outputDir,
      scale = 2,
      denoise = -1,
      tileSize = 0,
      gpuId = 'auto',
      outputFormat = 'png',
    } = opts;

    const args = ['-v'];

    const normInput = process.platform === 'win32' ? path.normalize(inputDir) : inputDir;
    const normOutput = process.platform === 'win32' ? path.normalize(outputDir) : outputDir;

    args.push('-i', normInput, '-o', normOutput);
    args.push('-s', String(scale));

    if (engineId === 'realesrgan') {
      if (modelName) {
        args.push('-n', modelName);
      }
      if (modelDir) {
        args.push('-m', process.platform === 'win32' ? path.normalize(modelDir) : modelDir);
      }
    } else if (engineId === 'waifu2x') {
      if (modelDir) {
        args.push('-m', process.platform === 'win32' ? path.normalize(modelDir) : modelDir);
      }
      args.push('-n', String(denoise));
    } else if (engineId === 'realcugan') {
      if (modelDir) {
        args.push('-m', process.platform === 'win32' ? path.normalize(modelDir) : modelDir);
      }
      let effectiveDenoise = denoise;
      if (modelId === 'realcugan-nose') {
        effectiveDenoise = 0;
      } else if (modelId === 'realcugan-pro' || scale > 2) {
        if (denoise === 1 || denoise === 2) {
          effectiveDenoise = -1;
        }
      }
      args.push('-n', String(effectiveDenoise));
    }

    if (tileSize > 0) {
      args.push('-t', String(tileSize));
    }

    // Sequential single-image GPU pipeline (1:1:1) for seamless, consecutive image-by-image progress
    args.push('-j', '1:1:1');

    if (gpuId !== undefined && gpuId !== null && gpuId !== 'auto' && String(gpuId).trim() !== '') {
      args.push('-g', String(gpuId));
    }

    if (outputFormat && outputFormat !== 'original') {
      args.push('-f', outputFormat === 'jpeg' ? 'jpg' : outputFormat);
    }

    return args;
  }

  /**
   * Parse completed file events from verbose NCNN stderr output.
   * Matches lines like:
   * /path/to/in/page_1.png -> /path/to/out/page_1.png done
   * @param {string} chunk
   * @returns {Array<{ inputFile: string, outputFile: string }>}
   */
  parseStderrEvents(chunk) {
    if (!chunk) return [];
    const events = [];
    const regex = /([^\r\n]+?)\s*->\s*([^\r\n]+?)\s+done/g;
    let match;
    while ((match = regex.exec(chunk)) !== null) {
      events.push({
        inputFile: match[1].trim(),
        outputFile: match[2].trim(),
      });
    }
    return events;
  }

  /**
   * Parse percentage within tile chunk.
   * @param {string} chunk
   * @returns {number|null}
   */
  parseTilePercent(chunk) {
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
   * Finalize an upscaled output file:
   * Applies Caesium Engine compression if enabled, otherwise copies file.
   *
   * @param {string} srcOut
   * @param {string} targetDest
   * @param {Object} [compressOptions]
   * @returns {Promise<Object>}
   */
  async finalizeOutputFile(srcOut, targetDest, compressOptions = {}) {
    const targetDir = path.dirname(targetDest);
    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    if (compressOptions?.enabled) {
      try {
        const result = await imageOptimizer.optimizeUpscaledImage(srcOut, targetDest, compressOptions);
        return result;
      } catch (err) {
        console.error('[NcnnBatchRunner] optimizeUpscaledImage error, falling back to copy:', err);
        await fs.promises.copyFile(srcOut, targetDest);
        let outSize = 0;
        try {
          outSize = (await fs.promises.stat(targetDest)).size;
        } catch {}
        return {
          success: false,
          fallbackCopied: true,
          error: err.message,
          originalBytes: outSize,
          optimizedBytes: outSize,
          savedBytes: 0,
          savedPercent: 0,
        };
      }
    }

    await fs.promises.copyFile(srcOut, targetDest);
    let outSize = 0;
    try {
      outSize = (await fs.promises.stat(targetDest)).size;
    } catch {}
    return {
      success: true,
      originalBytes: outSize,
      optimizedBytes: outSize,
      savedBytes: 0,
      savedPercent: 0,
    };
  }

  /**
   * Run upscale batch through NCNN with directory batching.
   * @param {Array<{ absolutePath: string, fileName?: string }>} images
   * @param {Object} opts
   * @returns {Promise<{ success: boolean, processedCount: number, error?: string }>}
   */
  async upscaleBatch(images, opts) {
    if (!images || images.length === 0) {
      return { success: true, processedCount: 0 };
    }

    this._cancelled = false;
    const {
      binaryPath,
      engineId,
      modelId,
      modelDir,
      modelName,
      scale = 2,
      denoise = -1,
      tileSize = 0,
      gpuId = 'auto',
      outputDir,
      outputFormat = 'original',
      compress = null,
      onProgress,
    } = opts;

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      return { success: false, processedCount: 0, error: `Binary not found: ${binaryPath}` };
    }

    const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const baseStaging = path.join(os.tmpdir(), 'manga_crawler_ncnn_batch');
    const stagingIn = path.join(baseStaging, `in_${batchId}`);
    const stagingOut = path.join(baseStaging, `out_${batchId}`);

    this._activeStagingDirs.add(stagingIn);
    this._activeStagingDirs.add(stagingOut);

    try {
      fs.mkdirSync(stagingIn, { recursive: true });
      fs.mkdirSync(stagingOut, { recursive: true });
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Map staged filenames to real filenames
      const fileMap = new Map();
      for (let i = 0; i < images.length; i++) {
        const src = images[i].absolutePath;
        const ext = path.extname(src);
        const stageName = `img_${String(i).padStart(5, '0')}${ext}`;
        const stagePath = path.join(stagingIn, stageName);

        // Symlink or copy
        try {
          fs.linkSync(src, stagePath);
        } catch {
          fs.copyFileSync(src, stagePath);
        }

        fileMap.set(stageName, {
          sourcePath: src,
          targetOutput: images[i].output,
          targetFileName: images[i].fileName || path.basename(src),
          stageBase: `img_${String(i).padStart(5, '0')}`,
        });
      }

      const args = this.buildBatchArgs({
        engineId,
        modelId,
        modelDir,
        modelName,
        inputDir: stagingIn,
        outputDir: stagingOut,
        scale,
        denoise,
        tileSize,
        gpuId,
        outputFormat,
      });

      return await new Promise((resolve) => {
        const child = spawn(binaryPath, args, {
          cwd: path.dirname(binaryPath),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        this._childProcess = child;
        let stdoutData = '';
        let stderrData = '';
        let processedCount = 0;
        let lastTilePercent = 0;
        let childClosed = false;
        const emittedFiles = new Set();
        const inFlightFiles = new Set();
        const readyEntries = new Set();
        const prevFileSizes = new Map();

        const processCompletedEntry = async (entry, srcOut) => {
          if (emittedFiles.has(entry) || inFlightFiles.has(entry)) return;
          inFlightFiles.add(entry);

          try {
            const entryBase = entry.slice(0, entry.lastIndexOf('.')) || entry;
            let mapped = null;
            for (const [sName, info] of fileMap.entries()) {
              if (info.stageBase === entryBase || sName === entry) {
                mapped = info;
                break;
              }
            }

            if (!mapped) {
              inFlightFiles.delete(entry);
              return;
            }

            let targetDest = mapped.targetOutput;
            if (!targetDest) {
              const outExt = path.extname(entry);
              const originalExt = path.extname(mapped.targetFileName);
              const nameWithoutExt = mapped.targetFileName.slice(0, -originalExt.length);
              targetDest = path.join(outputDir, `${nameWithoutExt}${outExt}`);
            }

            const optResult = await this.finalizeOutputFile(srcOut, targetDest, compress);
            emittedFiles.add(entry);
            inFlightFiles.delete(entry);
            processedCount++;

            const current = Math.min(processedCount, images.length);
            const percent = Math.min(100, Math.round((current / images.length) * 100));

            onProgress?.({
              current,
              total: images.length,
              inputPath: mapped.sourcePath,
              outputPath: targetDest,
              outputSize: optResult.optimizedBytes,
              savedPercent: optResult.savedPercent,
              currentFile: mapped.targetFileName,
              percent,
              filePercent: 100,
              status: 'done',
              engineType: 'ncnn',
            });

            // Immediately signal next image as processing if there is a next one
            if (current < images.length) {
              const nextImg = images[current];
              const nextInput = nextImg?.input || nextImg?.absolutePath;
              onProgress?.({
                current: current + 1,
                total: images.length,
                inputPath: nextInput,
                outputPath: nextImg?.output || '',
                currentFile: nextImg?.fileName || path.basename(nextInput || ''),
                percent,
                filePercent: 0,
                status: 'processing',
                engineType: 'ncnn',
              });
            }
          } catch (err) {
            console.error('[NcnnBatchRunner] processCompletedEntry error:', err);
            inFlightFiles.delete(entry);
          }
        };

        const checkCompletedFiles = () => {
          try {
            if (!fs.existsSync(stagingOut)) return;
            const entries = fs.readdirSync(stagingOut);
            entries.sort(); // Natural numerical order: img_00000, img_00001...

            for (const entry of entries) {
              if (emittedFiles.has(entry) || inFlightFiles.has(entry)) continue;
              const srcOut = path.join(stagingOut, entry);
              let currentSize = 0;
              try {
                const stat = fs.statSync(srcOut);
                if (stat.size <= 0) continue; // File is still being created/flushed
                currentSize = stat.size;
              } catch {
                continue;
              }

              // Anti-race condition guard: ensure file is completely flushed
              const isConfirmed = readyEntries.has(entry) || childClosed;
              const isStable = prevFileSizes.get(entry) === currentSize;
              prevFileSizes.set(entry, currentSize);

              if (isConfirmed || isStable) {
                processCompletedEntry(entry, srcOut);
              }
            }
          } catch {}
        };

        // Poll staging output directory every 40ms to bypass C stdio 4KB block-buffering
        const pollTimer = setInterval(checkCompletedFiles, 40);

        // Immediately signal image 1 as processing
        if (images.length > 0) {
          const firstImg = images[0];
          const firstInput = firstImg?.input || firstImg?.absolutePath;
          onProgress?.({
            current: 1,
            total: images.length,
            inputPath: firstInput,
            outputPath: firstImg?.output || '',
            currentFile: firstImg?.fileName || path.basename(firstInput || ''),
            percent: 0,
            filePercent: 0,
            status: 'processing',
            engineType: 'ncnn',
          });
        }

        const handleChunk = (chunk, isStderr = false) => {
          const str = chunk.toString();
          if (isStderr) {
            stderrData += str;
          } else {
            stdoutData += str;
          }

          // Parse file completion events from stdout or stderr
          const events = this.parseStderrEvents(str);
          if (events.length > 0) {
            for (const ev of events) {
              const entryName = path.basename(ev.outputFile);
              readyEntries.add(entryName);
              if (emittedFiles.has(entryName) || inFlightFiles.has(entryName)) continue;
              processCompletedEntry(entryName, ev.outputFile);
            }
          } else {
            // Check files on disk
            checkCompletedFiles();

            // Check tile percentage inside active image
            const p = this.parseTilePercent(str);
            if (p !== null && p !== lastTilePercent) {
              lastTilePercent = p;
              const current = Math.min(processedCount, images.length);
              const activeImg = images[Math.min(current, images.length - 1)];
              const activeInput = activeImg?.input || activeImg?.absolutePath;
              const basePercent = (current / images.length) * 100;
              const subPercent = (p / 100) * (100 / images.length);
              onProgress?.({
                current: current + 1,
                total: images.length,
                inputPath: activeInput,
                outputPath: activeImg?.output || '',
                currentFile: activeImg?.fileName || path.basename(activeInput || ''),
                percent: Math.min(100, Math.round(basePercent + subPercent)),
                filePercent: p,
                status: 'processing',
                engineType: 'ncnn',
              });
            }
          }
        };

        child.stdout.on('data', (chunk) => handleChunk(chunk, false));
        child.stderr.on('data', (chunk) => handleChunk(chunk, true));

        child.on('error', (err) => {
          clearInterval(pollTimer);
          this._childProcess = null;
          resolve({ success: false, processedCount, error: err.message });
        });

        child.on('close', async (code) => {
          clearInterval(pollTimer);
          this._childProcess = null;
          childClosed = true;
          if (this._cancelled) {
            resolve({ success: false, processedCount, error: 'Cancelled' });
            return;
          }

          if (code === 0) {
            // Ensure all output files are moved and reported
            checkCompletedFiles();
            while (inFlightFiles.size > 0) {
              await new Promise((r) => setTimeout(r, 20));
            }

            resolve({
              success: true,
              processedCount: processedCount > 0 ? processedCount : images.length,
            });
          } else {
            resolve({
              success: false,
              processedCount,
              error: `NCNN batch failed with exit code ${code}: ${stderrData.slice(0, 400)}`,
            });
          }
        });
      });
    } catch (err) {
      return { success: false, processedCount: 0, error: err.message };
    } finally {
      // Cleanup staging
      try {
        fs.rmSync(stagingIn, { recursive: true, force: true });
        fs.rmSync(stagingOut, { recursive: true, force: true });
      } catch {}
      this._activeStagingDirs.delete(stagingIn);
      this._activeStagingDirs.delete(stagingOut);
    }
  }
}

module.exports = NcnnBatchRunner;
