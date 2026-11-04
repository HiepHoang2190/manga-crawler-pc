'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const { requireSharp } = require('./frame');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const GLOB = '*.{jpg,jpeg,png,webp,gif,avif}';
const GLOB_REC = '**/*.{jpg,jpeg,png,webp,gif,avif}';

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function scanPipelineImages({ sourceDir = '', sourceFiles = [], includeSubfolders = true, maxDepth = 5, concurrency = 16 } = {}) {
  const sharp = requireSharp();
  const isFilesMode = Array.isArray(sourceFiles) && sourceFiles.length > 0;
  let filePaths = [];
  if (isFilesMode) {
    filePaths = sourceFiles.filter((p) => typeof p === 'string' && IMAGE_EXTS.has(path.extname(p).toLowerCase()));
  } else if (sourceDir && fs.existsSync(sourceDir)) {
    const matched = await fg(includeSubfolders ? GLOB_REC : GLOB, {
      cwd: sourceDir,
      absolute: true,
      caseSensitiveMatch: false,
      deep: includeSubfolders ? maxDepth : 1,
      onlyFiles: true,
    });
    filePaths = matched.map((p) => path.normalize(p));
  }

  const entries = filePaths.map((absolutePath) => ({
    absolutePath,
    relativePath: !isFilesMode && sourceDir ? path.relative(sourceDir, absolutePath) : path.basename(absolutePath),
  }));
  entries.sort((a, b) => naturalCompare(a.relativePath, b.relativePath));

  const results = new Array(entries.length);
  const total = entries.length;
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;
      const entry = entries[index];
      try {
        const stat = await fs.promises.stat(entry.absolutePath);
        const meta = await sharp(entry.absolutePath).metadata();
        results[index] = { ...entry, size: stat.size, width: meta.width || 0, height: meta.height || 0 };
      } catch (err) {
        results[index] = { ...entry, size: 0, width: 0, height: 0, error: String(err?.message || err) };
      }
    }
  }

  const workers = Math.max(1, Math.min(concurrency, total || 1));
  await Promise.all(Array.from({ length: workers }, worker));
  return { ok: true, images: results };
}

module.exports = { scanPipelineImages, IMAGE_EXTS };
