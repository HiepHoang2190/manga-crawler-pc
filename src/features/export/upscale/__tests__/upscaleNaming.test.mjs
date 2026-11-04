import { getUpscaleSuffix, buildUpscaleOutputPath } from '../upscaleNaming.js';

describe('upscaleNaming', () => {
  describe('getUpscaleSuffix', () => {
    test('generates _cugan_noise1_2x for Real-CUGAN SE at 2x noise 1', () => {
      const model = { id: 'realcugan-se', suffixTag: 'cugan' };
      const suffix = getUpscaleSuffix(model, 2, 1, true);
      expect(suffix).toBe('_cugan_noise1_2x');
    });

    test('generates _cunet_noise2_2x for CUNet at 2x noise 2', () => {
      const model = { id: 'cunet', suffixTag: 'cunet' };
      const suffix = getUpscaleSuffix(model, 2, 2, true);
      expect(suffix).toBe('_cunet_noise2_2x');
    });

    test('omits noise when denoise is -1 (disabled)', () => {
      const model = { id: 'cunet', suffixTag: 'cunet' };
      const suffix = getUpscaleSuffix(model, 2, -1, true);
      expect(suffix).toBe('_cunet_2x');
    });

    test('omits noise when engine does not support denoise (e.g. Real-ESRGAN)', () => {
      const model = { id: 'realesrgan-x4plus-anime', suffixTag: 'realesrgan_anime' };
      const suffix = getUpscaleSuffix(model, 4, -1, false);
      expect(suffix).toBe('_realesrgan_anime_4x');
    });
  });

  describe('buildUpscaleOutputPath', () => {
    test('appends suffix in external output directory', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/photos/manga/1.png',
        relativePath: '1.png',
        inPlace: false,
        outputDir: '/photos/upscaled',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_noise1_2x',
      });
      expect(out).toBe('/photos/upscaled/1_cugan_noise1_2x.png');
    });

    test('appends suffix in inPlace mode alongside original file', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/photos/manga/1.png',
        relativePath: '1.png',
        inPlace: true,
        outputDir: '',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_noise1_2x',
      });
      expect(out).toBe('/photos/manga/1_cugan_noise1_2x.png');
    });

    test('respects output format conversion to webp', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/photos/manga/1.jpg',
        relativePath: '1.jpg',
        inPlace: false,
        outputDir: '/photos/upscaled',
        outputFormat: 'webp',
        appendParams: true,
        suffix: '_cunet_2x',
      });
      expect(out).toBe('/photos/upscaled/1_cunet_2x.webp');
    });

    test('preserves subfolder hierarchy', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/root/ch1/001.png',
        relativePath: 'ch1/001.png',
        inPlace: false,
        outputDir: '/out',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_noise1_2x',
      });
      expect(out).toBe('/out/ch1/001_cugan_noise1_2x.png');
    });

    test('preserves deep nested subfolder hierarchy and cleans trailing slashes', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/root/arc1/vol1/ch1/001.png',
        relativePath: 'arc1/vol1/ch1/001.png',
        inPlace: false,
        outputDir: '/out/',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_2x',
      });
      expect(out).toBe('/out/arc1/vol1/ch1/001_cugan_2x.png');
    });

    test('normalizes mixed separators on Windows subfolders', () => {
      const out = buildUpscaleOutputPath({
        inputPath: 'C:\\manga\\chapter 1\\001.png',
        relativePath: 'chapter 1/001.png',
        inPlace: false,
        outputDir: 'D:\\output\\',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_2x',
      });
      expect(out).toBe('D:\\output\\chapter 1\\001_cugan_2x.png');
    });

    test('handles Windows backslash separators correctly in inPlace mode', () => {
      const out = buildUpscaleOutputPath({
        inputPath: 'C:\\manga\\chapter 1\\001.png',
        relativePath: 'chapter 1\\001.png',
        inPlace: true,
        outputDir: '',
        outputFormat: 'jpg',
        appendParams: true,
        suffix: '_cugan_2x',
      });
      expect(out).toBe('C:\\manga\\chapter 1\\001_cugan_2x.jpg');
    });

    test('preserves root folder Naruto when outputDir is Document', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/Users/admin/Downloads/Naruto/chapter1/001.png',
        relativePath: 'chapter1/001.png',
        sourceDir: '/Users/admin/Downloads/Naruto',
        inPlace: false,
        outputDir: '/Users/admin/Documents',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_2x',
      });
      expect(out).toBe('/Users/admin/Documents/Naruto/chapter1/001_cugan_2x.png');
    });

    test('does not duplicate root folder when outputDir already ends with root folder name', () => {
      const out = buildUpscaleOutputPath({
        inputPath: '/Users/admin/Downloads/Naruto/chapter1/001.png',
        relativePath: 'chapter1/001.png',
        sourceDir: '/Users/admin/Downloads/Naruto/',
        inPlace: false,
        outputDir: '/Users/admin/Documents/Naruto/',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_2x',
      });
      expect(out).toBe('/Users/admin/Documents/Naruto/chapter1/001_cugan_2x.png');
    });

    test('preserves root folder with Windows separators', () => {
      const out = buildUpscaleOutputPath({
        inputPath: 'D:\\Raw\\Naruto\\chapter 1\\001.png',
        relativePath: 'chapter 1/001.png',
        sourceDir: 'D:\\Raw\\Naruto\\',
        inPlace: false,
        outputDir: 'E:\\Output\\',
        outputFormat: 'original',
        appendParams: true,
        suffix: '_cugan_2x',
      });
      expect(out).toBe('E:\\Output\\Naruto\\chapter 1\\001_cugan_2x.png');
    });
  });
});
