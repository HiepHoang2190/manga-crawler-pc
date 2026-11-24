const { getSharp } = require('../../../shared/checkSharp');

/**
 * Classify whether an already-decoded raw image buffer is a blank (white/black/solid) page.
 * Works directly on a downscaled buffer (e.g. 36x32 RGB/RGBA/Grayscale) with zero extra decode cost.
 * @param {Buffer|Uint8Array} data
 * @param {{ width: number, height: number, channels: number }} info
 * @returns {{ isBlank: boolean, blankType?: 'white' | 'black' | 'solid', confidence: number, avgMean: number }}
 */
function classifyBlankFromRaw(data, info) {
  if (!data || !info || !info.width || !info.height || !info.channels) {
    return { isBlank: false, confidence: 0, avgMean: 128 };
  }

  const pixelCount = info.width * info.height;
  const ch = info.channels;
  if (pixelCount <= 0 || data.length < pixelCount * ch) {
    return { isBlank: false, confidence: 0, avgMean: 128 };
  }

  const colorCh = ch >= 3 ? 3 : 1;
  const sums = [0, 0, 0];
  const sumSqs = [0, 0, 0];
  let alphaSum = 0;
  let alphaSumSq = 0;
  const hasAlpha = ch === 4 || ch === 2;

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * ch;
    for (let c = 0; c < colorCh; c += 1) {
      const v = data[base + c];
      sums[c] += v;
      sumSqs[c] += v * v;
    }
    if (hasAlpha) {
      const a = data[base + ch - 1];
      alphaSum += a;
      alphaSumSq += a * a;
    }
  }

  let meanTotal = 0;
  let stdevTotal = 0;
  for (let c = 0; c < colorCh; c += 1) {
    const m = sums[c] / pixelCount;
    const variance = Math.max(0, sumSqs[c] / pixelCount - m * m);
    meanTotal += m;
    stdevTotal += Math.sqrt(variance);
  }
  const avgMean = meanTotal / colorCh;
  const avgStdev = stdevTotal / colorCh;

  if (hasAlpha) {
    const alphaMean = alphaSum / pixelCount;
    const alphaStdev = Math.sqrt(Math.max(0, alphaSumSq / pixelCount - alphaMean * alphaMean));
    if (alphaStdev >= 6 && alphaMean > 1) {
      return { isBlank: false, confidence: 0, avgMean };
    }
    if (alphaMean <= 2 && alphaStdev < 2) {
      return { isBlank: true, blankType: 'solid', confidence: 95, avgMean };
    }
  }

  if (avgStdev < 6 && avgMean >= 242) {
    return { isBlank: true, blankType: 'white', confidence: 100, avgMean };
  }

  if (avgStdev < 6 && avgMean <= 12) {
    return { isBlank: true, blankType: 'black', confidence: 100, avgMean };
  }

  if (avgStdev < 4) {
    const bins = new Uint32Array(64);
    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * ch;
      const luma = colorCh === 3
        ? (data[base] * 77 + data[base + 1] * 150 + data[base + 2] * 29) >> 8
        : data[base];
      bins[luma >> 2] += 1;
    }
    let entropy = 0;
    for (let b = 0; b < 64; b += 1) {
      const count = bins[b];
      if (count > 0) {
        const p = count / pixelCount;
        entropy -= p * Math.log2(p);
      }
    }
    if (entropy < 0.8) {
      return { isBlank: true, blankType: 'solid', confidence: 95, avgMean };
    }
  }

  return { isBlank: false, confidence: 0, avgMean };
}

/**
 * Detect blank white, pure black, or flat solid pages using downscaled Sharp stats.
 * @param {Buffer | import('sharp').Sharp} sharpOrBuffer
 * @param {object} [precomputedStats]
 * @returns {Promise<{ isBlank: boolean, blankType?: 'white' | 'black' | 'solid', confidence: number, avgMean?: number, error?: string }>}
 */
async function detectBlankPage(sharpOrBuffer, precomputedStats = null) {
  if (!sharpOrBuffer && !precomputedStats) {
    return { isBlank: false, confidence: 0 };
  }

  try {
    let stats = precomputedStats;
    if (!stats) {
      let pipeline;
      if (Buffer.isBuffer(sharpOrBuffer)) {
        const sharp = getSharp();
        if (!sharp) return { isBlank: false, confidence: 0 };
        pipeline = sharp(sharpOrBuffer);
      } else {
        pipeline = typeof sharpOrBuffer.clone === 'function' ? sharpOrBuffer.clone() : sharpOrBuffer;
      }

      if (typeof pipeline.resize === 'function') {
        pipeline = pipeline.resize(64, 64, { fit: 'inside', withoutEnlargement: true });
      }
      stats = await pipeline.stats();
    }

    if (!stats || !Array.isArray(stats.channels) || stats.channels.length === 0) {
      return { isBlank: false, confidence: 0 };
    }

    const { entropy, channels } = stats;

    // Protect transparent PNGs whose RGB channels are uniform but alpha draws visible strokes/text
    if (channels.length === 4 || channels.length === 2) {
      const alpha = channels[channels.length - 1];
      if (alpha && alpha.stdev >= 6 && alpha.mean > 1) {
        return { isBlank: false, confidence: 0 };
      }
      if (alpha && alpha.mean <= 2 && alpha.stdev < 2) {
        return { isBlank: true, blankType: 'solid', confidence: 95 };
      }
    }

    const colorChannels = channels.length >= 3 ? channels.slice(0, 3) : channels.slice(0, 1);
    const avgMean = colorChannels.reduce((sum, c) => sum + c.mean, 0) / colorChannels.length;
    const avgStdev = colorChannels.reduce((sum, c) => sum + c.stdev, 0) / colorChannels.length;

    if (avgStdev < 6 && avgMean >= 242) {
      return { isBlank: true, blankType: 'white', confidence: 100, avgMean };
    }

    if (avgStdev < 6 && avgMean <= 12) {
      return { isBlank: true, blankType: 'black', confidence: 100, avgMean };
    }

    if (entropy !== undefined && entropy < 0.8 && avgStdev < 4) {
      return { isBlank: true, blankType: 'solid', confidence: 95, avgMean };
    }

    return { isBlank: false, confidence: 0, avgMean };
  } catch (err) {
    return { isBlank: false, confidence: 0, error: err.message };
  }
}

module.exports = { detectBlankPage, classifyBlankFromRaw };
