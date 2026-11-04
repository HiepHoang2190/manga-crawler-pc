'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { extractImagesFromBook } = require('./converter/extractors');
const { collectChapterImages } = require('./exportCbz');
const { formatFolderName } = require('../shared/mangaUtils');

const COMIC_EXTS = new Set(['.cbz', '.zip', '.pdf', '.epub', '.mobi', '.cbr', '.rar', '.7z']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp']);

/**
 * Prepares chapters for packaging into CBZ, PDF, EPUB, or MOBI.
 * Unpacks any archive chapters (.cbz, .zip, .epub, etc.) into real image files.
 *
 * @param {object} params
 * @param {Array<{ title: string, folderBasename?: string, path?: string, isSingleFile?: boolean }>} params.chapters
 * @param {string} [params.sourceDir]
 * @param {function} [params.onProgress]
 * @returns {Promise<{
 *   preparedChapters: Array<{ title: string, folderBasename: string, resolvedDir: string, isExtracted: boolean }>,
 *   allImages: Array<{ path: string, title: string, chapterIndex: number }>,
 *   tempRoot: string | null,
 *   effectiveMangaDir: string | null
 * }>}
 */
async function prepareChaptersForPackaging({ chapters, sourceDir, onProgress = () => {} }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-pack-work-'));
  const tempChaptersDir = path.join(tempRoot, 'chapters');

  const preparedChapters = [];
  const allImages = [];
  let hasExtractedChapters = false;

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const ct = String(ch.title || `Chapter ${ci + 1}`).trim();

    let chPath = ch.path;
    if (!chPath && ch.folderBasename && sourceDir) {
      chPath = path.join(sourceDir, ch.folderBasename);
    }
    if (!chPath && sourceDir) {
      chPath = path.join(sourceDir, ct);
    }

    if (!chPath || !fs.existsSync(chPath)) {
      continue;
    }

    const stat = fs.statSync(chPath);

    if (stat.isDirectory()) {
      const files = collectChapterImages(chPath, false);
      const safeDirName = ch.folderBasename || path.basename(chPath);
      preparedChapters.push({
        title: ct,
        folderBasename: safeDirName,
        resolvedDir: chPath,
        isExtracted: false,
      });
      for (const f of files) {
        allImages.push({
          path: path.join(chPath, f),
          title: ct,
          chapterIndex: ci,
        });
      }
    } else if (stat.isFile()) {
      const ext = path.extname(chPath).toLowerCase();

      if (COMIC_EXTS.has(ext)) {
        hasExtractedChapters = true;
        if (!fs.existsSync(tempChaptersDir)) {
          fs.mkdirSync(tempChaptersDir, { recursive: true });
        }
        const safeName = `${String(ci + 1).padStart(3, '0')}_${formatFolderName(ct, 100) || `ch_${ci + 1}`}`;
        const chTargetDir = path.join(tempChaptersDir, safeName);
        fs.mkdirSync(chTargetDir, { recursive: true });

        onProgress({ message: `Đang trích xuất nội dung: ${path.basename(chPath)}...` });
        const extRes = await extractImagesFromBook(chPath, chTargetDir, { onProgress });
        if (extRes.ok && Array.isArray(extRes.images) && extRes.images.length > 0) {
          preparedChapters.push({
            title: ct,
            folderBasename: safeName,
            resolvedDir: chTargetDir,
            isExtracted: true,
          });
          for (const img of extRes.images) {
            allImages.push({
              path: img.path,
              title: ct,
              chapterIndex: ci,
            });
          }
        }
      } else if (IMAGE_EXTS.has(ext)) {
        hasExtractedChapters = true;
        if (!fs.existsSync(tempChaptersDir)) {
          fs.mkdirSync(tempChaptersDir, { recursive: true });
        }
        const safeName = `${String(ci + 1).padStart(3, '0')}_${formatFolderName(ct, 100) || `ch_${ci + 1}`}`;
        const chTargetDir = path.join(tempChaptersDir, safeName);
        fs.mkdirSync(chTargetDir, { recursive: true });

        const destImg = path.join(chTargetDir, `0001${ext}`);
        fs.copyFileSync(chPath, destImg);

        preparedChapters.push({
          title: ct,
          folderBasename: safeName,
          resolvedDir: chTargetDir,
          isExtracted: true,
        });
        allImages.push({
          path: destImg,
          title: ct,
          chapterIndex: ci,
        });
      }
    }
  }

  // If we had extracted chapters and also have non-extracted directory chapters,
  // ensure all prepared chapters reside under tempChaptersDir so CBZ/PDF export can access them
  if (hasExtractedChapters && preparedChapters.length > 0) {
    for (const ch of preparedChapters) {
      if (!ch.isExtracted) {
        const destDir = path.join(tempChaptersDir, ch.folderBasename);
        if (!fs.existsSync(destDir)) {
          try {
            fs.symlinkSync(ch.resolvedDir, destDir, 'junction');
          } catch {
            fs.cpSync(ch.resolvedDir, destDir, { recursive: true });
          }
        }
      }
    }
  }

  return {
    preparedChapters,
    allImages,
    tempRoot,
    effectiveMangaDir: hasExtractedChapters ? tempChaptersDir : sourceDir,
  };
}

module.exports = {
  prepareChaptersForPackaging,
  COMIC_EXTS,
  IMAGE_EXTS,
};
