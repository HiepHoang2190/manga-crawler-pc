const fs = require('fs');
const path = require('path');
const os = require('os');
const { finished } = require('stream/promises');
const archiver = require('archiver');
const { resolveChapterDir, resolveMangaDir } = require('../download/connector/connectorPathUtils');
const { listChapterImageFiles, IMAGE_EXT } = require('../library/listChapterImageFiles');
const {
  formatFolderName,
  formatChapterTitle,
  isFlatChapterLayout,
  getFlatChapterImageNamePrefix,
  formatChapterPageFileName,
  sortChaptersForExport,
  formatExportZipChapterFolderName,
} = require('../shared/mangaUtils');
const { processImageForDoublePageRotation, processRotateDoublePage } = require('./image/rotateDoublePage');

const MAX_CBZ_BASENAME = 180;

/**
 * @param {string[]} parts
 * @returns {string}
 */
function zipEntryName(...parts) {
  return parts
    .filter((p) => p != null && String(p).trim() !== '')
    .map((p) => String(p).replace(/\\/g, '/'))
    .join('/');
}

/**
 * Tên file .cbz cho một phần khi chia theo dung lượng (Part 01, 02, …).
 * @param {string} mangaTitle
 * @param {number} partIndex1Based
 * @param {number} totalParts
 * @returns {string}
 */
function safePartCbzBaseName(mangaTitle, partIndex1Based, totalParts) {
  const m = formatFolderName(mangaTitle, MAX_CBZ_BASENAME).trim() || 'Manga';
  const width = Math.max(2, String(totalParts).length);
  const part = String(partIndex1Based).padStart(width, '0');
  const joined = `${m} - Part ${part}`;
  return formatFolderName(joined, MAX_CBZ_BASENAME) || `Part-${part}`;
}

/**
 * @param {string} mangaDirResolved
 * @param {string} chapterDirResolved
 */
function assertChapterDirUnderManga(mangaDirResolved, chapterDirResolved) {
  const rel = path.relative(mangaDirResolved, chapterDirResolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Đường dẫn chương không hợp lệ.');
  }
}



/**
 * Tạo thư mục tạm để xử lý ảnh (xoay trang đôi).
 * @returns {string}
 */
