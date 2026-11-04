'use strict';

const { toSharp } = require('./frame');

const FORMAT_EXT = { jpg: '.jpg', png: '.png', webp: '.webp' };

function resolveOutputExt(srcExt, format) {
  if (format && FORMAT_EXT[format]) return FORMAT_EXT[format];
  const ext = String(srcExt || '.jpg');
  return ext.startsWith('.') ? ext : `.${ext}`;
}

async function encodeFrame(
  frame,
  { format = 'original', quality = 90, resizePercent = null, capToOriginalSize = true } = {},
  srcExt = '.jpg',
  originalSize = null
) {
  const ext = resolveOutputExt(srcExt, format);
  const lower = ext.toLowerCase();
  const baseQ = Math.max(1, Math.min(100, Math.round(Number(quality) || 90)));
  const pct = Number(resizePercent);
  const isGrayscale = Boolean(frame.isGrayscale ?? frame.info?.isGrayscale);

  function buildPipeline(q) {
    let pipeline = toSharp(frame);
    if (Number.isFinite(pct) && pct > 0 && pct < 100) {
      pipeline = pipeline.resize({ width: Math.max(1, Math.round((frame.info.width * pct) / 100)) });
    }

    if (isGrayscale && lower !== '.png') {
      pipeline = pipeline.toColourspace('b-w');
    }

    if (lower === '.png') {
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    } else if (lower === '.webp') {
      pipeline = pipeline.webp({ quality: q, effort: 4 });
    } else if (lower === '.avif') {
      pipeline = pipeline.avif({ quality: q });
    } else if (lower === '.gif') {
      pipeline = pipeline.gif();
    } else {
      if (frame.info.channels === 4) pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
      const jpegOpts = { quality: q, mozjpeg: true };
      if (!isGrayscale) {
        jpegOpts.chromaSubsampling = '4:2:0';
      }
      pipeline = pipeline.jpeg(jpegOpts);
    }
    return pipeline;
  }

  let buffer = await buildPipeline(baseQ).toBuffer();

  // Khống chế dung lượng trần thông minh (Smart Size Capping - học từ ImageMagick & KCC):
  // Nếu là định dạng lossy (JPG, WebP) và có originalSize, tự động hạ nhẹ Quality nếu file mới nặng hơn file gốc
  const isLossy = lower === '.jpg' || lower === '.jpeg' || lower === '.webp';
  const shouldCap = capToOriginalSize !== false && isLossy && Number.isFinite(originalSize) && originalSize > 0 && buffer.length > originalSize;

  if (shouldCap) {
    const testQualities = [baseQ - 8, baseQ - 15, baseQ - 22, 68].filter((val) => val < baseQ && val >= 65);
    for (const nextQ of testQualities) {
      const nextBuf = await buildPipeline(nextQ).toBuffer();
      buffer = nextBuf;
      if (buffer.length <= originalSize) break;
    }
  }

  return { buffer, ext };
}

module.exports = { resolveOutputExt, encodeFrame };
