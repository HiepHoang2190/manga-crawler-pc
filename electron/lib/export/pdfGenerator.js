const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Jimp = require('jimp');

// Lazy-load sharp — it's a native module that may be unavailable on some platforms.
// Jimp (pure JS) is used as a fallback when sharp cannot be loaded.
let _sharp = null;
function _getSharp() {
  if (_sharp === null) {
    try {
      _sharp = require('sharp');
    } catch (_) {
      _sharp = false;
    }
  }
  return _sharp || null;
}

function _mimeToFormat(mime) {
  const map = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
  };
  return map[String(mime).toLowerCase()] || 'jpeg';
}

// Formats Jimp cannot decode — detected via extension to avoid a crash before format is known
const _JIMP_UNSUPPORTED = ['webp', 'avif', 'heif', 'heic'];

function _extFormat(imgPath) {
  const ext = path.extname(imgPath).toLowerCase().slice(1);
  return ext === 'jpg' ? 'jpeg' : ext;
}

async function _getImageMetadata(imgPath) {
  const sharp = _getSharp();
  if (sharp) {
    return await sharp(imgPath).metadata();
  }
  // Jimp has no webp/avif/heif codec — return format from extension only (dimensions unknown)
  if (_JIMP_UNSUPPORTED.includes(_extFormat(imgPath))) {
    return { width: null, height: null, format: _extFormat(imgPath) };
  }
  const img = await Jimp.read(imgPath);
  return { width: img.bitmap.width, height: img.bitmap.height, format: _mimeToFormat(img.getMIME()) };
}

const JPEG_QUALITY = 95;

/** Convert unsupported formats to high-quality JPEG (PNG balloons size; Amazon prefers JPEG). */
async function _convertToJpeg(imgPath, outputPath) {
  const sharp = _getSharp();
  if (sharp) {
    await sharp(imgPath).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(outputPath);
    return;
  }
  // Jimp cannot decode webp/avif/heif — sharp is required for these formats
  const fmt = _extFormat(imgPath);
  if (_JIMP_UNSUPPORTED.includes(fmt)) {
    throw new Error(
      `Converting ${fmt.toUpperCase()} images requires the sharp module, which failed to load. ` +
      `Please reinstall the application to restore sharp support.`
    );
  }
  const img = await Jimp.read(imgPath);
  await img.quality(JPEG_QUALITY).writeAsync(outputPath);
}

/**
 * Generate PDF from images with variable page sizes.
 * Each image becomes a full page with dimensions matching the image.
 *
 * @param {object} opts
 * @param {Array<{path: string, title: string}>} opts.images - Array of image objects with path and title
 * @param {string} opts.outputPath - Full path to output PDF file
 * @param {object} opts.metadata - PDF metadata
 * @param {string} opts.metadata.title - PDF title
 * @param {string} opts.metadata.creator - PDF creator/author
 * @param {boolean} [opts.seamless=false] - If true, stack all images into one tall page (no page breaks between images)
 * @param {function} [opts.onProgress] - Progress callback: ({done: number, total: number, label: string}) => void
 * @returns {Promise<void>}
 */
