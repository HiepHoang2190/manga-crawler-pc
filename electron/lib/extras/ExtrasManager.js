const fs = require('fs');
const path = require('path');
const os = require('os');
const { safeExtractZip } = require('./safeExtractZip');
const DirectDownloader = require('./DirectDownloader');

class ExtrasManager {
  /**
   * @param {string|null} [customDir] - Đường dẫn tùy biến (dành cho test hoặc ghi đè)
   */
  constructor(customDir = null) {
    this._customDir = customDir;
  }

  /**
   * Lấy thư mục lưu trữ bền vững ngoài app
   * Không bao giờ bị xóa khi gỡ cài đặt app hoặc cài bản mới
   */
  getExtrasDir() {
    if (this._customDir) return this._customDir;
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      return path.join(localAppData, 'MangaCrawlerShared', 'extras');
    }
    // macOS & Linux
    return path.join(os.homedir(), 'Library', 'Application Support', 'manga-crawler', 'extras');
  }

  /**
   * Kiểm tra trạng thái gói extras
   */
  getStatus() {
    const extrasDir = this.getExtrasDir();
    const manifestPath = path.join(extrasDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        installed: false,
        path: extrasDir,
        version: null,
        components: { upscale: false, onnx: false },
      };
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const hasUpscale = fs.existsSync(path.join(extrasDir, 'upscale'));
      const hasOnnx = fs.existsSync(path.join(extrasDir, 'onnxruntime'));
      return {
        installed: hasUpscale || hasOnnx,
        path: extrasDir,
        version: manifest.version || '1.0.0',
        components: {
          upscale: hasUpscale,
          onnx: hasOnnx,
        },
      };
    } catch {
      return {
        installed: false,
        path: extrasDir,
        version: null,
        components: { upscale: false, onnx: false },
      };
    }
  }

  /**
   * Cài đặt gói extras từ file .zip cục bộ
   * @param {string} zipPath - Đường dẫn file .zip
   * @param {(progress: {phase: string, percent: number, detail?: string}) => void} [onProgress]
   */
  async installFromZip(zipPath, onProgress = () => {}) {
    const extrasDir = this.getExtrasDir();
    if (!fs.existsSync(extrasDir)) {
      fs.mkdirSync(extrasDir, { recursive: true });
    }

    onProgress({ phase: 'extracting', percent: 20, detail: 'Đang giải nén gói tài nguyên...' });
    await safeExtractZip(zipPath, {
      dir: extrasDir,
      onProgress: (prog) => {
        const scaledPercent = Math.min(75, 20 + Math.round((prog.percent || 0) * 0.55));
        onProgress({
          phase: 'extracting',
          percent: scaledPercent,
          detail: `Đang giải nén: ${prog.current}/${prog.total} tệp`,
        });
      },
    });

    // chmod +x cho các binary trên unix (macOS / Linux)
    if (process.platform !== 'win32') {
      onProgress({ phase: 'extracting', percent: 80, detail: 'Đang cấp quyền thực thi...' });
      const upscaleDir = path.join(extrasDir, 'upscale');
      if (fs.existsSync(upscaleDir)) {
        const files = fs.readdirSync(upscaleDir);
        for (const f of files) {
          const full = path.join(upscaleDir, f);
          try {
            if (fs.statSync(full).isFile() && !f.endsWith('.bin') && !f.endsWith('.param')) {
              fs.chmodSync(full, '755');
            }
          } catch {}
        }
      }
    }

    onProgress({ phase: 'ready', percent: 100, detail: 'Cài đặt hoàn tất!' });
    return this.getStatus();
  }

  /**
   * Lấy URL Google Drive mặc định theo platform hiện tại
   */
  getDefaultDownloadUrl() {
    try {
      const linksPath = path.join(__dirname, '../../config/extrasLinks.json');
      if (fs.existsSync(linksPath)) {
        const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
        const keyShort = `${process.platform === 'win32' ? 'win' : 'mac'}-${process.arch}`;
        const keyFull = `${process.platform}-${process.arch}`;
        return links[keyShort] || links[keyFull] || null;
      }
    } catch {}
    return null;
  }

  /**
   * Tải và cài đặt tự động từ GitHub Releases CDN
   * @param {string|null} [overrideUrl]
   * @param {(progress: object) => void} [onProgress]
   * @param {AbortSignal|null} [abortSignal]
   */
  async downloadAndInstall(overrideUrl = null, onProgress = () => {}, abortSignal = null) {
    const url = overrideUrl || this.getDefaultDownloadUrl();
    if (!url) throw new Error('Chưa cấu hình link tải gói tài nguyên cho hệ điều hành này.');

    const tempZip = path.join(os.tmpdir(), `manga-crawler-extras-${Date.now()}.zip`);
    onProgress({ phase: 'downloading', percent: 0, detail: 'Đang kết nối máy chủ tải gói tài nguyên...' });

    const progressHandler = (prog) => {
      onProgress({
        phase: 'downloading',
        percent: prog.percent,
        receivedBytes: prog.receivedBytes,
        totalBytes: prog.totalBytes,
        speed: prog.speed,
        detail: `Đang tải: ${prog.speed}`,
      });
    };

    await DirectDownloader.downloadDirectFile(url, tempZip, progressHandler, abortSignal);

    try {
      return await this.installFromZip(tempZip, onProgress);
    } finally {
      try { fs.unlinkSync(tempZip); } catch {}
    }
  }

  /**
   * Tìm file thực thi engine upscale trong thư mục extras
   * @param {string} binaryName - 'realesrgan-ncnn-vulkan' | 'waifu2x-ncnn-vulkan' | 'realcugan-ncnn-vulkan'
   * @returns {string|null}
   */
  getUpscaleBinaryPath(binaryName) {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const fullName = `${binaryName}${ext}`;
    const p = path.join(this.getExtrasDir(), 'upscale', fullName);
    return fs.existsSync(p) ? p : null;
  }

  /**
   * Lấy đường dẫn thư mục onnxruntime-node trong thư mục extras
   * @returns {string|null}
   */
  getOnnxRuntimePath() {
    const p = path.join(this.getExtrasDir(), 'onnxruntime');
    if (!fs.existsSync(p)) return null;

    // Self-healing: Đảm bảo onnxruntime-common tồn tại trong onnxruntime/node_modules/onnxruntime-common
    // nếu người dùng trước đó đã cài gói zip cũ chưa có onnxruntime-common.
    try {
      const commonInExtras = path.join(p, 'node_modules', 'onnxruntime-common');
      if (!fs.existsSync(commonInExtras)) {
        let appCommonDir = null;
        try {
          const entry = require.resolve('onnxruntime-common');
          let cur = path.dirname(entry);
          while (cur && cur !== path.dirname(cur)) {
            if (fs.existsSync(path.join(cur, 'package.json'))) {
              try {
                const pkg = JSON.parse(fs.readFileSync(path.join(cur, 'package.json'), 'utf8'));
                if (pkg.name === 'onnxruntime-common') {
                  appCommonDir = cur;
                  break;
                }
              } catch (_) {}
            }
            cur = path.dirname(cur);
          }
        } catch (_) {}

        if (appCommonDir && fs.existsSync(appCommonDir)) {
          fs.mkdirSync(path.dirname(commonInExtras), { recursive: true });
          fs.cpSync(appCommonDir, commonInExtras, { recursive: true });
        }
      }
    } catch (_) {}

    return p;
  }

  /**
   * Xóa toàn bộ gói extras để giải phóng bộ nhớ
   * @returns {object} Trạng thái mới sau khi xóa
   */
  deleteExtras() {
    const extrasDir = this.getExtrasDir();
    if (fs.existsSync(extrasDir)) {
      try {
        fs.rmSync(extrasDir, { recursive: true, force: true });
      } catch (err) {
        console.error('[ExtrasManager] deleteExtras error:', err);
        throw err;
      }
    }
    return this.getStatus();
  }
}

// Singleton instance
const defaultExtrasManager = new ExtrasManager();

module.exports = {
  ExtrasManager,
  defaultExtrasManager,
};
