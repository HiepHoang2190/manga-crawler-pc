// electron/lib/export/image/pipeline/actions/desaturate.js
'use strict';

const { toSharp, fromSharp } = require('../frame');

const METHODS = ['luminosity', 'lightness', 'average'];
const DEFAULTS = { method: 'luminosity', intensity: 100 };

function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function validate(params = {}) {
  const method = METHODS.includes(params.method) ? params.method : DEFAULTS.method;
  const intensity = num(params.intensity, 0, 100, DEFAULTS.intensity);
  return { method, intensity };
}

async function desaturateFrame(frame, params) {
  const { method, intensity } = params;
  if (intensity <= 0) {
    return { frame, info: { method, intensity, applied: false } };
  }

  const alpha = intensity / 100;

  if (method === 'luminosity') {
    // Luminosity (ITU-R BT.601 standard: 0.299 R + 0.587 G + 0.114 B)
    const diag = (1 - alpha) + alpha * 0.299;
    const gOff = alpha * 0.587;
    const bOff = alpha * 0.114;
    const rOff = alpha * 0.299;
    const gDiag = (1 - alpha) + alpha * 0.587;
    const bDiag = (1 - alpha) + alpha * 0.114;
    const matrix = [
      [diag, gOff, bOff],
      [rOff, gDiag, bOff],
      [rOff, gOff, bDiag],
    ];
    const pipeline = toSharp(frame).recomb(matrix);
    const out = await fromSharp(pipeline, { ...frame, isGrayscale: alpha >= 1 });
    return { frame: out, info: { method, intensity, applied: true } };
  }

  if (method === 'average') {
    // Average: (R + G + B) / 3
    const avg = 1 / 3;
    const diag = (1 - alpha) + alpha * avg;
    const off = alpha * avg;
    const matrix = [
      [diag, off, off],
      [off, diag, off],
      [off, off, diag],
    ];
    const pipeline = toSharp(frame).recomb(matrix);
    const out = await fromSharp(pipeline, { ...frame, isGrayscale: alpha >= 1 });
    return { frame: out, info: { method, intensity, applied: true } };
  }

  if (method === 'lightness') {
    // Lightness: (max(R,G,B) + min(R,G,B)) / 2
    // Exact per-pixel processing on raw buffer
    const buf = Buffer.from(frame.data);
    const channels = frame.info.channels;
    const len = buf.length;
    for (let i = 0; i < len; i += channels) {
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const gray = Math.round((max + min) / 2);
      if (alpha >= 1) {
        buf[i] = gray;
        buf[i + 1] = gray;
        buf[i + 2] = gray;
      } else {
        buf[i] = Math.round((1 - alpha) * r + alpha * gray);
        buf[i + 1] = Math.round((1 - alpha) * g + alpha * gray);
        buf[i + 2] = Math.round((1 - alpha) * b + alpha * gray);
      }
    }
    const out = {
      ...frame,
      data: buf,
      isGrayscale: alpha >= 1,
    };
    return { frame: out, info: { method, intensity, applied: true } };
  }

  return { frame, info: { method, intensity, applied: false } };
}

async function apply(frames, params) {
  const out = [];
  const info = [];
  for (const frame of frames) {
    const res = await desaturateFrame(frame, params);
    out.push(res.frame);
    info.push(res.info);
  }
  return { frames: out, info };
}

module.exports = { type: 'desaturate', defaults: DEFAULTS, validate, apply };
