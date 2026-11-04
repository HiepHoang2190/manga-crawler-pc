const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveChapterDir, resolveMangaDir } = require('../download/connector/connectorPathUtils');
const { listChapterImageFiles, IMAGE_EXT } = require('../library/listChapterImageFiles');
const {
  formatFolderName,
  formatChapterTitle,
  isFlatChapterLayout,
  getFlatChapterImageNamePrefix,
  sortChaptersForExport,
} = require('../shared/mangaUtils');
const { processImageForDoublePageRotation, processRotateDoublePage } = require('./image/rotateDoublePage');
const { generatePdf } = require('./pdfGenerator');

const MAX_PDF_BASENAME = 180;

// ─── Naming helpers ───────────────────────────────────────────────────────────

/**
 * Tên file .pdf cho single volume.
 * @param {string} mangaTitle
 * @returns {string}
 */
function safePdfBaseName(mangaTitle) {
  return formatFolderName(mangaTitle, MAX_PDF_BASENAME).trim() || 'Manga';
}

/**
 * Tên file .pdf cho một phần khi chia theo dung lượng (Part 01, 02, …).
 * @param {string} mangaTitle
 * @param {number} partIndex1Based
 * @param {number} totalParts
 * @returns {string}
 */
function safePartPdfBaseName(mangaTitle, partIndex1Based, totalParts) {
  const m = safePdfBaseName(mangaTitle);
  const width = Math.max(2, String(totalParts).length);
  const part = String(partIndex1Based).padStart(width, '0');
  const joined = `${m} - Part ${part}`;
  return formatFolderName(joined, MAX_PDF_BASENAME) || `Part-${part}`;
}

/**
 * Tên file .pdf cho một chương khi chia theo chương.
 * @param {string} mangaTitle
 * @param {string} chapterTitle
 * @returns {string}
 */
