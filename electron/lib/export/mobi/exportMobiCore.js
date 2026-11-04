'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { buildEpubFromImages, exportEpubCore } = require('../epub/exportEpubCore');
const { detectKindleCompiler } = require('../tools/kindleGenManager');

/**
 * Compile file EPUB sang MOBI thông qua KindleGen hoặc Calibre ebook-convert.
 */
function runCompiler(compilerInfo, epubPath, mobiPath, { onProgress = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Đã hủy tiến trình'));

    const isKindlegen = compilerInfo.type === 'kindlegen';
    const mobiDir = path.dirname(mobiPath);
    if (!fs.existsSync(mobiDir)) {
      try {
        fs.mkdirSync(mobiDir, { recursive: true });
      } catch (err) {
        return reject(new Error(`Không thể tạo thư mục đầu ra: ${err.message}`));
      }
    }

    let child;
    let compileDir = null;

    if (isKindlegen) {
      // Để phòng ngừa lỗi Unicode path, khoảng trắng, và spawn UNKNOWN trên ổ đĩa ngoài Windows,
      // sao chép file EPUB vào một thư mục tạm thời chuẩn ASCII và chạy KindleGen tại đó.
      try {
        compileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-build-'));
      } catch {
        compileDir = os.tmpdir();
      }

      const safeEpubName = 'book.epub';
      const safeMobiName = 'book.mobi';
      const safeEpubPath = path.join(compileDir, safeEpubName);
      const safeMobiPath = path.join(compileDir, safeMobiName);

      try {
        fs.copyFileSync(epubPath, safeEpubPath);
      } catch (err) {
        return reject(new Error(`Không thể chuẩn bị file EPUB tạm: ${err.message}`));
      }

      child = spawn(compilerInfo.path, [safeEpubName, '-o', safeMobiName], {
        cwd: compileDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        const text = d.toString();
        stdout += text;
        onProgress({ message: text.trim().slice(-100) });
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          try { child.kill(); } catch { /* ignore */ }
          try {
            if (compileDir && compileDir !== os.tmpdir()) {
              fs.rmSync(compileDir, { recursive: true, force: true });
            }
          } catch {}
          reject(new Error('Đã hủy tiến trình biên dịch MOBI'));
        });
      }

      child.on('close', (code) => {
        try {
          // KindleGen: 0 = OK, 1 = OK with warnings, 2 = Error
          if (code === 0 || code === 1) {
            let producedMobi = safeMobiPath;
            if (!fs.existsSync(producedMobi)) {
              const entries = fs.readdirSync(compileDir);
              const found = entries.find((e) => e.toLowerCase().endsWith('.mobi'));
              if (found) producedMobi = path.join(compileDir, found);
            }

            if (fs.existsSync(producedMobi)) {
              fs.copyFileSync(producedMobi, mobiPath);
              return resolve({ ok: true, outputPath: mobiPath });
            }
          }
          return reject(new Error(`KindleGen thất bại (mã thoát ${code}): ${stderr || stdout.slice(-300)}`));
        } finally {
          try {
            if (compileDir && compileDir !== os.tmpdir()) {
              fs.rmSync(compileDir, { recursive: true, force: true });
            }
          } catch {}
        }
      });

      child.on('error', (err) => {
        try {
          if (compileDir && compileDir !== os.tmpdir()) {
            fs.rmSync(compileDir, { recursive: true, force: true });
          }
        } catch {}
        const msg = err.message || String(err);
        if (err.code === 'EBADARCH' || msg.includes('-86')) {
          return reject(
            new Error(
              `Không thể khởi chạy KindleGen (lỗi EBADARCH / -86: Kiến trúc CPU không tương thích). Trên macOS 10.15+ và chip Apple Silicon, Amazon KindleGen 32-bit cũ không thể hoạt động. Vui lòng cài đặt Calibre (ebook-convert 64-bit) để biên dịch MOBI.`
            )
          );
        }
        if (err.code === 'UNKNOWN' || msg.includes('UNKNOWN')) {
          return reject(
            new Error(
              `Không thể khởi chạy công cụ KindleGen (${msg}). File thực thi có thể bị hỏng, thiếu quyền hoặc bị chương trình diệt virus chặn. Vui lòng kiểm tra lại file biên dịch.`
            )
          );
        }
        reject(err);
      });
    } else {
      // ebook-convert input.epub output.mobi --no-inline-toc --prefer-metadata-cover --mobi-file-type both
      child = spawn(
        compilerInfo.path,
        [epubPath, mobiPath, '--no-inline-toc', '--prefer-metadata-cover', '--mobi-file-type', 'both'],
        {
          cwd: mobiDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        const text = d.toString();
        stdout += text;
        onProgress({ message: text.trim().slice(-100) });
      });

      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          try { child.kill(); } catch { /* ignore */ }
          reject(new Error('Đã hủy tiến trình biên dịch MOBI'));
        });
      }

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(mobiPath)) {
          return resolve({ ok: true, outputPath: mobiPath });
        }
        return reject(new Error(`Calibre ebook-convert thất bại (mã thoát ${code}): ${stderr || stdout.slice(-300)}`));
      });

      child.on('error', (err) => {
        const msg = err.message || String(err);
        if (err.code === 'UNKNOWN' || msg.includes('UNKNOWN')) {
          return reject(new Error(`Không thể khởi chạy Calibre (${msg}). Vui lòng kiểm tra lại quyền thực thi.`));
        }
        reject(err);
      });
    }
  });
}

