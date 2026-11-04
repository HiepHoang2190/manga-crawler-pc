/**
 * BinaryManager — Resolves NCNN-Vulkan binary paths based on OS/arch.
 *
 * Binaries are bundled in extraResources:
 *   {resourcesPath}/upscale/{platform-dir}/{binary-name}[.exe]
 *
 * Platform dirs: win-x64, mac-x64, mac-arm64
 */
const path = require('path');
const fs = require('fs');
const { getEngineConfig } = require('./engineConfigs');

class BinaryManager {
  /**
   * @param {string} resourcesPath — process.resourcesPath in packaged app,
   *   or path to project root's resources/ in dev mode
   * @param {string} [userDataPath] — app.getPath('userData') for dynamic download fallback
   */
  constructor(resourcesPath, userDataPath) {
    this._resourcesPath = resourcesPath || '';
    this._userDataPath = userDataPath || '';
  }

  /**
   * Determine platform directory name for current OS/arch.
   * @returns {string} e.g. 'win-x64', 'mac-x64', 'mac-arm64'
   */
  getPlatformDir() {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === 'win32') return 'win-x64';
    if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    // Linux fallback (not officially supported yet)
    return `${platform}-${arch}`;
  }

  /**
   * Resolve full path to engine binary.
   * @param {string} engineId — 'waifu2x' | 'realesrgan' | 'realcugan'
   * @returns {string|null} absolute path, or null if engine unknown
   */
  resolveBinaryPath(engineId) {
    const cfg = getEngineConfig(engineId);
    if (!cfg) return null;

    try {
      const { defaultExtrasManager } = require('../extras/ExtrasManager');
      const extrasPath = defaultExtrasManager.getUpscaleBinaryPath(cfg.binaryName);
      if (extrasPath && fs.existsSync(extrasPath)) {
        return extrasPath;
      }
    } catch {}

    const dir = this.getPlatformDir();
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binaryFile = `${cfg.binaryName}${ext}`;

    const candidates = [
      path.join(this._resourcesPath, 'upscale', dir, binaryFile),
      path.join(this._resourcesPath, 'resources', 'upscale', dir, binaryFile),
    ];

    if (this._userDataPath) {
      candidates.push(
        path.join(this._userDataPath, 'upscale', dir, binaryFile),
        path.join(this._userDataPath, 'resources', 'upscale', dir, binaryFile)
      );
    }

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {}
    }

    return candidates[0];
  }

  /**
   * Check if engine binary exists on disk.
   * @param {string} engineId
   * @returns {boolean}
   */
  isBinaryAvailable(engineId) {
    const p = this.resolveBinaryPath(engineId);
    if (!p) return false;
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }

  /**
   * Ensure binary has execute permission (macOS/Linux).
   * No-op on Windows.
   * @param {string} engineId
   * @returns {boolean} true if successful
   */
  ensureExecutable(engineId) {
    if (process.platform === 'win32') return true;
    const p = this.resolveBinaryPath(engineId);
    if (!p || !fs.existsSync(p)) return false;
    try {
      fs.chmodSync(p, '755');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove macOS quarantine attribute (Gatekeeper).
   * @param {string} engineId
   * @returns {boolean}
   */
  removeQuarantine(engineId) {
    if (process.platform !== 'darwin') return true;
    const p = this.resolveBinaryPath(engineId);
    if (!p || !fs.existsSync(p)) return false;
    try {
      const { execSync } = require('child_process');
      execSync(`xattr -d com.apple.quarantine "${p}" 2>/dev/null || true`);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { BinaryManager };
