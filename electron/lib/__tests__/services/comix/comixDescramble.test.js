/**
 * Unit tests for Comix tile descramble (WASM buildOrder + sharp rearrange).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  resolveComixScrambleSeed,
  buildComixTileOrder,
  descrambleComixImageBuffer,
} = require('../../../download/connector/comixDescramble');

const fixtureDir = path.join(__dirname, 'fixtures');
const meta = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'scramble_02900_5x5.json'), 'utf8')
);
const scrambledBytes = fs.readFileSync(path.join(fixtureDir, 'scramble_02900_5x5.webp'));

describe('comixDescramble', () => {
  test('resolveComixScrambleSeed XORs CDN seed with hash table', () => {
    expect(resolveComixScrambleSeed(meta.hash, meta.seed)).toBe(meta.expectedSeedXor);
  });

  test('buildComixTileOrder returns unique permutation for 5x5 algo v2', () => {
    const seed = resolveComixScrambleSeed(meta.hash, meta.seed);
    const order = buildComixTileOrder(seed, 25, 2);
    expect(order).toHaveLength(25);
    expect(new Set(order).size).toBe(25);
    expect(order.every((n) => n >= 0 && n < 25)).toBe(true);
    // Not identity (otherwise scramble would be a no-op)
    expect(order.some((n, i) => n !== i)).toBe(true);
  });

  test('descrambleComixImageBuffer restores coherent image (differs from scrambled)', async () => {
    const fixed = await descrambleComixImageBuffer(scrambledBytes, {
      hash: meta.hash,
      seed: meta.seed,
      grid: meta.grid,
      algo: meta.algo,
    });
    expect(Buffer.isBuffer(fixed)).toBe(true);
    expect(fixed.length).toBeGreaterThan(1000);
    expect(fixed.equals(scrambledBytes)).toBe(false);

    const scrambledMeta = await sharp(scrambledBytes).metadata();
    const fixedMeta = await sharp(fixed).metadata();
    expect(fixedMeta.width).toBe(scrambledMeta.width);
    expect(fixedMeta.height).toBe(scrambledMeta.height);

    // Center tile should change after rearrange for this fixture
    const tileW = Math.floor(scrambledMeta.width / 5);
    const tileH = Math.floor(scrambledMeta.height / 5);
    const sx = 2 * tileW;
    const sy = 2 * tileH;
    const before = await sharp(scrambledBytes)
      .extract({ left: sx, top: sy, width: Math.min(32, tileW), height: Math.min(32, tileH) })
      .raw()
      .toBuffer();
    const after = await sharp(fixed)
      .extract({ left: sx, top: sy, width: Math.min(32, tileW), height: Math.min(32, tileH) })
      .raw()
      .toBuffer();
    expect(before.equals(after)).toBe(false);
  }, 20000);

  test('module load does not crash when sharp is unavailable (Windows packaging)', () => {
    jest.resetModules();
    jest.doMock('../../../shared/checkSharp', () => ({
      getSharp: () => null,
      isSharpAvailable: () => false,
      tryInstallSharpForWindows: async () => false,
    }));
    expect(() => {
      require('../../../download/connector/comixDescramble');
    }).not.toThrow();
    jest.dontMock('../../../shared/checkSharp');
  });

  test('descramble throws clear error when sharp is unavailable', async () => {
    jest.resetModules();
    jest.doMock('../../../shared/checkSharp', () => ({
      getSharp: () => null,
      isSharpAvailable: () => false,
      tryInstallSharpForWindows: async () => false,
    }));
    const {
      descrambleComixImageBuffer: descrambleWithoutSharp,
    } = require('../../../download/connector/comixDescramble');
    await expect(
      descrambleWithoutSharp(scrambledBytes, {
        hash: meta.hash,
        seed: meta.seed,
        grid: meta.grid,
        algo: meta.algo,
      })
    ).rejects.toThrow(/sharp module/i);
    jest.dontMock('../../../shared/checkSharp');
  });
});