/**
 * Đóng gói danh sách ảnh thành 1 file MOBI.
 */
async function buildMobiFromImages({
  images,
  outputPath,
  metadata = {},
  compilerOpts = {},
  onProgress = () => {},
  signal,
}) {
  const { repairKindleCompilerIfZip } = require('../tools/kindleGenManager');
  await repairKindleCompilerIfZip();

  const compiler = detectKindleCompiler(compilerOpts);
  if (!compiler.available) {
    return {
      ok: false,
      error: 'Không tìm thấy công cụ KindleGen hoặc Calibre để xuất định dạng MOBI. Vui lòng tải KindleGen trong phần cài đặt.',
    };
  }

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tempEpub = path.join(os.tmpdir(), `temp_${Date.now()}_${path.basename(outputPath, '.mobi')}.epub`);

  try {
    onProgress({ message: 'Đang tạo cấu trúc sách điện tử...', percent: 20 });
    await buildEpubFromImages({
      images,
      outputPath: tempEpub,
      metadata,
      onProgress: (p) => onProgress({ ...p, percent: Math.round(p.percent * 0.5) }),
      signal,
    });

    onProgress({ message: 'Đang biên dịch sang định dạng MOBI...', percent: 60 });
    await runCompiler(compiler, tempEpub, outputPath, { onProgress, signal });

    onProgress({ message: `Hoàn tất tạo file MOBI: ${path.basename(outputPath)}`, percent: 100 });
    return { ok: true, outputPath };
  } finally {
    try {
      if (fs.existsSync(tempEpub)) fs.unlinkSync(tempEpub);
    } catch {
      // ignore
    }
  }
}

/**
 * Xuất danh sách ảnh hoặc chapter sang MOBI.
 */
async function exportMobiCore({
  images = [],
  mangaTitle = 'Manga',
  outputDir,
  packMode = 'singleVolume',
  maxMbPerFile = 200,
  metadata = {},
  compilerOpts = {},
  onProgress = () => {},
  signal,
}) {
  if (!outputDir) {
    return { ok: false, error: 'Chưa chỉ định thư mục xuất file MOBI.' };
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { repairKindleCompilerIfZip } = require('../tools/kindleGenManager');
  await repairKindleCompilerIfZip();

  const compiler = detectKindleCompiler(compilerOpts);
  if (!compiler.available) {
    return {
      ok: false,
      error: 'Không tìm thấy công cụ KindleGen hoặc Calibre để xuất định dạng MOBI.',
    };
  }

  // Tận dụng exportEpubCore để chia volume/sizeSplit thành các file epub trung gian
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobi-batch-'));
  try {
    const epubResult = await exportEpubCore({
      images,
      mangaTitle,
      outputDir: tempDir,
      packMode,
      maxMbPerFile,
      metadata,
      onProgress: (p) => onProgress({ ...p, message: 'Đang tạo cấu trúc truyện...' }),
      signal,
    });

    if (!epubResult.ok) return epubResult;

    const outputFiles = [];
    const total = epubResult.outputFiles.length;

    for (let i = 0; i < total; i += 1) {
      if (signal?.aborted) throw new Error('Đã hủy xuất MOBI');
      const epubFile = epubResult.outputFiles[i];
      const mobiName = path.basename(epubFile, '.epub') + '.mobi';
      const destMobi = path.join(outputDir, mobiName);

      onProgress({ message: `Đang biên dịch MOBI (${i + 1}/${total}): ${mobiName}` });
      await runCompiler(compiler, epubFile, destMobi, { onProgress, signal });
      outputFiles.push(destMobi);
    }

    return { ok: true, outputFiles };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

module.exports = {
  buildMobiFromImages,
  exportMobiCore,
};
