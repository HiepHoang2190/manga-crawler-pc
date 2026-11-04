/**
 * Heavy DRM transforms (strip descramble, ComicDays grid) off the Electron main-thread
 * event loop via worker_threads — keeps UI responsive during downloads.
 */

'use strict';

const { parentPort } = require('worker_threads');
const Jimp = require('jimp');

const COMIC_GRID = 4;
const COMIC_MULTIPLE = 8;

/**
 * XOR-strip descrambling (Cuu Truyện / Minotruyen).
 * @param {Buffer} scrambledBuffer
 * @param {string} drmPlain decrypted DRM plaintext
 */
async function stripDescrambleToJpeg(scrambledBuffer, drmPlain) {
  const scrambled = await Jimp.read(scrambledBuffer);
  const width = scrambled.getWidth();
  const height = scrambled.getHeight();
  const output = await new Promise((resolve, reject) => {
    new Jimp(width, height, 0xffffffff, (err, img) => (err ? reject(err) : resolve(img)));
  });
  const normalized = drmPlain.replace(/~/g, '|');
  const segments = normalized.split('|');
  let sy = 0;
  for (let i = 1; i < segments.length; i++) {
    const parts = segments[i].split('-', 2);
    if (parts.length !== 2) continue;
    const dy = parseInt(parts[0], 10);
    let stripHeight = parseInt(parts[1], 10);
    if (sy + stripHeight > height) stripHeight = height - sy;
    if (dy + stripHeight > height) stripHeight = height - dy;
    if (stripHeight <= 0) continue;
    output.blit(scrambled, 0, dy, 0, sy, width, stripHeight);
    sy += stripHeight;
  }
  return output.getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * Grid descrambling (ComicDays / Kodansha).
 * @param {Buffer} scrambledBuf
 */
async function comicDaysGridToJpeg(scrambledBuf) {
  const scrambled = await Jimp.read(scrambledBuf);
  const width = scrambled.bitmap.width;
  const height = scrambled.bitmap.height;
  const cellW =
    Math.floor(width / (COMIC_GRID * COMIC_MULTIPLE)) * COMIC_MULTIPLE;
  const cellH =
    Math.floor(height / (COMIC_GRID * COMIC_MULTIPLE)) * COMIC_MULTIPLE;

  const tiles = [];
  for (let col = 0; col < COMIC_GRID; col++) {
    tiles[col] = [];
    for (let row = 0; row < COMIC_GRID; row++) {
      tiles[col][row] = scrambled
        .clone()
        .crop(col * cellW, row * cellH, cellW, cellH);
    }
  }

  const dest = new Jimp(width, height);
  dest.composite(scrambled, 0, 0);
  for (let col = 0; col < COMIC_GRID; col++) {
    for (let row = 0; row < COMIC_GRID; row++) {
      dest.composite(tiles[col][row], row * cellW, col * cellH);
    }
  }
  return dest.getBufferAsync(Jimp.MIME_JPEG);
}

/** One task finishing before the next keeps Jimp-safe use per worker isolate. */
let chain = Promise.resolve();

parentPort.on('message', (task) => {
  chain = chain.then(async () => {
    const id = task.id;
    try {
      let jpeg;
      const buf = Buffer.isBuffer(task.image)
        ? task.image
        : Buffer.from(task.image);
      if (task.kind === 'strip') {
        jpeg = await stripDescrambleToJpeg(buf, task.drmPlain);
      } else if (task.kind === 'comicDaysGrid') {
        jpeg = await comicDaysGridToJpeg(buf);
      } else {
        throw new Error(`Unknown DRM kind: ${task.kind}`);
      }
      try {
        parentPort.postMessage({ id, ok: true, jpeg }, [jpeg.buffer]);
      } catch {
        parentPort.postMessage({ id, ok: true, jpeg });
      }
    } catch (err) {
      parentPort.postMessage({
        id: task.id,
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  });
});
