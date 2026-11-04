const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadOfflineMangaAtResolvedDir } = require('./loadOfflineMangaFromDisk');

/** Thư mục con chứa các trang PDF đã render thành PNG. */
const PDF_PAGES_FOLDER = '_pdf_pages';

function hash16(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

async function ensurePdfjsWorker() {
  const { pathToFileURL } = require('url');
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc || pdfjsLib.GlobalWorkerOptions.workerSrc === './pdf.worker.mjs') {
    const resolved_worker_path = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(resolved_worker_path).href;
  }
}

/**
 * Render PDF thành ảnh PNG, dựng manga/chapters giống offline thư mục.
 * @param {string} pdfPath
 * @param {{ tempRoot: string, scale?: number, onProgress?: (extracted: number, total: number) => void }} opts
 */
async function loadPdfFromFilePath(pdfPath, { tempRoot, scale = 2.0, onProgress }) {
  const resolved = path.resolve(String(pdfPath || '').trim());
  const baseName = path.basename(resolved);

  if (!resolved) return { ok: false, error: 'Đường dẫn PDF trống.' };
  if (!fs.existsSync(resolved)) return { ok: false, error: `${baseName}: File not found.` };

  let st;
  try { st = fs.statSync(resolved); } catch (e) {
    return { ok: false, error: `${baseName}: ${String(e?.message || e)}` };
  }
  if (!st.isFile()) return { ok: false, error: `${baseName}: Not a file.` };
  if (!resolved.toLowerCase().endsWith('.pdf')) return { ok: false, error: `${baseName}: Only .pdf files are supported.` };

  const titleHint = path.basename(resolved, path.extname(resolved));
  const outDir = path.join(String(tempRoot || '').trim(), `${Date.now()}-${hash16(resolved)}`);
  const pagesDir = path.join(outDir, PDF_PAGES_FOLDER);

  try {
    await fs.promises.mkdir(pagesDir, { recursive: true });

    await ensurePdfjsWorker();
    const { pdfToPng } = require('pdf-to-png-converter');

    // Step 1: get page count first so we can report accurate progress
    let totalPages = 0;
    try {
      const meta = await pdfToPng(resolved, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: scale,
        returnMetadataOnly: true,
      });
      totalPages = meta.length;
    } catch (e) {
      const msg = String(e?.message || e).toLowerCase();
      if (msg.includes('password') || msg.includes('encrypted') || msg.includes('passwordexception') || msg.includes('no password given')) {
        try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
        return { ok: false, error: `${baseName}: PDF is password-protected.` };
      }
      throw e;
    }

    if (totalPages === 0) {
      try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
      return { ok: false, error: `${baseName}: No pages found in PDF.` };
    }

    onProgress?.(0, totalPages);

    // Step 2: render page by page for progress reporting
    for (let i = 1; i <= totalPages; i++) {
      const pages = await pdfToPng(resolved, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: scale,
        pagesToProcess: [i],
        returnPageContent: true,
      });
      if (pages[0]?.content) {
        const fileName = `${String(i).padStart(3, '0')}.png`;
        await fs.promises.writeFile(path.join(pagesDir, fileName), pages[0].content);
      }
      onProgress?.(i, totalPages);
    }
  } catch (e) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: ${String(e?.message || e) || 'PDF rendering failed.'}` };
  }

  const loaded = loadOfflineMangaAtResolvedDir(outDir, titleHint);
  if (!loaded.ok || !loaded.chapters?.length) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return {
      ok: false,
      error: loaded?.error ? `${baseName}: ${loaded.error}` : `${baseName}: No image chapters found in PDF.`,
    };
  }

  return {
    ok: true,
    manga: { ...loaded.manga, cbzTempExtractDir: outDir, pdfFilePath: resolved },
    chapters: loaded.chapters,
    cbzTempExtractDir: outDir,
  };
}

/**
 * Streaming variant: opens the PDF as a pdfjs document held in memory and
 * renders pages on demand instead of rasterizing the whole file to disk.
 * Returned shape matches loadPdfFromFilePath so callers can swap freely.
 *
 * On any failure (encrypted, corrupt, pdfjs init error) returns ok:false so
 * the caller can fall back to the legacy render-to-disk pipeline.
 */
async function loadPdfFromFilePathStreaming(pdfPath, opts = {}) {
  const { openSession } = require('../pdfSessionService');
  const session = await openSession(pdfPath, opts);
  if (session.ok) {
    return {
      ok: true,
      manga: session.manga,
      chapters: session.chapters,
      cbzTempExtractDir: session.manga.cbzTempExtractDir,
      sessionId: session.sessionId,
    };
  }
  return { ok: false, error: session.error || 'Không mở được PDF.' };
}

module.exports = { loadPdfFromFilePath, loadPdfFromFilePathStreaming, PDF_PAGES_FOLDER };
