const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const yauzl = require('yauzl');
const { SUPPORTED_EXTENSIONS } = require('./formatDetector');
const { IMAGE_EXT } = require('../library/listChapterImageFiles');

/** @type {Record<string, 'CBZ'|'ZIP'|'CBR'|'PDF'|'EPUB'|'MOBI'>} */
const EXT_TO_BADGE = {
  '.cbz': 'CBZ',
  '.zip': 'ZIP',
  '.cbr': 'CBR',
  '.rar': 'CBR',
  '.pdf': 'PDF',
  '.epub': 'EPUB',
  '.mobi': 'MOBI',
  '.azw':  'MOBI',
  '.azw3': 'MOBI',
};

const EXTENDED_IMAGE_EXT = new Set([...IMAGE_EXT, '.bmp']);

function pathHasJunkSegment(segments) {
  for (const s of segments) {
    if (s === '__MACOSX') return true;
    if (s.startsWith('._')) return true;
    if (s === '.DS_Store') return true;
    if (s === 'Thumbs.db') return true;
  }
  return false;
}

/**
 * Kiểm tra nhanh xem file .zip có chứa ít nhất 1 file ảnh hợp lệ không
 * bằng cách duyệt central directory qua yauzl (không giải nén, chỉ ~1-2ms).
 * @param {string} zipPath
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<boolean>}
 */
function isZipComicArchive(zipPath, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val, zipfile) => {
      if (settled) return;
      settled = true;
      if (zipfile) {
        try {
          zipfile.close();
        } catch {
          /* ignore */
        }
      }
      resolve(val);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) {
        clearTimeout(timer);
        return finish(false);
      }
      zipfile.on('entry', (entry) => {
        const rawName = String(entry.fileName || '');
        if (!rawName.endsWith('/')) {
          const segments = rawName.split(/[/\\]/).filter(Boolean);
          if (segments.length > 0 && !pathHasJunkSegment(segments)) {
            const basename = segments[segments.length - 1];
            const ext = path.extname(basename).toLowerCase();
            if (EXTENDED_IMAGE_EXT.has(ext)) {
              clearTimeout(timer);
              return finish(true, zipfile);
            }
          }
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => {
        clearTimeout(timer);
        finish(false, zipfile);
      });
      zipfile.on('error', () => {
        clearTimeout(timer);
        finish(false, zipfile);
      });
      zipfile.readEntry();
    });
  });
}

/**
 * Kiểm tra nhanh file .rar có chứa ít nhất 1 file ảnh hợp lệ không bằng node-unrar-js.
 * @param {string} rarPath
 * @returns {Promise<boolean>}
 */
async function isRarComicArchive(rarPath) {
  try {
    const { createExtractorFromFile } = require('node-unrar-js');
    const os = require('os');
    const extractor = await createExtractorFromFile({
      filepath: rarPath,
      targetPath: os.tmpdir(),
    });
    const list = extractor.getFileList();
    const fileHeaders = [...list.fileHeaders];
    return fileHeaders.some((fh) => {
      if (fh.flags && fh.flags.directory) return false;
      const rawName = String(fh.name || '');
      const segments = rawName.split(/[/\\]/).filter(Boolean);
      if (segments.length === 0 || pathHasJunkSegment(segments)) return false;
      const basename = segments[segments.length - 1];
      const ext = path.extname(basename).toLowerCase();
      return EXTENDED_IMAGE_EXT.has(ext);
    });
  } catch {
    return false;
  }
}

/**
 * Liệt kê mọi file archive được hỗ trợ trong thư mục (đệ quy).
 * Với các định dạng nén chung (.zip, .rar), tự động xác minh nội dung thông minh
 * để loại trừ các file phần mềm, mã nguồn, tài liệu không phải truyện tranh.
 * @param {string} dir
 * @returns {Promise<{ ok: boolean, error?: string, files: Array<{ absolutePath: string, name: string, format: 'CBZ'|'ZIP'|'CBR'|'PDF'|'EPUB'|'MOBI' }> }>}
 */
async function listArchivesInDirectory(dir) {
  const root = path.resolve(String(dir || '').trim());
  if (!fs.existsSync(root)) {
    return { ok: false, error: 'Không tìm thấy thư mục.', files: [] };
  }
  let st;
  try {
    st = fs.statSync(root);
  } catch (e) {
    return { ok: false, error: String(e?.message || e), files: [] };
  }
  if (!st.isDirectory()) {
    return { ok: false, error: 'Không phải thư mục.', files: [] };
  }

  // Build glob pattern for all supported extensions
  const extList = SUPPORTED_EXTENSIONS.map((e) => e.slice(1)).join(',');
  const pattern = `**/*.{${extList}}`;

  const entries = await fg(pattern, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    caseSensitiveMatch: false,
  });

  const seen = new Set();
  const candidates = [];
  for (const raw of entries) {
    const absolutePath = path.resolve(raw);
    const ext = path.extname(absolutePath).toLowerCase();
    const badge = EXT_TO_BADGE[ext];
    if (!badge) continue;
    if (seen.has(absolutePath)) continue;
    seen.add(absolutePath);
    candidates.push({ absolutePath, ext, badge });
  }

  // Xác minh nội dung cho file ZIP và RAR
  const verified = await Promise.all(
    candidates.map(async (item) => {
      if (item.ext === '.zip') {
        const isComic = await isZipComicArchive(item.absolutePath);
        if (!isComic) return null;
      } else if (item.ext === '.rar') {
        const isComic = await isRarComicArchive(item.absolutePath);
        if (!isComic) return null;
      }
      return {
        absolutePath: item.absolutePath,
        name: path.basename(item.absolutePath),
        format: item.badge,
      };
    })
  );

  const files = verified.filter(Boolean);

  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  return { ok: true, files };
}

module.exports = {
  listArchivesInDirectory,
  isZipComicArchive,
  isRarComicArchive,
};

