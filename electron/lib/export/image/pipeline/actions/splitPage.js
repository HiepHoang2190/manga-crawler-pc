// electron/lib/export/image/pipeline/actions/splitPage.js
'use strict';

const { shouldSplit, findOptimalSplitColumn } = require('../../splitDoublePage');
const { toSharp, fromSharp, extractFrame, childSuffix, clampInt } = require('../frame');

const DEFAULTS = { minWidth: 1200, ratioThreshold: 1.15, readingDirection: 'ltr' };

function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function validate(params = {}) {
  const out = {
    minWidth: num(params.minWidth, 100, 20000, DEFAULTS.minWidth),
    ratioThreshold: num(params.ratioThreshold, 1, 4, DEFAULTS.ratioThreshold),
    readingDirection: params.readingDirection === 'rtl' ? 'rtl' : 'ltr',
  };
  if (params.force === 'split' || params.force === 'keep') out.force = params.force;
  if (params.customSplit && typeof params.customSplit === 'object') {
    const topRatio = num(params.customSplit.topRatio, 0.05, 0.95, 0.5);
    out.customSplit = { topRatio, bottomRatio: num(params.customSplit.bottomRatio, 0.05, 0.95, topRatio) };
  }
  return out;
}

function seamMask(width, height, points) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${points}" fill="#ffffff"/></svg>`
  );
}

async function splitFrame(frame, params) {
  const { width: W, height: H } = frame.info;
  const scale = frame.scale || 1;
  const auto = shouldSplit(W / scale, H / scale, params.minWidth, params.ratioThreshold);
  const willSplit = params.force === 'split' ? true : params.force === 'keep' ? false : auto;
  if (!willSplit || W < 2) return { frames: [frame], info: { willSplit: false, auto } };

  let topX;
  let bottomX;
  if (params.customSplit) {
    topX = clampInt(W * params.customSplit.topRatio, 1, W - 1);
    bottomX = clampInt(W * params.customSplit.bottomRatio, 1, W - 1);
  } else {
    const grey = await toSharp(frame).removeAlpha().toColourspace('b-w').raw().toBuffer();
    topX = findOptimalSplitColumn(grey, W, H);
    bottomX = topX;
  }

  let left;
  let right;
  if (topX === bottomX) {
    left = await extractFrame(frame, { left: 0, top: 0, width: topX, height: H });
    right = await extractFrame(frame, { left: topX, top: 0, width: W - topX, height: H });
  } else {
    const leftWidth = Math.max(topX, bottomX);
    const minX = Math.min(topX, bottomX);
    const rightWidth = W - minX;
    const leftBase = await extractFrame(frame, { left: 0, top: 0, width: leftWidth, height: H });
    const rightBase = await extractFrame(frame, { left: minX, top: 0, width: rightWidth, height: H });
    left = await fromSharp(
      toSharp(leftBase).composite([{ input: seamMask(leftWidth, H, `${topX},0 ${leftWidth},0 ${leftWidth},${H} ${bottomX},${H}`), top: 0, left: 0 }]),
      leftBase
    );
    right = await fromSharp(
      toSharp(rightBase).composite([{ input: seamMask(rightWidth, H, `0,0 ${topX - minX},0 ${bottomX - minX},${H} 0,${H}`), top: 0, left: 0 }]),
      rightBase
    );
  }

  const [first, second] = params.readingDirection === 'rtl' ? [right, left] : [left, right];
  return {
    frames: [
      { ...first, suffix: childSuffix(frame.suffix, 'a') },
      { ...second, suffix: childSuffix(frame.suffix, 'b') },
    ],
    info: { willSplit: true, auto, topRatio: topX / W, bottomRatio: bottomX / W },
  };
}

async function apply(frames, params) {
  const out = [];
  const info = [];
  for (const frame of frames) {
    const res = await splitFrame(frame, params);
    out.push(...res.frames);
    info.push(res.info);
  }
  return { frames: out, info };
}

module.exports = { type: 'splitPage', defaults: DEFAULTS, validate, apply };
