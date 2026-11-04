// electron/lib/export/image/pipeline/actions/deskew.js
'use strict';

const { requireSharp, toSharp, fromSharp, extractFrame } = require('../frame');
const { detectSkewAngleFromBuffer, computeInscribedCrop } = require('../../deskewImage');

const CROP_MODES = ['autoCrop', 'fillWhite', 'fillBlack', 'none'];
const DEFAULTS = { cropMode: 'autoCrop', minAngle: 0.1 };

function validate(params = {}) {
  const minAngle = Number(params.minAngle);
  const out = {
    cropMode: CROP_MODES.includes(params.cropMode) ? params.cropMode : DEFAULTS.cropMode,
    minAngle: Number.isFinite(minAngle) ? Math.max(0, Math.min(5, minAngle)) : DEFAULTS.minAngle,
  };
  if (typeof params.angle === 'number' && Number.isFinite(params.angle)) {
    out.angle = Math.max(-45, Math.min(45, params.angle));
  }
  return out;
}

async function deskewFrame(frame, params) {
  const detected = typeof params.angle === 'number'
    ? { angle: params.angle, confidence: 1, manual: true }
    : { ...(await detectSkewAngleFromBuffer(frame.data, { raw: frame.info })), manual: false };
  const angle = detected.angle;
  if (Math.abs(angle) < Math.max(params.minAngle, 0.05)) {
    return { frame, info: { ...detected, applied: false } };
  }

  const sharp = requireSharp();
  const background = params.cropMode === 'fillBlack'
    ? { r: 0, g: 0, b: 0, alpha: 1 }
    : { r: 255, g: 255, b: 255, alpha: 1 };
  let rotated = await fromSharp(
    toSharp(frame).rotate(angle, { background, interpolator: sharp.interpolators?.nohalo || 'bicubic' }),
    frame
  );

  if (params.cropMode === 'autoCrop' && Math.abs(angle) >= 0.1) {
    rotated = await extractFrame(rotated, computeInscribedCrop(frame.info.width, frame.info.height, angle));
  }
  return { frame: rotated, info: { ...detected, applied: true } };
}

async function apply(frames, params) {
  const out = [];
  const info = [];
  for (const frame of frames) {
    const res = await deskewFrame(frame, params);
    out.push(res.frame);
    info.push(res.info);
  }
  return { frames: out, info };
}

module.exports = { type: 'deskew', defaults: DEFAULTS, validate, apply };
