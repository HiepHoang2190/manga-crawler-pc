const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Tạo metadata manifest cho gói extras
 */
function generateManifest({ platform, arch, version, files }) {
  return {
    version: version || '1.0.0',
    platform,
    arch,
    createdAt: new Date().toISOString(),
    components: {
      upscale: true,
      onnxruntime: true,
    },
    files: files || [],
  };
}

/**
 * Lọc danh sách platforms trong thư mục bin/napi-v6 của onnxruntime-node
 */
function filterOnnxPlatforms(targetPlatform, availablePlatforms) {
  const map = {
    darwin: 'darwin',
    win32: 'win32',
    linux: 'linux',
  };
  const target = map[targetPlatform] || targetPlatform;
  return availablePlatforms.filter((p) => p === target);
}

/**
 * Đóng gói thư mục upscale và onnxruntime-node thành file .zip
 */
async function createExtrasZip({ platform, arch, rootDir, outputZipPath }) {
  const outputDir = path.dirname(outputZipPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // 1. Thêm upscale binaries
    const upscalePlatformDir = platform === 'win32' ? 'win-x64' : (arch === 'arm64' ? 'mac-arm64' : 'mac-x64');
    const upscaleSrc = path.join(rootDir, 'resources', 'upscale', upscalePlatformDir);
    if (fs.existsSync(upscaleSrc)) {
      archive.directory(upscaleSrc, 'upscale');
    }

    // 2. Thêm onnxruntime-node đã lọc (chỉ giữ platform & arch tương ứng, loại bỏ symlinks .bin)
    const onnxSrc = path.join(rootDir, 'node_modules', 'onnxruntime-node');
    if (fs.existsSync(onnxSrc)) {
      archive.directory(onnxSrc, 'onnxruntime', (data) => {
        const normName = data.name.replace(/\\/g, '/');

        // Loại bỏ hoàn toàn các symlink CLI không cần thiết trong .bin
        if (normName.includes('/.bin/') || normName.endsWith('/.bin') || normName.includes('node_modules/.bin') || normName.startsWith('.bin/')) {
          return false;
        }

        // Lọc chính xác platform và arch cho native binaries trong bin/napi-v6/
        if (normName.includes('bin/napi-v6/')) {
          if (platform === 'win32') {
            if (!normName.includes('bin/napi-v6/win32')) {
              return false;
            }
          } else if (platform === 'darwin') {
            const sub = `bin/napi-v6/darwin/${arch}`;
            if (!normName.includes(sub)) {
              return false;
            }
          } else {
            if (!normName.includes(`bin/napi-v6/${platform}`)) {
              return false;
            }
          }
        }
        return data;
      });
    }

    // 2b. Thêm onnxruntime-common vào onnxruntime/node_modules/onnxruntime-common
    const onnxCommonSrc = path.join(rootDir, 'node_modules', 'onnxruntime-common');
    if (fs.existsSync(onnxCommonSrc)) {
      archive.directory(onnxCommonSrc, 'onnxruntime/node_modules/onnxruntime-common', (data) => {
        const normName = data.name.replace(/\\/g, '/');
        if (normName.includes('/.bin/') || normName.endsWith('/.bin') || normName.includes('node_modules/.bin') || normName.startsWith('.bin/')) {
          return false;
        }
        return data;
      });
    }

    // 3. Thêm manifest.json
    const manifest = generateManifest({ platform, arch, version: '1.0.0' });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    archive.finalize();
  });
}

function getPlatformKey(platform, arch) {
  if (platform === 'win32') return `win-${arch}`;
  if (platform === 'darwin') return `mac-${arch}`;
  return `${platform}-${arch}`;
}

// Chạy trực tiếp qua dòng lệnh CLI
if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const args = process.argv.slice(2);
  const isCurrent = args.includes('--current');

  (async () => {
    const configs = isCurrent
      ? [{ platform: process.platform, arch: process.arch }]
      : [
          { platform: 'win32', arch: 'x64' },
          { platform: 'darwin', arch: 'arm64' },
          { platform: 'darwin', arch: 'x64' },
        ];

    for (const cfg of configs) {
      const platformKey = getPlatformKey(cfg.platform, cfg.arch);
      const outZip = path.join(rootDir, 'release', 'extras', `manga-crawler-extras-${platformKey}.zip`);

      console.log(`[package-extras] Packaging ${platformKey} to ${outZip}...`);
      await createExtrasZip({ platform: cfg.platform, arch: cfg.arch, rootDir, outputZipPath: outZip });
      console.log(`[package-extras] Done: ${outZip}`);
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { generateManifest, filterOnnxPlatforms, createExtrasZip, getPlatformKey };
