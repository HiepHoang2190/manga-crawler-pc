'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detect whether an EPUB or PDF file contains text-based or image-based content.
 *
 * @param {string} absolutePath
 * @returns {Promise<{ ok: boolean, contentType?: 'text'|'image', error?: string }>}
 */
async function detectEbookContentType(absolutePath) {
  const resolved = path.resolve(String(absolutePath || '').trim());
  const baseName = path.basename(resolved);

  // Validate file exists and is a file
  if (!resolved) {
    return { ok: false, error: 'Path is empty.' };
  }

  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `${baseName}: File not found.` };
  }

  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Not a file.` };
  }

  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.epub') {
    return detectEpubContentType(resolved, baseName);
  }

  if (ext === '.pdf') {
    return detectPdfContentType(resolved, baseName);
  }

  // MOBI/AZW are always text-based — route to EbookReader after conversion
  if (ext === '.mobi' || ext === '.azw' || ext === '.azw3') {
    return { ok: true, contentType: 'image' }; // handled by loadMobiFromFilePath → MangaReader
  }

  return { ok: false, error: `${baseName}: Unsupported file type '${ext}'.` };
}

/**
 * Inspect an EPUB's OPF manifest spine to determine text vs image content.
 * Returns 'text' if XHTML/HTML spine items >= image spine items (majority or tie).
 */
async function detectEpubContentType(filePath, baseName) {
  try {
    const { EPub } = require('epub2');
    const epub = await EPub.createAsync(filePath);

    const manifest = epub.manifest || {};
    const spineContents = epub.spine && epub.spine.contents ? epub.spine.contents : [];

    if (spineContents.length === 0) {
      // No spine items — fall back to checking manifest directly
      return { ok: true, contentType: 'text' };
    }

    let xhtmlCount = 0;
    let imageCount = 0;

    for (const spineItem of spineContents) {
      const id = spineItem.id;
      const manifestItem = manifest[id];
      if (!manifestItem) continue;

      const mediaType = (manifestItem['media-type'] || '').toLowerCase().trim();

      if (
        mediaType === 'application/xhtml+xml' ||
        mediaType === 'text/html'
      ) {
        xhtmlCount++;
      } else if (mediaType.startsWith('image/')) {
        imageCount++;
      }
    }

    // Majority rule: text if xhtmlCount >= imageCount (tie goes to text)
    const contentType = xhtmlCount >= imageCount ? 'text' : 'image';
    return { ok: true, contentType };
  } catch (e) {
    return { ok: false, error: `${baseName}: ${e.message || String(e)}` };
  }
}

/**
 * Inspect a PDF's first 5 pages to determine if any have a text layer.
 * Returns 'text' if at least one page has extractable text, 'image' otherwise.
 */
async function detectPdfContentType(filePath, baseName) {
  try {
    const { pathToFileURL } = require('url');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // pdfjs v5 requires a non-empty workerSrc — point it at the bundled worker file
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc || pdfjsLib.GlobalWorkerOptions.workerSrc === './pdf.worker.mjs') {
      const resolved_worker_path = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(resolved_worker_path).href;
    }

    const { getPdfjsFactoryParams } = require('../shared/pdfjsAssets');
    const loadingTask = pdfjsLib.getDocument({
      url: filePath,
      // CMap / standard-font data for CJK & non-embedded-font PDFs —
      // see electron/lib/shared/pdfjsAssets.js.
      ...getPdfjsFactoryParams(),
      useSystemFonts: true,
      disableFontFace: true,
    });

    let pdfDoc;
    try {
      pdfDoc = await loadingTask.promise;
    } catch (e) {
      const msg = String(e?.message || e).toLowerCase();
      if (
        msg.includes('password') ||
        msg.includes('encrypted') ||
        msg.includes('passwordexception') ||
        msg.includes('no password given')
      ) {
        return { ok: false, error: `${baseName}: PDF is password-protected.` };
      }
      throw e;
    }

    const numPages = pdfDoc.numPages;
    const pagesToCheck = Math.min(numPages, 5);

    for (let i = 1; i <= pagesToCheck; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      if (textContent.items && textContent.items.length > 0) {
        await pdfDoc.destroy();
        return { ok: true, contentType: 'text' };
      }
    }

    await pdfDoc.destroy();
    return { ok: true, contentType: 'image' };
  } catch (e) {
    return { ok: false, error: `${baseName}: ${e.message || String(e)}` };
  }
}

module.exports = { detectEbookContentType };