async function generatePdf(optsOrImages, maybeOutputPath, maybeOpts) {
  let opts = {};
  if (Array.isArray(optsOrImages)) {
    opts = {
      images: optsOrImages.map((p) => (typeof p === 'string' ? { path: p } : p)),
      outputPath: maybeOutputPath,
      ...(maybeOpts || {}),
    };
  } else {
    opts = optsOrImages || {};
  }
  const images = Array.isArray(opts.images) ? opts.images : [];
  const outputPath = String(opts.outputPath || '').trim();
  const metadata = opts.metadata || {};
  const seamless = Boolean(opts.seamless);
  const onProgress = opts.onProgress;

  if (!images.length) {
    throw new Error('No images provided for PDF generation');
  }

  if (!outputPath) {
    throw new Error('Output path is required for PDF generation');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create PDF document with autoFirstPage: false (we'll add pages manually)
  const doc = new PDFDocument({ autoFirstPage: false });
  
  // Create write stream
  const stream = fs.createWriteStream(outputPath);
  
  // Set up error handling for stream
  let streamError = null;
  stream.on('error', (err) => {
    streamError = err;
    console.error('[PDFGenerator] Stream error:', err);
  });

  // Pipe document to stream
  doc.pipe(stream);

  // Set PDF metadata
  doc.info.Title = String(metadata.title || 'Manga Export');
  doc.info.Creator = String(metadata.creator || 'Manga Crawler Export');
  doc.info.CreationDate = new Date();

  console.log(`[PDFGenerator] Starting PDF generation: ${images.length} images${seamless ? ' (seamless mode)' : ''}`);
  console.log(`[PDFGenerator] Output: ${outputPath}`);
  console.log(`[PDFGenerator] Metadata: ${doc.info.Title} by ${doc.info.Creator}`);

  // Temporary files to clean up
  const tempFiles = [];

  try {
    if (seamless) {
      // ── Seamless mode: collect all image dimensions first, then render one tall page ──
      const resolvedImages = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imgPath = String(img.path || '').trim();
        if (!imgPath) {
          console.warn(`[PDFGenerator] Skipping image ${i + 1}: no path provided`);
          continue;
        }
        if (!fs.existsSync(imgPath)) {
          throw new Error(`Image file not found: ${imgPath}`);
        }

        const imgMetadata = await _getImageMetadata(imgPath);
        let { width, height, format } = imgMetadata;

        const unsupportedFormats = ['webp', 'avif', 'gif', 'tiff', 'tif', 'heif', 'heic'];
        let imagePathToUse = imgPath;

        if (unsupportedFormats.includes(String(format || '').toLowerCase())) {
          console.log(`[PDFGenerator] Converting ${String(format).toUpperCase()} to JPEG for PDF compatibility`);
          const tempJpegPath = path.join(os.tmpdir(), `pdf-convert-${Date.now()}-${i}.jpg`);
          await _convertToJpeg(imgPath, tempJpegPath);
          imagePathToUse = tempJpegPath;
          tempFiles.push(tempJpegPath);
          // Re-read dimensions from the converted JPEG when original was unreadable (e.g. webp without sharp)
          if (!width || !height) {
            const convertedMeta = await _getImageMetadata(imagePathToUse);
            width = convertedMeta.width;
            height = convertedMeta.height;
          }
        }

        if (!width || !height) {
          throw new Error(`Cannot determine dimensions for image: ${path.basename(imgPath)}`);
        }

        resolvedImages.push({ imgPath: imagePathToUse, width, height, title: String(img.title || '') });

        if (onProgress) {
          onProgress({ done: i + 1, total: images.length * 2, label: String(img.title || path.basename(imgPath)) });
        }
      }

      if (!resolvedImages.length) throw new Error('No valid images to render.');

      // All images are scaled to the width of the widest image
      const pageWidth = Math.max(...resolvedImages.map((r) => r.width));
      const totalHeight = resolvedImages.reduce((sum, r) => {
        // Scale height proportionally if width differs
        return sum + Math.round(r.height * (pageWidth / r.width));
      }, 0);

      console.log(`[PDFGenerator] Seamless page: ${pageWidth}×${totalHeight} px`);
      doc.addPage({ size: [pageWidth, totalHeight], margin: 0 });

      let yOffset = 0;
      for (let i = 0; i < resolvedImages.length; i++) {
        const { imgPath, width, height, title } = resolvedImages[i];
        const scaledHeight = Math.round(height * (pageWidth / width));
        doc.image(imgPath, 0, yOffset, { width: pageWidth, height: scaledHeight });
        yOffset += scaledHeight;

        if (onProgress) {
          onProgress({ done: images.length + i + 1, total: images.length * 2, label: title || path.basename(imgPath) });
        }
      }
    } else {
      // ── Normal mode: one page per image ──
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const imgPath = String(img.path || '').trim();
        const imgTitle = String(img.title || '').trim();

        if (!imgPath) {
          console.warn(`[PDFGenerator] Skipping image ${i + 1}: no path provided`);
          continue;
        }

        if (!fs.existsSync(imgPath)) {
          throw new Error(`Image file not found: ${imgPath}`);
        }

        try {
          const imgMetadata = await _getImageMetadata(imgPath);
          let { width, height, format } = imgMetadata;

          const unsupportedFormats = ['webp', 'avif', 'gif', 'tiff', 'tif', 'heif', 'heic'];
          let imagePathToUse = imgPath;

          if (unsupportedFormats.includes(String(format || '').toLowerCase())) {
            console.log(`[PDFGenerator] Converting ${String(format).toUpperCase()} to JPEG for PDF compatibility`);
            const tempJpegPath = path.join(os.tmpdir(), `pdf-convert-${Date.now()}-${i}.jpg`);
            await _convertToJpeg(imgPath, tempJpegPath);
            imagePathToUse = tempJpegPath;
            tempFiles.push(tempJpegPath);
            // Re-read dimensions from the converted JPEG when original was unreadable (e.g. webp without sharp)
            if (!width || !height) {
              const convertedMeta = await _getImageMetadata(imagePathToUse);
              width = convertedMeta.width;
              height = convertedMeta.height;
            }
            console.log(`[PDFGenerator] Converted to: ${path.basename(tempJpegPath)}`);
          }

          if (!width || !height) {
            throw new Error(`Cannot determine dimensions for image: ${path.basename(imgPath)}`);
          }

          console.log(`[PDFGenerator] Adding page ${i + 1}/${images.length}: ${path.basename(imgPath)} (${width}×${height}, ${format})`);

          // Add page with dimensions matching the image (variable page size)
          doc.addPage({ size: [width, height], margin: 0 });
          doc.image(imagePathToUse, 0, 0, { width, height });

          if (onProgress) {
            onProgress({ done: i + 1, total: images.length, label: imgTitle || path.basename(imgPath) });
          }
        } catch (error) {
          console.error(`[PDFGenerator] Error processing image ${i + 1}:`, error);
          throw new Error(`Failed to add image to PDF: ${path.basename(imgPath)} - ${error.message}`);
        }
      }
    }
  } finally {
    // Clean up temporary converted files
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
          console.log(`[PDFGenerator] Cleaned up temp file: ${path.basename(tempFile)}`);
        }
      } catch (cleanupError) {
        console.warn(`[PDFGenerator] Failed to clean up temp file ${tempFile}:`, cleanupError);
      }
    }
  }

  // Finalize PDF document
  doc.end();

  // Wait for stream to finish writing
  await new Promise((resolve, reject) => {
    stream.on('finish', () => {
      if (streamError) {
        reject(streamError);
      } else {
        console.log(`[PDFGenerator] PDF generation complete: ${outputPath}`);
        resolve();
      }
    });
    stream.on('error', reject);
    doc.on('error', reject);
  });

  // Verify output file was created
  if (!fs.existsSync(outputPath)) {
    throw new Error('PDF file was not created successfully');
  }

  const stats = fs.statSync(outputPath);
  console.log(`[PDFGenerator] Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

module.exports = {
  generatePdf,
};
