'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const TARGET_EXT = { jpg: '.jpg', png: '.png', webp: '.webp', original: 'original' };
const IMAGE_GLOB = '*.{jpg,jpeg,png,webp,gif,bmp,avif}';
const IMAGE_GLOB_REC = '**/*.{jpg,jpeg,png,webp,gif,bmp,avif}';

function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e.startsWith('.') ? e : `.${e}`;
}

function isImageExt(ext) {
  return IMAGE_EXTS.has(normalizeExt(ext));
}

function matchesTargetFormat(ext, targetFormat) {
  const t = String(targetFormat || '').toLowerCase();
  if (t === 'original') return false;
  const e = normalizeExt(ext);
  if (t === 'jpg') return e === '.jpg' || e === '.jpeg';
  if (t === 'png') return e === '.png';
  if (t === 'webp') return e === '.webp';
  return false;
}

function buildOutputPath({ sourceDir, absolutePath, sameAsSource, outputDir, targetFormat }) {
  const t = String(targetFormat || '').toLowerCase();
  const parsed = path.parse(absolutePath);
  const ext = t === 'original' ? parsed.ext : TARGET_EXT[t];
  if (!ext) throw new Error(`Unsupported target format: ${targetFormat}`);
  const newBase = parsed.name + ext;
  if (sameAsSource) {
    return path.join(parsed.dir, newBase);
  }
  if (!sourceDir) {
    return path.join(outputDir, newBase);
  }
  const rel = path.relative(sourceDir, absolutePath);
  const relDir = path.dirname(rel);
  const outDir = relDir === '.' ? outputDir : path.join(outputDir, relDir);
  return path.join(outDir, newBase);
}

async function scanImageFolder({
  sourceDir,
  sourceFiles,
  includeSubfolders = false,
  targetFormat = 'png',
} = {}) {
  const isFilesMode = Array.isArray(sourceFiles) && sourceFiles.length > 0;
  const source_value = String(sourceDir || '').trim();

  if (!isFilesMode && !source_value) {
    return { ok: false, error: 'Invalid source directory', images: [], skipped: [] };
  }

  let found = [];
  let root = '';

  if (isFilesMode) {
    found = sourceFiles.filter((filePath) => typeof filePath === 'string' && fs.existsSync(filePath));
    root = source_value ? path.resolve(source_value) : '';
  } else {
    root = path.resolve(source_value);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return { ok: false, error: 'Invalid source directory', images: [], skipped: [] };
    }
    const pattern = includeSubfolders ? IMAGE_GLOB_REC : IMAGE_GLOB;
    found = await fg.glob(pattern, {
      cwd: root,
      onlyFiles: true,
      caseSensitiveMatch: false,
      absolute: true,
      dot: false,
      deep: includeSubfolders ? 5 : 1,
    });
  }

  const images = [];
  const skipped = [];
  for (const absolutePath of found.sort()) {
    const ext = path.extname(absolutePath);
    if (!isImageExt(ext)) continue;
    const relativePath = isFilesMode
      ? (root ? path.relative(root, absolutePath) : path.basename(absolutePath))
      : path.relative(root, absolutePath);
    const entry = { absolutePath, relativePath, ext: normalizeExt(ext) };
    if (matchesTargetFormat(ext, targetFormat)) skipped.push(entry);
    else images.push(entry);
  }
  return { ok: true, images, skipped, sourceDir: root };
}

let _sharpCache;

function getSharpDefault() {
  if (_sharpCache === undefined) {
    try {
      _sharpCache = require('sharp');
    } catch {
      _sharpCache = null;
    }
  }
  return _sharpCache;
}

function getJimpDefault() {
  try {
    return require('jimp');
  } catch {
    return null;
  }
}

function __resetSharpCacheForTests() {
  _sharpCache = undefined;
}

