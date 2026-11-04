'use strict';

const fs = require('fs');
const path = require('path');
const {
  writeFixedLayoutEpub,
  estimateEpubPartBytes,
  safeEpubBaseName,
  safePdfBaseName,
} = require('../exportEpub');

/**
 * Đóng gói danh sách ảnh thành 1 file EPUB 3 chuẩn Kindle-safe.
 * @param {object} params
 * @param {Array<{ path: string, title?: string }>} params.images
 * @param {string} params.outputPath
 * @param {object} [params.metadata]
 * @param {string} [params.metadata.title]
 * @param {string} [params.metadata.author]
 * @param {function} [params.onProgress]
 * @param {AbortSignal} [params.signal]
 */
async function buildEpubFromImages({
  images,
  outputPath,
  metadata = {},
  onProgress = () => {},
  signal,
}) {
  if (!images || !images.length) {
    return { ok: false, error: 'Không có ảnh để đóng gói EPUB.' };
  }
  if (!outputPath) {
    return { ok: false, error: 'Thiếu đường dẫn file đầu ra.' };
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const title = metadata.title || path.basename(outputPath, '.epub') || 'Comic';
  const creator = metadata.author || metadata.creator || 'Manga Crawler';

  onProgress({ message: `Đang tạo file EPUB: ${path.basename(outputPath)}`, percent: 10 });

  if (signal?.aborted) {
    throw new Error('Đã hủy đóng gói EPUB');
  }

  await writeFixedLayoutEpub({
    images,
    outputPath,
    metadata: { title, creator },
  });

  onProgress({ message: `Đã tạo xong file EPUB: ${path.basename(outputPath)}`, percent: 100 });

  return { ok: true, outputPath };
}

/**
 * Xuất danh sách ảnh hoặc chapter sang EPUB theo các chế độ đóng gói.
 * @param {object} params
 * @param {Array<{ path: string, title?: string, sz?: number }>} params.images
 * @param {string} params.mangaTitle
 * @param {string} params.outputDir
 * @param {'singleVolume'|'sizeSplit'} [params.packMode='singleVolume']
 * @param {number} [params.maxMbPerFile=200]
 * @param {object} [params.metadata]
 * @param {function} [params.onProgress]
 * @param {AbortSignal} [params.signal]
 */
async function exportEpubCore({
  images = [],
  mangaTitle = 'Manga',
  outputDir,
  packMode = 'singleVolume',
  maxMbPerFile = 200,
  metadata = {},
  onProgress = () => {},
  signal,
}) {
  if (!images.length) {
    return { ok: false, error: 'Không có ảnh để xuất EPUB.' };
  }
  if (!outputDir) {
    return { ok: false, error: 'Thiếu thư mục đích.' };
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeTitle = safeEpubBaseName(mangaTitle);
  const outputFiles = [];

  if (packMode === 'singleVolume') {
    const outFile = path.join(outputDir, `${safeTitle}.epub`);
    await buildEpubFromImages({
      images,
      outputPath: outFile,
      metadata: { ...metadata, title: mangaTitle },
      onProgress,
      signal,
    });
    outputFiles.push(outFile);
    return { ok: true, outputFiles };
  }

  // sizeSplit mode
  const maxBytes = Math.max(1024 * 1024, Number(maxMbPerFile || 200) * 1024 * 1024);
  const sized = images.map((img) => {
    let sz = img.sz;
    if (!sz) {
      try {
        sz = fs.statSync(img.path).size;
      } catch {
        sz = 100000;
      }
    }
    return { ...img, sz };
  });

  const segments = [];
  let current = [];
  const flush = () => {
    if (current.length) {
      segments.push(current);
      current = [];
    }
  };

  for (const item of sized) {
    if (current.length > 0 && estimateEpubPartBytes([...current, item]) > maxBytes) flush();
    if (estimateEpubPartBytes([item]) > maxBytes) {
      if (current.length > 0) flush();
      segments.push([item]);
      continue;
    }
    current.push(item);
  }
  flush();

  const totalParts = segments.length;
  for (let i = 0; i < totalParts; i += 1) {
    if (signal?.aborted) throw new Error('Đã hủy đóng gói EPUB');
    const partNum = i + 1;
    const partTitle = totalParts > 1 ? `${safeTitle}_Part_${String(partNum).padStart(2, '0')}` : safeTitle;
    const outFile = path.join(outputDir, `${partTitle}.epub`);

    await buildEpubFromImages({
      images: segments[i],
      outputPath: outFile,
      metadata: { ...metadata, title: `${mangaTitle} (Phần ${partNum}/${totalParts})` },
      onProgress: (p) => onProgress({ ...p, part: partNum, totalParts }),
      signal,
    });
    outputFiles.push(outFile);
  }

  return { ok: true, outputFiles };
}

module.exports = {
  buildEpubFromImages,
  exportEpubCore,
};
