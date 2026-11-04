const fs = require('fs');
const path = require('path');
const { downloadChapterWithBrowserCapture } = require('../../../platform/connectors/services/moetruyenBrowserCapture');

describe('moetruyenBrowserCapture', () => {
  const tmpDir = path.join(__dirname, 'tmp_test_capture');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('should export downloadChapterWithBrowserCapture function', () => {
    expect(typeof downloadChapterWithBrowserCapture).toBe('function');
  });

  test('should return aborted if shouldAbort returns true initially', async () => {
    const payload = {
      mangaTitle: 'Test Manga',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/1',
      chapterTitle: 'Chapter 1',
      baseSaveDir: tmpDir,
      shouldAbort: () => true,
    };

    const result = await downloadChapterWithBrowserCapture(payload);
    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
  });

  test('should handle mock browser window and capture pages successfully', async () => {
    const mockImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 800, height: 1200 }),
      toPNG: () => Buffer.from('FAKE_PNG_BYTES'),
      toJPEG: () => Buffer.from('FAKE_JPG_BYTES'),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) {
          // Return 2 pages: [0, 1]
          return Promise.resolve([0, 1]);
        }
        if (code.includes('is-loaded')) {
          return Promise.resolve(true);
        }
        if (code.includes('getBoundingClientRect')) {
          return Promise.resolve({ x: 10, y: 20, width: 800, height: 1200 });
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn().mockResolvedValue(mockImage),
      session: {
        cookies: {
          set: jest.fn().mockResolvedValue(undefined),
        },
      },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const onProgress = jest.fn();
    const onChapterTotal = jest.fn();
    const onPageDownloaded = jest.fn();

    const payload = {
      mangaTitle: 'Test Manga',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      onProgress,
      onChapterTotal,
      onPageDownloaded,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });
    expect(result.ok).toBe(true);
    expect(result.totalPages).toBe(2);
    expect(result.successCount).toBe(2);
    expect(onChapterTotal).toHaveBeenCalledWith(2);
    expect(onProgress).toHaveBeenCalled();
    expect(onPageDownloaded).toHaveBeenCalled();
    expect(mockWin.destroy).toHaveBeenCalled();

    // Verify files were written to disk
    const { resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
    const chapterFolder = resolveChapterDir(tmpDir, 'Test Manga', 'Chapter 41');
    const files = fs.readdirSync(chapterFolder).filter((f) => f.endsWith('.jpg'));
    expect(files.length).toBe(2);
  });

  test('should clean up window and return error if loadURL fails', async () => {
    const mockWin = {
      webContents: {
        setUserAgent: jest.fn(),
      },
      loadURL: jest.fn().mockRejectedValue(new Error('Network error')),
      isDestroyed: () => false,
      destroy: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Manga',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Network error');
    expect(mockWin.destroy).toHaveBeenCalled();
  });

  test('should capture pages via Chrome DevTools Protocol (CDP) with captureBeyondViewport and scale', async () => {
    const fakeBase64Jpeg = Buffer.from('FAKE_CDP_JPEG_BYTES').toString('base64');
    const mockDebugger = {
      attach: jest.fn(),
      detach: jest.fn(),
      isAttached: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockResolvedValue({ data: fakeBase64Jpeg }),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      debugger: mockDebugger,
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) {
          return Promise.resolve([0]);
        }
        if (code.includes('is-loaded')) {
          return Promise.resolve(true);
        }
        if (code.includes('data-imgx-width')) {
          return Promise.resolve({
            x: 0,
            y: 0,
            pageX: 0,
            pageY: 100,
            width: 800,
            height: 1200,
            dataWidth: 1600,
            dataHeight: 2400,
          });
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn(),
      session: { cookies: { set: jest.fn() } },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
      setContentSize: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Manga CDP',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(true);
    expect(mockDebugger.attach).toHaveBeenCalledWith('1.3');
    expect(mockDebugger.sendCommand).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 92,
      clip: {
        x: 0,
        y: 100,
        width: 800,
        height: 1200,
        scale: 2, // 1600 / 800
      },
      captureBeyondViewport: true,
    });
    // capturePage should NOT be called when CDP succeeds
    expect(mockWebContents.capturePage).not.toHaveBeenCalled();
    expect(mockDebugger.detach).toHaveBeenCalled();
    expect(mockWin.destroy).toHaveBeenCalled();

    const { resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
    const chapterFolder = resolveChapterDir(tmpDir, 'Test Manga CDP', 'Chapter 41');
    const files = fs.readdirSync(chapterFolder).filter((f) => f.endsWith('.jpg'));
    expect(files.length).toBe(1);
    const content = fs.readFileSync(path.join(chapterFolder, files[0]));
    expect(content.toString()).toBe('FAKE_CDP_JPEG_BYTES');
  });

  test('should fallback to capturePage with setContentSize if CDP sendCommand fails', async () => {
    const mockDebugger = {
      attach: jest.fn(),
      detach: jest.fn(),
      isAttached: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockRejectedValue(new Error('CDP error')),
    };

    const mockImage = {
      isEmpty: () => false,
      toJPEG: () => Buffer.from('FALLBACK_JPEG_BYTES'),
      toPNG: () => Buffer.from('FALLBACK_PNG_BYTES'),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      debugger: mockDebugger,
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) {
          return Promise.resolve([0]);
        }
        if (code.includes('is-loaded')) {
          return Promise.resolve(true);
        }
        if (code.includes('data-imgx-width')) {
          return Promise.resolve({
            x: 0,
            y: 0,
            pageX: 0,
            pageY: 100,
            width: 800,
            height: 1200,
            dataWidth: 800,
            dataHeight: 1200,
          });
        }
        if (code.includes('getBoundingClientRect')) {
          return Promise.resolve({ x: 0, y: 0, width: 800, height: 1200 });
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn().mockResolvedValue(mockImage),
      session: { cookies: { set: jest.fn() } },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
      setContentSize: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Manga Fallback',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(true);
    expect(mockWin.setContentSize).toHaveBeenCalledWith(1600, 1800);
    expect(mockWebContents.capturePage).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 800,
      height: 1200,
    });
    expect(mockDebugger.detach).toHaveBeenCalled();
  });

  test('should fallback to capturePage if CDP sendCommand times out (simulating Windows hang)', async () => {
    // Hang forever without resolving or rejecting to simulate Windows compositor deadlock
    const mockDebugger = {
      attach: jest.fn(),
      detach: jest.fn(),
      isAttached: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockImplementation((method) => {
        if (method === 'Page.captureScreenshot') {
          return new Promise(() => {});
        }
        return Promise.resolve({});
      }),
    };

    const mockImage = {
      isEmpty: () => false,
      toJPEG: () => Buffer.from('TIMEOUT_FALLBACK_JPEG_BYTES'),
      toPNG: () => Buffer.from('TIMEOUT_FALLBACK_PNG_BYTES'),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      debugger: mockDebugger,
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) {
          return Promise.resolve([0]);
        }
        if (code.includes('is-loaded')) {
          return Promise.resolve(true);
        }
        if (code.includes('data-imgx-width')) {
          return Promise.resolve({
            x: 0,
            y: 0,
            pageX: 0,
            pageY: 100,
            width: 800,
            height: 1200,
            dataWidth: 800,
            dataHeight: 1200,
          });
        }
        if (code.includes('getBoundingClientRect')) {
          return Promise.resolve({ x: 0, y: 0, width: 800, height: 1200 });
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn().mockResolvedValue(mockImage),
      session: { cookies: { set: jest.fn() } },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
      setContentSize: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Manga Timeout',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    // Use fake timers or let timeout trigger
    const startT = Date.now();
    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(true);
    expect(mockWebContents.capturePage).toHaveBeenCalled();
    expect(mockDebugger.detach).toHaveBeenCalled();
  }, 10000);

  test('should retry page capture when attempt 1 fails and succeed on attempt 2', async () => {
    let callCount = 0;
    const fakeJpeg = Buffer.from('RETRY_SUCCESS_JPEG').toString('base64');
    const mockDebugger = {
      attach: jest.fn(),
      detach: jest.fn(),
      isAttached: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary glitch'));
        }
        return Promise.resolve({ data: fakeJpeg });
      }),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      debugger: mockDebugger,
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) return Promise.resolve([0]);
        if (code.includes('is-loaded')) return Promise.resolve(true);
        if (code.includes('data-imgx-width')) {
          return Promise.resolve({
            x: 0,
            y: 0,
            pageX: 0,
            pageY: 100,
            width: 800,
            height: 1200,
            dataWidth: 800,
            dataHeight: 1200,
          });
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn().mockResolvedValue({ isEmpty: () => true }), // fallback fails on attempt 1 to trigger retry
      session: { cookies: { set: jest.fn() } },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
      setContentSize: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Retry Page',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.successCount).toBe(1);
  });

  test('should perform post-loop sweep for failed pages and rescue them', async () => {
    let callCount = 0;
    const fakeJpeg = Buffer.from('RESCUED_JPEG').toString('base64');
    const mockDebugger = {
      attach: jest.fn(),
      detach: jest.fn(),
      isAttached: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockImplementation((method) => {
        if (method === 'Page.captureScreenshot') {
          callCount++;
          // Fail first 3 attempts (main loop), succeed on 4th attempt (post-loop sweep)
          if (callCount <= 3) {
            return Promise.reject(new Error('Main loop failure'));
          }
          return Promise.resolve({ data: fakeJpeg });
        }
        return Promise.resolve({});
      }),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      debugger: mockDebugger,
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) return Promise.resolve([0]);
        if (code.includes('is-loaded')) return Promise.resolve(true);
        if (code.includes('data-imgx-width')) {
          return Promise.resolve({
            x: 0,
            y: 0,
            pageX: 0,
            pageY: 100,
            width: 800,
            height: 1200,
            dataWidth: 800,
            dataHeight: 1200,
          });
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn().mockResolvedValue({ isEmpty: () => true }),
      session: { cookies: { set: jest.fn() } },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
      setContentSize: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Sweep Rescued',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(4);
    expect(result.successCount).toBe(1);
  });

  test('should extract pages directly via __extractPageDecryptedBase64 as lossless WebP and clean stale JPG', async () => {
    // Valid minimal WebP header buffer: RIFF [4 bytes] WEBP VP8 [4 bytes]
    const fakeWebpBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x20, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
      0x56, 0x50, 0x38, 0x20, // VP8_
      0x14, 0x00, 0x00, 0x00,
      ...new Array(100).fill(0xaa),
    ]);
    const fakeWebpBase64 = fakeWebpBytes.toString('base64');

    // Pre-create a stale corrupt .jpg file in the destination folder
    const { resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
    const chapterFolder = resolveChapterDir(tmpDir, 'Test Direct Decrypt', 'Chapter 41');
    fs.mkdirSync(chapterFolder, { recursive: true });
    const staleJpgPath = path.join(chapterFolder, '001.jpg');
    fs.writeFileSync(staleJpgPath, Buffer.from('CORRUPT_STALE_JPG_HALFB_LACK'));

    const mockDebugger = {
      attach: jest.fn(),
      detach: jest.fn(),
      isAttached: jest.fn().mockReturnValue(true),
      sendCommand: jest.fn().mockResolvedValue({}),
    };

    const mockWebContents = {
      setUserAgent: jest.fn(),
      loadURL: jest.fn().mockResolvedValue(undefined),
      debugger: mockDebugger,
      executeJavaScript: jest.fn().mockImplementation((code) => {
        if (code.includes('querySelectorAll')) {
          return Promise.resolve([0, 1]);
        }
        if (code.includes('__extractPageDecryptedBase64')) {
          return Promise.resolve(fakeWebpBase64);
        }
        return Promise.resolve(null);
      }),
      capturePage: jest.fn(),
      session: { cookies: { set: jest.fn() } },
    };

    const mockWin = {
      webContents: mockWebContents,
      loadURL: jest.fn().mockResolvedValue(undefined),
      isDestroyed: () => false,
      destroy: jest.fn(),
    };

    const MockBrowserWindow = jest.fn().mockImplementation(() => mockWin);

    const payload = {
      mangaTitle: 'Test Direct Decrypt',
      mangaUrl: 'https://moetruyen.net/manga/1',
      chapterUrl: 'https://moetruyen.net/manga/1/chapters/41',
      chapterTitle: 'Chapter 41',
      baseSaveDir: tmpDir,
      shouldAbort: () => false,
    };

    const result = await downloadChapterWithBrowserCapture(payload, {
      BrowserWindowClass: MockBrowserWindow,
    });

    expect(result.ok).toBe(true);
    expect(result.totalPages).toBe(2);
    expect(result.successCount).toBe(2);

    // Verify screenshot was completely bypassed
    expect(mockDebugger.sendCommand).not.toHaveBeenCalledWith('Page.captureScreenshot', expect.anything());
    expect(mockWebContents.capturePage).not.toHaveBeenCalled();

    // Verify files were saved as .webp
    const files = fs.readdirSync(chapterFolder);
    expect(files).toContain('001.webp');
    expect(files).toContain('002.webp');

    // Verify stale .jpg was cleanly removed
    expect(files).not.toContain('001.jpg');
    expect(fs.existsSync(staleJpgPath)).toBe(false);

    // Verify content matches the lossless decrypted WebP bytes
    const savedBytes = fs.readFileSync(path.join(chapterFolder, '001.webp'));
    expect(savedBytes.equals(fakeWebpBytes)).toBe(true);
  });
});