async function encodeImageToFormat(inputPath, outputPath, targetFormat, deps = {}) {
  const t = String(targetFormat || '').toLowerCase();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (t === 'original') {
    if (path.resolve(inputPath) !== path.resolve(outputPath)) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return;
  }

  const getSharp = deps.getSharp ?? getSharpDefault;
  const getJimp = deps.getJimp ?? getJimpDefault;

  const sharpFn = getSharp();
  if (sharpFn) {
    // Read to buffer first to prevent sharp from memory-mapping the file on Windows,
    // which locks the file and prevents it from being moved to the trash afterwards.
    let inputArg = inputPath;
    try {
      inputArg = await (deps.readFile ?? fs.promises.readFile)(inputPath);
    } catch {
      inputArg = inputPath;
    }
    const instance = sharpFn(inputArg);
    if (t === 'png') {
      await instance.png().toFile(outputPath);
    } else if (t === 'jpg') {
      await instance.jpeg({ quality: 100 }).toFile(outputPath);
    } else if (t === 'webp') {
      await instance.webp({ lossless: true }).toFile(outputPath);
    } else {
      throw new Error(`Unsupported target format: ${targetFormat}`);
    }
    return { engine: 'sharp' };
  }

  if (t === 'webp') {
    throw new Error(
      'Converting to WebP requires the sharp module, which failed to load. Please reinstall the app to restore sharp support.'
    );
  }

  const Jimp = getJimp();
  if (!Jimp) {
    throw new Error('No image encoder available (sharp or jimp)');
  }

  const jimpImg = await Jimp.read(inputPath);
  if (t === 'jpg') {
    await jimpImg.quality(100).writeAsync(outputPath);
  } else if (t === 'png') {
    await jimpImg.writeAsync(outputPath);
  } else {
    throw new Error(`Unsupported target format: ${targetFormat}`);
  }
  return { engine: 'jimp' };
}

let convertCancelled = false;

function requestCancelConvertFolderImages() {
  convertCancelled = true;
}

function resetConvertFolderImagesCancel() {
  convertCancelled = false;
}

async function convertFolderImages(opts = {}) {
  resetConvertFolderImagesCancel();
  const sourceFiles = Array.isArray(opts.sourceFiles) ? opts.sourceFiles : [];
  const isFilesMode = sourceFiles.length > 0;
  const source_value = String(opts.sourceDir || '').trim();
  const output_value = String(opts.outputDir || '').trim();
  const sourceDir = source_value ? path.resolve(source_value) : '';
  const targetFormat = String(opts.targetFormat || 'png').toLowerCase();
  const sameAsSource = Boolean(opts.sameAsSource);
  const outputDir = sameAsSource
    ? (sourceDir || (isFilesMode ? path.dirname(sourceFiles[0]) : ''))
    : output_value ? path.resolve(output_value) : '';
  const includeSubfolders = Boolean(opts.includeSubfolders);
  const moveOriginalsToTrash = Boolean(opts.moveOriginalsToTrash);
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const trashItem = opts.trashItem;
  const encode = opts.encodeImageToFormat || encodeImageToFormat;

  if (!sameAsSource && !outputDir) {
    return {
      ok: false,
      error: 'Missing output directory',
      converted: 0,
      skipped: 0,
      failed: 0,
      cancelled: false,
      errors: [],
      warnings: [],
    };
  }

  const scan = await scanImageFolder({ sourceDir, sourceFiles, includeSubfolders, targetFormat });
  if (!scan.ok) {
    return {
      ok: false,
      error: scan.error,
      converted: 0,
      skipped: 0,
      failed: 0,
      cancelled: false,
      errors: [],
      warnings: [],
    };
  }

  const queue = scan.images;
  const total = queue.length;
  let converted = 0;
  let failed = 0;
  const errors = [];
  const warnings = [];
  let cancelled = false;

  for (let i = 0; i < queue.length; i++) {
    if (convertCancelled) {
      cancelled = true;
      break;
    }
    const item = queue[i];
    onProgress({ done: i, total, currentRelativePath: item.relativePath, errors: [...errors] });
    try {
      const outPath = buildOutputPath({
        sourceDir,
        absolutePath: item.absolutePath,
        sameAsSource,
        outputDir,
        targetFormat,
      });
      if (path.resolve(outPath) === path.resolve(item.absolutePath)) {
        continue;
      }
      await encode(item.absolutePath, outPath, targetFormat);
      converted += 1;
      if (moveOriginalsToTrash && typeof trashItem === 'function') {
        try {
          await trashItem(item.absolutePath);
        } catch (e) {
          warnings.push({ relativePath: item.relativePath, error: String(e?.message || e) });
        }
      }
    } catch (e) {
      failed += 1;
      errors.push({ relativePath: item.relativePath, error: String(e?.message || e) });
    }
  }

  onProgress({
    done: cancelled ? converted + failed : total,
    total,
    currentRelativePath: '',
    errors: [...errors],
  });

  return {
    ok: failed === 0 && !cancelled,
    converted,
    skipped: scan.skipped.length,
    failed,
    cancelled,
    errors,
    warnings,
  };
}

module.exports = {
  IMAGE_EXTS,
  TARGET_EXT,
  IMAGE_GLOB,
  IMAGE_GLOB_REC,
  isImageExt,
  matchesTargetFormat,
  buildOutputPath,
  normalizeExt,
  scanImageFolder,
  encodeImageToFormat,
  __resetSharpCacheForTests,
  convertFolderImages,
  requestCancelConvertFolderImages,
  resetConvertFolderImagesCancel,
};
