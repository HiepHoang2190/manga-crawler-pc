/**
 * Auto-updater: kiểm tra phiên bản qua GitHub Releases API, rồi tải file cài đặt.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

const GITHUB_REPO = 'suutamebooktruyentranh2025-hub/manga-crawler-pc-releases';
const GITHUB_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

/**
 * So sánh semver đơn giản: trả về true nếu remote > local.
 */
function isNewerVersion(remote, local) {
  const parse = (v) =>
    String(v || '0').replace(/[^0-9.]/g, '').split('.').map((n) => parseInt(n, 10) || 0);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

/**
 * Fetch JSON từ API (hỗ trợ GitHub API với User-Agent).
 */
function fetchJson(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent': 'MangaCrawler-Updater/1.0',
          'Accept': 'application/vnd.github.v3+json',
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchJson(res.headers.location, redirectCount + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          if (res.statusCode === 403) {
            return reject(new Error(
              `Đã vượt quá giới hạn lượt kiểm tra của GitHub, vui lòng thử lại sau vài phút. Tải thủ công: ${GITHUB_RELEASES_PAGE}`
            ));
          }
          return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Download file cài đặt từ URL GitHub Releases, theo redirect tới CDN.
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function doRequest(reqUrl, redirectCount) {
      if (redirectCount > 15) return reject(new Error('Too many redirects'));
      const parsed = new URL(reqUrl);
      const mod = parsed.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: 120000,
        headers: {
          'User-Agent': 'MangaCrawler-Updater/1.0',
        },
      };

      const req = mod.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const nextUrl = new URL(res.headers.location, reqUrl).href;
          return doRequest(nextUrl, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const contentType = String(res.headers['content-type'] || '');
        if (contentType.includes('text/html')) {
          res.resume();
          return reject(new Error('Máy chủ trả về HTML thay vì file cài đặt'));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const out = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) {
            onProgress({ downloaded, total, percent: total > 0 ? Math.round((downloaded / total) * 100) : -1 });
          }
        });
        res.pipe(out);
        out.on('finish', () => resolve(destPath));
        out.on('error', reject);
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
      req.end();
    }

    doRequest(url, 0);
  });
}

/**
 * Xác định link và file từ danh sách assets của GitHub Release tương ứng với OS và CPU arch.
 */
function resolveGitHubDownloadInfo(assets, platform = process.platform, arch = process.arch, remoteVersion = '') {
  if (!Array.isArray(assets) || !assets.length) return null;

  if (platform === 'darwin') {
    if (arch === 'arm64') {
      const armAsset = assets.find((a) => /arm64|aarch64/i.test(a.name) && a.name.endsWith('.dmg')) ||
                       assets.find((a) => a.name.endsWith('.dmg') && !/x64|x86_64|intel/i.test(a.name));
      if (armAsset) {
        return {
          url: armAsset.browser_download_url,
          filename: armAsset.name,
          size: armAsset.size,
          arch: 'arm64',
        };
      }
      return null;
    }

    // Mac Intel x64
    const x64Asset = assets.find((a) => /x64|x86_64|intel/i.test(a.name) && a.name.endsWith('.dmg')) ||
                     assets.find((a) => a.name.endsWith('.dmg') && !/arm64|aarch64/i.test(a.name));
    if (x64Asset) {
      return {
        url: x64Asset.browser_download_url,
        filename: x64Asset.name,
        size: x64Asset.size,
        arch: 'x64',
      };
    }
    return null;
  }

  if (platform === 'win32') {
    const exeAsset = assets.find((a) => a.name.endsWith('.exe'));
    if (exeAsset) {
      return {
        url: exeAsset.browser_download_url,
        filename: exeAsset.name,
        size: exeAsset.size,
        arch: 'x64',
      };
    }
    return null;
  }

  // Linux
  const linuxAsset = assets.find((a) => a.name.endsWith('.AppImage') || a.name.endsWith('.deb'));
  if (linuxAsset) {
    return {
      url: linuxAsset.browser_download_url,
      filename: linuxAsset.name,
      size: linuxAsset.size,
      arch,
    };
  }
  return null;
}

/**
 * Kiểm tra update từ GitHub Releases API của repo public manga-crawler-pc-releases.
 * URL Google Sheet (nếu còn được truyền từ bản cũ) bị bỏ qua.
 */
