/**
 * BrandingStorage Service
 *
 * Lưu trữ và quản lý cấu hình thương hiệu ứng dụng (Tên app tùy chỉnh & Icon tùy chỉnh)
 * Lưu tại: app.getPath('userData')/branding/branding.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');

const DEFAULT_APP_NAME = 'Sưu Tầm Ebook Truyện Tranh';
const DEFAULT_ICON_TYPE = 'app'; // 'app' | 'electron' | 'custom'

function getBrandingDir() {
  const dir = path.join(app.getPath('userData'), 'branding');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getConfigFile() {
  return path.join(getBrandingDir(), 'branding.json');
}

function getCustomIconFile() {
  return path.join(getBrandingDir(), 'custom_icon.png');
}

/**
 * Lấy đường dẫn icon ứng dụng mặc định (Manga Crawler)
 */
function getDefaultAppIconPath() {
  const devPath = path.join(__dirname, '..', '..', '..', '..', 'public', 'data', 'icon.png');
  if (fs.existsSync(devPath)) return devPath;
  const distPath = path.join(__dirname, '..', '..', '..', '..', 'dist', 'data', 'icon.png');
  if (fs.existsSync(distPath)) return distPath;
  return devPath;
}

/**
 * Lấy đường dẫn icon Electron mặc định (Atom icon)
 */
function getDefaultElectronIconPath() {
  const devPath = path.join(__dirname, '..', '..', '..', '..', 'public', 'data', 'electron-icon.png');
  if (fs.existsSync(devPath)) return devPath;
  const distPath = path.join(__dirname, '..', '..', '..', '..', 'dist', 'data', 'electron-icon.png');
  if (fs.existsSync(distPath)) return distPath;
  return devPath;
}

/**
 * Đọc cấu hình thương hiệu hiện tại.
 */
function getBrandingConfig() {
  const configFile = getConfigFile();
  let raw = {};
  if (fs.existsSync(configFile)) {
    try {
      raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (_) {
      raw = {};
    }
  }

  const appName = typeof raw.appName === 'string' ? raw.appName : DEFAULT_APP_NAME;
  const iconType = ['app', 'electron', 'custom'].includes(raw.iconType) ? raw.iconType : DEFAULT_ICON_TYPE;
  const customIconExists = fs.existsSync(getCustomIconFile());

  let customIconDataUrl = null;
  if (customIconExists) {
    try {
      const buf = fs.readFileSync(getCustomIconFile());
      customIconDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    } catch (_) {}
  }

  let defaultAppDataUrl = null;
  try {
    const p = getDefaultAppIconPath();
    if (fs.existsSync(p)) {
      defaultAppDataUrl = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
    }
  } catch (_) {}

  let defaultElectronDataUrl = null;
  try {
    const p = getDefaultElectronIconPath();
    if (fs.existsSync(p)) {
      defaultElectronDataUrl = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
    }
  } catch (_) {}

  const showTitleBarIcon = raw.showTitleBarIcon !== false;

  return {
    appName,
    defaultAppName: DEFAULT_APP_NAME,
    showTitleBarIcon,
    iconType: iconType === 'custom' && !customIconExists ? 'app' : iconType,
    customIconPath: customIconExists ? getCustomIconFile() : null,
    customIconDataUrl,
    defaultAppDataUrl,
    defaultElectronDataUrl,
  };
}

/**
 * Lưu cấu hình thương hiệu mới.
 * @param {object} param0
 * @param {string} param0.appName - Cho phép chuỗi rỗng "" (blank)
 * @param {'app'|'electron'|'custom'} param0.iconType
 * @param {Buffer} [param0.iconBuffer] - Buffer ảnh custom upload
 * @param {boolean} [param0.showTitleBarIcon] - Hiển thị icon trên TitleBar hay không
 */
function saveBrandingConfig({ appName, iconType, iconBuffer, showTitleBarIcon }) {
  const finalAppName = typeof appName === 'string' ? appName : DEFAULT_APP_NAME;
  let finalIconType = ['app', 'electron', 'custom'].includes(iconType) ? iconType : DEFAULT_ICON_TYPE;

  const configFile = getConfigFile();
  let existingRaw = {};
  if (fs.existsSync(configFile)) {
    try {
      existingRaw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (_) {}
  }

  const finalShowTitleBarIcon =
    showTitleBarIcon !== undefined
      ? Boolean(showTitleBarIcon)
      : (typeof existingRaw.showTitleBarIcon === 'boolean' ? existingRaw.showTitleBarIcon : true);

  if (iconBuffer && Buffer.isBuffer(iconBuffer)) {
    try {
      const img = nativeImage.createFromBuffer(iconBuffer);
      if (!img.isEmpty()) {
        const pngBuf = img.toPNG();
        fs.writeFileSync(getCustomIconFile(), pngBuf);
        finalIconType = 'custom';
      }
    } catch (err) {
      console.error('[brandingStorage] Failed to save custom icon:', err);
    }
  }

  const config = {
    appName: finalAppName,
    iconType: finalIconType,
    showTitleBarIcon: finalShowTitleBarIcon,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
  return getBrandingConfig();
}

/**
 * Khôi phục cấu hình về mặc định.
 */
function resetBrandingConfig() {
  const configFile = getConfigFile();
  const customIcon = getCustomIconFile();
  if (fs.existsSync(configFile)) {
    try { fs.unlinkSync(configFile); } catch (_) {}
  }
  if (fs.existsSync(customIcon)) {
    try { fs.unlinkSync(customIcon); } catch (_) {}
  }
  return getBrandingConfig();
}

/**
 * Phân giải nativeImage cho Electron BrowserWindow / Dock.
 */
function resolveNativeIcon(config = getBrandingConfig()) {
  const { iconType, customIconPath } = config;

  if (iconType === 'custom' && customIconPath && fs.existsSync(customIconPath)) {
    const img = nativeImage.createFromPath(customIconPath);
    if (!img.isEmpty()) return img;
  }

  if (iconType === 'electron') {
    const electronIconPath = getDefaultElectronIconPath();
    if (fs.existsSync(electronIconPath)) {
      const img = nativeImage.createFromPath(electronIconPath);
      if (!img.isEmpty()) return img;
    }
    return nativeImage.createEmpty();
  }

  // Mặc định app icon
  const appIconPath = getDefaultAppIconPath();
  if (fs.existsSync(appIconPath)) {
    const img = nativeImage.createFromPath(appIconPath);
    if (!img.isEmpty()) return img;
  }

  return nativeImage.createEmpty();
}

module.exports = {
  DEFAULT_APP_NAME,
  DEFAULT_ICON_TYPE,
  getBrandingConfig,
  saveBrandingConfig,
  resetBrandingConfig,
  resolveNativeIcon,
  getDefaultAppIconPath,
  getDefaultElectronIconPath,
};
