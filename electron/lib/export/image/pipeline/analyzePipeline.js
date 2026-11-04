'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { frameFromInput } = require('./frame');
const { normalizeActions } = require('./actionRegistry');
const { executeChain } = require('./executeChain');
const { resolvePageNumber } = require('./pageNumber');

function summarizeSteps(actions, stepInfos) {
  const badges = { skewAngle: null, hasBorder: false, isDoublePage: false };
  actions.forEach((action, i) => {
    const info = stepInfos[i];
    if (!info || info.skipped || !Array.isArray(info.frames)) return;
    for (const f of info.frames) {
      if (action.type === 'deskew' && badges.skewAngle === null && f.applied) badges.skewAngle = f.angle;
      if (action.type === 'crop' && f.trimmed) badges.hasBorder = true;
      if (action.type === 'splitPage' && f.willSplit) badges.isDoublePage = true;
    }
  });
  return badges;
}

async function analyzePipeline({
  files = [],
  actions = [],
  overrides = {},
  maxSize = 800,
  onProgress = () => {},
  isCancelled = () => false,
  concurrency,
} = {}) {
  const normalized = normalizeActions(actions);
  if (normalized.length === 0) {
    return {
      ok: true,
      results: files.map((file) => ({
        absolutePath: file.absolutePath,
        ok: true,
        badges: { skewAngle: null, hasBorder: false, isDoublePage: false },
        outputCount: 1,
        outputWidth: file.width || null,
        outputHeight: file.height || null,
      })),
    };
  }
  const results = new Array(files.length);
  const total = files.length;
  let completed = 0;
  let next = 0;

  async function worker() {
    while (!isCancelled()) {
      const index = next++;
      if (index >= total) return;
      const file = files[index];
      try {
        const baseFrame = await frameFromInput(await fs.promises.readFile(file.absolutePath), { maxSize });
        const pageNumber = resolvePageNumber(file.absolutePath, index);
        const { frames, stepInfos } = await executeChain({
          baseFrame,
          actions: normalized,
          fileOverrides: overrides?.[file.absolutePath] || {},
          isCancelled,
          context: { pageNumber, filePath: file.absolutePath, fileIndex: index },
        });
        results[index] = {
          absolutePath: file.absolutePath,
          ok: true,
          badges: summarizeSteps(normalized, stepInfos),
          outputCount: frames.length,
          outputWidth: Math.round(frames[0].info.width / baseFrame.scale),
          outputHeight: Math.round(frames[0].info.height / baseFrame.scale),
        };
      } catch (err) {
        if (String(err?.message) === 'CANCELLED') return;
        results[index] = { absolutePath: file.absolutePath, ok: false, error: String(err?.message || err) };
      }
      completed += 1;
      onProgress({
        phase: 'analyze',
        current: completed,
        total,
        file: file.relativePath || path.basename(file.absolutePath),
        status: results[index].ok ? 'done' : 'failed',
      });
    }
  }

  const defaultConcurrency = Math.max(4, Math.min(16, os.cpus().length || 4));
  const workers = Math.max(1, Math.min(concurrency || defaultConcurrency, total || 1));
  await Promise.all(Array.from({ length: workers }, worker));
  return { ok: true, results: results.filter(Boolean), cancelled: Boolean(isCancelled()) };
}

module.exports = { analyzePipeline, summarizeSteps };
