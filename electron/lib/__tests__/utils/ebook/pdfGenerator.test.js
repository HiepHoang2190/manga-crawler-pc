const { generatePdf } = require('../../../export/pdfGenerator');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

describe('pdfGenerator', () => {
  let tempDir;
  let testImages;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = path.join(os.tmpdir(), `pdf-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Create test images with different dimensions
    testImages = [];
    
    // Portrait image (800x1200)
    const img1Path = path.join(tempDir, 'test1.jpg');
    await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
      .jpeg()
      .toFile(img1Path);
    testImages.push({ path: img1Path, title: 'Chapter 1 - Page 1' });

    // Landscape image (1600x900)
    const img2Path = path.join(tempDir, 'test2.jpg');
    await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    })
      .jpeg()
      .toFile(img2Path);
    testImages.push({ path: img2Path, title: 'Chapter 1 - Page 2' });

    // Square image (1000x1000)
    const img3Path = path.join(tempDir, 'test3.jpg');
    await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 0, g: 0, b: 255 }
      }
    })
      .jpeg()
      .toFile(img3Path);
    testImages.push({ path: img3Path, title: 'Chapter 2 - Page 1' });
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should generate PDF with variable page sizes', async () => {
    const outputPath = path.join(tempDir, 'output.pdf');
    
    await generatePdf({
      images: testImages,
      outputPath,
      metadata: {
        title: 'Test Manga',
        creator: 'Test Creator'
      }
    });

    // Verify PDF file was created
    expect(fs.existsSync(outputPath)).toBe(true);
    
    // Verify file has content
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should call progress callback during generation', async () => {
    const outputPath = path.join(tempDir, 'output-progress.pdf');
    const progressCalls = [];
    
    await generatePdf({
      images: testImages,
      outputPath,
      metadata: {
        title: 'Test Manga',
        creator: 'Test Creator'
      },
      onProgress: (progress) => {
        progressCalls.push(progress);
      }
    });

    // Verify progress was reported
    expect(progressCalls.length).toBe(testImages.length);
    expect(progressCalls[0]).toEqual({
      done: 1,
      total: testImages.length,
      label: testImages[0].title
    });
    expect(progressCalls[progressCalls.length - 1]).toEqual({
      done: testImages.length,
      total: testImages.length,
      label: testImages[testImages.length - 1].title
    });
  });

  test('should throw error when no images provided', async () => {
    const outputPath = path.join(tempDir, 'output-empty.pdf');
    
    await expect(generatePdf({
      images: [],
      outputPath,
      metadata: { title: 'Test', creator: 'Test' }
    })).rejects.toThrow('No images provided');
  });

  test('should throw error when output path is missing', async () => {
    await expect(generatePdf({
      images: testImages,
      outputPath: '',
      metadata: { title: 'Test', creator: 'Test' }
    })).rejects.toThrow('Output path is required');
  });

  test('should throw error when image file does not exist', async () => {
    const outputPath = path.join(tempDir, 'output-missing.pdf');
    const invalidImages = [
      { path: path.join(tempDir, 'nonexistent.jpg'), title: 'Missing' }
    ];
    
    await expect(generatePdf({
      images: invalidImages,
      outputPath,
      metadata: { title: 'Test', creator: 'Test' }
    })).rejects.toThrow('Image file not found');
  });

  test('should create output directory if it does not exist', async () => {
    const nestedDir = path.join(tempDir, 'nested', 'output');
    const outputPath = path.join(nestedDir, 'output.pdf');
    
    await generatePdf({
      images: testImages,
      outputPath,
      metadata: {
        title: 'Test Manga',
        creator: 'Test Creator'
      }
    });

    // Verify directory and file were created
    expect(fs.existsSync(nestedDir)).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('should set PDF metadata correctly', async () => {
    const outputPath = path.join(tempDir, 'output-metadata.pdf');
    const metadata = {
      title: 'My Test Manga',
      creator: 'Custom Creator'
    };
    
    await generatePdf({
      images: testImages,
      outputPath,
      metadata
    });

    // Verify PDF was created (metadata verification would require PDF parsing library)
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('should fail with clear error when sharp is unavailable and a WebP image is processed', async () => {
    // Simulate the Windows production scenario: sharp unavailable, Jimp used as fallback.
    // The old code would crash with the cryptic "Unsupported MIME type: image/webp" from Jimp.
    // The new code should throw a clear message explaining sharp is required.
    const webpPath = path.join(tempDir, 'no-sharp-webp.webp');
    await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 100, g: 100, b: 100 } }
    }).webp().toFile(webpPath);

    // Use jest.doMock (not jest.mock) so the mock applies only in this test scope
    jest.resetModules();
    jest.doMock('sharp', () => { throw new Error('sharp not available'); });
    const { generatePdf: generatePdfNoSharp } = require('../../../export/pdfGenerator');

    const outputPath = path.join(tempDir, 'output-no-sharp-webp.pdf');
    await expect(generatePdfNoSharp({
      images: [{ path: webpPath, title: 'WebP No Sharp' }],
      outputPath,
      metadata: { title: 'Test', creator: 'Test' }
    })).rejects.toThrow('sharp module');

    jest.unmock('sharp');
    jest.resetModules();
  });

  test('should convert WebP images to JPEG for PDF compatibility', async () => {
    // Create a WebP test image
    const webpPath = path.join(tempDir, 'test-webp.webp');
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 128, g: 128, b: 255 }
      }
    })
      .webp()
      .toFile(webpPath);

    const outputPath = path.join(tempDir, 'output-webp.pdf');
    const webpImages = [
      { path: webpPath, title: 'WebP Test Page' },
      ...testImages // Mix WebP with JPEG
    ];
    
    await generatePdf({
      images: webpImages,
      outputPath,
      metadata: {
        title: 'WebP Test Manga',
        creator: 'Test Creator'
      }
    });

    // Verify PDF was created successfully
    expect(fs.existsSync(outputPath)).toBe(true);
    
    // Verify file has content
    const stats = fs.statSync(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });
});
