/**
 * Quét ảnh trùng nội dung (dHash) và phân tích thông minh (tuỳ chọn smartMode).
 * Hỗ trợ tìm chính xác (classic) hoặc mờ theo ngưỡng Hamming + QR/Credit/Banner/Trang trống (smartMode).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fg = require('fast-glob');
const { getSharp } = require('../../shared/checkSharp');
const { computeDHash, computeDHashFromRaw36x32, clusterSimilarImages } = require('./detectors/fuzzyHashMatcher');
const { detectBlankPage, classifyBlankFromRaw } = require('./detectors/blankPageDetector');
const { detectBanner } = require('./detectors/bannerDetector');
const qrDetector = require('./detectors/qrDetector');
const { detectEdgeCreditPages, isEdgePage } = require('./detectors/edgeRepetitionDetector');

let activeScanToken = null;

function cancelScan() {
  if (activeScanToken) {
    activeScanToken.cancelled = true;
  }
}

const IMAGE_GLOB = '*.{jpg,jpeg,png,webp,gif,avif}';
const IMAGE_GLOB_REC = '**/*.{jpg,jpeg,png,webp,gif,avif}';

function isImageFileName(name) {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(name);
}

/**
 * Tính dHash 8x8 (chuỗi 64 bit) để tìm ảnh giống nhau về nội dung.
 * Khi smartMode = true, phân tích thêm trang trống, banner và QR (ở vị trí edge hoặc banner).
 */
