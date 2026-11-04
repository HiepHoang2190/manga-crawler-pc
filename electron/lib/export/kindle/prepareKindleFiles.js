'use strict';

/**
 * prepareKindleFiles — turn an Offline Library manga (image-folder chapters)
 * into one or more Kindle-ready files (EPUB or PDF), auto-split below the 200MB cap.
 */

const fs = require('fs');
const path = require('path');

const {
  exportChaptersToPdf: defaultExportPdf,
  safePdfBaseName,
} = require('../exportPdf');
const {
  exportChaptersToEpub: defaultExportEpub,
  safeEpubBaseName,
} = require('../exportEpub');
const { SPLIT_TARGET_BYTES } = require('./kindleContentTypes');

/**
 * @param {unknown} raw
 * @returns {'epub'|'pdf'}
 */
function normalizeFormat(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'epub') return 'epub';
  // Default PDF for manga image quality through Amazon Send to Kindle.
  return 'pdf';
}

/**
 * @param {object} params
 * @param {string} params.absoluteMangaDir
 * @param {string} params.mangaTitle
 * @param {Array<{title: string, folderBasename?: string}>} params.chapters
 * @param {object} params.chapterFolderFormat
 * @param {string} params.outputDir
 * @param {'epub'|'pdf'} [params.format]
 * @param {string} [params.author]
 * @param {boolean} [params.rotateDoublePage]
 * @param {boolean} [params.pdfSeamless]
 * @param {(p: {done: number, total: number, label: string}) => void} [params.onProgress]
 * @param {object} [deps]
 * @param {Function} [deps.exportChaptersToPdf]
 * @param {Function} [deps.exportChaptersToEpub]
 * @returns {Promise<{ ok: boolean, files?: string[], format?: string, error?: string }>}
 */
async function prepareKindleFiles(params, deps = {}) {
  const exportChaptersToPdf = deps.exportChaptersToPdf || defaultExportPdf;
  const exportChaptersToEpub = deps.exportChaptersToEpub || defaultExportEpub;
  const format = normalizeFormat(params.format);

  const absoluteMangaDir = String(params.absoluteMangaDir || '').trim();
  const mangaTitle = String(params.mangaTitle || '').trim();
  const chapters = Array.isArray(params.chapters) ? params.chapters : [];
  const outputDir = String(params.outputDir || '').trim();

  if (!absoluteMangaDir) return { ok: false, error: 'Thiếu đường dẫn truyện.' };
  if (!outputDir) return { ok: false, error: 'Thiếu thư mục tạm.' };

  const normalized = chapters
    .map((c) => ({
      title: String(c?.title || '').trim(),
      ...(c?.folderBasename ? { folderBasename: String(c.folderBasename).trim() } : {}),
    }))
    .filter((c) => c.title || c.folderBasename);
  if (!normalized.length) return { ok: false, error: 'Không có chương nào để gửi.' };

  const common = {
    mode: 'sizeSplit',
    baseSaveDir: '',
    mangaTitle: mangaTitle || 'Manga',
    chapters: normalized,
    outputDir,
    maxBytes: SPLIT_TARGET_BYTES,
    chapterFolderFormat: params.chapterFolderFormat,
    absoluteMangaDir,
    onProgress: params.onProgress,
  };

  try {
    let files;
    if (format === 'pdf') {
      files = await exportChaptersToPdf({
        ...common,
        rotateDoublePage: Boolean(params.rotateDoublePage),
        pdfSeamless: Boolean(params.pdfSeamless),
      });
    } else {
      files = await exportChaptersToEpub({
        ...common,
        author: params.author,
      });
    }

    if (!Array.isArray(files) || files.length === 0) {
      return {
        ok: false,
        error: format === 'pdf' ? 'Không tạo được file PDF nào.' : 'Không tạo được file EPUB nào.',
      };
    }

    // Single part → drop the "- Part 01" suffix for a clean document title.
    if (files.length === 1) {
      const base =
        format === 'pdf'
          ? safePdfBaseName(mangaTitle || 'Manga')
          : safeEpubBaseName(mangaTitle || 'Manga');
      const cleanName = `${base}.${format}`;
      const cleanPath = path.join(outputDir, cleanName);
      if (path.resolve(cleanPath) !== path.resolve(files[0])) {
        try {
          fs.renameSync(files[0], cleanPath);
          return { ok: true, files: [cleanPath], format };
        } catch {
          /* keep original name on rename failure */
        }
      }
    }

    return { ok: true, files, format };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

module.exports = { prepareKindleFiles, normalizeFormat };
