const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { listChapterImageFiles, CHAPTER_PDF_RASTER_SUBDIR } = require('./listChapterImageFiles');

const META_BASENAME = '.pdf_png_extract.json';

async function ensurePdfjsWorker() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc || pdfjsLib.GlobalWorkerOptions.workerSrc === './pdf.worker.mjs') {
    const resolved_worker_path = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(resolved_worker_path).href;
  }
}

/**
 * When a chapter folder has no raster images but contains exactly one PDF
 * (e.g. Google Drive chapter from TruyenTuoiTho), render pages under CHAPTER_PDF_RASTER_SUBDIR
 * (001.png, 002.png, …) so listChapterImageFiles / reader can display them. Cached via .pdf_png_extract.json.
 *
 * @param {string} chapterDir
 * @returns {Promise<{ ok: boolean, error?: string, extracted?: boolean }>}
 */
async function ensureChapterPdfRenderedAsPngPages(chapterDir) {
  const dir = String(chapterDir || '').trim();
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, error: 'Không tìm thấy thư mục chương.' };
  }

  const listed = listChapterImageFiles(dir);
  if (listed.ok && listed.files.length > 0) {
    return { ok: true, extracted: false };
  }

  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { ok: false, error: 'Không đọc được danh sách file.' };
  }

  const pdf_basenames = names.filter((name) => {
    if (name.startsWith('._')) return false;
    return name.toLowerCase().endsWith('.pdf');
  });
  if (pdf_basenames.length !== 1) {
    return { ok: true, extracted: false };
  }
  pdf_basenames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const pdf_basename = pdf_basenames[0];
  const pdf_path = path.join(dir, pdf_basename);

  let pdf_stat;
  try {
    pdf_stat = fs.statSync(pdf_path);
  } catch {
    return { ok: false, error: 'Không đọc được file PDF.' };
  }

  const meta_path = path.join(dir, META_BASENAME);
  let cached_page_count = 0;
  const raster_dir = path.join(dir, CHAPTER_PDF_RASTER_SUBDIR);

  if (fs.existsSync(meta_path)) {
    try {
      const meta = JSON.parse(fs.readFileSync(meta_path, 'utf8'));
      if (
        meta &&
        meta.pdfBase === pdf_basename &&
        Number(meta.pdfMtimeMs) === pdf_stat.mtimeMs &&
        Number.isFinite(Number(meta.pageCount)) &&
        Number(meta.pageCount) > 0
      ) {
        cached_page_count = Number(meta.pageCount);
        let valid_pages = 0;
        for (let i = 1; i <= cached_page_count; i += 1) {
          const png_path = path.join(raster_dir, `${String(i).padStart(3, '0')}.png`);
          if (fs.existsSync(png_path) && fs.statSync(png_path).size > 0) {
            valid_pages += 1;
          }
        }
        if (valid_pages === cached_page_count) {
          return { ok: true, extracted: false };
        }
      }
    } catch {
      // Re-render below
    }
  }

  await ensurePdfjsWorker();
  // Internal renderer — see electron/lib/shared/pdfToPng.js (the
  // pdf-to-png-converter package throws "Invalid factory url" on Windows).
  const { pdfToPng } = require('../shared/pdfToPng');

  let total_pages = 0;
  try {
    const meta_pages = await pdfToPng(pdf_path, {
      disableFontFace: true,
      useSystemFonts: true,
      viewportScale: 2.0,
      returnMetadataOnly: true,
    });
    total_pages = meta_pages.length;
  } catch (e) {
    const msg = String(e?.message || e).toLowerCase();
    if (msg.includes('password') || msg.includes('encrypted') || msg.includes('no password given')) {
      return { ok: false, error: 'PDF được bảo vệ mật khẩu, không render được.' };
    }
    return { ok: false, error: String(e?.message || e) || 'Không đọc được PDF.' };
  }

  if (!total_pages) {
    return { ok: false, error: 'PDF không có trang.' };
  }

  fs.mkdirSync(raster_dir, { recursive: true });

  for (let i = 1; i <= total_pages; i += 1) {
    const pages = await pdfToPng(pdf_path, {
      disableFontFace: true,
      useSystemFonts: true,
      viewportScale: 2.0,
      pagesToProcess: [i],
      returnPageContent: true,
    });
    if (pages[0]?.content) {
      const out_name = `${String(i).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(raster_dir, out_name), pages[0].content);
    }
  }

  try {
    fs.writeFileSync(
      meta_path,
      JSON.stringify({
        pdfBase: pdf_basename,
        pdfMtimeMs: pdf_stat.mtimeMs,
        pageCount: total_pages,
      })
    );
  } catch {
    // Non-fatal
  }

  return { ok: true, extracted: true };
}

module.exports = { ensureChapterPdfRenderedAsPngPages, META_BASENAME, CHAPTER_PDF_RASTER_SUBDIR };
