'use strict';

/**
 * In-house replacement for the `pdf-to-png-converter` package.
 *
 * Why this exists — pdf-to-png-converter@3.18.0 is broken on Windows with
 * pdfjs-dist v5, in three ways, and exposes no option to override any of them:
 *
 *  1. It builds cMapUrl / standardFontDataUrl with path.resolve() +
 *     path.normalize() and appends `path.sep`. On Windows that produces
 *     "C:\...\node_modules\pdfjs-dist\cmaps\", and pdfjs v5 rejects any
 *     factory URL that does not end with '/' verbatim:
 *       Invalid factory url: "C:\...\cmaps\" must include trailing slash.
 *     → EVERY PDF fails on Windows, in every feature that used the package
 *       (Convert, offline PDF reading, chapter PDF rasterizing).
 *  2. It resolves `./node_modules/pdfjs-dist/...` against process.cwd(), so
 *     even with the slash fixed the asset folders are only found when the
 *     app happens to be launched from its own install directory.
 *  3. It resolves outputFolder with path.join(process.cwd(), outputFolder),
 *     which corrupts an absolute output folder on Windows
 *     ("C:\cwd\C:\Users\...\Temp\...").
 *
 * This module keeps the exact call shape the app already uses —
 *   pdfToPng(pdfPath, { viewportScale, pagesToProcess, returnMetadataOnly,
 *                       returnPageContent, outputFolder, outputFileMaskFunc,
 *                       disableFontFace, useSystemFonts, enableXfa,
 *                       pdfFilePassword, verbosityLevel })
 *   → [{ pageNumber, name, content, path, width, height, rotation }]
 * — but renders with pdfjs-dist + @napi-rs/canvas directly (the same stack
 * electron/lib/reader/workers/pdfRenderWorker.js already uses), with factory
 * URLs from ./pdfjsAssets.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { getPdfjsFactoryParams } = require('./pdfjsAssets');

const MAX_VIEWPORT_SCALE = 100;
const MAX_CANVAS_PIXELS = 100_000_000;

let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (
        !pdfjsLib.GlobalWorkerOptions.workerSrc ||
        pdfjsLib.GlobalWorkerOptions.workerSrc === './pdf.worker.mjs'
      ) {
        const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      }
      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

async function toPlainUint8Array(pdfFile) {
  if (typeof pdfFile === 'string') {
    const buffer = await fs.promises.readFile(pdfFile);
    // Copy out of the pooled Buffer: pdfjs rejects Buffer inputs directly.
    return new Uint8Array(buffer);
  }
  if (Buffer.isBuffer(pdfFile)) {
    return new Uint8Array(pdfFile);
  }
  if (pdfFile instanceof Uint8Array) {
    return pdfFile;
  }
  return new Uint8Array(pdfFile);
}

/**
 * Render pages of a PDF to PNG.
 * @param {string|Buffer|Uint8Array|ArrayBuffer} pdfFile
 * @param {object} [props] see module header for the supported options
 * @returns {Promise<Array<{ pageNumber: number, name: string, content: Buffer|undefined, path: string, width: number, height: number, rotation: number }>>}
 */
async function pdfToPng(pdfFile, props = {}) {
  const viewportScale = props?.viewportScale ?? 1;
  if (
    typeof viewportScale !== 'number' ||
    !Number.isFinite(viewportScale) ||
    viewportScale <= 0 ||
    viewportScale > MAX_VIEWPORT_SCALE
  ) {
    throw new Error(
      `viewportScale must be a finite number greater than 0 and at most ${MAX_VIEWPORT_SCALE}, received: ${viewportScale}`
    );
  }

  const pdfjsLib = await loadPdfjs();
  const data = await toPlainUint8Array(pdfFile);

  const pdfDoc = await pdfjsLib
    .getDocument({
      data,
      ...getPdfjsFactoryParams(),
      disableFontFace: props?.disableFontFace ?? true,
      useSystemFonts: props?.useSystemFonts ?? false,
      enableXfa: props?.enableXfa ?? true,
      password: props?.pdfFilePassword ?? undefined,
      verbosity: props?.verbosityLevel ?? 0,
      isEvalSupported: false,
    })
    .promise;

  try {
    const allPages = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);
    const requested = Array.isArray(props?.pagesToProcess) ? props.pagesToProcess : allPages;
    const pagesToProcess = requested.filter((n) => Number.isInteger(n) && n >= 1 && n <= pdfDoc.numPages);

    const returnMetadataOnly = props?.returnMetadataOnly === true;
    const defaultMask =
      typeof pdfFile === 'string' ? path.parse(pdfFile).name : 'buffer';

    // path.resolve() — NOT path.join(cwd, ...): an absolute outputFolder must
    // survive untouched on every platform.
    const outputDir =
      props?.outputFolder !== undefined && !returnMetadataOnly
        ? path.resolve(String(props.outputFolder))
        : undefined;
    if (outputDir) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    const { createCanvas } = returnMetadataOnly ? {} : require('@napi-rs/canvas');

    const results = [];
    for (const pageNumber of pagesToProcess) {
      const name = props?.outputFileMaskFunc
        ? props.outputFileMaskFunc(pageNumber)
        : `${defaultMask}_page_${pageNumber}.png`;
      if (!name) {
        throw new Error(`outputFileMaskFunc returned an empty filename for page ${pageNumber}.`);
      }

      const page = await pdfDoc.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: viewportScale });

        if (returnMetadataOnly) {
          results.push({
            pageNumber,
            name,
            content: undefined,
            path: '',
            width: viewport.width,
            height: viewport.height,
            rotation: page.rotate,
          });
          continue;
        }

        const width = Math.max(1, Math.floor(viewport.width));
        const height = Math.max(1, Math.floor(viewport.height));
        if (width * height > MAX_CANVAS_PIXELS) {
          throw new Error(
            `Canvas ${width}×${height} px exceeds the ${MAX_CANVAS_PIXELS.toLocaleString()} pixel limit. Reduce viewportScale.`
          );
        }

        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        const content = canvas.toBuffer('image/png');

        const output = {
          pageNumber,
          name,
          content,
          path: '',
          width: viewport.width,
          height: viewport.height,
          rotation: page.rotate,
        };

        if (outputDir) {
          if (path.isAbsolute(name)) {
            throw new Error(`Output file name escapes the output folder: ${name}`);
          }
          const filePath = path.join(outputDir, name);
          const rel = path.relative(outputDir, filePath);
          if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
            throw new Error(`Output file name escapes the output folder: ${name}`);
          }
          await fs.promises.writeFile(filePath, content);
          output.path = filePath;
          if (props?.returnPageContent === false) {
            output.content = undefined;
          }
        }

        results.push(output);
      } finally {
        try { page.cleanup(); } catch { /* */ }
      }
    }
    return results;
  } finally {
    try { await pdfDoc.cleanup(); } catch { /* */ }
    try { await pdfDoc.destroy(); } catch { /* */ }
  }
}

module.exports = { pdfToPng };
