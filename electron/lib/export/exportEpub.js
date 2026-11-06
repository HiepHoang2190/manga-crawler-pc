'use strict';

/**
 * KCC-compatible fixed-layout (pre-paginated) EPUB 3 export for manga/comic images.
 * Optimised for Kindle hardware, Kobo, Boox and other e-ink readers.
 * Each page XHTML declares a viewport matching the source image dimensions;
 * the OPF carries Kindle-specific metadata (fixed-layout, zero-gutter, book-type comic)
 * and page-spread properties in the spine to prevent blank interleaved pages.
 * JPEG/PNG bytes are stored unchanged; WebP/BMP/etc. convert to high-quality JPEG.
 * sizeSplit mode mirrors exportPdf: bin-pack images under maxBytes, one .epub per part.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const sharp = require('sharp');

const { resolveChapterDir, resolveMangaDir } = require('../download/connector/connectorPathUtils');
const {
  isFlatChapterLayout,
  getFlatChapterImageNamePrefix,
  sortChaptersForExport,
  formatFolderName,
} = require('../shared/mangaUtils');
const { listChapterImageFiles, IMAGE_EXT } = require('../library/listChapterImageFiles');
const { safePdfBaseName, safePartPdfBaseName } = require('./exportPdf');

const EPUB_BASE_OVERHEAD = 12 * 1024;
const EPUB_PER_IMAGE_OVERHEAD = 2 * 1024;
const MAX_EPUB_BASENAME = 180;

/** Formats Amazon STK mishandles — convert to high-quality JPEG (not PNG). */
const CONVERT_TO_JPEG_EXTS = new Set(['.webp', '.bmp', '.avif', '.heic', '.heif', '.tif', '.tiff']);
const JPEG_QUALITY = 95;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimated packaged size for bin-packing (images stored + EPUB XML overhead).
 * @param {Array<{ sz: number }>} items
 * @returns {number}
 */
function estimateEpubPartBytes(items) {
  const list = Array.isArray(items) ? items : [];
  const raw = list.reduce((sum, it) => sum + (Number(it.sz) || 0), 0);
  return raw + EPUB_BASE_OVERHEAD + list.length * EPUB_PER_IMAGE_OVERHEAD;
}

function collectChapterImages(chapterDir, flatten, listOptions = {}) {
  if (!flatten) {
    const result = listChapterImageFiles(chapterDir, listOptions);
    if (result.ok && result.files && result.files.length > 0) {
      return result.files;
    }
  }

  function recurse(dir, base) {
    const results = [];
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        results.push(...recurse(path.join(dir, e.name), rel));
      } else if (IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
        results.push(rel);
      }
    }
    return results;
  }

  const allFiles = recurse(chapterDir, '');
  allFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return allFiles;
}

function assertChapterDirUnderManga(mangaDirResolved, chapterDirResolved) {
  const rel = path.relative(mangaDirResolved, chapterDirResolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Đường dẫn chương không hợp lệ.');
  }
}

function mediaTypeForExt(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'image/jpeg';
}

/** Kindle hardware texture & fixed-layout limit (1920px max on long edge). */
const MAX_KINDLE_IMAGE_DIM = 1920;

/**
 * Prepare one source image for EPUB packaging.
 * Returns dimensions (width, height) alongside the prepared file path.
 * Images exceeding Kindle's 1920px hardware texture limit are downscaled proportionally.
 * @returns {Promise<{ srcPath: string, ext: string, mediaType: string, tempPath: string|null, width: number, height: number }>}
 */
