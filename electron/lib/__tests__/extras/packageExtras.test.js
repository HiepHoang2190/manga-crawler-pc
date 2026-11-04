const { generateManifest, filterOnnxPlatforms } = require('../../../../scripts/packageExtras');

describe('packageExtras helper functions', () => {
  test('generateManifest creates valid manifest metadata', () => {
    const manifest = generateManifest({
      platform: 'darwin',
      arch: 'arm64',
      version: '1.0.0',
      files: [{ path: 'upscale/realesrgan', size: 1000 }],
    });
    expect(manifest.platform).toBe('darwin');
    expect(manifest.arch).toBe('arm64');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.files.length).toBe(1);
    expect(manifest.components.upscale).toBe(true);
    expect(manifest.components.onnxruntime).toBe(true);
  });

  test('filterOnnxPlatforms keeps only target platform in bin/napi-v6', () => {
    const allowedDarwin = filterOnnxPlatforms('darwin', ['darwin', 'linux', 'win32']);
    expect(allowedDarwin).toEqual(['darwin']);

    const allowedWin = filterOnnxPlatforms('win32', ['darwin', 'linux', 'win32']);
    expect(allowedWin).toEqual(['win32']);
  });
});