async function calculateImageHashAndMetadata(
  filePath,
  { smartMode = false, isEdge = false, qrCacheByHash = null } = {}
) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) return null;

    // Đọc buffer trước để tránh sharp memory-map và lock file trên Windows
    const fileBuffer = await fs.promises.readFile(filePath);

    const sharp = getSharp();
    if (sharp) {
      try {
        const sharpInstance = sharp(fileBuffer);
        const metadata = await sharpInstance.metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        if (!smartMode) {
          const hash = await computeDHash(fileBuffer);
          return {
            hash,
            width,
            height,
            sizeBytes: stat.size,
          };
        }

        // Normalize non-RGB multi-channel colorspaces (e.g. CMYK JPEGs) to sRGB so channel 4 is never misread as alpha
        let rawPipeline = sharpInstance.clone();
        if (metadata.space === 'cmyk' || (metadata.channels === 4 && metadata.space && metadata.space !== 'srgb' && metadata.space !== 'rgb')) {
          rawPipeline = rawPipeline.toColorspace('srgb');
        }

        // Single decode (36x32 raw) feeds both 9x8 dHash and blank-page statistics
        const { data: rawData, info: rawInfo } = await rawPipeline
          .resize(36, 32, { fit: 'fill' })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const hash = computeDHashFromRaw36x32(rawData, rawInfo);
        const blankRes = classifyBlankFromRaw(rawData, rawInfo);
        const bannerRes = detectBanner({ width, height });

        let qrRes = { hasQr: false };
        if (!blankRes.isBlank && (isEdge || bannerRes.isBanner)) {
          const qrBrightFlag = blankRes.avgMean >= 150 ? 1 : 0;
          const qrSizeBucket = width >= 400 && height >= 400 ? 'hi' : `${width}x${height}`;
          const qrCacheKey = `${hash}:${qrSizeBucket}:${qrBrightFlag}`;

          if (qrCacheByHash && qrCacheByHash.has(qrCacheKey)) {
            try {
              qrRes = await qrCacheByHash.get(qrCacheKey);
            } catch {
              qrRes = { hasQr: false };
            }
          } else {
            let qrPromise = null;
            try {
              qrPromise = qrDetector.detectQrCode(fileBuffer, { avgMean: blankRes.avgMean });
              if (qrCacheByHash) {
                qrCacheByHash.set(qrCacheKey, qrPromise);
              }
              qrRes = await qrPromise;
              if (qrRes?.error && qrCacheByHash && qrCacheByHash.get(qrCacheKey) === qrPromise) {
                qrCacheByHash.delete(qrCacheKey);
              }
            } catch {
              if (qrCacheByHash && qrPromise && qrCacheByHash.get(qrCacheKey) === qrPromise) {
                qrCacheByHash.delete(qrCacheKey);
              }
              qrRes = { hasQr: false };
            }
          }
        }

        return {
          hash,
          width,
          height,
          sizeBytes: stat.size,
          isBlank: Boolean(blankRes.isBlank),
          blankType: blankRes.blankType,
          isBanner: Boolean(bannerRes.isBanner),
          bannerReasonCode: bannerRes.reasonCode,
          aspectRatio: bannerRes.aspectRatio,
          hasQr: Boolean(qrRes.hasQr),
          qrText: qrRes.qrText,
          isDonateOrInvite: Boolean(qrRes.isDonateOrInvite),
        };
      } catch (err) {
        console.warn(`[DuplicateScan] Sharp failed to process ${filePath}, trying Jimp fallback:`, err.message);
      }
    }

    // Fallback sang Jimp
    const Jimp = require('jimp');
    const image = await Jimp.read(fileBuffer);

    const width = image.bitmap.width;
    const height = image.bitmap.height;

    image.resize(9, 8).greyscale();

    const data = image.bitmap.data;
    let hash = '';
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const left = data[(y * 9 + x) * 4];
        const right = data[(y * 9 + x + 1) * 4];
        hash += left < right ? '1' : '0';
      }
    }

    if (!smartMode) {
      return {
        hash,
        width: width || 0,
        height: height || 0,
        sizeBytes: stat.size,
      };
    }

    const bannerRes = detectBanner({ width, height });
    return {
      hash,
      width: width || 0,
      height: height || 0,
      sizeBytes: stat.size,
      isBlank: false,
      isBanner: Boolean(bannerRes.isBanner),
      bannerReasonCode: bannerRes.reasonCode,
      aspectRatio: bannerRes.aspectRatio,
      hasQr: false,
    };
  } catch (err) {
    console.error(`[DuplicateScan] Failed to calculate hash/metadata for ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Có ít nhất một ảnh dưới dir (đệ quy tối đa `maxDepth` cấp dưới dir).
 */
function hasAnyImageUnder(dirPath, maxDepth = 5) {
  const abs = path.resolve(dirPath);
  try {
    if (!fs.statSync(abs).isDirectory()) return false;
  } catch {
    return false;
  }
  const found = fg.sync(IMAGE_GLOB_REC, {
    cwd: abs,
    onlyFiles: true,
    dot: false,
    deep: maxDepth,
    suppressErrors: true,
  });
  return found.length > 0;
}

/**
 * Một "bucket" = một thư mục chương (hoặc thư mục chỉ chứa ảnh).
 */
function expandScanBuckets(rootPath) {
  const abs = path.resolve(String(rootPath || '').trim());
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return [];
  }
  if (!st.isDirectory()) return [];

  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }

  const imagesHere = entries.filter((e) => e.isFile() && isImageFileName(e.name));
  const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

  if (subdirs.length === 0) {
    if (imagesHere.length || hasAnyImageUnder(abs, 5)) {
      return [{ id: abs, label: path.basename(abs), dirPath: abs }];
    }
    return [];
  }

  const buckets = [];
  for (const d of subdirs) {
    const p = path.join(abs, d.name);
    if (hasAnyImageUnder(p, 5)) {
      buckets.push({
        id: p,
        label: `${path.basename(abs)}${path.sep}${d.name}`,
        dirPath: p,
      });
    }
  }
  if (buckets.length > 0) return buckets;

  if (imagesHere.length || hasAnyImageUnder(abs, 5)) {
    return [{ id: abs, label: path.basename(abs), dirPath: abs }];
  }
  return [];
}

function sha256FileStream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      fs.promises
        .stat(filePath)
        .then((st) => resolve({ digest: hash.digest('hex'), size: st.size }))
        .catch(reject);
    });
    stream.on('error', reject);
  });
}

function computeRelativePath(fullPath, fallbackName, roots, baseDir) {
  let rel = fallbackName;
  if (roots && roots.length > 1) {
    for (const root of roots) {
      try {
        const r = path.relative(root, fullPath);
        if (r && !r.startsWith('..')) {
          return path.join(path.basename(root), r);
        }
      } catch {
        // ignore
      }
    }
  } else if (baseDir) {
    try {
      const r = path.relative(baseDir, fullPath);
      if (r && !r.startsWith('..')) return r;
    } catch {
      // ignore
    }
  }
  return rel;
}

/**
 * @param {string} dirPath
 * @param {{ recursive?: boolean, maxDepth?: number, smartMode?: boolean, preGlobbedPaths?: string[] }} [opts]
 * @param {Function} [onProgress]
 */
async function findDuplicatesInDirectory(dirPath, opts = {}, onProgress = null) {
  const recursive = Boolean(opts.recursive);
  const maxDepth = Number.isFinite(opts.maxDepth) ? Math.max(1, Math.min(12, opts.maxDepth)) : 6;
  const smartMode = Boolean(opts.smartMode);

  let paths = opts.preGlobbedPaths;
  if (!paths) {
    const abs = path.resolve(dirPath);
    const patterns = recursive ? [IMAGE_GLOB_REC] : [IMAGE_GLOB];
    const deep = recursive ? maxDepth : 1;

    try {
      paths = await fg.glob(patterns, {
        cwd: abs,
        onlyFiles: true,
        absolute: true,
        dot: false,
        deep,
        suppressErrors: true,
      });
      paths = paths
        .map((p) => path.resolve(p))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch {
      return { duplicateGroups: [] };
    }
  } else {
    paths = [...paths].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const hashToFiles = new Map();
  const fileAnalysisMap = smartMode ? new Map() : null;
  const qrCacheByHash = opts.qrCacheByHash || null;
  const cancelToken = opts.cancelToken || null;
  const isScanCancelled = () => Boolean(cancelToken?.cancelled || (typeof opts.isCancelled === 'function' && opts.isCancelled()));
  const cpuCount = os.cpus()?.length || 4;
  const concurrency = Number.isFinite(opts.concurrency)
    ? Math.max(1, Math.floor(opts.concurrency))
    : cpuCount >= 2
      ? Math.max(2, Math.min(6, Math.floor(cpuCount / 2)))
      : 1;
  let processed = 0;
  const total = paths.length;
  const results = new Array(total);
  let nextIdx = 0;
  let localAborted = false;
  const workerCount = Math.min(concurrency, total);

  async function runWorker() {
    while (!localAborted && !isScanCancelled()) {
      const idx = nextIdx;
      nextIdx += 1;
      if (idx >= total) break;

      const fullPath = paths[idx];
      const isEdge = smartMode ? isEdgePage(idx, total) : false;
      const meta = await calculateImageHashAndMetadata(fullPath, { smartMode, isEdge, qrCacheByHash });
      if (localAborted || isScanCancelled()) break;

      processed += 1;
      if (onProgress) {
        try {
          onProgress(processed, total, fullPath);
        } catch (err) {
          localAborted = true;
          throw err;
        }
      }
      if (meta) {
        results[idx] = { fullPath, meta, index: idx, isEdge };
      }
      if (processed % 12 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  if (isScanCancelled()) {
    return { duplicateGroups: [], fileAnalysisMap, isCancelled: true };
  }

  for (let i = 0; i < total; i += 1) {
    const entry = results[i];
    if (!entry) continue;
    const { fullPath, meta, index, isEdge } = entry;

    if (fileAnalysisMap) {
      fileAnalysisMap.set(fullPath, { ...meta, index, totalPages: total, isEdge });
    }

    const name = path.basename(fullPath);
    if (!hashToFiles.has(meta.hash)) hashToFiles.set(meta.hash, []);
    hashToFiles.get(meta.hash).push({
      name,
      fullPath,
      sizeBytes: meta.sizeBytes,
      width: meta.width,
      height: meta.height,
    });
  }

  const duplicateGroups = [];
  for (const [h, list] of hashToFiles) {
    if (list.length > 1) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      duplicateGroups.push({
        hash: h,
        sizeBytes: list[0].sizeBytes,
        files: list.map(({ name, fullPath, sizeBytes, width, height }) => ({
          name,
          fullPath,
          sizeBytes,
          width,
          height,
        })),
      });
    }
  }
  duplicateGroups.sort((a, b) =>
    a.files[0].name.localeCompare(b.files[0].name, undefined, { numeric: true })
  );
  return { duplicateGroups, hashToFiles, fileAnalysisMap };
}

/**
 * @param {string[]} rootPaths
 * @param {{ recursive?: boolean, maxDepth?: number, smartMode?: boolean, files?: string[] }} [options]
 * @param {Function} [onProgress]
 */
async function scanDuplicateImages(rootPaths, options = {}, onProgress = null) {
  const scanToken = { cancelled: false };
  activeScanToken = scanToken;
  const isScanAborted = () =>
    Boolean(
      scanToken.cancelled ||
        options?.signal?.aborted ||
        (typeof options?.isCancelled === 'function' && options.isCancelled())
    );

  try {
    const roots = Array.isArray(rootPaths)
      ? rootPaths.map((p) => String(p || '').trim()).filter(Boolean)
      : [];
    const files = Array.isArray(options?.files)
      ? options.files.map((p) => String(p || '').trim()).filter(Boolean)
      : [];
    const smartMode = Boolean(options?.smartMode);
    const maxHammingDistance = Number.isFinite(options?.maxHammingDistance)
      ? Math.max(0, Math.min(12, Math.floor(options.maxHammingDistance)))
      : 4;

    if (!roots.length && !files.length) {
      return { ok: false, error: 'Chưa chọn thư mục hoặc tệp.', buckets: [] };
    }

    const seenBuckets = new Set();
    const buckets = [];
    const scanOpts = {
      recursive: options.recursive !== false,
      maxDepth: options.maxDepth,
      smartMode,
    };

    const bucketPaths = [];
    let globalTotal = 0;

    // 1. If explicit files are provided
    if (files.length) {
      const validFiles = files
        .filter((fp) => {
          try {
            const abs = path.resolve(fp);
            return fs.existsSync(abs) && fs.statSync(abs).isFile() && isImageFileName(abs);
          } catch {
            return false;
          }
        })
        .map((fp) => path.resolve(fp))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (validFiles.length) {
        const parentDir = path.dirname(validFiles[0]);
        bucketPaths.push({
          bucket: { id: 'selected_files', label: 'Tệp đã chọn', dirPath: parentDir },
          paths: validFiles,
        });
        globalTotal += validFiles.length;
      }
    }

    // 2. Gather all subfolders (buckets) to scan for roots (or scan root directly when recursive === false)
    const allBuckets = [];
    for (const root of roots) {
      if (isScanAborted()) break;
      if (!scanOpts.recursive) {
        const absRoot = path.resolve(String(root || '').trim());
        try {
          if (fs.statSync(absRoot).isDirectory() && !seenBuckets.has(absRoot)) {
            seenBuckets.add(absRoot);
            allBuckets.push({ id: absRoot, label: path.basename(absRoot), dirPath: absRoot });
          }
        } catch {
          // ignore invalid root
        }
        continue;
      }
      const expanded = expandScanBuckets(root);
      for (const b of expanded) {
        if (seenBuckets.has(b.id)) continue;
        seenBuckets.add(b.id);
        allBuckets.push(b);
      }
    }

    // 3. Pre-glob and numerically sort all file paths across directory buckets
    for (const b of allBuckets) {
      if (isScanAborted()) break;
      const abs = path.resolve(b.dirPath);
      const patterns = scanOpts.recursive ? [IMAGE_GLOB_REC] : [IMAGE_GLOB];
      const deep = scanOpts.recursive
        ? (Number.isFinite(scanOpts.maxDepth) ? Math.max(1, Math.min(12, scanOpts.maxDepth)) : 6)
        : 1;

      let paths = [];
      try {
        paths = await fg.glob(patterns, {
          cwd: abs,
          onlyFiles: true,
          absolute: true,
          dot: false,
          deep,
          suppressErrors: true,
        });
        paths = paths
          .map((p) => path.resolve(p))
          .sort((a, b2) => a.localeCompare(b2, undefined, { numeric: true }));
      } catch {
        paths = [];
      }
      bucketPaths.push({ bucket: b, paths });
      globalTotal += paths.length;
    }

    // 4. Scan each bucket sequentially
    let globalProcessed = 0;
    const globalHashToFiles = new Map();
    const fileToBucketId = new Map();
    const globalFileAnalysisMap = smartMode ? new Map() : null;
    const allBucketsForCreditCheck = smartMode ? [] : null;
    const qrCacheByHash = smartMode ? new Map() : null;

    for (const { bucket, paths } of bucketPaths) {
      if (isScanAborted()) break;

      const localOnProgress = (localProcessed, localTotal, currentFile) => {
        if (onProgress) {
          onProgress(globalProcessed + localProcessed, globalTotal, currentFile);
        }
      };

      const { duplicateGroups, hashToFiles, fileAnalysisMap, isCancelled: dirCancelled } = await findDuplicatesInDirectory(
        bucket.dirPath,
        { ...scanOpts, preGlobbedPaths: paths, smartMode, qrCacheByHash, cancelToken: scanToken, isCancelled: isScanAborted },
        localOnProgress
      );

      if (dirCancelled) break;

      globalProcessed += paths.length;

      if (smartMode) {
        if (fileAnalysisMap) {
          for (const [fp, meta] of fileAnalysisMap) {
            globalFileAnalysisMap.set(fp, meta);
          }
        }
        allBucketsForCreditCheck.push({
          id: bucket.id,
          images: paths.map((p, idx) => {
            const analysis = fileAnalysisMap?.get(p);
            return {
              fullPath: p,
              hash: analysis?.hash || '',
              index: idx,
              totalPages: paths.length,
              width: analysis?.width || 0,
              height: analysis?.height || 0,
              isBlank: Boolean(analysis?.isBlank),
            };
          }),
        });
      }

      if (!smartMode && duplicateGroups && duplicateGroups.length) {
        buckets.push({
          ...bucket,
          duplicateGroups,
        });
      }

      if (hashToFiles) {
        for (const [hash, fileList] of hashToFiles) {
          if (!globalHashToFiles.has(hash)) globalHashToFiles.set(hash, []);
          const globalList = globalHashToFiles.get(hash);
          for (const f of fileList) {
            globalList.push(f);
            fileToBucketId.set(f.fullPath, bucket.id);
          }
        }
      }
    }

    if (isScanAborted()) {
      return {
        ok: false,
        cancelled: true,
        smartMode,
        error: 'Đã hủy quét.',
        buckets: [],
        images: [],
        stats: { total: 0, duplicates: 0, ok: 0 },
      };
    }

  const baseDir = (files && files.length > 0)
    ? path.dirname(files[0])
    : (roots[0] || '');

  // Classic mode (smartMode = false): preserve exact legacy hash matching & stats shape
  if (!smartMode) {
    const crossBucketGroups = [];
    for (const [hash, fileList] of globalHashToFiles) {
      if (fileList.length < 2) continue;
      const bucketIds = new Set(fileList.map((f) => fileToBucketId.get(f.fullPath)));
      if (bucketIds.size < 2) continue;

      const sorted = [...fileList].sort((a, b) =>
        a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true })
      );
      crossBucketGroups.push({
        hash,
        sizeBytes: sorted[0].sizeBytes,
        files: sorted.map(({ name, fullPath, sizeBytes, width, height }) => ({
          name,
          fullPath,
          sizeBytes,
          width,
          height,
        })),
      });
    }

    if (crossBucketGroups.length > 0) {
      crossBucketGroups.sort((a, b) =>
        a.files[0].fullPath.localeCompare(b.files[0].fullPath, undefined, { numeric: true })
      );
      buckets.push({
        id: '__cross_bucket__',
        label: '⊕ Trùng giữa các chương',
        dirPath: '',
        duplicateGroups: crossBucketGroups,
      });
    }

    const allImages = [];
    let groupCounter = 0;
    for (const [hash, fileList] of globalHashToFiles) {
      const isDuplicate = fileList.length > 1;
      let currentGroupNum = null;
      if (isDuplicate) {
        groupCounter += 1;
        currentGroupNum = groupCounter;
      }
      const sortedFiles = [...fileList].sort((a, b) =>
        a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true })
      );
      sortedFiles.forEach((f, idx) => {
        const isOriginal = !isDuplicate || idx === 0;
        allImages.push({
          name: f.name,
          fullPath: f.fullPath,
          relativePath: computeRelativePath(f.fullPath, f.name, roots, baseDir),
          sizeBytes: f.sizeBytes,
          width: f.width,
          height: f.height,
          hash,
          isDuplicate,
          isOriginal,
          duplicateGroup: currentGroupNum,
          duplicateCount: fileList.length,
        });
      });
    }

    allImages.sort((a, b) => {
      if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? -1 : 1;
      if (a.duplicateGroup && b.duplicateGroup && a.duplicateGroup !== b.duplicateGroup) {
        return a.duplicateGroup - b.duplicateGroup;
      }
      return a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true });
    });

    const duplicateCopies = allImages.filter((img) => img.isDuplicate && !img.isOriginal).length;
    const uniqueCount = allImages.filter((img) => !img.isDuplicate).length;

    return {
      ok: true,
      smartMode: false,
      buckets,
      images: allImages,
      stats: {
        total: allImages.length,
        duplicates: duplicateCopies,
        ok: uniqueCount,
      },
    };
  }

  // Smart mode (smartMode = true):
  // 1. Edge credit repetition detection across chapters
  const creditPaths = detectEdgeCreditPages(allBucketsForCreditCheck);

  // 2. Partition blank items vs non-blank items so white and black blank pages never merge
  const blankItems = [];
  const nonBlankItems = [];
  for (const [hash, fileList] of globalHashToFiles) {
    for (const f of fileList) {
      const analysis = globalFileAnalysisMap.get(f.fullPath) || {};
      const record = {
        ...f,
        hash,
        isBlank: Boolean(analysis.isBlank),
        blankType: analysis.blankType,
        isBanner: Boolean(analysis.isBanner),
        bannerReasonCode: analysis.bannerReasonCode,
        aspectRatio: analysis.aspectRatio,
        hasQr: Boolean(analysis.hasQr),
        qrText: analysis.qrText,
        isDonateOrInvite: Boolean(analysis.isDonateOrInvite),
        isCredit: creditPaths.has(f.fullPath),
      };
      if (record.isBlank) {
        blankItems.push(record);
      } else {
        nonBlankItems.push(record);
      }
    }
  }

  const allImages = [];

  for (const b of blankItems) {
    allImages.push({
      name: b.name,
      fullPath: b.fullPath,
      relativePath: computeRelativePath(b.fullPath, b.name, roots, baseDir),
      sizeBytes: b.sizeBytes,
      width: b.width,
      height: b.height,
      hash: b.hash,
      isDuplicate: false,
      isOriginal: false,
      duplicateGroup: null,
      duplicateCount: 1,
      category: 'BLANK_PAGE',
      isSuggestedForTrash: true,
      details: {
        blankType: b.blankType,
      },
    });
  }

  // 3. Fuzzy clustering on non-blank items (configurable Hamming threshold & compatible aspect ratio)
  const clusters = clusterSimilarImages(nonBlankItems, { maxDistance: maxHammingDistance, maxRatioDiff: 0.35 });
  let groupCounter = 0;

  for (const cluster of clusters) {
    // Classify smart flags per item; story-eligible items form duplicate groups keeping best quality original
    const storyItems = cluster.items.filter(
      (it) => !it.hasQr && !it.isCredit && !it.isBanner
    );
    const trashItems = cluster.items.filter(
      (it) => it.hasQr || it.isCredit || it.isBanner
    );

    for (const t of trashItems) {
      const category = t.hasQr
        ? 'QR_CODE'
        : t.isCredit
          ? 'CREDIT_PAGE'
          : 'AD_BANNER';
      allImages.push({
        name: t.name,
        fullPath: t.fullPath,
        relativePath: computeRelativePath(t.fullPath, t.name, roots, baseDir),
        sizeBytes: t.sizeBytes,
        width: t.width,
        height: t.height,
        hash: t.hash,
        isDuplicate: false,
        isOriginal: false,
        duplicateGroup: null,
        duplicateCount: 1,
        category,
        isSuggestedForTrash: true,
        details: {
          bannerReasonCode: t.bannerReasonCode,
          aspectRatio: t.aspectRatio,
          qrText: t.qrText,
          isDonateOrInvite: t.isDonateOrInvite,
        },
      });
    }

    if (storyItems.length === 0) continue;

    // Pick highest resolution -> largest byte size -> lexicographical path as Original
    const sortedStory = [...storyItems].sort((a, b) => {
      const pxA = (a.width || 0) * (a.height || 0);
      const pxB = (b.width || 0) * (b.height || 0);
      if (pxB !== pxA) return pxB - pxA;
      if ((b.sizeBytes || 0) !== (a.sizeBytes || 0)) return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      return a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true });
    });

    const isDupGroup = sortedStory.length > 1;
    let groupNum = null;
    if (isDupGroup) {
      groupCounter += 1;
      groupNum = groupCounter;
    }

    sortedStory.forEach((f, idx) => {
      const isOriginal = !isDupGroup || idx === 0;
      allImages.push({
        name: f.name,
        fullPath: f.fullPath,
        relativePath: computeRelativePath(f.fullPath, f.name, roots, baseDir),
        sizeBytes: f.sizeBytes,
        width: f.width,
        height: f.height,
        hash: f.hash,
        isDuplicate: isDupGroup,
        isOriginal,
        duplicateGroup: groupNum,
        duplicateCount: sortedStory.length,
        matchType: isDupGroup ? cluster.matchType : undefined,
        category: isDupGroup ? 'DUPLICATE' : 'OK',
        isSuggestedForTrash: isDupGroup && idx > 0,
        details: {},
      });
    });
  }

  allImages.sort((a, b) => {
    if (a.isSuggestedForTrash !== b.isSuggestedForTrash) return a.isSuggestedForTrash ? -1 : 1;
    if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? -1 : 1;
    if (a.duplicateGroup && b.duplicateGroup && a.duplicateGroup !== b.duplicateGroup) {
      return a.duplicateGroup - b.duplicateGroup;
    }
    return a.fullPath.localeCompare(b.fullPath, undefined, { numeric: true });
  });

  const duplicateCopies = allImages.filter((img) => img.isDuplicate && !img.isOriginal).length;
  const blanksCount = allImages.filter((img) => img.category === 'BLANK_PAGE').length;
  const qrCount = allImages.filter((img) => img.category === 'QR_CODE').length;
  const creditsCount = allImages.filter((img) => img.category === 'CREDIT_PAGE').length;
  const bannersCount = allImages.filter((img) => img.category === 'AD_BANNER').length;
  const okCount = allImages.filter((img) => img.category === 'OK').length;
  const smartTrashCount = blanksCount + qrCount + creditsCount + bannersCount;

  return {
    ok: true,
    smartMode: true,
    buckets,
    images: allImages,
    stats: {
      total: allImages.length,
      duplicates: duplicateCopies,
      ok: okCount,
      blanks: blanksCount,
      qrCodes: qrCount,
      credits: creditsCount,
      banners: bannersCount,
      smartTrash: smartTrashCount,
    },
  };
  } finally {
    if (activeScanToken === scanToken) {
      activeScanToken = null;
    }
  }
}

function isPathUnderAllowedRoots(filePath, allowedRoots) {
  const resolved = path.resolve(filePath);
  const isWin = process.platform === 'win32';
  const resolvedNorm = isWin ? resolved.toLowerCase() : resolved;
  for (const root of allowedRoots) {
    const r = path.resolve(String(root || '').trim());
    const rNorm = isWin ? r.toLowerCase() : r;
    if (resolvedNorm === rNorm) return true;
    const rel = path.relative(rNorm, resolvedNorm);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/**
 * Chuyển file vào Thùng rác (Recycle Bin) — không xóa vĩnh viễn nếu hỗ trợ.
 * Nếu shell.trashItem thất bại, tự động fallback xóa file an toàn bằng fs.promises.unlink.
 */
async function deleteFilesUnderRoots(pathsToDelete, allowedRoots) {
  const { shell } = require('electron');
  const roots = (allowedRoots || []).map((p) => path.resolve(String(p || '').trim())).filter(Boolean);
  const deleted = [];
  const errors = [];

  for (const p of pathsToDelete) {
    const full = path.resolve(String(p || '').trim());
    if (!isPathUnderAllowedRoots(full, roots)) {
      errors.push({ path: full, error: 'Không nằm trong thư mục đã quét.' });
      continue;
    }
    try {
      await shell.trashItem(full);
      deleted.push(full);
    } catch (trashErr) {
      try {
        await fs.promises.unlink(full);
        deleted.push(full);
      } catch (unlinkErr) {
        errors.push({
          path: full,
          error: trashErr?.message || unlinkErr?.message || String(trashErr || unlinkErr),
        });
      }
    }
  }

  return { deleted, errors };
}

/**
 * Liệt kê nhanh danh sách ảnh đã nạp khi chọn thư mục hoặc files (không tính hash).
 */
async function listImportedImages({ sourceDir, folders, sourceFiles, includeSubfolders = true } = {}) {
  const files = [];
  const seenPaths = new Set();

  if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
    for (const fp of sourceFiles) {
      if (!isImageFileName(fp)) continue;
      try {
        const fullPath = path.resolve(String(fp || '').trim());
        if (seenPaths.has(fullPath)) continue;
        seenPaths.add(fullPath);
        const st = fs.statSync(fullPath);
        if (st.isFile()) {
          files.push({
            name: path.basename(fullPath),
            fullPath,
            relativePath: path.basename(fullPath),
            sizeBytes: st.size,
          });
        }
      } catch {
        // ignore
      }
    }
  } else {
    const dirs = [];
    if (Array.isArray(folders) && folders.length > 0) {
      dirs.push(...folders);
    } else if (sourceDir && typeof sourceDir === 'string') {
      dirs.push(sourceDir);
    }

    const pattern = includeSubfolders ? IMAGE_GLOB_REC : IMAGE_GLOB;
    const isMultiRoot = dirs.length > 1;

    for (const dir of dirs) {
      const root = path.resolve(String(dir || '').trim());
      if (!fs.existsSync(root)) continue;
      const rootBaseName = path.basename(root);
      const entries = await fg(pattern, {
        cwd: root,
        onlyFiles: true,
        absolute: true,
        deep: includeSubfolders ? 8 : 1,
      });
      for (const entry of entries) {
        try {
          const fullPath = path.resolve(entry);
          if (seenPaths.has(fullPath)) continue;
          seenPaths.add(fullPath);

          const st = fs.statSync(fullPath);
          let rel = path.basename(fullPath);
          try {
            const r = path.relative(root, fullPath);
            if (r && !r.startsWith('..')) {
              rel = isMultiRoot ? path.join(rootBaseName, r) : r;
            }
          } catch {
            // ignore
          }
          files.push({
            name: path.basename(fullPath),
            fullPath,
            relativePath: rel,
            sizeBytes: st.size,
          });
        } catch {
          // ignore
        }
      }
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));

  return {
    ok: true,
    files,
    total: files.length,
  };
}

module.exports = {
  expandScanBuckets,
  findDuplicatesInDirectory,
  scanDuplicateImages,
  listImportedImages,
  cancelScan,
  isPathUnderAllowedRoots,
  deleteFilesUnderRoots,
  isImageFileName,
};
