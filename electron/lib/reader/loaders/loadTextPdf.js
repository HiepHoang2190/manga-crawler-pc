'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

/**
 * Import pdfjs-dist with the worker pointed at the bundled worker file.
 * In Electron's main process (Node.js) there is no DOM Worker, but pdfjs v5
 * requires a non-empty workerSrc. Pointing it at the local file:// URL of the
 * bundled pdf.worker.mjs makes pdfjs use a Node.js worker_thread internally.
 */
async function getPdfjsLib() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc || pdfjsLib.GlobalWorkerOptions.workerSrc === './pdf.worker.mjs') {
    const resolved_worker_path = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(resolved_worker_path).href;
  }
  return pdfjsLib;
}

/**
 * Open a PDF document, handling password errors uniformly.
 * @param {object} pdfjsLib
 * @param {string} resolved  — absolute path
 * @param {string} baseName  — for error messages
 */
async function openPdfDoc(pdfjsLib, resolved, baseName) {
  const loadingTask = pdfjsLib.getDocument({
    url: resolved,
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    return await loadingTask.promise;
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (
      msg.includes('password') ||
      msg.includes('encrypted') ||
      msg.includes('passwordexception') ||
      msg.includes('no password given')
    ) {
      throw Object.assign(new Error(`${baseName}: PDF is password-protected.`), { isPasswordError: true });
    }
    throw e;
  }
}

/**
 * Load PDF metadata (title, pageCount) without rendering pages.
 *
 * @param {string} absolutePath
 * @returns {Promise<{ ok: boolean, title?: string, pageCount?: number, coverDataUrl?: string|null, error?: string }>}
 */
async function loadTextPdfFromFilePath(absolutePath) {
  const resolved = path.resolve(String(absolutePath || '').trim());
  const baseName = path.basename(resolved);

  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `${baseName}: File not found.` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Not a file.` };
  }

  try {
    const pdfjsLib = await getPdfjsLib();
    const pdfDoc = await openPdfDoc(pdfjsLib, resolved, baseName);
    const pageCount = pdfDoc.numPages;

    let title = path.basename(resolved, path.extname(resolved));
    try {
      const metadata = await pdfDoc.getMetadata();
      const infoTitle = metadata?.info?.Title;
      if (infoTitle && String(infoTitle).trim()) {
        title = String(infoTitle).trim();
      }
    } catch {
      // Metadata is optional — use filename as fallback
    }

    await pdfDoc.destroy();
    return { ok: true, title, pageCount, coverDataUrl: null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Extract text content of a single PDF page as an HTML fragment.
 *
 * @param {string} absolutePath
 * @param {number} pageIndex  — 0-based
 * @returns {Promise<{ ok: boolean, html?: string, error?: string }>}
 */
async function readPdfPage(absolutePath, pageIndex) {
  const resolved = path.resolve(String(absolutePath || '').trim());
  const baseName = path.basename(resolved);

  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `${baseName}: File not found.` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Not a file.` };
  }

  try {
    const pdfjsLib = await getPdfjsLib();
    const pdfDoc = await openPdfDoc(pdfjsLib, resolved, baseName);
    const pageCount = pdfDoc.numPages;

    if (pageIndex < 0 || pageIndex >= pageCount) {
      await pdfDoc.destroy();
      return { ok: false, error: 'Page index out of range.' };
    }

    const page = await pdfDoc.getPage(pageIndex + 1); // pdfjs is 1-based
    const textContent = await page.getTextContent();
    await pdfDoc.destroy();

    return { ok: true, html: buildHtmlFromTextItems(textContent.items) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Convert pdfjs text items into HTML paragraphs.
 */
function buildHtmlFromTextItems(items) {
  if (!items || items.length === 0) return '<p></p>';

  const textItems = items.filter(item => item.str && item.str.trim() !== '');
  if (textItems.length === 0) return '<p></p>';

  const paragraphs = [];
  let currentParagraph = [];
  let prevY = null;
  let prevFontSize = null;

  for (const item of textItems) {
    const y = item.transform ? item.transform[5] : 0;
    const fontSize = Math.abs(item.height || (item.transform ? item.transform[3] : 12)) || 12;

    if (prevY !== null && prevFontSize !== null) {
      const gap = Math.abs(prevY - y);
      if (gap > prevFontSize * 1.5) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(' '));
          currentParagraph = [];
        }
      }
    }

    currentParagraph.push(item.str);
    prevY = y;
    prevFontSize = fontSize;
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(' '));
  }

  if (paragraphs.length === 0) return '<p></p>';

  return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { loadTextPdfFromFilePath, readPdfPage };
