const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  shouldSplit,
  resolveTargetDir,
  scanForSplit,
} = require('../../export/image/splitDoublePage');

describe('splitDoublePage - sub-folder support and structure', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'split-test-'));
    // Structure:
    // root.jpg
    // lvl1/f1.jpg
    // lvl1/lvl2/f2.jpg
    // lvl1/lvl2/lvl3/f3.jpg
    // lvl1/lvl2/lvl3/lvl4/f4.jpg (depth 4 subfolder)
    // lvl1/lvl2/lvl3/lvl4/lvl5/f5.jpg (depth 5 subfolder - beyond 4 levels)
    fs.mkdirSync(path.join(tmpDir, 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5'), { recursive: true });
    
    // Write fake small jpg files (just headers/dummy so glob finds them)
    const dummy = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    fs.writeFileSync(path.join(tmpDir, 'root.jpg'), dummy);
    fs.writeFileSync(path.join(tmpDir, 'lvl1', 'f1.jpg'), dummy);
    fs.writeFileSync(path.join(tmpDir, 'lvl1', 'lvl2', 'f2.jpg'), dummy);
    fs.writeFileSync(path.join(tmpDir, 'lvl1', 'lvl2', 'lvl3', 'f3.jpg'), dummy);
    fs.writeFileSync(path.join(tmpDir, 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'f4.jpg'), dummy);
    fs.writeFileSync(path.join(tmpDir, 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'f5.jpg'), dummy);
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolveTargetDir in-place returns file directory', () => {
    const file = path.join(tmpDir, 'lvl1', 'lvl2', 'f2.jpg');
    const target = resolveTargetDir({
      sourceDir: tmpDir,
      absolutePath: file,
      inPlace: true,
      outputDir: null,
    });
    expect(target).toBe(path.join(tmpDir, 'lvl1', 'lvl2'));
  });

  test('resolveTargetDir with outputDir preserves relative hierarchy (con, cháu, ...)', () => {
    const file = path.join(tmpDir, 'lvl1', 'lvl2', 'lvl3', 'f3.jpg');
    const outRoot = path.join(tmpDir, 'export_out');
    const target = resolveTargetDir({
      sourceDir: tmpDir,
      absolutePath: file,
      inPlace: false,
      outputDir: outRoot,
    });
    expect(target).toBe(path.join(outRoot, 'lvl1', 'lvl2', 'lvl3'));
  });

  test('resolveTargetDir for root file returns outputDir directly', () => {
    const file = path.join(tmpDir, 'root.jpg');
    const outRoot = path.join(tmpDir, 'export_out');
    const target = resolveTargetDir({
      sourceDir: tmpDir,
      absolutePath: file,
      inPlace: false,
      outputDir: outRoot,
    });
    expect(target).toBe(outRoot);
  });

  test('resolveTargetDir in files mode with outputDir returns outputDir directly', () => {
    const file = path.join(tmpDir, 'lvl1', 'lvl2', 'f2.jpg');
    const outRoot = path.join(tmpDir, 'export_out');
    const target = resolveTargetDir({
      sourceDir: tmpDir,
      absolutePath: file,
      inPlace: false,
      outputDir: outRoot,
      isFilesMode: true,
    });
    expect(target).toBe(outRoot);
  });

  test('scanForSplit with sourceFiles mode returns specified files with basename relativePath', async () => {
    const f1 = path.join(tmpDir, 'root.jpg');
    const f2 = path.join(tmpDir, 'lvl1', 'f1.jpg');
    const res = await scanForSplit({
      sourceFiles: [f2, f1],
    });
    expect(res.ok).toBe(true);
    expect(res.images.length).toBe(2);
    expect(res.images.map(img => img.relativePath)).toEqual(['f1.jpg', 'root.jpg']);
  });

  test('scanForSplit without subfolders finds only root files', async () => {
    const res = await scanForSplit({
      sourceDir: tmpDir,
      includeSubfolders: false,
    });
    expect(res.ok).toBe(true);
    expect(res.images.length).toBe(1);
    expect(res.images[0].relativePath).toBe('root.jpg');
  });

  test('scanForSplit with includeSubfolders and maxDepth 5 finds up to 4 subfolder levels', async () => {
    const res = await scanForSplit({
      sourceDir: tmpDir,
      includeSubfolders: true,
      maxDepth: 5,
    });
    expect(res.ok).toBe(true);
    // Should find root.jpg, lvl1/f1.jpg, lvl1/lvl2/f2.jpg, lvl1/lvl2/lvl3/f3.jpg, lvl1/lvl2/lvl3/lvl4/f4.jpg
    // lvl5 is beyond 4 levels deep and should NOT be included
    const rels = res.images.map(img => img.relativePath.replace(/\\/g, '/'));
    expect(rels).toContain('root.jpg');
    expect(rels).toContain('lvl1/f1.jpg');
    expect(rels).toContain('lvl1/lvl2/f2.jpg');
    expect(rels).toContain('lvl1/lvl2/lvl3/f3.jpg');
    expect(rels).toContain('lvl1/lvl2/lvl3/lvl4/f4.jpg');
    expect(rels).not.toContain('lvl1/lvl2/lvl3/lvl4/lvl5/f5.jpg');
  });

  test('splitDoublePages exports to outputDir preserving subfolder structure (con, cháu, ...)', async () => {
    const { splitDoublePages } = require('../../export/image/splitDoublePage');
    const outDir = path.join(tmpDir, 'split_output');

    const result = await splitDoublePages({
      sourceDir: tmpDir,
      outputDir: outDir,
      includeSubfolders: true,
      maxDepth: 5,
    });

    expect(result.ok).toBe(true);
    // Images in test are not valid full images so they won't split, but will be copied preserving structure:
    expect(fs.existsSync(path.join(outDir, 'root.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'f1.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'lvl2', 'f2.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'lvl2', 'lvl3', 'f3.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'lvl2', 'lvl3', 'lvl4', 'f4.jpg'))).toBe(true);
  });

  test('splitDoublePages respects excludedSplitPaths and skips splitting them', async () => {
    const { splitDoublePages } = require('../../export/image/splitDoublePage');
    const outDir = path.join(tmpDir, 'split_output_excluded');
    const fileToExclude = path.join(tmpDir, 'lvl1', 'f1.jpg');

    const result = await splitDoublePages({
      sourceDir: tmpDir,
      outputDir: outDir,
      includeSubfolders: true,
      excludedSplitPaths: [fileToExclude],
    });

    expect(result.ok).toBe(true);
    // The excluded file should be copied as a single file, not split into -a and -b
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'f1.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'f1-a.jpg'))).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'lvl1', 'f1-b.jpg'))).toBe(false);
  });

  test('splitImageWithSharp splits at customRatio when provided', async () => {
    const { splitImageWithSharp } = require('../../export/image/splitDoublePage');
    const sharp = require('sharp');
    const imgPath = path.join(tmpDir, 'real-double.png');
    // Create 200x100 test image
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toFile(imgPath);

    const outA = path.join(tmpDir, 'real-double-a.png');
    const outB = path.join(tmpDir, 'real-double-b.png');

    // Split at 35% (0.35) -> 200 * 0.35 = 70
    const res = await splitImageWithSharp(imgPath, outA, outB, 'ltr', 'png', 0.35);
    expect(res.splitX).toBe(70);

    const metaA = await sharp(outA).metadata();
    const metaB = await sharp(outB).metadata();
    expect(metaA.width).toBe(70);
    expect(metaB.width).toBe(130);
  });

  test('splitImageWithSharp performs slanted cut with topRatio and bottomRatio', async () => {
    const { splitImageWithSharp } = require('../../export/image/splitDoublePage');
    const sharp = require('sharp');
    const imgPath = path.join(tmpDir, 'slanted-double.png');
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 50, g: 100, b: 150 },
      },
    })
      .png()
      .toFile(imgPath);

    const outA = path.join(tmpDir, 'slanted-a.png');
    const outB = path.join(tmpDir, 'slanted-b.png');

    // Slanted cut: top 60% (120px), bottom 40% (80px)
    const res = await splitImageWithSharp(imgPath, outA, outB, 'ltr', 'png', {
      topRatio: 0.6,
      bottomRatio: 0.4,
    });

    expect(res.topX).toBe(120);
    expect(res.bottomX).toBe(80);
    expect(res.splitX).toBe(100);

    const metaA = await sharp(outA).metadata();
    const metaB = await sharp(outB).metadata();
    // Left half width is max(120, 80) = 120
    expect(metaA.width).toBe(120);
    // Right half width is 200 - min(120, 80) = 120
    expect(metaB.width).toBe(120);
    expect(metaA.height).toBe(100);
    expect(metaB.height).toBe(100);
  });

  test('splitImageWithSharp supports deskew rotation before splitting', async () => {
    const { splitImageWithSharp } = require('../../export/image/splitDoublePage');
    const sharp = require('sharp');
    const imgPath = path.join(tmpDir, 'rotate-double.png');
    await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 80, g: 120, b: 160 },
      },
    })
      .png()
      .toFile(imgPath);

    const outA = path.join(tmpDir, 'rotate-a.png');
    const outB = path.join(tmpDir, 'rotate-b.png');

    // Rotate 2 degrees and split at 50%
    const res = await splitImageWithSharp(imgPath, outA, outB, 'ltr', 'png', {
      topRatio: 0.5,
      bottomRatio: 0.5,
      rotation: 2,
    });

    expect(res.splitX).toBeGreaterThan(0);
    expect(fs.existsSync(outA)).toBe(true);
    expect(fs.existsSync(outB)).toBe(true);
  });
});


