'use strict';

/**
 * Comix.to scrambled-page descramble (tile shuffle).
 * Ported from site secure.js: WASM buildOrderV1/V2 + canvas tile redraw.
 *
 * sharp must be lazy-loaded: connectors are required at Electron main startup.
 * A top-level require('sharp') crashes the whole app on Windows when the
 * win32-x64 native binary is missing from the packaged installer.
 */
const fs = require('fs');
const path = require('path');
const { getSharp } = require('../../shared/checkSharp');

/** Known X-Scramble-Hash → XOR constant (from site secure.js). */
const SCRAMBLE_HASH_TABLE = {
  '03632': 58414,
  '02900': 117532,
};

let wasmExports = null;

function loadWasmExports() {
  if (wasmExports) return wasmExports;
  const wasmPath = path.join(__dirname, 'assets', 'comix-descramble.wasm');
  const wasmBytes = fs.readFileSync(wasmPath);
  const mod = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(mod);
  wasmExports = instance.exports;
  return wasmExports;
}

/**
 * @param {string|null|undefined} hashHeader X-Scramble-Hash
 * @param {string|number|null|undefined} seedHeader X-Scramble-Seed
 * @returns {number} unsigned seed for buildOrder
 */
function resolveComixScrambleSeed(hashHeader, seedHeader) {
  const hashKey = String(hashHeader || '').trim();
  const hashXor = hashKey ? SCRAMBLE_HASH_TABLE[hashKey] ?? 0 : 0;
  const seedNum = parseInt(String(seedHeader || '0'), 10) || 0;
  return (seedNum ^ hashXor) >>> 0;
}

/**
 * Map X-Scramble-Algo header to WASM builder version.
 * Site: "3" → v2, else v1.
 * @param {string|null|undefined} algoHeader
 * @returns {1|2}
 */
function resolveComixAlgoVersion(algoHeader) {
  return String(algoHeader || '') === '3' ? 2 : 1;
}

/**
 * @param {number} seed
 * @param {number} tileCount
 * @param {1|2} algoVersion
 * @returns {number[]}
 */
function buildComixTileOrder(seed, tileCount, algoVersion) {
  const exportsApi = loadWasmExports();
  const builder =
    algoVersion === 2 ? exportsApi.buildOrderV2 : exportsApi.buildOrderV1;
  const ptr = builder(seed >>> 0, tileCount | 0);
  return Array.from(new Int32Array(exportsApi.memory.buffer, ptr, tileCount));
}

/**
 * Parse "5x5" grid header.
 * @param {string|null|undefined} gridHeader
 * @returns {{cols: number, rows: number}}
 */
function parseComixScrambleGrid(gridHeader) {
  const parts = String(gridHeader || '5x5')
    .split('x')
    .map((p) => parseInt(p, 10) || 5);
  return { cols: parts[0] ?? 5, rows: parts[1] ?? 5 };
}

function copyTile(srcBuf, dstBuf, width, channels, sx, sy, dx, dy, tileW, tileH) {
  for (let y = 0; y < tileH; y++) {
    const srcOff = ((sy + y) * width + sx) * channels;
    const dstOff = ((dy + y) * width + dx) * channels;
    srcBuf.copy(dstBuf, dstOff, srcOff, srcOff + tileW * channels);
  }
}

/**
 * Resolve sharp only when descramble actually needs it.
 * @returns {Function}
 */
function requireSharpForDescramble() {
  const sharpModule = getSharp();
  if (!sharpModule) {
    throw new Error(
      'Could not load the sharp module (win32-x64 runtime). ' +
        'Comix descramble requires sharp. Please reinstall the application.'
    );
  }
  return sharpModule;
}

/**
 * Descramble a Comix CDN image buffer using scramble response headers.
 * @param {Buffer} imageBuffer
 * @param {{hash?: string, seed?: string|number, grid?: string, algo?: string}} meta
 * @returns {Promise<Buffer>} webp buffer
 */
async function descrambleComixImageBuffer(imageBuffer, meta = {}) {
  const seed = resolveComixScrambleSeed(meta.hash, meta.seed);
  const algoVersion = resolveComixAlgoVersion(meta.algo);
  const { cols, rows } = parseComixScrambleGrid(meta.grid);
  const tileCount = cols * rows;
  if (!seed || tileCount < 1) {
    return Buffer.from(imageBuffer);
  }

  const sharpModule = requireSharpForDescramble();
  const order = buildComixTileOrder(seed, tileCount, algoVersion);
  const { data, info } = await sharpModule(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const tileW = Math.floor(width / cols);
  const tileH = Math.floor(height / rows);
  if (tileW < 1 || tileH < 1) {
    return Buffer.from(imageBuffer);
  }

  const src = Buffer.from(data);
  const dst = Buffer.alloc(src.length);
  src.copy(dst);

  for (let n = 0; n < tileCount; n++) {
    const destIdx = order[n];
    const srcCol = n % cols;
    const srcRow = Math.floor(n / cols);
    const dstCol = destIdx % cols;
    const dstRow = Math.floor(destIdx / cols);
    copyTile(
      src,
      dst,
      width,
      channels,
      srcCol * tileW,
      srcRow * tileH,
      dstCol * tileW,
      dstRow * tileH,
      tileW,
      tileH
    );
  }

  return sharpModule(dst, { raw: { width, height, channels } }).webp().toBuffer();
}

module.exports = {
  SCRAMBLE_HASH_TABLE,
  resolveComixScrambleSeed,
  resolveComixAlgoVersion,
  buildComixTileOrder,
  parseComixScrambleGrid,
  descrambleComixImageBuffer,
};
