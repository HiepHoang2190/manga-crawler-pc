/**
 * Generates descriptive filename suffix for upscaled images.
 * Format: _<modelTag>[_noise<N>]_<scale>x
 * Example: _cugan_noise1_2x, _cunet_noise1_2x, _realesrgan_anime_4x
 *
 * @param {Object} model - Selected model object (has suffixTag or id)
 * @param {number|string} scale - Scale factor (e.g. 2, 3, 4)
 * @param {number} denoise - Denoise level (-1, 0, 1, 2, 3)
 * @param {boolean} supportsDenoise - Whether the engine supports denoise
 * @returns {string} e.g. '_cugan_noise1_2x'
 */
export function getUpscaleSuffix(model, scale, denoise, supportsDenoise) {
  const parts = [];
  const tag = model?.suffixTag || model?.id || 'ai';
  parts.push(tag);
  if (supportsDenoise && denoise !== undefined && denoise !== null && Number(denoise) >= 0) {
    parts.push(`noise${denoise}`);
  }
  if (scale) {
    parts.push(`${scale}x`);
  }
  return `_${parts.join('_')}`;
}

/**
 * Resolves the destination directory where output files will be saved.
 * - When inPlace is true:
 *     - If sourceDir exists: returns sourceDir
 *     - Else if sourceFiles has items: returns folder containing the first file
 * - When inPlace is false:
 *     - If sourceDir exists (imported folder): appends sourceDir root folder name to outputDir (unless outputDir already ends with it)
 *     - If sourceFiles only (imported files): returns clean outputDir (files placed directly in outputDir)
 *
 * @param {Object} params
 * @param {string} [params.sourceDir=''] - Source directory if imported folder
 * @param {Array<string>} [params.sourceFiles=[]] - Source files list if imported files
 * @param {boolean} [params.inPlace=false] - Whether in-place mode is active
 * @param {string} [params.outputDir=''] - Configured output directory
 * @returns {string} Destination folder path
 */
export function getUpscaleOutputFolder({
  sourceDir = '',
  sourceFiles = [],
  inPlace = false,
  outputDir = '',
}) {
  if (inPlace) {
    if (sourceDir) return sourceDir.replace(/[\\/]+$/, '');
    if (sourceFiles && sourceFiles[0]) return sourceFiles[0].replace(/[\\/][^\\/]+$/, '');
    return '';
  }

  if (!outputDir) return '';

  let cleanOutputDir = outputDir.replace(/[\\/]+$/, '');
  const sep = cleanOutputDir.includes('\\') ? '\\' : '/';

  if (sourceDir) {
    const rootFolder = sourceDir.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || '';
    const outputFolder = cleanOutputDir.split(/[\\/]/).filter(Boolean).pop() || '';

    if (rootFolder && rootFolder.toLowerCase() !== outputFolder.toLowerCase()) {
      return `${cleanOutputDir}${sep}${rootFolder}`;
    }
  }

  return cleanOutputDir;
}

/**
 * Builds destination file path for an upscaled image.
 *
 * @param {Object} params
 * @param {string} params.inputPath - Original file path
 * @param {string} [params.relativePath] - Relative path from source folder
 * @param {string} [params.sourceDir] - Source folder path (e.g. /path/to/Naruto)
 * @param {boolean} params.inPlace - Save alongside original
 * @param {string} params.outputDir - Output directory
 * @param {string} [params.outputFormat='original'] - 'original' | 'jpg' | 'png' | 'webp'
 * @param {boolean} [params.appendParams=true] - Whether to append model/scale suffix
 * @param {string} [params.suffix=''] - Suffix string (e.g. '_cugan_noise1_2x')
 * @returns {string} Destination path
 */
export function buildUpscaleOutputPath({
  inputPath,
  relativePath,
  sourceDir,
  inPlace,
  outputDir,
  outputFormat = 'original',
  appendParams = true,
  suffix = '',
}) {
  const outputExtMap = { jpg: '.jpg', png: '.png', webp: '.webp' };
  const lastDot = inputPath.lastIndexOf('.');
  const origExt = lastDot >= 0 ? inputPath.slice(lastDot).toLowerCase() : '';
  const targetExt = outputFormat === 'original' ? origExt : (outputExtMap[outputFormat] || origExt);

  const appliedSuffix = appendParams ? suffix : '';

  if (inPlace) {
    const dir = inputPath.replace(/[\\/][^\\/]+$/, '');
    const fileName = inputPath.split(/[\\/]/).pop() || '';
    const base = fileName.replace(/\.[^.]+$/, '');
    const sep = inputPath.includes('\\') ? '\\' : '/';
    return `${dir}${sep}${base}${appliedSuffix}${targetExt}`;
  }

  if (!outputDir) return inputPath;

  let cleanOutputDir = outputDir.replace(/[\\/]+$/, '');
  const sep = cleanOutputDir.includes('\\') ? '\\' : '/';

  // If sourceDir is provided, preserve its root folder name inside outputDir (e.g. Naruto)
  if (sourceDir) {
    const rootFolder = sourceDir.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || '';
    const outputFolder = cleanOutputDir.split(/[\\/]/).filter(Boolean).pop() || '';

    // Only append rootFolder if:
    // 1) rootFolder is non-empty
    // 2) outputDir doesn't already end with rootFolder (avoid Naruto/Naruto)
    // 3) relativePath doesn't already start with rootFolder
    if (rootFolder) {
      const isSameFolder = rootFolder.toLowerCase() === outputFolder.toLowerCase();
      const normRel = (relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
      const alreadyHasRoot = normRel.toLowerCase().startsWith(rootFolder.toLowerCase() + '/');
      if (!isSameFolder && !alreadyHasRoot) {
        cleanOutputDir = `${cleanOutputDir}${sep}${rootFolder}`;
      }
    }
  }

  let rel = relativePath || inputPath.split(/[\\/]/).pop() || '';
  if (sep === '\\') {
    rel = rel.replace(/\//g, '\\');
  } else {
    rel = rel.replace(/\\/g, '/');
  }
  rel = rel.replace(/^[\\/]+/, '');

  const relBase = rel.replace(/\.[^.]+$/, '');
  return `${cleanOutputDir}${sep}${relBase}${appliedSuffix}${targetExt}`;
}

/**
 * Sorts images using Natural Sort (numeric-aware) so page numbers
 * (1, 2, 10, 20...) are ordered properly without lexicographical interleaving.
 *
 * @param {Array<Object>} list - Image list
 * @param {string} [sortBy='name_asc'] - 'name_asc' | 'name_desc' | 'size_asc' | 'size_desc'
 * @returns {Array<Object>} Sorted list
 */
export function sortImages(list, sortBy = 'name_asc') {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    if (sortBy === 'name_asc') {
      return (a.relativePath || a.fileName || '').localeCompare(
        b.relativePath || b.fileName || '',
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
    }
    if (sortBy === 'name_desc') {
      return (b.relativePath || b.fileName || '').localeCompare(
        a.relativePath || a.fileName || '',
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
    }
    if (sortBy === 'size_asc') return (a.sizeBytes || 0) - (b.sizeBytes || 0);
    if (sortBy === 'size_desc') return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    return 0;
  });
}
