'use strict';

const { getSharp } = require('../../../shared/checkSharp');

function requireSharp() {
  const sharp = getSharp();
  if (!sharp) throw new Error('SHARP_UNAVAILABLE');
  return sharp;
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function childSuffix(parent, letter) {
  return parent ? `${parent}-${letter}` : letter;
}

async function frameFromInput(input, { maxSize = 0 } = {}) {
  const sharp = requireSharp();
  const meta = await sharp(input).metadata();
  const isGrayscale = meta.channels === 1 || meta.space === 'b-w' || meta.space === 'grey' || meta.space === 'grey16';
  let pipeline = sharp(input).toColourspace('srgb').removeAlpha();
  if (maxSize > 0) {
    pipeline = pipeline.resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    info: { width: info.width, height: info.height, channels: info.channels },
    suffix: '',
    scale: meta.width ? info.width / meta.width : 1,
    isGrayscale,
  };
}

function toSharp(frame) {
  return requireSharp()(frame.data, { raw: { width: frame.info.width, height: frame.info.height, channels: frame.info.channels } });
}

async function fromSharp(pipeline, meta = {}) {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const isGrayscale = Boolean(meta.isGrayscale ?? meta.info?.isGrayscale);
  return {
    data,
    info: { width: info.width, height: info.height, channels: info.channels },
    suffix: meta.suffix ?? '',
    scale: meta.scale ?? 1,
    isGrayscale,
  };
}

async function extractFrame(frame, box, suffix = frame.suffix) {
  const W = frame.info.width;
  const H = frame.info.height;
  const left = clampInt(box.left, 0, W - 1);
  const top = clampInt(box.top, 0, H - 1);
  const width = clampInt(box.width, 1, W - left);
  const height = clampInt(box.height, 1, H - top);
  if (left === 0 && top === 0 && width === W && height === H) {
    return { ...frame, suffix };
  }
  return fromSharp(toSharp(frame).extract({ left, top, width, height }), { ...frame, suffix, scale: frame.scale });
}

module.exports = { requireSharp, clampInt, childSuffix, frameFromInput, toSharp, fromSharp, extractFrame };
