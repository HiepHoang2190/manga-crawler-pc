'use strict';

const fs = require('fs');
const path = require('path');
const { frameFromInput, requireSharp, toSharp } = require('./frame');
const { normalizeActions } = require('./actionRegistry');
const { executeChain } = require('./executeChain');
const { encodeFrame } = require('./encodeOutput');
const { createStepCache } = require('./stepCache');
const { resolvePageNumber } = require('./pageNumber');

const defaultCache = createStepCache();

async function loadBaseFrame(filePath, maxSize, cache) {
  const stat = await fs.promises.stat(filePath);
  const cacheBase = `${filePath}|${stat.mtimeMs}|${stat.size}|${maxSize}`;
  const baseKey = `base|${cacheBase}`;
  let hit = cache.get(baseKey);
  if (!hit) {
    const frame = await frameFromInput(await fs.promises.readFile(filePath), { maxSize });
    hit = { frames: [frame], info: null };
    cache.set(baseKey, hit);
  }
  return { baseFrame: hit.frames[0], cacheBase, originalSize: stat.size };
}

async function composeFrames(frames, gap = 8) {
  if (frames.length === 1) {
    let single = toSharp(frames[0]);
    if (frames[0].info.channels === 4) single = single.flatten({ background: { r: 255, g: 255, b: 255 } });
    return single.jpeg({ quality: 85 }).toBuffer();
  }
  const sharp = requireSharp();
  const width = frames.reduce((sum, f) => sum + f.info.width, 0) + gap * (frames.length - 1);
  const height = Math.max(...frames.map((f) => f.info.height));
  const layers = [];
  let left = 0;
  for (const f of frames) {
    layers.push({ input: f.data, raw: f.info, left, top: 0 });
    left += f.info.width + gap;
  }
  return sharp({ create: { width, height, channels: 3, background: { r: 32, g: 32, b: 32 } } })
    .composite(layers)
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function previewPipeline({
  filePath,
  actions = [],
  fileOverrides = {},
  upToStep = null,
  mode = 'final',
  frameIndex = null,
  fileIndex = null,
  pageNumber: explicitPageNumber = null,
  output = {},
  maxSize = 1200,
  cache = defaultCache,
} = {}) {
  const normalized = normalizeActions(actions);
  const pageNumber = Number.isInteger(explicitPageNumber)
    ? explicitPageNumber
    : resolvePageNumber(filePath, fileIndex);
  const context = { pageNumber, filePath, fileIndex };
  const { baseFrame, cacheBase: rawCacheBase, originalSize } = await loadBaseFrame(filePath, maxSize, cache);
  const cacheBase = `${rawCacheBase}|p${pageNumber}`;
  const hasStep = Number.isInteger(upToStep) && upToStep >= 0 && upToStep < normalized.length;
  const isStepInput = mode === 'stepInput' && hasStep;
  const isStepOutput = mode === 'stepOutput' && hasStep;
  const overrides = fileOverrides || {};

  const through = await executeChain({
    baseFrame,
    actions: normalized,
    fileOverrides: overrides,
    stopBefore: hasStep && (isStepInput || isStepOutput) ? upToStep + 1 : normalized.length,
    cache,
    cacheBase,
    context,
  });
  let frames = through.frames;
  if (isStepInput) {
    frames = (await executeChain({ baseFrame, actions: normalized, fileOverrides: overrides, stopBefore: upToStep, cache, cacheBase, context })).frames;
  }
  if (Number.isInteger(frameIndex) && frames[frameIndex]) frames = [frames[frameIndex]];

  const image = await composeFrames(frames);
  const result = {
    ok: true,
    dataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
    frames: frames.map((f) => ({ suffix: f.suffix, width: f.info.width, height: f.info.height })),
    scale: baseFrame.scale,
    sourceWidth: Math.round(baseFrame.info.width / baseFrame.scale),
    sourceHeight: Math.round(baseFrame.info.height / baseFrame.scale),
    stepInfo: isStepInput || isStepOutput ? through.stepInfos[upToStep] || null : null,
    stepInfos: through.stepInfos,
  };

  if (!isStepInput && !isStepOutput) {
    let bytes = 0;
    const scaledBudget = originalSize ? originalSize * (baseFrame.scale * baseFrame.scale) : null;
    for (const f of frames) bytes += (await encodeFrame(f, output, path.extname(filePath), scaledBudget)).buffer.length;
    result.estimatedBytes = Math.round(bytes / (baseFrame.scale * baseFrame.scale));
  }
  return result;
}

module.exports = { previewPipeline, composeFrames, defaultCache };
