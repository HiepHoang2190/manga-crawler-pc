'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { frameFromInput } = require('./frame');
const { normalizeActions } = require('./actionRegistry');
const { executeChain } = require('./executeChain');
const { encodeFrame } = require('./encodeOutput');
const { resolvePageNumber } = require('./pageNumber');

function samePath(a, b) {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'linux' ? ra === rb : ra.toLowerCase() === rb.toLowerCase();
}

function buildOutputName(absolutePath, suffix, ext) {
  const { name } = path.parse(absolutePath);
  return suffix ? `${name}-${suffix}${ext}` : `${name}${ext}`;
}

function resolveTargetDir(file, output) {
  if (output.inPlace || !output.outputDir) return path.dirname(file.absolutePath);
  const relDir = path.dirname(file.relativePath || path.basename(file.absolutePath));
  return relDir === '.' ? output.outputDir : path.join(output.outputDir, relDir);
}

function resolveConcurrency(concurrency, total, cpuCount = os.cpus().length || 1) {
  let target;
  if (concurrency === 'max' || concurrency === 0) {
    target = cpuCount;
  } else if (Number.isInteger(Number(concurrency)) && Number(concurrency) > 0) {
    target = Number(concurrency);
  } else {
    // Tự động: tối ưu CPU đa nhân như XnConvert, chừa 1 core cho UI/OS nếu > 2 cores, kẹp 1..16
    target = cpuCount <= 2 ? cpuCount : Math.min(16, cpuCount - 1);
  }
  return Math.max(1, Math.min(target, total || 1));
}

async function safeRename(tmp, targetPath, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await fs.promises.rename(tmp, targetPath);
      return;
    } catch (err) {
      const code = err?.code;
      const isLockError = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
      if (!isLockError || attempt === retries - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, (attempt + 1) * 50));
    }
  }
}

async function writeAtomic(targetPath, buffer) {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.tmp-${crypto.randomUUID()}`;
  try {
    await fs.promises.writeFile(tmp, buffer);
    await safeRename(tmp, targetPath);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true, recursive: true }).catch(() => {});
    throw err;
  }
}

async function processFile(file, ctx, fileIndex) {
  const input = await fs.promises.readFile(file.absolutePath);
  const originalSize = input.length;
  const baseFrame = await frameFromInput(input);
  const pageNumber = resolvePageNumber(file.absolutePath, fileIndex);
  const { frames } = await executeChain({
    baseFrame,
    actions: ctx.actions,
    fileOverrides: ctx.overrides[file.absolutePath] || {},
    isCancelled: ctx.isCancelled,
    context: { pageNumber, filePath: file.absolutePath, fileIndex },
  });
  const srcExt = path.extname(file.absolutePath);
  const targetDir = resolveTargetDir(file, ctx.output);
  const encoded = [];
  const isSingleOutput = frames.length === 1;
  for (const frame of frames) {
    const sizeBudget = isSingleOutput ? originalSize : Math.round(originalSize * 0.7);
    const { buffer, ext } = await encodeFrame(frame, ctx.output, srcExt, sizeBudget);
    encoded.push({ buffer, target: path.join(targetDir, buildOutputName(file.absolutePath, frame.suffix, ext)) });
  }
  if (ctx.isCancelled()) throw new Error('CANCELLED');

  const written = [];
  for (const item of encoded) {
    await writeAtomic(item.target, item.buffer);
    written.push(item.target);
  }
  if (ctx.output.inPlace && !written.some((p) => samePath(p, file.absolutePath))) {
    await fs.promises.rm(file.absolutePath, { force: true });
  }
  return written;
}

async function runPipeline({
  files = [],
  actions = [],
  overrides = {},
  output = {},
  onProgress = () => {},
  isCancelled = () => false,
  concurrency,
} = {}) {
  const format = output.format || 'original';
  const out = {
    format,
    quality: Number(output.quality) || (format === 'original' ? 100 : 90),
    resizePercent: output.resizePercent ?? null,
    inPlace: Boolean(output.inPlace),
    outputDir: output.outputDir ? String(output.outputDir) : '',
  };
  if (!out.inPlace && !out.outputDir) {
    return { ok: false, error: 'OUTPUT_DIR_REQUIRED', done: 0, failed: [], outputs: [], cancelled: false };
  }

  const ctx = { actions: normalizeActions(actions), overrides: overrides || {}, output: out, isCancelled };
  const total = files.length;
  const failed = [];
  const outputs = [];
  let done = 0;
  let completed = 0;
  let next = 0;

  async function worker() {
    while (!isCancelled()) {
      const index = next++;
      if (index >= total) return;
      const file = files[index];
      const label = file.relativePath || path.basename(file.absolutePath);
      try {
        outputs.push(...(await processFile(file, ctx, index)));
        done += 1;
        completed += 1;
        onProgress({ phase: 'run', current: completed, total, file: label, status: 'done' });
      } catch (err) {
        if (String(err?.message) === 'CANCELLED') return;
        const message = String(err?.message || err);
        failed.push({ path: file.absolutePath, error: message });
        completed += 1;
        onProgress({ phase: 'run', current: completed, total, file: label, status: 'failed', error: message });
      }
    }
  }

  const workers = resolveConcurrency(concurrency ?? output.concurrency, total);

  // Tối ưu hoá luồng xử lý: gán 1 thread/image cho libvips để tránh lock contention giữa các worker song song
  let prevConcurrency;
  try {
    prevConcurrency = sharp.concurrency();
    sharp.concurrency(1);
    sharp.cache({ files: 0, memory: 512, items: 200 });
  } catch {}

  try {
    await Promise.all(Array.from({ length: workers }, worker));
  } finally {
    try {
      if (typeof prevConcurrency === 'number') sharp.concurrency(prevConcurrency);
    } catch {}
  }
  return { ok: true, done, failed, outputs, cancelled: Boolean(isCancelled()) };
}

module.exports = { runPipeline, writeAtomic, safeRename, buildOutputName, samePath, resolveTargetDir, resolveConcurrency };