async function checkForUpdate(customUrl) {
  let currentVersion = '1.0.0';
  try {
    if (app && typeof app.getVersion === 'function') {
      currentVersion = app.getVersion();
    } else {
      currentVersion = require('../../../../../package.json').version;
    }
  } catch {
    currentVersion = '1.0.0';
  }

  const platform = process.platform;
  const arch = process.arch;
  const githubApiUrl = (customUrl && !String(customUrl).includes('google.com'))
    ? customUrl
    : GITHUB_LATEST_API;

  const release = await fetchJson(githubApiUrl);
  if (!release?.tag_name) {
    throw new Error('GitHub release không có tag_name');
  }

  const remoteVersion = String(release.tag_name || '').replace(/^v/i, '').trim();
  const downloadInfo = resolveGitHubDownloadInfo(release.assets, platform, arch, remoteVersion);
  const changelog = String(release.body || '').trim();
  const releaseDate = String(release.published_at || '').trim();

  return {
    hasUpdate: isNewerVersion(remoteVersion, currentVersion),
    currentVersion,
    remoteVersion,
    downloadInfo,
    platform,
    arch,
    changelog,
    releaseDate,
    releaseUrl: release.html_url || '',
    source: 'github',
  };
}

/**
 * Tải file update từ GitHub Releases về thư mục temp.
 */
async function downloadUpdate(downloadInfo, onProgress) {
  if (!downloadInfo?.url || !downloadInfo?.filename) {
    throw new Error('Thiếu thông tin download');
  }
  const tempDir = path.join(app.getPath('temp'), 'manga-crawler-update');
  fs.mkdirSync(tempDir, { recursive: true });
  const destPath = path.join(tempDir, downloadInfo.filename);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

  await downloadFile(downloadInfo.url, destPath, onProgress);
  return destPath;
}

/**
 * Cài đặt update sau khi tải xong.
 * Windows: chạy NSIS installer với --updated flag để tự động restart sau khi cài đặt.
 * macOS DMG: mount → copy .app → relaunch.
 */
async function installUpdate(filePath) {
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows: chạy NSIS installer với các flag phù hợp
    // /S = Silent mode (không hiện UI)
    // --updated = Flag đặc biệt của electron-builder NSIS để xử lý update
    // Installer sẽ:
    // 1. Đợi app hiện tại đóng hoàn toàn
    // 2. Cài đặt phiên bản mới
    // 3. Tự động khởi động lại app
    const { spawn } = require('child_process');
    
    try {
      // Spawn installer process với detached mode
      // Không dùng execFile vì cần installer chạy độc lập sau khi app quit
      const child = spawn(filePath, ['/S', '--updated'], {
        detached: true,
        stdio: 'ignore',
      });
      
      // Unref để child process không giữ parent process
      child.unref();
      
      // Đợi một chút để đảm bảo installer đã start
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Quit app để installer có thể cài đặt
      // Installer sẽ tự động restart app sau khi hoàn thành
      setImmediate(() => {
        app.quit();
      });
      
      return { action: 'installer_started', filePath };
    } catch (err) {
      // Fallback: mở thư mục nếu không chạy được installer
      await shell.openPath(path.dirname(filePath));
      return { action: 'opened_folder', filePath, fallback: true, error: String(err?.message || err) };
    }
  }

  if (platform === 'darwin') {
    const { execFile } = require('child_process');
    const util = require('util');
    const execFileAsync = util.promisify(execFile);
    const mountPoint = `/Volumes/MangaCrawlerUpdate_${Date.now()}`;

    await execFileAsync('hdiutil', ['attach', filePath, '-mountpoint', mountPoint, '-nobrowse', '-quiet']);
    try {
      const entries = fs.readdirSync(mountPoint);
      const appName = entries.find((e) => e.endsWith('.app'));
      if (!appName) throw new Error('Không tìm thấy .app trong DMG');

      const srcApp = path.join(mountPoint, appName);
      const destApp = path.join('/Applications', appName);

      if (fs.existsSync(destApp)) await execFileAsync('rm', ['-rf', destApp]);
      await execFileAsync('cp', ['-R', srcApp, '/Applications/']);
      await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => {});

      app.relaunch({ execPath: path.join(destApp, 'Contents', 'MacOS', appName.replace('.app', '')) });
      app.exit(0);
      return { action: 'relaunched' };
    } catch (err) {
      await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => {});
      throw err;
    }
  }

  throw new Error(`Nền tảng không hỗ trợ: ${platform}`);
}

module.exports = {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  resolveGitHubDownloadInfo,
  isNewerVersion,
  GITHUB_REPO,
  GITHUB_LATEST_API,
};