function createTempProcessingDir() {
  const tempRoot = path.join(os.tmpdir(), 'manga-cbz-rotate');
  if (!fs.existsSync(tempRoot)) {
    fs.mkdirSync(tempRoot, { recursive: true });
  }
  const uniqueDir = path.join(tempRoot, `process-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  fs.mkdirSync(uniqueDir, { recursive: true });
  return uniqueDir;
}

/**
 * Dọn dẹp thư mục tạm.
 * @param {string} dir
 */
function cleanupTempDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * @param {string} outPath
 * @param {(archive: any) => void} feedArchive
 */
async function runArchiveToFile(outPath, feedArchive) {
  const output = fs.createWriteStream(outPath);
  const archive = archiver('zip');
  archive.on('error', (err) => {
    output.destroy(err);
  });
  archive.pipe(output);
  feedArchive(archive);
  await archive.finalize();
  await finished(output);
}

/**
 * Collect image files from a chapter directory.
 * If flatten=true, recurse into subdirs and natural-sort all images (flat list).
 * Otherwise only read flat files at root level (existing behavior).
 *
 * @param {string} chapterDir
 * @param {boolean} flatten
 * @returns {string[]} — relative paths from chapterDir
 */
function collectChapterImages(chapterDir, flatten, listOptions = {}) {
  if (!flatten) {
    const result = listChapterImageFiles(chapterDir, listOptions);
    if (result.ok && result.files && result.files.length > 0) {
      return result.files;
    }
  }

  function recurse(dir, base) {
    const results = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return results; }
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        results.push(...recurse(path.join(dir, e.name), rel));
      } else if (IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
        results.push(rel);
      }
    }
    return results;
  }

  const allFiles = recurse(chapterDir, '');
  allFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return allFiles;
}

/**
 * Check which chapters have images inside subdirectories.
 * Returns list of chapter titles that have subfolder images.
 *
 * @param {string} baseSaveDir
 * @param {string} mangaTitle
 * @param {Array<{title: string}>} chapters
 * @param {object} chapterFolderFormat
 * @returns {string[]}
 */
function checkChaptersWithSubfolderImages(baseSaveDir, mangaTitle, chapters, chapterFolderFormat) {
  if (isFlatChapterLayout(chapterFolderFormat)) return [];
  const affected = [];
  for (const ch of chapters) {
    const ct = String(ch.title || '').trim();
    if (!ct) continue;
    const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, ct, chapterFolderFormat);
    let entries;
    try { entries = fs.readdirSync(chapterDir, { withFileTypes: true }); } catch (_) { continue; }
    const hasSubImages = entries.some((e) => {
      if (!e.isDirectory()) return false;
      try {
        const sub = fs.readdirSync(path.join(chapterDir, e.name));
        return sub.some((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
      } catch (_) { return false; }
    });
    if (hasSubImages) affected.push(ct);
  }
  return affected;
}


/**
 * Chia danh sách ảnh đã xử lý thành các phần theo maxBytes, không cắt giữa chương
 * (mọi ảnh cùng zipFolder luôn nằm trong cùng một file CBZ).
 *
 * @param {Array<{ zipFolder: string, sz: number, globalIdx: number }>} processedItems
 * @param {number} maxBytes
 * @returns {Array<Array<object>>}
 */
function segmentProcessedItemsByMaxBytesWithoutSplittingChapters(processedItems, maxBytes) {
  /** @type {Array<Array<object>>} */
  const chapterGroups = [];
  let currentGroup = null;

  for (let gi = 0; gi < processedItems.length; gi += 1) {
    const item = processedItems[gi];
    const key = String(item.zipFolder || item.title || '').trim() || `__item_${gi}`;
    if (!currentGroup || currentGroup.key !== key) {
      currentGroup = { key, items: [] };
      chapterGroups.push(currentGroup);
    }
    currentGroup.items.push({ ...item, globalIdx: gi });
  }

  const segments = [];
  let current = [];
  let currentSize = 0;
  const flush = () => {
    if (current.length) {
      segments.push(current);
      current = [];
      currentSize = 0;
    }
  };

  for (const group of chapterGroups) {
    const groupItems = group.items;
    const groupSize = groupItems.reduce((sum, it) => sum + Number(it.sz) || 0, 0);

    if (groupSize > maxBytes) {
      flush();
      segments.push(groupItems);
      continue;
    }

    if (current.length > 0 && currentSize + groupSize > maxBytes) {
      flush();
    }

    current.push(...groupItems);
    currentSize += groupSize;
  }
  flush();

  return segments;
}

/**
 * Gom danh sách ảnh cần đóng gói theo thứ tự chương (dùng cho export và ước tính).
 * @param {object} opts
 * @returns {{ mangaResolved: string, mangaTitle: string, allItems: Array<object> }}
 */
function collectChapterExportItems(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const sortedChapters = sortChaptersForExport(opts.chapters);
  const chapterFolderFormat = opts.chapterFolderFormat || {};
  const flatten = Boolean(opts.flattenSubfolders);
  const absDir = String(opts.absoluteMangaDir || '').trim();
  const mangaDir = absDir ? path.resolve(absDir) : resolveMangaDir(base, mt);
  const mangaResolved = path.resolve(mangaDir);

  /** @type {Array<{ full: string, title: string, zipFolder: string, baseName: string, ext: string }>} */
  const allItems = [];
  const usedFolderNames = new Set();

  for (let ci = 0; ci < sortedChapters.length; ci += 1) {
    const ch = sortedChapters[ci];
    const ct = String(ch.title || '').trim();
    if (!ct) continue;
    const fb = String(ch.folderBasename || '').trim();
    const chapterDir = fb
      ? path.join(mangaResolved, fb)
      : resolveChapterDir(base, mt, ct, chapterFolderFormat);
    assertChapterDirUnderManga(mangaResolved, path.resolve(chapterDir));
    const listOptions =
      isFlatChapterLayout(chapterFolderFormat) && !fb
        ? { namePrefix: getFlatChapterImageNamePrefix(ct, chapterFolderFormat) }
        : {};
    const files = collectChapterImages(chapterDir, flatten, listOptions);
    if (!files.length) throw new Error(`Không có ảnh trong chương: ${ct}`);

    let folderName = formatExportZipChapterFolderName(
      ct,
      ci + 1,
      sortedChapters.length,
      chapterFolderFormat,
    );
    let unique = folderName;
    let n = 2;
    while (usedFolderNames.has(unique)) {
      unique = `${folderName}_${n}`;
      n += 1;
    }
    usedFolderNames.add(unique);

    for (let pageIdx = 0; pageIdx < files.length; pageIdx += 1) {
      const name = files[pageIdx];
      if (path.basename(name).includes('..')) continue;
      const extRaw = path.extname(name).slice(1).toLowerCase() || 'jpg';
      const zipBaseName = flatten
        ? path.basename(name)
        : formatChapterPageFileName(ct, pageIdx + 1, extRaw, chapterFolderFormat);
      allItems.push({
        full: path.join(chapterDir, name),
        title: ct,
        zipFolder: unique,
        baseName: zipBaseName,
        ext: path.extname(zipBaseName).toLowerCase() || `.${extRaw}`,
      });
    }
  }

  return { mangaResolved, mangaTitle: mt, allItems };
}

/**
 * Ước tính chia file CBZ theo dung lượng (không xoay ảnh / không ghi file).
 * @param {object} opts — giống exportSizeSplitCbz (không cần outputDir)
 * @returns {{ ok: true, totalBytes: number, selectedChapterCount: number, partCount: number, oversizedChapterTitles: string[], parts: Array<{ index: number, chapterCount: number, approxBytes: number, chapterTitles: string[] }> }}
 */
function estimateSizeSplitCbzExport(opts) {
  const maxBytes = Number(opts.maxBytes);
  if (!Number.isFinite(maxBytes) || maxBytes < 1024 * 1024) {
    throw new Error('Giới hạn dung lượng mỗi file không hợp lệ (tối thiểu 1 MB).');
  }

  const { allItems } = collectChapterExportItems(opts);
  if (!allItems.length) throw new Error('Không có ảnh để đóng gói.');

  const sizedItems = [];
  for (let gi = 0; gi < allItems.length; gi += 1) {
    const item = allItems[gi];
    let st;
    try {
      st = fs.statSync(item.full);
    } catch (e) {
      throw new Error(`Không đọc được file: ${item.baseName} (${String(e?.message || e)})`);
    }
    sizedItems.push({ ...item, sz: st.size, globalIdx: gi });
  }

  const segments = segmentProcessedItemsByMaxBytesWithoutSplittingChapters(sizedItems, maxBytes);
  const totalBytes = sizedItems.reduce((sum, item) => sum + item.sz, 0);

  const chapterSizes = new Map();
  for (const item of sizedItems) {
    chapterSizes.set(item.zipFolder, (chapterSizes.get(item.zipFolder) || 0) + item.sz);
  }

  const oversizedChapterTitles = [];
  const seenZipFolders = new Set();
  for (const item of sizedItems) {
    if (seenZipFolders.has(item.zipFolder)) continue;
    seenZipFolders.add(item.zipFolder);
    if ((chapterSizes.get(item.zipFolder) || 0) > maxBytes) {
      oversizedChapterTitles.push(item.title);
    }
  }

  const parts = segments.map((seg, idx) => {
    const bytes = seg.reduce((sum, item) => sum + item.sz, 0);
    const titles = [];
    const seen = new Set();
    for (const it of seg) {
      if (seen.has(it.zipFolder)) continue;
      seen.add(it.zipFolder);
      titles.push(it.title);
    }
    return { index: idx + 1, chapterCount: titles.length, approxBytes: bytes, chapterTitles: titles };
  });

  return {
    ok: true,
    totalBytes,
    selectedChapterCount: seenZipFolders.size,
    partCount: segments.length,
    oversizedChapterTitles,
    parts,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{ title: string }>} opts.chapters
 * @param {string} opts.outputDir
 * @param {number} opts.maxBytes
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {(p: { done: number, total: number, label: string }) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportSizeSplitCbz(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const chapters = Array.isArray(opts.chapters) ? opts.chapters : [];
  const outputDir = String(opts.outputDir || '').trim();
  const chapterFolderFormat = opts.chapterFolderFormat;
  const onProgress = opts.onProgress;
  const maxBytes = Number(opts.maxBytes);
  const flatten = Boolean(opts.flattenSubfolders);
  const rotateDoublePage = Boolean(opts.rotateDoublePage);
  const rotateThreshold = opts.rotateThreshold || 1.2;
  
  if (!Number.isFinite(maxBytes) || maxBytes < 1024 * 1024) {
    throw new Error('Giới hạn dung lượng mỗi file không hợp lệ (tối thiểu 1 MB).');
  }

  const { mangaTitle: mtResolved, allItems } = collectChapterExportItems({
    baseSaveDir: base,
    mangaTitle: mt,
    chapters,
    chapterFolderFormat,
    flattenSubfolders: flatten,
    absoluteMangaDir: opts.absoluteMangaDir,
  });
  if (!allItems.length) throw new Error('Không có ảnh để đóng gói.');

  // Xử lý xoay trang đôi nếu được bật
  const { processedItems, tempDir } = await processRotateDoublePage(allItems, rotateDoublePage, rotateThreshold, onProgress);

  // Compute global pad width for flatten mode
  const globalPadWidth = String(processedItems.length).length;

  const sizedItems = [];
  for (let gi = 0; gi < processedItems.length; gi += 1) {
    const item = processedItems[gi];
    let st;
    try {
      st = fs.statSync(item.full);
    } catch (e) {
      throw new Error(`Không đọc được file: ${item.baseName} (${String(e?.message || e)})`);
    }
    sizedItems.push({ ...item, sz: st.size, globalIdx: gi });
  }

  const segments = segmentProcessedItemsByMaxBytesWithoutSplittingChapters(sizedItems, maxBytes);

  const totalParts = segments.length;
  const totalFiles = processedItems.length;
  const outputFiles = [];
  let done = 0;
  onProgress?.({ done: 0, total: totalFiles, label: '' });

  try {
    for (let i = 0; i < segments.length; i += 1) {
      const part = segments[i];
      const fileBase = `${safePartCbzBaseName(mtResolved, i + 1, totalParts)}.cbz`;
      const outPath = path.join(outputDir, fileBase);

      // For flatten: re-number within this part (1-based, padded to part size)
      const partPadWidth = flatten ? String(part.length).length : 0;

      await runArchiveToFile(outPath, (archive) => {
        part.forEach((item, localIdx) => {
          // Verify file exists before adding to archive
          if (!fs.existsSync(item.full)) {
            console.error(`[ExportCBZ] File not found: ${item.full}`);
            return;
          }
          const entryName = flatten
            ? String(localIdx + 1).padStart(partPadWidth, '0') + item.ext
            : zipEntryName(item.zipFolder, item.baseName);
          archive.file(item.full, { name: entryName, store: true });
          done += 1;
          onProgress?.({ done, total: totalFiles, label: item.title });
        });
      });
      outputFiles.push(outPath);
    }
  } finally {
    // Dọn dẹp thư mục tạm
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }

  return outputFiles;
}

/**
 * @param {object} opts
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{ title: string }>} opts.chapters
 * @param {string} opts.outputFile
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {(p: { done: number, total: number, label: string }) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportSingleVolumeCbz(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const outputFile = String(opts.outputFile || '').trim();
  const chapterFolderFormat = opts.chapterFolderFormat;
  const onProgress = opts.onProgress;
  const flatten = Boolean(opts.flattenSubfolders);
  const rotateDoublePage = Boolean(opts.rotateDoublePage);
  const rotateThreshold = opts.rotateThreshold || 1.2;

  const { allItems } = collectChapterExportItems({
    baseSaveDir: base,
    mangaTitle: mt,
    chapters: opts.chapters,
    chapterFolderFormat,
    flattenSubfolders: flatten,
    absoluteMangaDir: opts.absoluteMangaDir,
  });
  if (!allItems.length) throw new Error('Không có ảnh để đóng gói.');

  // Xử lý xoay trang đôi nếu được bật
  const { processedItems, tempDir } = await processRotateDoublePage(allItems, rotateDoublePage, rotateThreshold, onProgress);

  const total = processedItems.length;
  const padWidth = flatten ? String(total).length : 0;
  let done = 0;
  onProgress?.({ done: 0, total, label: '' });

  try {
    await runArchiveToFile(outputFile, (archive) => {
      processedItems.forEach((item, idx) => {
        // Verify file exists before adding to archive
        if (!fs.existsSync(item.full)) {
          console.error(`[ExportCBZ] File not found: ${item.full}`);
          return;
        }
        // flatten: root-level sequential numbering, no subfolder
        const entryName = flatten
          ? String(idx + 1).padStart(padWidth, '0') + item.ext
          : zipEntryName(item.zipFolder, item.baseName);
        archive.file(item.full, { name: entryName, store: true });
        done += 1;
        onProgress?.({ done, total, label: item.title });
      });
    });
  } finally {
    // Dọn dẹp thư mục tạm
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }

  return [outputFile];
}

/**
 * @param {object} opts
 * @param {'sizeSplit'|'singleVolume'} opts.mode
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{ title: string }>} opts.chapters
 * @param {string} [opts.outputDir]
 * @param {string} [opts.outputFile]
 * @param {number} [opts.maxBytes]
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {(p: { done: number, total: number, label: string }) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportChaptersToCbz(opts) {
  const mode = opts.mode;
  if (mode === 'sizeSplit') {
    const outputDir = String(opts.outputDir || '').trim();
    if (!outputDir) throw new Error('Thiếu thư mục đích.');
    return exportSizeSplitCbz({
      baseSaveDir: opts.baseSaveDir,
      mangaTitle: opts.mangaTitle,
      chapters: opts.chapters,
      outputDir,
      maxBytes: opts.maxBytes,
      chapterFolderFormat: opts.chapterFolderFormat,
      flattenSubfolders: opts.flattenSubfolders,
      rotateDoublePage: opts.rotateDoublePage,
      rotateThreshold: opts.rotateThreshold,
      onProgress: opts.onProgress,
      absoluteMangaDir: opts.absoluteMangaDir,
    });
  }
  if (mode === 'singleVolume') {
    const outputFile = String(opts.outputFile || '').trim();
    if (!outputFile) throw new Error('Thiếu đường dẫn file .cbz.');
    return exportSingleVolumeCbz({
      baseSaveDir: opts.baseSaveDir,
      mangaTitle: opts.mangaTitle,
      chapters: opts.chapters,
      outputFile,
      chapterFolderFormat: opts.chapterFolderFormat,
      flattenSubfolders: opts.flattenSubfolders,
      rotateDoublePage: opts.rotateDoublePage,
      rotateThreshold: opts.rotateThreshold,
      onProgress: opts.onProgress,
      absoluteMangaDir: opts.absoluteMangaDir,
    });
  }
  throw new Error('Chế độ xuất không hợp lệ.');
}

module.exports = {
  exportChaptersToCbz,
  checkChaptersWithSubfolderImages,
  collectChapterExportItems,
  collectChapterImages,
  estimateSizeSplitCbzExport,
  segmentProcessedItemsByMaxBytesWithoutSplittingChapters,
  safePartCbzBaseName,
  zipEntryName,
};
