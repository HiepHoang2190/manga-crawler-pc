'use strict';

const { resolveCropBox } = require('../../cropImage');
const { clampInt, extractFrame } = require('../frame');

const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const DEFAULTS = {
  cropMode: 'autoTrim',
  pageScope: 'all',
  sampleMode: 'corner',
  sampleCorner: 'topLeft',
  specificColorType: 'black',
  customColorHex: '#000000',
  tolerance: 10,
  edges: { top: true, bottom: true, left: true, right: true },
  margins: { top: 0, bottom: 40, left: 0, right: 0 },
  marginUnit: 'px',
  dpi: 300,
  box: { left: 0, top: 0, width: 800, height: 1200 },
};

function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function normalizeBoxRatio(b) {
  const left = num(b.left, 0, 0.99, 0);
  const top = num(b.top, 0, 0.99, 0);
  return {
    left,
    top,
    width: num(b.width, 0.01, 1 - left, 1 - left),
    height: num(b.height, 0.01, 1 - top, 1 - top),
  };
}

function normalizeBoxPx(box = {}) {
  return {
    left: num(box.left, 0, 100000, 0),
    top: num(box.top, 0, 100000, 0),
    width: num(box.width, 1, 100000, 800),
    height: num(box.height, 1, 100000, 1200),
  };
}

function validate(params = {}) {
  const edges = params.edges || {};
  const margins = params.margins || {};
  const cropMode = params.cropMode === 'margin' || params.cropMode === 'box' ? params.cropMode : 'autoTrim';
  const pageScope = ['all', 'odd', 'even'].includes(params.pageScope) ? params.pageScope : 'all';
  const out = {
    cropMode,
    pageScope,
    sampleMode: params.sampleMode === 'specific' ? 'specific' : 'corner',
    sampleCorner: CORNERS.includes(params.sampleCorner) ? params.sampleCorner : 'topLeft',
    specificColorType: ['black', 'white', 'custom'].includes(params.specificColorType) ? params.specificColorType : 'black',
    customColorHex: /^#[0-9a-f]{6}$/i.test(params.customColorHex || '') ? params.customColorHex : '#000000',
    tolerance: num(params.tolerance, 0, 100, 10),
    edges: { top: edges.top !== false, bottom: edges.bottom !== false, left: edges.left !== false, right: edges.right !== false },
    margins: {
      top: num(margins.top, 0, 100000, 0),
      bottom: num(margins.bottom, 0, 100000, 40),
      left: num(margins.left, 0, 100000, 0),
      right: num(margins.right, 0, 100000, 0),
    },
  };
  if (cropMode === 'box') out.box = normalizeBoxPx(params.box);
  if (params.boxRatio && typeof params.boxRatio === 'object') out.boxRatio = normalizeBoxRatio(params.boxRatio);
  return out;
}

function resolveSampleColor(params, frame) {
  if (params.sampleMode === 'specific') {
    if (params.specificColorType === 'white') return { r: 255, g: 255, b: 255 };
    if (params.specificColorType === 'custom') {
      const hex = params.customColorHex.slice(1);
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    return { r: 0, g: 0, b: 0 };
  }
  const { width: W, height: H, channels } = frame.info;
  let x = 0;
  let y = 0;
  if (params.sampleCorner === 'topRight') x = W - 1;
  else if (params.sampleCorner === 'bottomLeft') y = H - 1;
  else if (params.sampleCorner === 'bottomRight') { x = W - 1; y = H - 1; }
  const idx = (y * W + x) * channels;
  return { r: frame.data[idx], g: frame.data[idx + 1], b: frame.data[idx + 2] };
}

function computeBox(frame, params) {
  const { width: W, height: H, channels } = frame.info;
  if (params.boxRatio) {
    const b = params.boxRatio;
    return {
      box: { left: Math.round(b.left * W), top: Math.round(b.top * H), width: Math.round(b.width * W), height: Math.round(b.height * H) },
      manual: true,
    };
  }
  const scale = frame.scale || 1;
  if (params.cropMode === 'box') {
    const b = params.box || {};
    const box = resolveCropBox({
      width: W,
      height: H,
      cropMode: 'box',
      options: {
        box: {
          left: b.left * scale,
          top: b.top * scale,
          width: b.width * scale,
          height: b.height * scale,
        },
      },
    });
    return { box, manual: true };
  }
  const m = params.margins;
  const box = resolveCropBox({
    width: W,
    height: H,
    cropMode: params.cropMode,
    rawPixels: frame.data,
    channels,
    options: {
      margins: { top: m.top * scale, bottom: m.bottom * scale, left: m.left * scale, right: m.right * scale },
      sampleColor: resolveSampleColor(params, frame),
      tolerance: params.tolerance,
      edges: params.edges,
    },
  });
  return { box, manual: false };
}

function clampBox(box, W, H) {
  const left = clampInt(box.left, 0, W - 1);
  const top = clampInt(box.top, 0, H - 1);
  const width = clampInt(box.width, 1, W - left);
  const height = clampInt(box.height, 1, H - top);
  return { left, top, width, height };
}

async function apply(frames, params, context = {}) {
  const pageScope = params.pageScope || 'all';
  const pageNumber = Number.isInteger(context?.pageNumber) ? context.pageNumber : 1;
  const isSkippedByPageScope =
    (pageScope === 'odd' && pageNumber % 2 === 0) ||
    (pageScope === 'even' && pageNumber % 2 !== 0);

  if (isSkippedByPageScope) {
    const info = frames.map((frame) => ({
      box: { left: 0, top: 0, width: frame.info.width, height: frame.info.height },
      boxRatio: { left: 0, top: 0, width: 1, height: 1 },
      manual: false,
      trimmed: false,
      skipped: true,
      pageScope,
      pageNumber,
    }));
    return { frames, info };
  }
  const out = [];
  const info = [];
  for (const frame of frames) {
    const { width: W, height: H } = frame.info;
    const { box: rawBox, manual } = computeBox(frame, params);
    const box = clampBox(rawBox, W, H);
    info.push({
      box,
      boxRatio: { left: box.left / W, top: box.top / H, width: box.width / W, height: box.height / H },
      manual,
      trimmed: box.width < W || box.height < H,
    });
    out.push(await extractFrame(frame, box));
  }
  return { frames: out, info };
}

module.exports = { type: 'crop', defaults: DEFAULTS, validate, apply };