function safeChapterPdfBaseName(mangaTitle, chapterTitle) {
  const m = formatFolderName(mangaTitle, 80).trim() || 'Manga';
  const c = formatChapterTitle(chapterTitle).substring(0, 80);
  const joined = `${m} - ${c}`;
  return formatFolderName(joined, MAX_PDF_BASENAME) || `${m}-chapter`;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

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

// ─── Image collection ─────────────────────────────────────────────────────────

/**
 * Thu thập file ảnh từ thư mục chương.
 * Nếu flatten=true, đệ quy vào thư mục con và sắp xếp tự nhiên.
 * @param {string} chapterDir
 * @param {boolean} flatten
 * @returns {string[]} — đường dẫn tương đối từ chapterDir
 */
function collectChapterImages(chapterDir, flatten, listOptions = {}) {
  if (!flatten) {
    const result = listChapterImageFiles(chapterDir, listOptions);
    return result.files || [];
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

// ─── Rotate double-page ───────────────────────────────────────────────────────

/**
 * Tạo thư mục tạm để xử lý ảnh (xoay trang đôi).
 * @returns {string}
 */
function createTempProcessingDir() {
  const tempRoot = path.join(os.tmpdir(), 'manga-pdf-rotate');
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
  } catch (_) {
    // Ignore cleanup errors
  }
}

// ─── Export modes ─────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{title: string, folderBasename?: string}>} opts.chapters
 * @param {string} opts.outputFile — đường dẫn đầy đủ bao gồm .pdf
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {boolean} [opts.pdfSeamless]
 * @param {string} [opts.absoluteMangaDir]
 * @param {(p: {done: number, total: number, label: string}) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportSingleVolumePdf(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const chapters = sortChaptersForExport(opts.chapters);
  const outputFile = String(opts.outputFile || '').trim();
  const chapterFolderFormat = opts.chapterFolderFormat;
  const onProgress = opts.onProgress;
  const flatten = Boolean(opts.flattenSubfolders);
  const rotateDoublePage = Boolean(opts.rotateDoublePage);
  const rotateThreshold = opts.rotateThreshold || 1.2;
  const pdfSeamless = Boolean(opts.pdfSeamless);

  const absDir = String(opts.absoluteMangaDir || '').trim();
  const mangaDir = absDir ? path.resolve(absDir) : resolveMangaDir(base, mt);
  const mangaResolved = path.resolve(mangaDir);

  // Thu thập ảnh từ tất cả chương
  const allItems = [];
  for (const ch of chapters) {
    const ct = String(ch.title || '').trim();
    if (!ct) continue;
    const fb = String(ch.folderBasename || '').trim();
    const chapterDir = fb ? path.join(mangaResolved, fb) : resolveChapterDir(base, mt, ct, chapterFolderFormat);
    assertChapterDirUnderManga(mangaResolved, path.resolve(chapterDir));
    const listOptions =
      isFlatChapterLayout(chapterFolderFormat) && !fb
        ? { namePrefix: getFlatChapterImageNamePrefix(ct, chapterFolderFormat) }
        : {};
    const files = collectChapterImages(chapterDir, flatten, listOptions);
    if (!files.length) throw new Error(`Không có ảnh trong chương: ${ct}`);
    for (const name of files) {
      if (path.basename(name).includes('..')) continue;
      allItems.push({ full: path.join(chapterDir, name), title: ct, baseName: path.basename(name), ext: path.extname(name).toLowerCase() });
    }
  }
  if (!allItems.length) throw new Error('Không có ảnh để đóng gói.');

  const { processedItems, tempDir } = await processRotateDoublePage(allItems, rotateDoublePage, rotateThreshold, onProgress);

  try {
    await generatePdf({
      images: processedItems.map((item) => ({ path: item.full, title: item.title })),
      outputPath: outputFile,
      metadata: { title: mt, creator: 'Manga Crawler Export' },
      seamless: pdfSeamless,
      onProgress,
    });
    return [outputFile];
  } finally {
    if (tempDir) cleanupTempDir(tempDir);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{title: string, folderBasename?: string}>} opts.chapters
 * @param {string} opts.outputDir
 * @param {number} opts.maxBytes
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {boolean} [opts.pdfSeamless]
 * @param {string} [opts.absoluteMangaDir]
 * @param {(p: {done: number, total: number, label: string}) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportSizeSplitPdf(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const chapters = sortChaptersForExport(opts.chapters);
  const outputDir = String(opts.outputDir || '').trim();
  const chapterFolderFormat = opts.chapterFolderFormat;
  const onProgress = opts.onProgress;
  const maxBytes = Number(opts.maxBytes);
  const flatten = Boolean(opts.flattenSubfolders);
  const rotateDoublePage = Boolean(opts.rotateDoublePage);
  const rotateThreshold = opts.rotateThreshold || 1.2;
  const pdfSeamless = Boolean(opts.pdfSeamless);

  if (!Number.isFinite(maxBytes) || maxBytes < 1024 * 1024) {
    throw new Error('Giới hạn dung lượng mỗi file không hợp lệ (tối thiểu 1 MB).');
  }

  const absDir = String(opts.absoluteMangaDir || '').trim();
  const mangaDir = absDir ? path.resolve(absDir) : resolveMangaDir(base, mt);
  const mangaResolved = path.resolve(mangaDir);

  // Thu thập ảnh từ tất cả chương
  const allItems = [];
  for (const ch of chapters) {
    const ct = String(ch.title || '').trim();
    if (!ct) continue;
    const fb = String(ch.folderBasename || '').trim();
    const chapterDir = fb ? path.join(mangaResolved, fb) : resolveChapterDir(base, mt, ct, chapterFolderFormat);
    assertChapterDirUnderManga(mangaResolved, path.resolve(chapterDir));
    const listOptions =
      isFlatChapterLayout(chapterFolderFormat) && !fb
        ? { namePrefix: getFlatChapterImageNamePrefix(ct, chapterFolderFormat) }
        : {};
    const files = collectChapterImages(chapterDir, flatten, listOptions);
    if (!files.length) throw new Error(`Không có ảnh trong chương: ${ct}`);
    for (const name of files) {
      if (path.basename(name).includes('..')) continue;
      allItems.push({ full: path.join(chapterDir, name), title: ct, baseName: path.basename(name), ext: path.extname(name).toLowerCase() });
    }
  }
  if (!allItems.length) throw new Error('Không có ảnh để đóng gói.');

  const { processedItems, tempDir } = await processRotateDoublePage(allItems, rotateDoublePage, rotateThreshold, onProgress);

  // Bin-pack theo dung lượng
  const segments = [];
  let current = [];
  let currentSize = 0;
  const flush = () => { if (current.length) { segments.push(current); current = []; currentSize = 0; } };

  for (const item of processedItems) {
    let st;
    try { st = fs.statSync(item.full); } catch (e) {
      throw new Error(`Không đọc được file: ${item.baseName} (${String(e?.message || e)})`);
    }
    const sz = st.size;
    if (current.length > 0 && currentSize + sz > maxBytes) flush();
    if (sz > maxBytes) {
      if (current.length > 0) flush();
      segments.push([{ ...item, sz }]);
      continue;
    }
    current.push({ ...item, sz });
    currentSize += sz;
  }
  flush();

  const totalParts = segments.length;
  const outputFiles = [];

  try {
    for (let i = 0; i < segments.length; i++) {
      const fileBase = `${safePartPdfBaseName(mt, i + 1, totalParts)}.pdf`;
      const outPath = path.join(outputDir, fileBase);
      console.log(`[ExportPDF] Generating part ${i + 1}/${totalParts}: ${fileBase}`);
      await generatePdf({
        images: segments[i].map((item) => ({ path: item.full, title: item.title })),
        outputPath: outPath,
        metadata: { title: `${mt} - Part ${String(i + 1).padStart(2, '0')}`, creator: 'Manga Crawler Export' },
        seamless: pdfSeamless,
        onProgress,
      });
      outputFiles.push(outPath);
    }
  } finally {
    if (tempDir) cleanupTempDir(tempDir);
  }

  return outputFiles;
}

/**
 * @param {object} opts
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{title: string, folderBasename?: string}>} opts.chapters
 * @param {string} opts.outputDir
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {boolean} [opts.pdfSeamless]
 * @param {string} [opts.absoluteMangaDir]
 * @param {(p: {done: number, total: number, label: string}) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportChapterSplitPdf(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const chapters = sortChaptersForExport(opts.chapters);
  const outputDir = String(opts.outputDir || '').trim();
  const chapterFolderFormat = opts.chapterFolderFormat;
  const onProgress = opts.onProgress;
  const flatten = Boolean(opts.flattenSubfolders);
  const rotateDoublePage = Boolean(opts.rotateDoublePage);
  const rotateThreshold = opts.rotateThreshold || 1.2;
  const pdfSeamless = Boolean(opts.pdfSeamless);

  const absDir = String(opts.absoluteMangaDir || '').trim();
  const mangaDir = absDir ? path.resolve(absDir) : resolveMangaDir(base, mt);
  const mangaResolved = path.resolve(mangaDir);

  const outputFiles = [];

  for (const ch of chapters) {
    const ct = String(ch.title || '').trim();
    if (!ct) continue;

    const fb = String(ch.folderBasename || '').trim();
    const chapterDir = fb ? path.join(mangaResolved, fb) : resolveChapterDir(base, mt, ct, chapterFolderFormat);
    assertChapterDirUnderManga(mangaResolved, path.resolve(chapterDir));
    const listOptions =
      isFlatChapterLayout(chapterFolderFormat) && !fb
        ? { namePrefix: getFlatChapterImageNamePrefix(ct, chapterFolderFormat) }
        : {};
    const files = collectChapterImages(chapterDir, flatten, listOptions);
    if (!files.length) throw new Error(`Không có ảnh trong chương: ${ct}`);

    const chapterItems = [];
    for (const name of files) {
      if (path.basename(name).includes('..')) continue;
      chapterItems.push({ full: path.join(chapterDir, name), title: ct, baseName: path.basename(name), ext: path.extname(name).toLowerCase() });
    }

    const { processedItems, tempDir } = await processRotateDoublePage(chapterItems, rotateDoublePage, rotateThreshold, onProgress);

    const fileBase = `${safeChapterPdfBaseName(mt, ct)}.pdf`;
    const outPath = path.join(outputDir, fileBase);
    console.log(`[ExportPDF] Generating chapter "${ct}": ${fileBase}`);

    try {
      await generatePdf({
        images: processedItems.map((item) => ({ path: item.full, title: item.title })),
        outputPath: outPath,
        metadata: { title: `${mt} - ${ct}`, creator: 'Manga Crawler Export' },
        seamless: pdfSeamless,
        onProgress,
      });
      outputFiles.push(outPath);
    } finally {
      if (tempDir) cleanupTempDir(tempDir);
    }
  }

  return outputFiles;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {'singleVolume'|'sizeSplit'|'chapterSplit'} opts.mode
 * @param {string} opts.baseSaveDir
 * @param {string} opts.mangaTitle
 * @param {Array<{title: string, folderBasename?: string}>} opts.chapters
 * @param {string} [opts.outputDir]   — dùng cho sizeSplit / chapterSplit
 * @param {string} [opts.outputFile]  — dùng cho singleVolume (đường dẫn đầy đủ .pdf)
 * @param {number} [opts.maxBytes]    — dùng cho sizeSplit
 * @param {object} opts.chapterFolderFormat
 * @param {boolean} [opts.flattenSubfolders]
 * @param {boolean} [opts.rotateDoublePage]
 * @param {number} [opts.rotateThreshold]
 * @param {boolean} [opts.pdfSeamless]
 * @param {string} [opts.absoluteMangaDir]
 * @param {(p: {done: number, total: number, label: string}) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportChaptersToPdf(opts) {
  const mode = opts.mode;

  if (mode === 'sizeSplit') {
    const outputDir = String(opts.outputDir || '').trim();
    if (!outputDir) throw new Error('Thiếu thư mục đích.');
    return exportSizeSplitPdf({ ...opts, outputDir });
  }

  if (mode === 'singleVolume') {
    const outputFile = String(opts.outputFile || '').trim();
    if (!outputFile) throw new Error('Thiếu đường dẫn file .pdf.');
    return exportSingleVolumePdf({ ...opts, outputFile });
  }

  if (mode === 'chapterSplit') {
    const outputDir = String(opts.outputDir || '').trim();
    if (!outputDir) throw new Error('Thiếu thư mục đích.');
    return exportChapterSplitPdf({ ...opts, outputDir });
  }

  throw new Error('Chế độ xuất không hợp lệ.');
}

module.exports = {
  exportChaptersToPdf,
  safePartPdfBaseName,
  safePdfBaseName,
  safeChapterPdfBaseName,
};
