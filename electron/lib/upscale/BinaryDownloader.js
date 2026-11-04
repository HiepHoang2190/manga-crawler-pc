/**
 * BinaryDownloader — Downloads NCNN-Vulkan upscale binaries from GitHub releases.
 *
 * Works in both dev (via scripts) and packaged Electron (main process fallback),
 * downloading to resources/upscale or userData/upscale using Node's https & extract-zip.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const extract = require('extract-zip');

const ENGINES = [
  {
    id: 'waifu2x',
    repo: 'nihui/waifu2x-ncnn-vulkan',
    binaryName: 'waifu2x-ncnn-vulkan',
    assets: {
      'win-x64': 'windows',
      'mac-x64': 'macos',
      'mac-arm64': 'macos',
    },
  },
  {
    id: 'realesrgan',
    repo: 'xinntao/Real-ESRGAN',
    binaryName: 'realesrgan-ncnn-vulkan',
    assets: {
      'win-x64': 'windows',
      'mac-x64': 'macos',
      'mac-arm64': 'macos',
    },
  },
  {
    id: 'realcugan',
    repo: 'nihui/realcugan-ncnn-vulkan',
    binaryName: 'realcugan-ncnn-vulkan',
    assets: {
      'win-x64': 'windows',
      'mac-x64': 'macos',
      'mac-arm64': 'macos',
    },
  },
];

function getPlatformDir() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32') return 'win-x64';
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  return `${platform}-${arch}`;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'manga-crawler-downloader' } };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchLatestRelease(repo) {
  const url = `https://api.github.com/repos/${repo}/releases`;
  const data = await httpsGet(url);
  const list = JSON.parse(data.toString());
  if (Array.isArray(list)) {
    const withAssets = list.find((r) => r.assets && r.assets.length > 0);
    if (withAssets) return withAssets;
  }
  return list[0] || null;
}

function findBinaryInDir(dir, binaryName) {
  const ext = binaryName.endsWith('.exe') ? '' : (process.platform === 'win32' ? '.exe' : '');
  const targetName = binaryName + ext;

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        const found = walk(fullPath);
        if (found) return found;
      } else if (entry.name === targetName || entry.name === binaryName || entry.name === binaryName + '.exe') {
        return fullPath;
      }
    }
    return null;
  }

  return walk(dir);
}

/**
 * Download and install an engine binary into target upscale directory.
 *
 * @param {string} engineId — 'waifu2x' | 'realesrgan' | 'realcugan'
 * @param {Object} [options]
 * @param {string} [options.destRoot] — base upscale dir (contains win-x64, mac-arm64, etc.)
 * @param {string} [options.platform] — target platform name (e.g. 'win-x64')
 * @param {boolean} [options.force] — overwrite existing files
 * @param {Function} [options.onLog] — log callback
 * @returns {Promise<{ ok: boolean, binaryPath?: string, error?: string, skipped?: boolean }>}
 */
async function downloadEngine(engineId, options = {}) {
  const engine = ENGINES.find((e) => e.id === engineId);
  if (!engine) {
    return { ok: false, error: `Unknown engine ID: ${engineId}` };
  }

  const platform = options.platform || getPlatformDir();
  const destRoot = options.destRoot || path.join(__dirname, '..', '..', '..', 'resources', 'upscale');
  const platformDir = path.join(destRoot, platform);
  const onLog = options.onLog || console.log;

  fs.mkdirSync(platformDir, { recursive: true });

  const ext = platform.startsWith('win') ? '.exe' : '';
  const binaryDest = path.join(platformDir, `${engine.binaryName}${ext}`);

  // Check if binary and required DLLs already exist
  const isWin = platform.startsWith('win');
  const dllCheck = isWin ? fs.existsSync(path.join(platformDir, 'vcomp140.dll')) : true;

  if (fs.existsSync(binaryDest) && dllCheck && !options.force) {
    onLog(`[BinaryDownloader] Already installed: ${binaryDest}`);
    return { ok: true, binaryPath: binaryDest, skipped: true };
  }

  const tmpDir = path.join(destRoot, '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  let tmpFile = null;
  let extractDir = null;

  try {
    onLog(`[BinaryDownloader] Fetching release metadata for ${engine.repo}...`);
    const release = await fetchLatestRelease(engine.repo);
    if (!release || !release.assets) {
      throw new Error(`No release assets found for ${engine.repo}`);
    }

    const assetKeyword = engine.assets[platform];
    if (!assetKeyword) {
      throw new Error(`No asset keyword for platform: ${platform}`);
    }

    const asset = release.assets.find((a) => {
      const name = a.name.toLowerCase();
      return name.includes(assetKeyword.toLowerCase()) && (name.endsWith('.zip') || name.endsWith('.tar.gz'));
    });

    if (!asset) {
      throw new Error(`No matching archive for "${assetKeyword}" in ${engine.repo}`);
    }

    tmpFile = path.join(tmpDir, asset.name);
    onLog(`[BinaryDownloader] Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)...`);
    const data = await httpsGet(asset.browser_download_url);
    fs.writeFileSync(tmpFile, data);

    extractDir = path.join(tmpDir, `${engine.id}_extract_${Date.now()}`);
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    fs.mkdirSync(extractDir, { recursive: true });

    onLog(`[BinaryDownloader] Extracting archive...`);
    await extract(tmpFile, { dir: path.resolve(extractDir) });

    const binaryFound = findBinaryInDir(extractDir, engine.binaryName);
    if (!binaryFound) {
      throw new Error(`Binary "${engine.binaryName}" not found in extracted archive`);
    }

    fs.copyFileSync(binaryFound, binaryDest);
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(binaryDest, '755');
      } catch (_) {}
    }
    onLog(`[BinaryDownloader] Installed binary: ${binaryDest}`);

    // Copy model directories and DLL dependencies alongside binary
    const binarySourceDir = path.dirname(binaryFound);
    const entries = fs.readdirSync(binarySourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('models')) {
        const srcModelDir = path.join(binarySourceDir, entry.name);
        const destModelDir = path.join(platformDir, entry.name);
        if (!fs.existsSync(destModelDir) || options.force) {
          fs.cpSync(srcModelDir, destModelDir, { recursive: true });
          onLog(`[BinaryDownloader] Copied models: ${entry.name}`);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
        const srcDll = path.join(binarySourceDir, entry.name);
        const destDll = path.join(platformDir, entry.name);
        fs.copyFileSync(srcDll, destDll);
        onLog(`[BinaryDownloader] Copied DLL: ${entry.name}`);
      }
    }

    return { ok: true, binaryPath: binaryDest };
  } catch (err) {
    onLog(`[BinaryDownloader] Error downloading ${engine.id}: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    try {
      if (tmpFile && fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
      if (extractDir && fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  ENGINES,
  getPlatformDir,
  downloadEngine,
  findBinaryInDir,
};