async function prepareEpubImage(srcPath) {
  const ext = path.extname(srcPath).toLowerCase() || '.jpg';
  const meta = await sharp(srcPath).metadata();
  const rawW = meta.width || 800;
  const rawH = meta.height || 1200;
  const needsResize = rawW > MAX_KINDLE_IMAGE_DIM || rawH > MAX_KINDLE_IMAGE_DIM;
  const needsFormatConvert = CONVERT_TO_JPEG_EXTS.has(ext);

  if (!needsResize && !needsFormatConvert) {
    const outExt = ext === '.jpeg' ? '.jpg' : ext;
    return {
      srcPath,
      ext: outExt,
      mediaType: mediaTypeForExt(outExt),
      tempPath: null,
      width: rawW,
      height: rawH,
    };
  }

  const tempPath = path.join(os.tmpdir(), `epub-img-${crypto.randomUUID()}.jpg`);
  let pipeline = sharp(srcPath);
  if (needsResize) {
    pipeline = pipeline.resize({
      width: rawW >= rawH ? MAX_KINDLE_IMAGE_DIM : undefined,
      height: rawH > rawW ? MAX_KINDLE_IMAGE_DIM : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const info = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(tempPath);
  return {
    srcPath: tempPath,
    ext: '.jpg',
    mediaType: 'image/jpeg',
    tempPath,
    width: info.width || rawW,
    height: info.height || rawH,
  };
}

/** Shared CSS for fixed-layout pages (referenced by each page XHTML). */
function buildStyleCss() {
  return `@page {
  margin: 0;
  padding: 0;
}
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background-color: #FFFFFF;
}
body {
  display: block;
}
div.page-wrapper {
  text-align: center;
  margin: 0;
  padding: 0;
}
img {
  display: block;
  margin: 0 auto;
  padding: 0;
}
`;
}

/**
 * Build one page XHTML with viewport meta matching image dimensions.
 * KCC-compatible: Kindle uses the viewport to determine fixed page size.
 * The hidden div fixes Kindle virtual panel mode/formatting quirks.
 */
function buildPageXhtml({ imageHref, title, width, height }) {
  const w = width || 800;
  const h = height || 1200;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=${w}, height=${h}"/>
  <title>${escapeXml(title || 'Page')}</title>
  <link href="../style.css" type="text/css" rel="stylesheet"/>
</head>
<body>
  <div class="page-wrapper" style="text-align:center;">
    <div style="display:none;">.</div>
    <img src="${escapeXml(imageHref)}" width="${w}" height="${h}" alt=""/>
  </div>
</body>
</html>
`;
}

function buildNavXhtml(pages) {
  // One TOC entry per chapter (first page of each title run), not one per image.
  const lis = [];
  let lastTitle = null;
  const list = Array.isArray(pages) ? pages : [];
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    const title = String(p?.title || '').trim() || `Page ${i + 1}`;
    if (title === lastTitle) continue;
    lastTitle = title;
    lis.push(`    <li><a href="pages/${p.pageFile}">${escapeXml(title)}</a></li>`);
  }
  const firstPageFile = list.length > 0 ? list[0].pageFile : 'page_0001.xhtml';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head><meta charset="utf-8"/><title>Navigation</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${lis.join('\n')}
    </ol>
  </nav>
  <nav epub:type="landmarks" id="landmarks" hidden="">
    <h2>Guide</h2>
    <ol>
      <li><a epub:type="cover" href="pages/${firstPageFile}">Cover</a></li>
      <li><a epub:type="bodymatter" href="pages/${firstPageFile}">Start of Content</a></li>
    </ol>
  </nav>
</body>
</html>
`;
}

/**
 * Build EPUB 2 NCX TOC for backward compatibility with older Kindle firmware.
 */
function buildNcxToc({ uuid, title, pages }) {
  const navPoints = [];
  let lastTitle = null;
  let playOrder = 0;
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i];
    const t = String(p?.title || '').trim() || `Page ${i + 1}`;
    if (t === lastTitle) continue;
    lastTitle = t;
    playOrder += 1;
    navPoints.push(
      `    <navPoint id="navpoint_${playOrder}" playOrder="${playOrder}">\n` +
      `      <navLabel><text>${escapeXml(t)}</text></navLabel>\n` +
      `      <content src="pages/${p.pageFile}"/>\n` +
      `    </navPoint>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title || 'Manga')}</text></docTitle>
  <navMap>
${navPoints.join('\n')}
  </navMap>
</ncx>
`;
}

/**
 * Determine page-spread property for each page in the spine.
 * Portrait images alternate left/right; landscape images get "center".
 */
function computePageSpreadProperties(pages) {
  let side = 'left';
  return pages.map((p) => {
    const w = p.width || 800;
    const h = p.height || 1200;
    // Landscape or near-square images → center (takes full spread)
    if (w >= h * 1.0) {
      // After a center page, reset alternation
      side = 'left';
      return 'center';
    }
    const current = side;
    side = side === 'left' ? 'right' : 'left';
    return current;
  });
}

function buildContentOpf({ title, creator, pages, uuid }) {
  const firstPage = pages[0];

  // Compute the "original-resolution" — use the most common page size or the first page
  const resW = firstPage ? (firstPage.width || 800) : 800;
  const resH = firstPage ? (firstPage.height || 1200) : 1200;

  const manifestItems = [
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="css" href="style.css" media-type="text/css"/>`,
    ...pages.flatMap((p, i) => {
      const n = String(i + 1).padStart(4, '0');
      const isFirst = i === 0;
      const imgProp = isFirst ? ` properties="cover-image"` : '';
      return [
        `    <item id="page_${n}" href="pages/${p.pageFile}" media-type="application/xhtml+xml"/>`,
        `    <item id="img_${n}" href="images/${p.imageFile}" media-type="${p.mediaType}"${imgProp}/>`,
      ];
    }),
  ].join('\n');

  // Compute page-spread properties
  const spreads = computePageSpreadProperties(pages);
  const spine = pages
    .map((_, i) => {
      const n = String(i + 1).padStart(4, '0');
      const spread = spreads[i];
      const prop = `properties="page-spread-${spread}"`;
      return `    <itemref idref="page_${n}" linear="yes" ${prop}/>`;
    })
    .join('\n');

  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const firstPageFile = firstPage ? firstPage.pageFile : 'page_0001.xhtml';

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title || 'Manga')}</dc:title>
    <dc:creator>${escapeXml(creator || 'Manga Crawler')}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    <meta name="cover" content="img_0001"/>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:spread">landscape</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta name="fixed-layout" content="true"/>
    <meta name="original-resolution" content="${resW}x${resH}"/>
    <meta name="book-type" content="comic"/>
    <meta name="primary-writing-mode" content="horizontal-lr"/>
    <meta name="zero-gutter" content="true"/>
    <meta name="zero-margin" content="true"/>
    <meta name="ke-border-color" content="#FFFFFF"/>
    <meta name="ke-border-width" content="0"/>
    <meta name="orientation-lock" content="none"/>
    <meta name="region-mag" content="false"/>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine page-progression-direction="ltr" toc="ncx">
${spine}
  </spine>
  <guide>
    <reference type="text" title="Start" href="pages/${firstPageFile}"/>
    <reference type="cover" title="Cover" href="pages/${firstPageFile}"/>
  </guide>
</package>
`;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

/**
 * Write one Kindle-safe reflowable image EPUB from an ordered list of images.
 * @param {object} opts
 * @param {Array<{ path: string, title?: string }>} opts.images
 * @param {string} opts.outputPath
 * @param {{ title?: string, creator?: string }} [opts.metadata]
 * @returns {Promise<string>}
 */
async function writeFixedLayoutEpub(opts) {
  const images = Array.isArray(opts.images) ? opts.images : [];
  const outputPath = String(opts.outputPath || '').trim();
  if (!outputPath) throw new Error('Thiếu đường dẫn file .epub.');
  if (!images.length) throw new Error('Không có ảnh để đóng gói EPUB.');

  const title = (opts.metadata && opts.metadata.title) || 'Manga';
  const creator = (opts.metadata && opts.metadata.creator) || 'Manga Crawler';
  const uuid = crypto.randomUUID();
  const tempFiles = [];

  try {
    const pages = [];
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      const prepared = await prepareEpubImage(img.path);
      if (prepared.tempPath) tempFiles.push(prepared.tempPath);
      const n = String(i + 1).padStart(4, '0');
      pages.push({
        srcPath: prepared.srcPath,
        title: img.title || `Page ${i + 1}`,
        imageFile: `img_${n}${prepared.ext}`,
        pageFile: `page_${n}.xhtml`,
        mediaType: prepared.mediaType,
        width: prepared.width,
        height: prepared.height,
      });
    }

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 0 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      archive.append('application/epub+zip', { name: 'mimetype', store: true });
      archive.append(CONTAINER_XML, { name: 'META-INF/container.xml' });
      archive.append(buildContentOpf({ title, creator, pages, uuid }), { name: 'OEBPS/content.opf' });
      archive.append(buildNcxToc({ uuid, title, pages }), { name: 'OEBPS/toc.ncx' });
      archive.append(buildNavXhtml(pages), { name: 'OEBPS/nav.xhtml' });
      archive.append(buildStyleCss(), { name: 'OEBPS/style.css' });

      for (const p of pages) {
        archive.file(p.srcPath, { name: `OEBPS/images/${p.imageFile}`, store: true });
        archive.append(
          buildPageXhtml({
            imageHref: `../images/${p.imageFile}`,
            title: p.title,
            width: p.width,
            height: p.height,
          }),
          { name: `OEBPS/pages/${p.pageFile}` }
        );
      }

      archive.finalize();
    });
  } finally {
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  return outputPath;
}

function collectAllChapterItems(opts) {
  const base = String(opts.baseSaveDir || '').trim();
  const mt = String(opts.mangaTitle || '').trim();
  const chapters = sortChaptersForExport(opts.chapters || []);
  const chapterFolderFormat = opts.chapterFolderFormat;
  const flatten = Boolean(opts.flattenSubfolders);

  const absDir = String(opts.absoluteMangaDir || '').trim();
  const mangaDir = absDir ? path.resolve(absDir) : resolveMangaDir(base, mt);
  const mangaResolved = path.resolve(mangaDir);

  const allItems = [];
  for (const ch of chapters) {
    const ct = String(ch.title || '').trim();
    if (!ct) continue;
    const fb = String(ch.folderBasename || '').trim();
    const chapterDir = fb
      ? path.join(mangaResolved, fb)
      : resolveChapterDir(base, mt, ct, chapterFolderFormat);
    assertChapterDirUnderManga(mangaResolved, path.resolve(chapterDir));
    const listOptions =
      isFlatChapterLayout(chapterFolderFormat) && !fb
        ? { namePrefix: getFlatChapterImageNamePrefix(ct, chapterFolderFormat) }
        : {};
    const files = collectChapterImages(chapterDir, flatten, listOptions);
    if (!files.length) throw new Error(`Không có ảnh trong chương: ${ct}`);
    for (const name of files) {
      if (path.basename(name).includes('..')) continue;
      allItems.push({
        full: path.join(chapterDir, name),
        title: ct,
        baseName: path.basename(name),
        ext: path.extname(name).toLowerCase(),
      });
    }
  }
  if (!allItems.length) throw new Error('Không có ảnh để đóng gói.');
  return allItems;
}

/**
 * @param {object} opts
 * @param {'sizeSplit'} opts.mode
 * @param {string} opts.mangaTitle
 * @param {Array} opts.chapters
 * @param {string} opts.outputDir
 * @param {number} opts.maxBytes
 * @param {object} [opts.chapterFolderFormat]
 * @param {string} [opts.absoluteMangaDir]
 * @param {string} [opts.baseSaveDir]
 * @param {boolean} [opts.flattenSubfolders]
 * @param {string} [opts.author]
 * @param {(p: object) => void} [opts.onProgress]
 * @returns {Promise<string[]>}
 */
async function exportChaptersToEpub(opts) {
  if (opts.mode !== 'sizeSplit') {
    throw new Error('Chế độ xuất EPUB không hợp lệ (chỉ hỗ trợ sizeSplit).');
  }

  const outputDir = String(opts.outputDir || '').trim();
  if (!outputDir) throw new Error('Thiếu thư mục đích.');
  const maxBytes = Number(opts.maxBytes);
  if (!Number.isFinite(maxBytes) || maxBytes < 1024) {
    throw new Error('Giới hạn dung lượng mỗi file không hợp lệ (tối thiểu 1 KB).');
  }

  const mt = String(opts.mangaTitle || '').trim() || 'Manga';
  const onProgress = opts.onProgress;
  const allItems = collectAllChapterItems(opts);

  const sized = [];
  for (const item of allItems) {
    let st;
    try {
      st = fs.statSync(item.full);
    } catch (e) {
      throw new Error(`Không đọc được file: ${item.baseName} (${String(e?.message || e)})`);
    }
    sized.push({ ...item, sz: st.size });
  }

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
  const outputFiles = [];
  const creator = String(opts.author || 'Manga Crawler').trim() || 'Manga Crawler';

  for (let i = 0; i < segments.length; i += 1) {
    const partIndex = i + 1;
    const fileBase = `${safePartPdfBaseName(mt, partIndex, totalParts)}.epub`;
    const outPath = path.join(outputDir, fileBase);
    const partTitle =
      totalParts > 1 ? `${mt} - Part ${String(partIndex).padStart(2, '0')}` : mt;

    onProgress?.({ done: i, total: totalParts, label: `EPUB ${partIndex}/${totalParts}` });

    await writeFixedLayoutEpub({
      images: segments[i].map((item) => ({ path: item.full, title: item.title })),
      outputPath: outPath,
      metadata: { title: partTitle, creator },
    });
    outputFiles.push(outPath);

    onProgress?.({
      done: partIndex,
      total: totalParts,
      label: `EPUB ${partIndex}/${totalParts}`,
    });
  }

  return outputFiles;
}

function safeEpubBaseName(mangaTitle) {
  return formatFolderName(mangaTitle, MAX_EPUB_BASENAME).trim() || 'Manga';
}

module.exports = {
  writeFixedLayoutEpub,
  exportChaptersToEpub,
  estimateEpubPartBytes,
  safeEpubBaseName,
  safePdfBaseName,
};
