'use strict';

const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const yauzl = require('yauzl');

const openZip = promisify(yauzl.open);
const pipeline = promisify(stream.pipeline);

/**
 * Trích xuất an toàn file .zip sang thư mục đích,
 * tự động xử lý fallback cho symbolic link khi chạy trên Windows không có quyền Admin/Developer Mode.
 *
 * @param {string} zipPath - Đường dẫn file zip
 * @param {object} opts
 * @param {string} opts.dir - Thư mục đích tuyệt đối
 * @param {(entry: object) => void} [opts.onEntry]
 * @param {(progress: {percent: number, current: number, total: number, fileName: string}) => void} [opts.onProgress]
 * @returns {Promise<void>}
 */
async function safeExtractZip(zipPath, opts) {
  if (!opts || !opts.dir) {
    throw new Error('opts.dir must be specified');
  }
  if (!path.isAbsolute(opts.dir)) {
    throw new Error('Target directory is expected to be absolute');
  }

  await fs.promises.mkdir(opts.dir, { recursive: true });
  const targetDir = await fs.promises.realpath(opts.dir);

  const zipfile = await openZip(zipPath, { lazyEntries: true });
  const totalEntries = zipfile.entryCount || 0;
  let processedEntries = 0;

  const deferredSymlinks = [];
  let canceled = false;

  return new Promise((resolve, reject) => {
    zipfile.on('error', (err) => {
      canceled = true;
      reject(err);
    });

    zipfile.on('close', async () => {
      if (canceled) return;
      try {
        // Xử lý các symlink bị hoãn do lỗi EPERM trên Windows
        for (const item of deferredSymlinks) {
          const { dest, link } = item;
          const targetPath = path.resolve(path.dirname(dest), link);

          try {
            if (fs.existsSync(targetPath)) {
              const stat = fs.statSync(targetPath);
              if (stat.isDirectory()) {
                try {
                  fs.symlinkSync(targetPath, dest, 'junction');
                } catch {
                  fs.cpSync(targetPath, dest, { recursive: true });
                }
              } else {
                fs.copyFileSync(targetPath, dest);
              }
            } else {
              console.warn(`[safeExtractZip] Target file does not exist, skipping non-fatal link: ${link} -> ${dest}`);
            }
          } catch (copyErr) {
            console.warn(`[safeExtractZip] Warning: fallback copy for symlink failed (${copyErr.message}): ${link} -> ${dest}`);
          }
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    zipfile.on('entry', async (entry) => {
      if (canceled) return;

      // Bỏ qua metadata __MACOSX
      if (entry.fileName.startsWith('__MACOSX/')) {
        processedEntries++;
        return zipfile.readEntry();
      }

      const dest = path.resolve(targetDir, entry.fileName);
      const relativeToTarget = path.relative(targetDir, dest);
      if (relativeToTarget.startsWith('..') || path.isAbsolute(relativeToTarget)) {
        throw new Error(`Out of bound path "${dest}" found while processing file ${entry.fileName}`);
      }

      const mode = (entry.externalFileAttributes >> 16) & 0xFFFF;
      const IFMT = 61440;
      const IFDIR = 16384;
      const IFLNK = 40960;
      const isSymlink = (mode & IFMT) === IFLNK;
      let isDir = (mode & IFMT) === IFDIR;

      if (!isDir && entry.fileName.endsWith('/')) {
        isDir = true;
      }
      const madeBy = entry.versionMadeBy >> 8;
      if (!isDir) {
        isDir = (madeBy === 0 && entry.externalFileAttributes === 16);
      }

      const destDir = isDir ? dest : path.dirname(dest);

      try {
        await fs.promises.mkdir(destDir, { recursive: true });

        // Bảo vệ chống tấn công ZipSlip (Path Traversal qua symlink directory)
        const canonicalDestDir = await fs.promises.realpath(destDir);
        const relativeDestDir = path.relative(targetDir, canonicalDestDir);
        if (relativeDestDir.split(path.sep).includes('..')) {
          throw new Error(`Out of bound path "${canonicalDestDir}" found while processing file ${entry.fileName}`);
        }

        if (opts.onEntry) {
          opts.onEntry(entry);
        }

        if (isDir) {
          processedEntries++;
          if (opts.onProgress && totalEntries > 0) {
            opts.onProgress({
              percent: Math.round((processedEntries / totalEntries) * 100),
              current: processedEntries,
              total: totalEntries,
              fileName: entry.fileName,
            });
          }
          return zipfile.readEntry();
        }

        zipfile.openReadStream(entry, async (streamErr, readStream) => {
          if (streamErr) {
            canceled = true;
            zipfile.close();
            return reject(streamErr);
          }

          if (isSymlink) {
            const chunks = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', async () => {
              const link = Buffer.concat(chunks).toString('utf8');
              try {
                // Thử tạo native symlink trước
                await fs.promises.symlink(link, dest);
              } catch (symlinkErr) {
                // Trên Windows không có quyền Admin hoặc Developer Mode, fs.symlink văng EPERM
                // Chúng tôi đưa vào danh sách hoãn để fallback sao chép file sau khi giải nén xong
                deferredSymlinks.push({ dest, link });
              }

              processedEntries++;
              if (opts.onProgress && totalEntries > 0) {
                opts.onProgress({
                  percent: Math.round((processedEntries / totalEntries) * 100),
                  current: processedEntries,
                  total: totalEntries,
                  fileName: entry.fileName,
                });
              }
              zipfile.readEntry();
            });

            readStream.on('error', (err) => {
              canceled = true;
              zipfile.close();
              reject(err);
            });
          } else {
            const procMode = getExtractedMode(mode, false);
            const writeStream = fs.createWriteStream(dest, { mode: procMode });

            try {
              await pipeline(readStream, writeStream);
              processedEntries++;
              if (opts.onProgress && totalEntries > 0) {
                opts.onProgress({
                  percent: Math.round((processedEntries / totalEntries) * 100),
                  current: processedEntries,
                  total: totalEntries,
                  fileName: entry.fileName,
                });
              }
              zipfile.readEntry();
            } catch (err) {
              canceled = true;
              zipfile.close();
              reject(err);
            }
          }
        });
      } catch (err) {
        canceled = true;
        zipfile.close();
        reject(err);
      }
    });

    zipfile.readEntry();
  });
}

function getExtractedMode(entryMode, isDir) {
  let mode = entryMode;
  if (mode === 0) {
    return isDir ? 0o755 : 0o644;
  }
  return mode & 0o777;
}

module.exports = {
  safeExtractZip,
};
