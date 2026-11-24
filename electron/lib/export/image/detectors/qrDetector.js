const { getSharp } = require('../../../shared/checkSharp');

const DONATE_OR_GROUP_PATTERNS = [
  /discord\.(gg|com)/i,
  /t\.me\//i,
  /facebook\.com/i,
  /fb\.com/i,
  /momo\.vn/i,
  /vietqr/i,
  /^000201/i,
  /patreon\.com/i,
  /paypal\.(me|com)/i,
  /zalo\.me/i,
  /bank/i,
  /donate/i,
];

let cachedJsQr = undefined;
function loadJsQr() {
  if (cachedJsQr !== undefined) return cachedJsQr;
  try {
    cachedJsQr = require('jsqr');
  } catch {
    cachedJsQr = null;
  }
  return cachedJsQr;
}

/**
 * Detect & decode QR code from an image buffer (bounds both width and height to protect webtoons).
 * Uses adaptive inversionAttempts based on precomputed page brightness when available.
 * @param {Buffer} fileBuffer
 * @param {{ avgMean?: number, maxWidth?: number, maxHeight?: number }} [options]
 * @returns {Promise<{ hasQr: boolean, qrText?: string, isDonateOrInvite?: boolean, error?: string }>}
 */
async function detectQrCode(fileBuffer, options = {}) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    return { hasQr: false };
  }

  const jsQR = loadJsQr();
  if (!jsQR) {
    return { hasQr: false, error: 'jsQR unavailable' };
  }

  try {
    const sharp = getSharp();
    if (!sharp) return { hasQr: false, error: 'Sharp unavailable' };

    const maxWidth = Number.isFinite(options?.maxWidth) ? options.maxWidth : 640;
    const maxHeight = Number.isFinite(options?.maxHeight) ? options.maxHeight : 1600;
    const avgMean = options?.avgMean;
    const inversionAttempts = Number.isFinite(avgMean) && avgMean >= 150 ? 'dontInvert' : 'attemptBoth';

    const { data, info } = await sharp(fileBuffer)
      .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const clampedArray = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
    const code = jsQR(clampedArray, info.width, info.height, {
      inversionAttempts,
    });

    if (!code || !code.data) {
      return { hasQr: false };
    }

    const qrText = String(code.data).trim();
    if (qrText.length < 4) {
      return { hasQr: false };
    }

    const isDonateOrInvite = DONATE_OR_GROUP_PATTERNS.some((p) => p.test(qrText));

    return {
      hasQr: true,
      qrText,
      isDonateOrInvite,
    };
  } catch (err) {
    return { hasQr: false, error: err.message };
  }
}

module.exports = {
  detectQrCode,
  DONATE_OR_GROUP_PATTERNS,
};
