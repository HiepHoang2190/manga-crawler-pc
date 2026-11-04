const fs = require('fs');
const path = require('path');
const os = require('os');

describe('BrandingStorage Service', () => {
  let tempDir;
  let brandingStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-'));
    // Mock electron app.getPath('userData')
    jest.resetModules();
    jest.doMock('electron', () => ({
      app: {
        getPath: jest.fn().mockReturnValue(tempDir),
      },
      nativeImage: {
        createFromBuffer: jest.fn((buf) => ({
          isEmpty: () => !buf || buf.length === 0,
          toPNG: () => buf,
          toDataURL: () => 'data:image/png;base64,mock',
          resize: jest.fn().mockReturnThis(),
        })),
        createFromPath: jest.fn((p) => ({
          isEmpty: () => !fs.existsSync(p),
          toPNG: () => Buffer.from('mock'),
          toDataURL: () => 'data:image/png;base64,mock',
          resize: jest.fn().mockReturnThis(),
        })),
        createEmpty: jest.fn(() => ({
          isEmpty: () => true,
        })),
      },
    }));

    brandingStorage = require('../platform/storage/brandingStorage');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('returns default branding configuration when no config exists', () => {
    const config = brandingStorage.getBrandingConfig();
    expect(config.appName).toBe('Sưu Tầm Ebook Truyện Tranh');
    expect(config.iconType).toBe('app');
    expect(config.showTitleBarIcon).toBe(true);
    expect(config.customIconPath).toBeNull();
  });

  it('saves custom app name including empty/blank string', () => {
    // Blank name allowed
    const savedBlank = brandingStorage.saveBrandingConfig({ appName: '', iconType: 'app' });
    expect(savedBlank.appName).toBe('');

    const loadedBlank = brandingStorage.getBrandingConfig();
    expect(loadedBlank.appName).toBe('');

    // Custom string name
    const savedCustom = brandingStorage.saveBrandingConfig({ appName: 'My Manga Reader', iconType: 'electron' });
    expect(savedCustom.appName).toBe('My Manga Reader');
    expect(savedCustom.iconType).toBe('electron');
  });

  it('saves and preserves showTitleBarIcon toggle while keeping native icon intact', () => {
    const saved = brandingStorage.saveBrandingConfig({
      appName: 'Custom App',
      iconType: 'electron',
      showTitleBarIcon: false,
    });
    expect(saved.showTitleBarIcon).toBe(false);

    const loaded = brandingStorage.getBrandingConfig();
    expect(loaded.showTitleBarIcon).toBe(false);

    // Native icon resolution still resolves the electron icon for the OS Dock/Taskbar
    const nativeImg = brandingStorage.resolveNativeIcon(loaded);
    expect(nativeImg).toBeDefined();
  });

  it('saves and resolves custom icon image buffer', () => {
    const fakeImageBuffer = Buffer.from('fake-png-data');
    const saved = brandingStorage.saveBrandingConfig({
      appName: 'Custom App',
      iconType: 'custom',
      iconBuffer: fakeImageBuffer,
    });

    expect(saved.iconType).toBe('custom');
    expect(saved.customIconPath).not.toBeNull();

    const loaded = brandingStorage.getBrandingConfig();
    expect(loaded.iconType).toBe('custom');
    expect(fs.existsSync(path.join(tempDir, 'branding', 'custom_icon.png'))).toBe(true);
  });

  it('resets branding configuration back to defaults', () => {
    brandingStorage.saveBrandingConfig({
      appName: 'Testing Reset',
      iconType: 'electron',
      showTitleBarIcon: false,
    });

    const reset = brandingStorage.resetBrandingConfig();
    expect(reset.appName).toBe('Sưu Tầm Ebook Truyện Tranh');
    expect(reset.iconType).toBe('app');
    expect(reset.showTitleBarIcon).toBe(true);
    expect(reset.customIconPath).toBeNull();
  });
});
