'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const { extractImagesFromBook } = require('./extractors');
const { buildEpubFromImages } = require('../epub/exportEpubCore');
const { buildMobiFromImages } = require('../mobi/exportMobiCore');
const { generatePdf } = require('../pdfGenerator');
const { formatFolderName } = require('../../shared/mangaUtils');

function buildCbzArchive(images, outputPath, { onProgress = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Đã hủy đóng gói CBZ'));

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve({ ok: true, outputPath }));
    archive.on('error', reject);

    archive.on('progress', (prog) => {
      const { entries } = prog;
      onProgress({
        message: `Đang nén CBZ (${entries.processed}/${entries.total})`,
        processed: entries.processed,
        total: entries.total,
      });
    });

    archive.pipe(output);

    images.forEach((img, idx) => {
      if (signal?.aborted) {
        archive.abort();
        return reject(new Error('Đã hủy đóng gói CBZ'));
      }
      const ext = path.extname(img.name || img.path);
      const entryName = `${String(idx + 1).padStart(4, '0')}${ext}`;
      archive.file(img.path, { name: entryName });
    });

    archive.finalize();
  });
}

/**
 * Trích xuất ảnh ra một thư mục đích.
 */
async function copyImagesToFolder(images, outputDir, { onProgress = () => {}, signal } = {}) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const total = images.length;
  for (let i = 0; i < total; i += 1) {
    if (signal?.aborted) throw new Error('Đã hủy trích xuất ảnh');
    const img = images[i];
    const ext = path.extname(img.name || img.path);
    const destName = `${String(i + 1).padStart(4, '0')}${ext}`;
    const destFile = path.join(outputDir, destName);

    fs.copyFileSync(img.path, destFile);
    onProgress({
      message: `Đang lưu ảnh (${i + 1}/${total})`,
      done: i + 1,
      total,
    });
  }

  return { ok: true, outputPath: outputDir };
}

/**
 * Chuyển đổi một tệp sách sang định dạng mong muốn.
 * @param {object} params
 * @param {string} params.inputPath
 * @param {'cbz'|'pdf'|'epub'|'mobi'|'folder'} params.targetFormat
 * @param {string} params.outputDir
 * @param {object} [params.options]
 * @param {function} [params.onProgress]
 * @param {AbortSignal} [params.signal]
 */
async function convertSingleBook({
  inputPath,
  targetFormat,
  outputDir,
  options = {},
  onProgress = () => {},
  signal,
}) {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    return { ok: false, error: 'Tệp nguồn không tồn tại.' };
  }
  if (!outputDir) {
    return { ok: false, error: 'Thiếu thư mục đầu ra.' };
  }

  const format = String(targetFormat || '').toLowerCase();
  const validFormats = ['cbz', 'zip', 'pdf', 'epub', 'mobi', 'folder', 'images'];
  if (!validFormats.includes(format)) {
    return { ok: false, error: `Định dạng đầu ra không hợp lệ: ${targetFormat}` };
  }

  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-extract-'));
  let rotateTempDir = null;

  try {
    onProgress({ message: `Đang đọc nội dung sách: ${path.basename(resolvedInput)}`, percent: 10 });
    const extractResult = await extractImagesFromBook(resolvedInput, tempExtractDir, {
      onProgress,
      signal,
    });

    if (!extractResult.ok) return extractResult;

    const { images, title } = extractResult;
    const safeTitle = formatFolderName(title || 'book', 150) || 'book';

    let imagesToUse = images;

    if (options.rotateDoublePage) {
      const { processRotateDoublePage } = require('../image/rotateDoublePage');
      const rotRes = await processRotateDoublePage(
        images.map((img) => ({ path: img.path, full: img.path, name: img.name })),
        true,
        1.2,
        (p) => onProgress({ message: `Đang xoay trang đôi (${p.done}/${p.total})...` })
      );
      if (rotRes.tempDir) {
        rotateTempDir = rotRes.tempDir;
        imagesToUse = rotRes.processedItems.map((item) => ({ ...item, path: item.path || item.full }));
      }
    }

    if (signal?.aborted) throw new Error('Đã hủy chuyển đổi');

    // 1. Chuyển sang CBZ / ZIP
    if (format === 'cbz' || format === 'zip') {
      const outPath = path.join(outputDir, `${safeTitle}.${format}`);
      onProgress({ message: `Đang đóng gói file ${format.toUpperCase()}...`, percent: 60 });
      return await buildCbzArchive(imagesToUse, outPath, { onProgress, signal });
    }

    // 2. Chuyển sang EPUB
    if (format === 'epub') {
      const outPath = path.join(outputDir, `${safeTitle}.epub`);
      onProgress({ message: 'Đang tạo file EPUB...', percent: 60 });
      return await buildEpubFromImages({
        images: imagesToUse,
        outputPath: outPath,
        metadata: { title },
        onProgress,
        signal,
      });
    }

    // 3. Chuyển sang MOBI
    if (format === 'mobi') {
      const outPath = path.join(outputDir, `${safeTitle}.mobi`);
      onProgress({ message: 'Đang tạo file MOBI...', percent: 60 });
      return await buildMobiFromImages({
        images: imagesToUse,
        outputPath: outPath,
        metadata: { title },
        compilerOpts: options.compilerOpts || {},
        onProgress,
        signal,
      });
    }

    // 4. Chuyển sang PDF
    if (format === 'pdf') {
      const outPath = path.join(outputDir, `${safeTitle}.pdf`);
      onProgress({ message: 'Đang tạo file PDF...', percent: 60 });
      await generatePdf({
        images: imagesToUse.map((img) => ({ path: img.path, title: img.name || title })),
        outputPath: outPath,
        metadata: { title },
        onProgress,
      });
      return { ok: true, outputPath: outPath };
    }

    // 5. Trích xuất ra Thư mục ảnh
    if (format === 'folder' || format === 'images') {
      const targetFolder = path.join(outputDir, safeTitle);
      onProgress({ message: 'Đang xuất các file ảnh...', percent: 60 });
      return await copyImagesToFolder(imagesToUse, targetFolder, { onProgress, signal });
    }

    return { ok: false, error: 'Định dạng không được hỗ trợ.' };
  } finally {
    if (rotateTempDir) {
      try {
        fs.rmSync(rotateTempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    try {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Chuyển đổi hàng loạt file sang định dạng mong muốn.
 */
async function batchConvertBooks({
  inputPaths = [],
  targetFormat,
  outputDir,
  options = {},
  onItemProgress = () => {},
  signal,
}) {
  const results = [];
  const total = inputPaths.length;

  for (let i = 0; i < total; i += 1) {
    if (signal?.aborted) {
      results.push({
        input: inputPaths[i],
        ok: false,
        error: 'Đã hủy chuyển đổi hàng loạt',
      });
      continue;
    }

    const inputPath = inputPaths[i];
    onItemProgress({
      index: i + 1,
      total,
      item: inputPath,
      message: `Đang xử lý (${i + 1}/${total}): ${path.basename(inputPath)}`,
    });

    try {
      const res = await convertSingleBook({
        inputPath,
        targetFormat,
        outputDir,
        options,
        onProgress: (p) => onItemProgress({ index: i + 1, total, item: inputPath, ...p }),
        signal,
      });
      results.push({ input: inputPath, ...res });
    } catch (err) {
      results.push({
        input: inputPath,
        ok: false,
        error: String(err?.message || err),
      });
    }
  }

  return results;
}

module.exports = {
  convertSingleBook,
  batchConvertBooks,
};
