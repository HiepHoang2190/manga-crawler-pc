/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const mockTrashItem = jest.fn();

jest.mock('electron', () => ({
  shell: {
    trashItem: (...args) => mockTrashItem(...args),
  },
}), { virtual: true });

const {
  isPathUnderAllowedRoots,
  deleteFilesUnderRoots,
  scanDuplicateImages,
  findDuplicatesInDirectory,
  cancelScan,
  listImportedImages,
} = require('../../export/image/duplicateImageScanner');

describe('duplicateImageScanner - Path validation and Deletion', () => {
  let tmpDir;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dup-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('isPathUnderAllowedRoots', () => {
    it('returns true for files directly inside allowed root', () => {
      const root = path.join(tmpDir, 'manga');
      const file = path.join(root, '001.webp');
      expect(isPathUnderAllowedRoots(file, [root])).toBe(true);
    });

    it('returns true for files nested inside chapters', () => {
      const root = path.join(tmpDir, 'manga');
      const file = path.join(root, 'Chap 01', 'sub', '001.webp');
      expect(isPathUnderAllowedRoots(file, [root])).toBe(true);
    });

    it('returns false for files outside allowed root', () => {
      const root = path.join(tmpDir, 'manga');
      const file = path.join(tmpDir, 'other', '001.webp');
      expect(isPathUnderAllowedRoots(file, [root])).toBe(false);
    });
  });

  describe('deleteFilesUnderRoots', () => {
    it('successfully calls shell.trashItem and tracks deleted files', async () => {
      const testFile = path.join(tmpDir, 'test.webp');
      await fs.promises.writeFile(testFile, 'dummy data');
      mockTrashItem.mockResolvedValueOnce(undefined);

      const result = await deleteFilesUnderRoots([testFile], [tmpDir]);
      expect(result.deleted).toEqual([path.resolve(testFile)]);
      expect(result.errors).toEqual([]);
      expect(mockTrashItem).toHaveBeenCalledWith(path.resolve(testFile));
    });

    it('falls back to fs.promises.unlink when shell.trashItem fails (e.g. external drives without Recycle Bin)', async () => {
      const testFile = path.join(tmpDir, 'external_drive_file.webp');
      await fs.promises.writeFile(testFile, 'dummy data');
      // Simulate Windows external drive failing to move to Recycle Bin
      mockTrashItem.mockRejectedValueOnce(new Error('Failed to move item to trash (Recycle Bin not available)'));

      const result = await deleteFilesUnderRoots([testFile], [tmpDir]);
      expect(result.deleted).toEqual([path.resolve(testFile)]);
      expect(result.errors).toEqual([]);
      // Confirm file was deleted via unlink fallback
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('records an error if file is outside allowed roots without attempting deletion', async () => {
      const outsideDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'outside-'));
      const outsideFile = path.join(outsideDir, 'forbidden.webp');
      await fs.promises.writeFile(outsideFile, 'secret');

      const result = await deleteFilesUnderRoots([outsideFile], [tmpDir]);
      expect(result.deleted).toEqual([]);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain('Không nằm trong thư mục đã quét');
      expect(mockTrashItem).not.toHaveBeenCalled();
      expect(fs.existsSync(outsideFile)).toBe(true);

      await fs.promises.rm(outsideDir, { recursive: true, force: true });
    });

    it('allows deletion when allowedRoots contains file paths directly', async () => {
      const testFile = path.join(tmpDir, 'selected.webp');
      await fs.promises.writeFile(testFile, 'dummy data');

      const result = await deleteFilesUnderRoots([testFile], [testFile]);
      expect(result.deleted).toEqual([path.resolve(testFile)]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('scanDuplicateImages with explicit files', () => {
    it('returns error when neither roots nor files are provided', async () => {
      const res = await scanDuplicateImages([], {});
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Chưa chọn thư mục hoặc tệp');
    });

    it('creates selected_files bucket and scans provided files', async () => {
      const file1 = path.join(tmpDir, 'a.png');
      const file2 = path.join(tmpDir, 'b.png');
      await fs.promises.writeFile(file1, 'fake image 1');
      await fs.promises.writeFile(file2, 'fake image 2');

      const res = await scanDuplicateImages([], { files: [file1, file2] });
      expect(res.ok).toBe(true);
      expect(Array.isArray(res.buckets)).toBe(true);
      expect(Array.isArray(res.images)).toBe(true);
      expect(res.stats).toBeDefined();
      expect(typeof res.stats.total).toBe('number');
    });
  });

  describe('listImportedImages', () => {
    it('returns empty array when no sourceDir or sourceFiles provided', async () => {
      const res = await listImportedImages({});
      expect(res.ok).toBe(true);
      expect(res.files).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('lists images quickly when sourceFiles are provided', async () => {
      const file1 = path.join(tmpDir, 'page01.jpg');
      const file2 = path.join(tmpDir, 'page02.png');
      const nonImage = path.join(tmpDir, 'notes.txt');
      await fs.promises.writeFile(file1, 'image data 1');
      await fs.promises.writeFile(file2, 'image data 2');
      await fs.promises.writeFile(nonImage, 'not an image');

      const res = await listImportedImages({ sourceFiles: [file1, file2, nonImage] });
      expect(res.ok).toBe(true);
      expect(res.total).toBe(2);
      expect(res.files.map((f) => f.name)).toEqual(['page01.jpg', 'page02.png']);
      expect(res.files[0].sizeBytes).toBeGreaterThan(0);
    });

    it('lists images in directory using sourceDir', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.promises.mkdir(subDir, { recursive: true });
      const f1 = path.join(tmpDir, 'root.webp');
      const f2 = path.join(subDir, 'nested.jpg');
      await fs.promises.writeFile(f1, 'root webp');
      await fs.promises.writeFile(f2, 'nested jpg');

      const resRec = await listImportedImages({ sourceDir: tmpDir, includeSubfolders: true });
      expect(resRec.ok).toBe(true);
      expect(resRec.total).toBe(2);

      const resNoRec = await listImportedImages({ sourceDir: tmpDir, includeSubfolders: false });
      expect(resNoRec.ok).toBe(true);
      expect(resNoRec.total).toBe(1);
      expect(resNoRec.files[0].name).toBe('root.webp');
    });

    it('lists images across multiple folders using folders array', async () => {
      const folderA = path.join(tmpDir, 'chapA');
      const folderB = path.join(tmpDir, 'chapB');
      await fs.promises.mkdir(folderA, { recursive: true });
      await fs.promises.mkdir(folderB, { recursive: true });
      await fs.promises.writeFile(path.join(folderA, '01.png'), 'a1');
      await fs.promises.writeFile(path.join(folderB, '01.png'), 'b1');

      const res = await listImportedImages({ folders: [folderA, folderB] });
      expect(res.ok).toBe(true);
      expect(res.total).toBe(2);
      expect(res.files.map((f) => f.relativePath)).toEqual(['chapA/01.png', 'chapB/01.png']);
    });
  });

  describe('classic vs smartMode scanning', () => {
    it('keeps classic scan behavior untouched when smartMode is false', async () => {
      const sharp = require('sharp');
      const whiteImage = path.join(tmpDir, 'white.jpg');
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
      }).jpeg().toFile(whiteImage);

      const res = await scanDuplicateImages([], { files: [whiteImage], smartMode: false });
      expect(res.ok).toBe(true);
      expect(res.smartMode).toBe(false);
      expect(res.images).toHaveLength(1);
      expect(res.images[0].isDuplicate).toBe(false);
      expect(res.images[0].category).toBeUndefined();
      expect(res.images[0].isSuggestedForTrash).toBeUndefined();
    });

    it('detects standalone blank & banner pages without merging white and black blanks in smartMode', async () => {
      const sharp = require('sharp');
      const whiteImage = path.join(tmpDir, '01_white.jpg');
      const blackImage = path.join(tmpDir, '02_black.jpg');
      const bannerImage = path.join(tmpDir, '03_banner.jpg');

      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
      }).jpeg().toFile(whiteImage);
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).jpeg().toFile(blackImage);
      await sharp({
        create: { width: 728, height: 90, channels: 3, background: { r: 30, g: 120, b: 220 } },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 200, height: 90, channels: 3, background: { r: 250, g: 200, b: 20 } },
            }).png().toBuffer(),
            left: 20,
            top: 0,
          },
        ])
        .jpeg()
        .toFile(bannerImage);

      const res = await scanDuplicateImages([], {
        files: [whiteImage, blackImage, bannerImage],
        smartMode: true,
      });

      expect(res.ok).toBe(true);
      expect(res.smartMode).toBe(true);
      const byName = Object.fromEntries(res.images.map((i) => [i.name, i]));

      expect(byName['01_white.jpg'].category).toBe('BLANK_PAGE');
      expect(byName['01_white.jpg'].isSuggestedForTrash).toBe(true);
      expect(byName['01_white.jpg'].isDuplicate).toBe(false);
      expect(byName['01_white.jpg'].duplicateGroup).toBeNull();

      expect(byName['02_black.jpg'].category).toBe('BLANK_PAGE');
      expect(byName['02_black.jpg'].isSuggestedForTrash).toBe(true);
      expect(byName['02_black.jpg'].isDuplicate).toBe(false);
      expect(byName['02_black.jpg'].duplicateGroup).toBeNull();

      expect(byName['03_banner.jpg'].category).toBe('AD_BANNER');
      expect(byName['03_banner.jpg'].isSuggestedForTrash).toBe(true);
      expect(byName['03_banner.jpg'].details?.bannerReasonCode).toBe('aspect_ratio');
      expect(res.stats.blanks).toBe(2);
      expect(res.stats.banners).toBe(1);
    });

    it('merges resized near-duplicate copies in smartMode and keeps highest-resolution file as isOriginal', async () => {
      const sharp = require('sharp');
      const hiResPath = path.join(tmpDir, 'z_hires.jpg');
      const loResPath = path.join(tmpDir, 'a_lowres.webp');

      // Gradient + high-contrast manga panels + small re-encoded watermark crop so Hamming distance is 1..3 (misses classic exact match, caught by smart fuzzy cluster)
      const w = 800;
      const h = 1200;
      const raw = Buffer.alloc(w * h * 3);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const panel = (x > 120 && x < 680 && y > 150 && y < 520) ? 25 : 0;
          const v = Math.max(0, Math.min(255, Math.floor((x / w) * 160 + (y / h) * 70 - panel)));
          const idx = (y * w + x) * 3;
          raw[idx] = v;
          raw[idx + 1] = v;
          raw[idx + 2] = v;
        }
      }
      const hiBuf = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 92 })
        .toBuffer();

      await fs.promises.writeFile(hiResPath, hiBuf);
      // Resize + composite corner stamp + WebP recompress so 1-2 dHash bits differ (missed by exact match, caught as 'fuzzy' in smartMode)
      const resizedBuf = await sharp(hiBuf).resize(400, 600).toBuffer();
      await sharp(resizedBuf)
        .composite([
          {
            input: await sharp({
              create: { width: 48, height: 75, channels: 3, background: { r: 0, g: 0, b: 0 } },
            }).png().toBuffer(),
            left: 400 - 48,
            top: 600 - 75,
          },
        ])
        .webp({ quality: 65 })
        .toFile(loResPath);

      const classicRes = await scanDuplicateImages([], {
        files: [loResPath, hiResPath],
        smartMode: false,
      });
      expect(classicRes.images.filter((i) => i.isDuplicate)).toHaveLength(0);

      const res = await scanDuplicateImages([], {
        files: [loResPath, hiResPath],
        smartMode: true,
      });

      expect(res.ok).toBe(true);
      const hi = res.images.find((i) => i.name === 'z_hires.jpg');
      const lo = res.images.find((i) => i.name === 'a_lowres.webp');
      expect(hi.isDuplicate).toBe(true);
      expect(lo.isDuplicate).toBe(true);
      expect(hi.duplicateGroup).toBe(lo.duplicateGroup);
      expect(hi.matchType).toBe('fuzzy');
      // Alphabetically lo ('a_lowres') would come first, yet smartMode picks z_hires (800x1200) as Original!
      expect(hi.isOriginal).toBe(true);
      expect(hi.isSuggestedForTrash).toBe(false);
      expect(lo.isOriginal).toBe(false);
      expect(lo.isSuggestedForTrash).toBe(true);
    });

    it('deduplicates QR scanning via scan-wide hash cache and preserves deterministic ordering under concurrency', async () => {
      const sharp = require('sharp');
      const qrDetector = require('../../export/image/detectors/qrDetector');
      const spyQr = jest.spyOn(qrDetector, 'detectQrCode');

      const ch1 = path.join(tmpDir, 'Chap 1');
      const ch2 = path.join(tmpDir, 'Chap 2');
      await fs.promises.mkdir(ch1, { recursive: true });
      await fs.promises.mkdir(ch2, { recursive: true });

      const buf = await sharp({
        create: { width: 800, height: 1200, channels: 3, background: { r: 220, g: 220, b: 220 } },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 200, height: 300, channels: 3, background: { r: 40, g: 40, b: 40 } },
            }).png().toBuffer(),
            left: 100,
            top: 200,
          },
        ])
        .jpeg({ quality: 85 })
        .toBuffer();

      // Identical edge image repeated across 2 chapters
      await fs.promises.writeFile(path.join(ch1, '01.jpg'), buf);
      await fs.promises.writeFile(path.join(ch2, '01.jpg'), buf);

      const res = await scanDuplicateImages([tmpDir], { recursive: true, smartMode: true });
      expect(res.ok).toBe(true);
      // Both Chap 1/01.jpg and Chap 2/01.jpg share identical dHash -> QR decoder runs at most once!
      expect(spyQr).toHaveBeenCalledTimes(1);
      expect(res.images.map((i) => i.relativePath)).toEqual([
        path.join('Chap 1', '01.jpg'),
        path.join('Chap 2', '01.jpg'),
      ]);

      spyQr.mockRestore();
    });

    it('evicts rejected/error QR cache entries and handles >12 concurrent images, CMYK inputs, and cancel isolation', async () => {
      const sharp = require('sharp');
      const qrDetector = require('../../export/image/detectors/qrDetector');

      // 1. Soft error from detectQrCode should NOT stay poisoned in qrCacheByHash
      let callNum = 0;
      const spyQr = jest.spyOn(qrDetector, 'detectQrCode').mockImplementation(async () => {
        callNum += 1;
        if (callNum === 1) return { hasQr: false, error: 'transient decode error' };
        return { hasQr: true, qrText: 'https://discord.gg/retry-ok', isDonateOrInvite: true };
      });

      const ch1 = path.join(tmpDir, 'Ch1');
      const ch2 = path.join(tmpDir, 'Ch2');
      await fs.promises.mkdir(ch1, { recursive: true });
      await fs.promises.mkdir(ch2, { recursive: true });

      const baseImg = await sharp({
        create: { width: 600, height: 900, channels: 3, background: { r: 220, g: 220, b: 220 } },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 150, height: 200, channels: 3, background: { r: 30, g: 30, b: 30 } },
            }).png().toBuffer(),
            left: 50,
            top: 80,
          },
        ])
        .jpeg({ quality: 85 })
        .toBuffer();

      await fs.promises.writeFile(path.join(ch1, '01.jpg'), baseImg);
      await fs.promises.writeFile(path.join(ch2, '01.jpg'), baseImg);

      // Force concurrency=1 so call 1 happens before call 2 in Ch2 (or sequential buckets anyway)
      const qrRes = await scanDuplicateImages([tmpDir], { recursive: true, smartMode: true });
      expect(qrRes.ok).toBe(true);
      expect(spyQr).toHaveBeenCalledTimes(2);
      expect(qrRes.stats.qrCodes).toBe(1);
      spyQr.mockRestore();

      // 2. Textured CMYK JPEG with K=0 pixels must NOT be misclassified as transparent BLANK_PAGE
      const cmykPath = path.join(tmpDir, 'cmyk_cover.jpg');
      const cmykBuf = await sharp({
        create: { width: 400, height: 600, channels: 3, background: { r: 255, g: 140, b: 40 } },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 160, height: 240, channels: 3, background: { r: 40, g: 180, b: 240 } },
            }).png().toBuffer(),
            left: 100,
            top: 150,
          },
        ])
        .toColorspace('cmyk')
        .jpeg()
        .toBuffer();
      await fs.promises.writeFile(cmykPath, cmykBuf);
      const cmykScan = await scanDuplicateImages([], { files: [cmykPath], smartMode: true });
      expect(cmykScan.ok).toBe(true);
      expect(cmykScan.images[0].category).toBe('OK');
      expect(cmykScan.images[0].isSuggestedForTrash).toBe(false);

      // 3. Cancellation in scanDuplicateImages must NOT break standalone findDuplicatesInDirectory afterward, nor hang >12 files
      const manyDir = path.join(tmpDir, 'Many');
      await fs.promises.mkdir(manyDir, { recursive: true });
      for (let i = 1; i <= 14; i += 1) {
        await fs.promises.writeFile(path.join(manyDir, `${String(i).padStart(2, '0')}.jpg`), baseImg);
      }
      const cancelledRes = await scanDuplicateImages(
        [manyDir],
        { recursive: false, smartMode: true },
        (processed) => {
          if (processed >= 2) cancelScan();
        }
      );
      expect(cancelledRes.ok).toBe(false);
      expect(cancelledRes.cancelled).toBe(true);

      // Standalone findDuplicatesInDirectory must run cleanly right after cancelScan()
      const standalone = await findDuplicatesInDirectory(manyDir, { recursive: false, smartMode: true });
      expect(standalone.isCancelled).toBeFalsy();
      expect(standalone.duplicateGroups.length).toBe(1);
      expect(standalone.duplicateGroups[0].files).toHaveLength(14);
    });

    it('honors recursive: false on root folder and respects configurable maxHammingDistance', async () => {
      const sharp = require('sharp');
      const subDir = path.join(tmpDir, 'ChildSub');
      await fs.promises.mkdir(subDir, { recursive: true });

      const mkPattern = async (flipCols = 0) => {
        const w = 400, h = 600;
        const raw = Buffer.alloc(w * h * 3);
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const v = Math.min(255, Math.floor((x / w) * 200));
            const idx = (y * w + x) * 3;
            raw[idx] = v;
            raw[idx + 1] = v;
            raw[idx + 2] = v;
          }
        }
        let pipeline = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
        if (flipCols > 0) {
          // Stamp bottom rows dark to invert bits cleanly
          pipeline = pipeline.composite([
            {
              input: await sharp({
                create: { width: w, height: flipCols * 75, channels: 3, background: { r: 255, g: 255, b: 255 } },
              }).png().toBuffer(),
              left: 0,
              top: 0,
            },
          ]);
        }
        return pipeline.jpeg({ quality: 90 }).toBuffer();
      };

      const pRoot = path.join(tmpDir, 'root_page.jpg');
      const pChild = path.join(subDir, 'child_page.jpg');
      await fs.promises.writeFile(pRoot, await mkPattern(0));
      await fs.promises.writeFile(pChild, await mkPattern(0));

      // recursive: false must NOT traverse into ChildSub/
      const noRec = await scanDuplicateImages([tmpDir], { recursive: false, smartMode: true });
      expect(noRec.ok).toBe(true);
      expect(noRec.images.map((i) => i.name)).toEqual(['root_page.jpg']);

      // Verify configurable maxHammingDistance merges only when threshold allows
      const baseImg = path.join(tmpDir, 'base_v1.jpg');
      const looseImg = path.join(tmpDir, 'loose_v2.jpg');
      await fs.promises.writeFile(baseImg, await mkPattern(0));
      await fs.promises.writeFile(looseImg, await mkPattern(2)); // ~8 bits diff across top row

      const strictRes = await scanDuplicateImages([], {
        files: [baseImg, looseImg],
        smartMode: true,
        maxHammingDistance: 1,
      });
      expect(strictRes.images.filter((i) => i.isDuplicate)).toHaveLength(0);

      const looseRes = await scanDuplicateImages([], {
        files: [baseImg, looseImg],
        smartMode: true,
        maxHammingDistance: 10,
      });
      expect(looseRes.images.filter((i) => i.isDuplicate)).toHaveLength(2);
    });
  });
});
