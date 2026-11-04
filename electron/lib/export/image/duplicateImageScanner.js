/**
 * Quét ảnh trùng nội dung (SHA-256) trong thư mục chương / manga.
 * Dùng fast-glob để không bỏ sót ảnh trong thư mục con (trước đây chỉ đếm 1 cấp → “không chạy” / không có kết quả).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fg = require('fast-glob');
const { getSharp } = require('../../shared/checkSharp');

let isCancelled = false;

function cancelScan() {
  isCancelled = true;
}

const IMAGE_GLOB = '*.{jpg,jpeg,png,webp,gif,avif}';
const IMAGE_GLOB_REC = '**/*.{jpg,jpeg,png,webp,gif,avif}';

function isImageFileName(name) {
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(name);
}

/**
 * Tính dHash 8x8 (chuỗi 64 bit) để tìm ảnh giống nhau về nội dung
 * Thay vì dùng SHA-256 dễ bị lệch khi sai định dạng hoặc resize
 */
async function calculateImageHashAndMetadata(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) return null;
    
    // Đọc buffer trước để tránh sharp memory-map và lock file trên Windows,
    // gây lỗi không thể chuyển file vào thùng rác sau khi quét.
    const fileBuffer = await fs.promises.readFile(filePath);

    const sharp = getSharp();
    if (sharp) {
      try {
        // Resize về 9x8 grayscale để tính dHash
        const { data } = await sharp(fileBuffer)
          .resize(9, 8, { fit: 'fill' })
          .grayscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
          
        // Tính dHash: so sánh pixel kế tiếp trên mỗi hàng
        let hash = '';
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const left = data[y * 9 + x];
            const right = data[y * 9 + x + 1];
            hash += (left < right) ? '1' : '0';
          }
        }
        
        // Lấy metadata gốc
        const metadata = await sharp(fileBuffer).metadata();
        
        return {
          hash,
          width: metadata.width || 0,
          height: metadata.height || 0,
          sizeBytes: stat.size
        };
      } catch (err) {
        console.warn(`[DuplicateScan] Sharp failed to process ${filePath}, trying Jimp fallback:`, err.message);
      }
    }

    // Fallback sang Jimp
    const Jimp = require('jimp');
    const image = await Jimp.read(fileBuffer);
    
    // Lấy metadata gốc trước khi resize
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Resize về 9x8 và chuyển thành grayscale để tính dHash
    image.resize(9, 8).greyscale();
    
    const data = image.bitmap.data;
    let hash = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        // Jimp data lưu dạng RGBA, do đã greyscale nên kênh R, G, B như nhau, lấy kênh R (offset = 0)
        const left = data[(y * 9 + x) * 4];
        const right = data[(y * 9 + x + 1) * 4];
        hash += (left < right) ? '1' : '0';
      }
    }
    
    return {
      hash,
      width: width || 0,
      height: height || 0,
      sizeBytes: stat.size
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

/**
 * @param {string} dirPath
 * @param {{ recursive?: boolean, maxDepth?: number }} [opts]
 * @param {Function} [onProgress]
 */
async function findDuplicatesInDirectory(dirPath, opts = {}, onProgress = null) {
  const recursive = Boolean(opts.recursive);
  const maxDepth = Number.isFinite(opts.maxDepth) ? Math.max(1, Math.min(12, opts.maxDepth)) : 6;

  let paths = opts.preGlobbedPaths;
  if (!paths) {
    const abs = path.resolve(dirPath);
    let patterns;
    let deep;
    if (recursive) {
      patterns = [IMAGE_GLOB_REC];
      deep = maxDepth;
    } else {
      patterns = [IMAGE_GLOB];
      deep = 1;
    }

    try {
      paths = await fg.glob(patterns, {
        cwd: abs,
        onlyFiles: true,
        absolute: true,
        dot: false,
        deep,
        suppressErrors: true,
      });
      paths = paths.map((p) => path.resolve(p));
    } catch {
      return { duplicateGroups: [] };
    }
  }

  const hashToFiles = new Map();
  let processed = 0;
  const total = paths.length;

  for (const fullPath of paths) {
    if (isCancelled) {
      return { duplicateGroups: [], isCancelled: true };
    }
    const meta = await calculateImageHashAndMetadata(fullPath);
    processed += 1;
    if (onProgress) {
      onProgress(processed, total, fullPath);
    }

    if (!meta) continue;

    const name = path.basename(fullPath);
    if (!hashToFiles.has(meta.hash)) hashToFiles.set(meta.hash, []);
    hashToFiles.get(meta.hash).push({ 
      name, 
      fullPath, 
      sizeBytes: meta.sizeBytes,
      width: meta.width,
      height: meta.height
    });

    if (processed % 8 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  const duplicateGroups = [];
  for (const [h, list] of hashToFiles) {
    if (list.length > 1) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      duplicateGroups.push({
        hash: h,
        sizeBytes: list[0].sizeBytes, // Keep for backward compatibility
        files: list.map(({ name, fullPath, sizeBytes, width, height }) => ({ name, fullPath, sizeBytes, width, height })),
      });
    }
  }
  duplicateGroups.sort((a, b) =>
    a.files[0].name.localeCompare(b.files[0].name, undefined, { numeric: true })
  );
  return { duplicateGroups, hashToFiles };
}

/**
 * @param {string[]} rootPaths
 * @param {{ recursive?: boolean, maxDepth?: number }} [options]
 * @param {Function} [onProgress]
 */
async function scanDuplicateImages(rootPaths, options = {}, onProgress = null) {
  isCancelled = false; // Reset when starting a new scan
  const roots = Array.isArray(rootPaths)
    ? rootPaths.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const files = Array.isArray(options?.files)
    ? options.files.map((p) => String(p || '').trim()).filter(Boolean)
    : [];

  if (!roots.length && !files.length) {
    return { ok: false, error: 'Chưa chọn thư mục hoặc tệp.', buckets: [] };
  }

  const seenBuckets = new Set();
  const buckets = [];
  const scanOpts = {
    recursive: options.recursive !== false,
    maxDepth: options.maxDepth,
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
      .map((fp) => path.resolve(fp));

    if (validFiles.length) {
      const parentDir = path.dirname(validFiles[0]);
      bucketPaths.push({
        bucket: { id: 'selected_files', label: 'Tệp đã chọn', dirPath: parentDir },
        paths: validFiles,
      });
      globalTotal += validFiles.length;
    }
  }

  // 2. Gather all subfolders (buckets) to scan for roots
  const allBuckets = [];
  for (const root of roots) {
    const expanded = expandScanBuckets(root);
    for (const b of expanded) {
      if (seenBuckets.has(b.id)) continue;
      seenBuckets.add(b.id);
      allBuckets.push(b);
    }
  }

  // 3. Pre-glob to find all file paths and total count across all directory buckets
  for (const b of allBuckets) {
    const abs = path.resolve(b.dirPath);
    let patterns;
    let deep;
    if (scanOpts.recursive) {
      patterns = [IMAGE_GLOB_REC];
      deep = Number.isFinite(scanOpts.maxDepth) ? Math.max(1, Math.min(12, scanOpts.maxDepth)) : 6;
    } else {
      patterns = [IMAGE_GLOB];
      deep = 1;
    }

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
      paths = paths.map((p) => path.resolve(p));
    } catch {
      paths = [];
    }
    bucketPaths.push({ bucket: b, paths });
    globalTotal += paths.length;
  }

  // 3. Scan each bucket sequentially, collecting all hashes globally
  let globalProcessed = 0;
  /** @type {Map<string, Array<{name: string, fullPath: string, sizeBytes: number, width: number, height: number}>>} */
  const globalHashToFiles = new Map();
  /** Track which bucket each file belongs to for cross-bucket detection */
  const fileToBucketId = new Map();

  for (const { bucket, paths } of bucketPaths) {
    if (isCancelled) break;

    const localOnProgress = (localProcessed, localTotal, currentFile) => {
      if (onProgress) {
        onProgress(globalProcessed + localProcessed, globalTotal, currentFile);
      }
    };

    const { duplicateGroups, hashToFiles, isCancelled: dirCancelled } = await findDuplicatesInDirectory(
      bucket.dirPath,
      { ...scanOpts, preGlobbedPaths: paths },
      localOnProgress
    );

    if (dirCancelled) break;

    globalProcessed += paths.length;

    // Collect per-bucket duplicates
    if (duplicateGroups && duplicateGroups.length) {
      buckets.push({
        ...bucket,
        duplicateGroups,
      });
    }

    // Merge this bucket's hashes into the global map
    if (hashToFiles) {
      for (const [hash, files] of hashToFiles) {
        if (!globalHashToFiles.has(hash)) globalHashToFiles.set(hash, []);
        const globalList = globalHashToFiles.get(hash);
        for (const f of files) {
          globalList.push(f);
          fileToBucketId.set(f.fullPath, bucket.id);
        }
      }
    }
  }

  if (isCancelled) {
    return { ok: false, error: 'Đã hủy quét.', buckets: [], images: [], stats: { total: 0, duplicates: 0, ok: 0 } };
  }

  // 4. Cross-bucket duplicate detection
  const crossBucketGroups = [];
  for (const [hash, files] of globalHashToFiles) {
    if (files.length < 2) continue;
    // Check if files span multiple buckets
    const bucketIds = new Set(files.map((f) => fileToBucketId.get(f.fullPath)));
    if (bucketIds.size < 2) continue;
    // This group has files from ≥2 different buckets

    // Exclude files that are already reported as intra-bucket duplicates
    // (only include files that are unique within their own bucket but duplicate across buckets)
    const intraBucketDupPaths = new Set();
    for (const b of buckets) {
      for (const g of b.duplicateGroups || []) {
        if (g.hash === hash) {
          for (const f of g.files) intraBucketDupPaths.add(f.fullPath);
        }
      }
    }

    // Keep all files for the cross-bucket group (including intra-bucket ones for complete view)
    const sorted = [...files].sort((a, b) =>
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

  // 5. Build allImages list for unified Tools Studio image list layout
  const baseDir = (files && files.length > 0)
    ? path.dirname(files[0])
    : (roots[0] || '');

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
      let rel = f.name;
      if (roots && roots.length > 1) {
        for (const root of roots) {
          try {
            const r = path.relative(root, f.fullPath);
            if (r && !r.startsWith('..')) {
              rel = path.join(path.basename(root), r);
              break;
            }
          } catch {}
        }
      } else if (baseDir) {
        try {
          const r = path.relative(baseDir, f.fullPath);
          if (r && !r.startsWith('..')) rel = r;
        } catch {}
      }
      allImages.push({
        name: f.name,
        fullPath: f.fullPath,
        relativePath: rel,
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
    buckets,
    images: allImages,
    stats: {
      total: allImages.length,
      duplicates: duplicateCopies,
      ok: uniqueCount,
    },
  };
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
 * Nếu shell.trashItem thất bại (ví dụ ổ đĩa ngoài, USB, exFAT/FAT32 hoặc ổ mạng trên Windows
 * không hỗ trợ Recycle Bin), tự động fallback xóa file an toàn bằng fs.promises.unlink.
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
      // Fallback khi shell.trashItem thất bại (ví dụ: ổ đĩa ngoài / USB không hỗ trợ Recycle Bin trên Windows)
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
 * Liệt kê nhanh danh sách ảnh đã nạp khi chọn thư mục hoặc files (không tính hash, cực nhanh).
 * Hỗ trợ cả 1 thư mục (sourceDir) hoặc nhiều thư mục (folders).
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
      } catch {}
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
          } catch {}
          files.push({
            name: path.basename(fullPath),
            fullPath,
            relativePath: rel,
            sizeBytes: st.size,
          });
        } catch {}
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
