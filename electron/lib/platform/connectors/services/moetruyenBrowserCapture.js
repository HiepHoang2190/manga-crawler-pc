/**
 * MoeTruyen browser capture module.
 *
 * Used exclusively for chapters protected with IMGX runtime encryption, where
 * images are decrypted in-browser via WebCrypto ECDH & HMAC sequence signing.
 * Spawns a single hidden BrowserWindow to render and capture all pages directly
 * from Chromium's compositor via capturePage().
 */
const fs = require('fs');
const path = require('path');
const { loadOrCreate } = require('../../storage/downloadDb');
const { resolveMangaDir, resolveChapterDir } = require('../../../download/connector/connectorPathUtils');
const { formatChapterTitle, formatChapterPageFileName } = require('../../../shared/mangaUtils');
const { downloadCoverIfNeeded } = require('../../../download/connector/connectorDownloadUtils');
const { removeEmptyChapterDir } = require('../../../download/removeEmptyChapterDir');

const DEFAULT_USER_AGENT =
  process.platform === 'darwin'
    ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Safely sends a CDP command with an explicit timeout to prevent hanging forever
 * when the Chromium compositor stalls on Windows offscreen surfaces.
 */
function sendCdpWithTimeout(cdpDebugger, method, params, timeoutMs = 5000) {
  return Promise.race([
    cdpDebugger.sendCommand(method, params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`CDP command '${method}' timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Downloads an IMGX-encrypted chapter by capturing rendered pages in a hidden BrowserWindow.
 *
 * @param {object} payload
 * @param {object} [options]
 * @returns {Promise<object>} Download result
 */
async function downloadChapterWithBrowserCapture(payload, options = {}) {
  const {
    mangaTitle,
    mangaUrl,
    chapterUrl,
    chapterTitle,
    baseSaveDir,
    coverUrl,
    chapterFolderFormat,
    onLog,
    onProgress,
    onChapterTotal,
    onPageDownloaded,
    shouldAbort,
  } = payload;

  const connector = options.connectorLabel || 'MoeTruyen';
  const log = (msg, level = 'info') => {
    if (typeof onLog === 'function') onLog(msg, level);
  };
  const report = (progressPayload) => {
    if (typeof onProgress === 'function') onProgress(progressPayload);
  };

  const chapterDir = resolveChapterDir(baseSaveDir, mangaTitle, chapterTitle, chapterFolderFormat);
  const dbChapterTitle = formatChapterTitle(chapterTitle);
  const mangaDir = resolveMangaDir(baseSaveDir, mangaTitle);

  // Check initial abort
  if (typeof shouldAbort === 'function' && shouldAbort()) {
    return { ok: false, aborted: true };
  }

  // Create directory
  try {
    fs.mkdirSync(chapterDir, { recursive: true });
  } catch (err) {
    const detail = String(err?.message || err);
    log(`Không tạo được thư mục chương: ${detail}`, 'error');
    return { ok: false, error: `Không tạo được thư mục lưu chương — ${detail}` };
  }

  const cleanupEmptyDir = () => {
    if (removeEmptyChapterDir(chapterDir)) {
      log('Đã xoá thư mục rỗng sau khi tải thất bại.', 'info');
    }
  };

  // Download cover if needed
  try {
    await downloadCoverIfNeeded(coverUrl, mangaDir, chapterUrl, DEFAULT_USER_AGENT, log);
  } catch {
    /* ignore cover failure */
  }

  if (typeof shouldAbort === 'function' && shouldAbort()) {
    cleanupEmptyDir();
    return { ok: false, aborted: true };
  }

  // Init DB
  const db = loadOrCreate(mangaDir, mangaTitle, mangaUrl, connector);
  if (!db.record.mangaTitle) {
    db.record.mangaTitle = mangaTitle;
    db.record.mangaUrl = mangaUrl;
    db.record.connector = connector;
    db.save();
  }

  // Acquire BrowserWindow
  let BrowserWindow = options.BrowserWindowClass;
  if (!BrowserWindow) {
    try {
      const electron = require('electron');
      BrowserWindow = electron && electron.BrowserWindow;
    } catch {
      /* not in electron */
    }
  }

  if (!BrowserWindow) {
    cleanupEmptyDir();
    return {
      ok: false,
      error: 'Electron BrowserWindow không khả dụng để chụp trang mã hoá IMGX.',
    };
  }

  let win = null;

  try {
    log(`[MoeTruyen Capture] Khởi tạo Chromium capture session cho: ${chapterTitle}`, 'info');

    const preloadScriptPath =
      options.preloadPath || path.join(__dirname, 'moetruyenCapturePreload.js');

    win = new BrowserWindow({
      show: false,
      width: 1400,
      height: 1800,
      webPreferences: {
        preload: preloadScriptPath,
        nodeIntegration: false,
        contextIsolation: false,
        javascript: true,
        backgroundThrottling: false,
      },
    });

    const ua = options.userAgent || DEFAULT_USER_AGENT;
    if (win.webContents && typeof win.webContents.setUserAgent === 'function') {
      win.webContents.setUserAgent(ua);
    }

    if (win.webContents && typeof win.webContents.on === 'function') {
      win.webContents.on('render-process-gone', (event, details) => {
        log(`[MoeTruyen Capture] Render process gone (${details?.reason || 'unknown'}).`, 'warn');
      });
    }

    // CDP debugger state (will attach safely after loadURL completes)
    let debuggerAttached = false;
    let currentEmulatedWidth = 1600;
    let currentEmulatedHeight = 2500;

    // Set cookie if provided
    if (options.cookie && win.webContents && win.webContents.session?.cookies) {
      try {
        const cookiePairs = String(options.cookie)
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
        const parsedUrl = new URL(chapterUrl);
        for (const pair of cookiePairs) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > 0) {
            const name = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim();
            await win.webContents.session.cookies.set({
              url: `${parsedUrl.protocol}//${parsedUrl.host}`,
              name,
              value,
            });
          }
        }
      } catch (err) {
        log(`[MoeTruyen Capture] Lỗi nạp cookie: ${err.message}`, 'warn');
      }
    }

    // Load chapter URL
    log(`[MoeTruyen Capture] Đang tải trang chương vào trình duyệt...`, 'info');
    await win.loadURL(chapterUrl);

    // Wait for reader container and page elements
    const detectStartTime = Date.now();
    let pageIndices = [];
    while (Date.now() - detectStartTime < 25000) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        cleanupEmptyDir();
        return { ok: false, aborted: true };
      }

      try {
        const detected = await win.webContents.executeJavaScript(`
          (() => {
            const map = new Map();
            const items = document.querySelectorAll('.page-protected-shell[data-page-index], [data-page-index]');
            items.forEach(el => {
              const raw = el.getAttribute('data-page-index');
              if (raw !== null && raw !== '') {
                const idx = parseInt(raw, 10);
                if (!Number.isNaN(idx)) {
                  map.set(idx, true);
                }
              }
            });
            return Array.from(map.keys()).sort((a, b) => a - b);
          })()
        `);
        if (Array.isArray(detected) && detected.length > 0) {
          pageIndices = detected;
          break;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    if (!pageIndices.length) {
      cleanupEmptyDir();
      return {
        ok: false,
        error: 'Không tìm thấy khung trang reader sau khi tải trang chương.',
      };
    }

    const totalPages = pageIndices.length;
    log(`[MoeTruyen Capture] Tìm thấy ${totalPages} trang truyện đã được reader nạp.`, 'info');

    if (typeof onChapterTotal === 'function') {
      onChapterTotal(totalPages);
    }

    // Inject unconstraining CSS to eliminate sidebars/docks and allow 100% full-width unconstrained rendering
    try {
      await win.webContents.executeJavaScript(`
        (() => {
          const styleId = 'crawler-unconstrain-style';
          let style = document.getElementById(styleId);
          if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
          }
          style.textContent = \`
            .reader-dock, aside, header, nav, footer { display: none !important; }
            .reader-shell__content { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
            .reader-shell__layout { display: block !important; width: 100% !important; max-width: none !important; }
            .reader-shell { max-width: none !important; width: 100% !important; padding: 0 !important; margin: 0 !important; }
            .page-frame, .page-card { width: 100% !important; max-width: none !important; display: flex !important; justify-content: center !important; }
            .page-protected-shell { width: var(--imgx-protected-width, auto) !important; max-width: none !important; margin: 0 auto !important; }
          \`;
        })()
      `);
    } catch {
      /* ignore style injection error */
    }

    // Safely attach Chrome DevTools Protocol (CDP) to the fully loaded page for virtual viewport emulation
    if (win.webContents && win.webContents.debugger && typeof win.webContents.debugger.attach === 'function') {
      try {
        win.webContents.debugger.attach('1.3');
        debuggerAttached = true;
        log('[MoeTruyen Capture] Kích hoạt Chrome DevTools Protocol (CDP) capture pipeline.', 'info');

        // Emulate large virtual viewport (1600x2500) so entire manga page fits inside viewport,
        // preventing OS display limits from cutting off sides or bottom
        try {
          await sendCdpWithTimeout(
            win.webContents.debugger,
            'Emulation.setDeviceMetricsOverride',
            {
              width: currentEmulatedWidth,
              height: currentEmulatedHeight,
              deviceScaleFactor: 1,
              mobile: false,
            },
            3000
          );
        } catch {
          /* ignore override setup error */
        }
      } catch (err) {
        log(`[MoeTruyen Capture] Không thể gắn CDP debugger: ${err.message}`, 'debug');
      }
    }

    // Build page metadata
    const pageInfos = pageIndices.map((pIdx, i) => {
      const idx = i + 1; // 1-based index
      const fileName = formatChapterPageFileName(chapterTitle, idx, 'jpg', chapterFolderFormat);
      const filePath = path.join(chapterDir, fileName);
      return {
        index: idx,
        pageIndex: pIdx,
        fileName,
        filePath,
      };
    });

    // Initialize DB if needed
    if (!db.hasChapter(dbChapterTitle)) {
      const allPages = pageInfos.map((pi) => ({
        index: pi.index,
        fileName: pi.fileName,
        sourceUrl: `moetruyen://page/${pi.pageIndex}`,
        status: 'pending',
      }));
      db.initChapter(dbChapterTitle, chapterUrl, allPages.length, allPages);
    }

    let successCount = 0;
    const failedPageIndices = [];

    /**
     * Captures a single page with retries, dynamic viewport resizing, and layout-shift stabilization.
     *
     * @param {object} info - Page info object
     * @param {number} maxAttempts - Number of retry attempts
     * @returns {Promise<{ ok: boolean, aborted?: boolean, buffer?: Buffer }>}
     */
    const captureSinglePage = async (info, maxAttempts = 3) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (typeof shouldAbort === 'function' && shouldAbort()) {
          return { ok: false, aborted: true };
        }

        // 1. Scroll element into view with block: 'start'
        try {
          await win.webContents.executeJavaScript(`
            (() => {
              const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                         document.querySelector('[data-page-index="${info.pageIndex}"]');
              if (el) {
                el.scrollIntoView({ behavior: 'instant', block: 'start' });
                window.dispatchEvent(new Event('scroll'));
              }
            })()
          `);
        } catch {
          /* ignore scroll error */
        }

        // 2. Direct Decryption Extraction via IMGX preload hook (Lossless & Instant)
        const pageStartTime = Date.now();
        const waitTimeout = attempt === 1 ? 15000 : 8000;
        let decryptedBase64 = null;
        while (Date.now() - pageStartTime < waitTimeout) {
          if (typeof shouldAbort === 'function' && shouldAbort()) {
            return { ok: false, aborted: true };
          }
          try {
            decryptedBase64 = await win.webContents.executeJavaScript(`
              (() => {
                if (typeof window.__extractPageDecryptedBase64 === 'function') {
                  return window.__extractPageDecryptedBase64(${info.pageIndex});
                }
                return null;
              })()
            `);
            if (decryptedBase64 && typeof decryptedBase64 === 'string' && decryptedBase64.length > 100) {
              break;
            }

            const isLoaded = await win.webContents.executeJavaScript(`
              (() => {
                const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                           document.querySelector('[data-page-index="${info.pageIndex}"]');
                if (!el) return false;
                if (el.classList.contains('is-loaded')) return true;
                const img = el.querySelector('img');
                return !!(img && img.classList.contains('is-loaded'));
              })()
            `);
            if (isLoaded) {
              // Settle 80ms for drawImage to finish mapping bytes
              await new Promise((r) => setTimeout(r, 80));
              decryptedBase64 = await win.webContents.executeJavaScript(`
                typeof window.__extractPageDecryptedBase64 === 'function'
                  ? window.__extractPageDecryptedBase64(${info.pageIndex})
                  : null
              `);
              break;
            }
          } catch {
            /* retry polling */
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        // Direct decryption success -> return raw lossless WebP buffer immediately!
        if (decryptedBase64 && typeof decryptedBase64 === 'string' && decryptedBase64.length > 100) {
          const buf = Buffer.from(decryptedBase64, 'base64');
          if (buf.length > 100) {
            log(`[MoeTruyen Capture] Đã giải mã trực tiếp trang ${info.index} (${buf.length} bytes, WebP gốc).`, 'debug');
            return { ok: true, buffer: buf, isDirectDecrypted: true };
          }
        }

        // 3. Fallback: Settle delay to eliminate layout shifts before taking screenshot
        await new Promise((r) => setTimeout(r, 150));

        // 4. Query fresh, pixel-perfect coordinates
        let meta = null;
        try {
          meta = await win.webContents.executeJavaScript(`
            (() => {
              const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                         document.querySelector('[data-page-index="${info.pageIndex}"]');
              if (!el) return null;
              const r = el.getBoundingClientRect();
              const img = el.querySelector('img') || el;
              const dataWidth = parseInt(img.getAttribute('data-imgx-width') || el.getAttribute('data-imgx-width') || '0', 10);
              const dataHeight = parseInt(img.getAttribute('data-imgx-height') || el.getAttribute('data-imgx-height') || '0', 10);
              return {
                x: Math.max(0, Math.round(r.x)),
                y: Math.max(0, Math.round(r.y)),
                pageX: Math.max(0, Math.round(window.scrollX + r.left)),
                pageY: Math.max(0, Math.round(window.scrollY + r.top)),
                width: Math.round(r.width),
                height: Math.round(r.height),
                dataWidth: Number.isFinite(dataWidth) && dataWidth > 0 ? dataWidth : 0,
                dataHeight: Number.isFinite(dataHeight) && dataHeight > 0 ? dataHeight : 0,
              };
            })()
          `);
        } catch (err) {
          log(`[MoeTruyen Capture] Lỗi lấy toạ độ trang ${info.index} (lần ${attempt}): ${err.message}`, 'debug');
        }

        if (!meta || meta.width <= 0 || meta.height <= 0) {
          if (attempt < maxAttempts) {
            log(`[MoeTruyen Capture] Trang ${info.index} chưa lấy được toạ độ, đang thử lại lần ${attempt + 1}/${maxAttempts}...`, 'warn');
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          return { ok: false };
        }

        // 5. If element width or height exceeds current emulated viewport, expand CDP virtual viewport (or window size for fallback)
        const neededW = Math.max(1600, (meta.dataWidth || meta.width || 800) + 200);
        const neededH = Math.max(2500, (meta.dataHeight || meta.height || 1200) + 300);

        if (debuggerAttached && win.webContents?.debugger && typeof win.webContents.debugger.isAttached === 'function' && win.webContents.debugger.isAttached()) {
          if (neededW > currentEmulatedWidth || neededH > currentEmulatedHeight) {
            try {
              currentEmulatedWidth = Math.max(currentEmulatedWidth, neededW);
              currentEmulatedHeight = Math.max(currentEmulatedHeight, neededH);
              await sendCdpWithTimeout(
                win.webContents.debugger,
                'Emulation.setDeviceMetricsOverride',
                {
                  width: currentEmulatedWidth,
                  height: currentEmulatedHeight,
                  deviceScaleFactor: 1,
                  mobile: false,
                },
                3000
              );
              await win.webContents.executeJavaScript(`
                (() => {
                  const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                             document.querySelector('[data-page-index="${info.pageIndex}"]');
                  if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
                })()
              `);
              await new Promise((r) => setTimeout(r, 100));
              const freshRect = await win.webContents.executeJavaScript(`
                (() => {
                  const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                             document.querySelector('[data-page-index="${info.pageIndex}"]');
                  if (!el) return null;
                  const r = el.getBoundingClientRect();
                  return {
                    x: Math.max(0, Math.round(r.x)),
                    y: Math.max(0, Math.round(r.y)),
                    pageX: Math.max(0, Math.round(window.scrollX + r.left)),
                    pageY: Math.max(0, Math.round(window.scrollY + r.top)),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                  };
                })()
              `);
              if (freshRect) {
                meta.x = freshRect.x;
                meta.y = freshRect.y;
                meta.pageX = freshRect.pageX;
                meta.pageY = freshRect.pageY;
                meta.width = freshRect.width;
                meta.height = freshRect.height;
              }
            } catch {
              /* ignore resize error */
            }
          }
        } else if (typeof win.getContentSize === 'function' && typeof win.setContentSize === 'function') {
          try {
            const currentSize = win.getContentSize();
            const currentW = Array.isArray(currentSize) && currentSize[0] > 0 ? currentSize[0] : 1400;
            const currentH = Array.isArray(currentSize) && currentSize[1] > 0 ? currentSize[1] : 1800;
            if (neededW > currentW || neededH > currentH) {
              const neededFallbackW = Math.max(currentW, neededW);
              const neededFallbackH = Math.max(currentH, neededH);
              win.setContentSize(neededFallbackW, neededFallbackH);
              await win.webContents.executeJavaScript(`
                (() => {
                  const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                             document.querySelector('[data-page-index="${info.pageIndex}"]');
                  if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
                })()
              `);
              await new Promise((r) => setTimeout(r, 100));
              const freshRect = await win.webContents.executeJavaScript(`
                (() => {
                  const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                             document.querySelector('[data-page-index="${info.pageIndex}"]');
                  if (!el) return null;
                  const r = el.getBoundingClientRect();
                  return {
                    x: Math.max(0, Math.round(r.x)),
                    y: Math.max(0, Math.round(r.y)),
                    pageX: Math.max(0, Math.round(window.scrollX + r.left)),
                    pageY: Math.max(0, Math.round(window.scrollY + r.top)),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                  };
                })()
              `);
              if (freshRect) {
                meta.x = freshRect.x;
                meta.y = freshRect.y;
                meta.pageX = freshRect.pageX;
                meta.pageY = freshRect.pageY;
                meta.width = freshRect.width;
                meta.height = freshRect.height;
              }
            }
          } catch {
            /* ignore resize error */
          }
        }

        // 6. Primary capture: Chrome DevTools Protocol with in-viewport capture
        let imageBuffer = null;
        if (debuggerAttached && win.webContents?.debugger && typeof win.webContents.debugger.isAttached === 'function' && win.webContents.debugger.isAttached()) {
          try {
            const scale = meta.dataWidth > 0 && meta.width > 0 ? meta.dataWidth / meta.width : 1;
            const cdpResult = await sendCdpWithTimeout(
              win.webContents.debugger,
              'Page.captureScreenshot',
              {
                format: 'jpeg',
                quality: 92,
                clip: {
                  x: meta.pageX,
                  y: meta.pageY,
                  width: meta.width,
                  height: meta.height,
                  scale,
                },
                captureBeyondViewport: true,
              },
              8000
            );
            if (cdpResult && cdpResult.data) {
              imageBuffer = Buffer.from(cdpResult.data, 'base64');
            }
          } catch (cdpErr) {
            log(`[MoeTruyen Capture] Lỗi CDP capture trang ${info.index} (lần ${attempt}): ${cdpErr.message}, chuyển sang capturePage fallback.`, 'debug');
          }
        }

        // 7. Fallback capture: Chromium capturePage
        if (!imageBuffer || !imageBuffer.length) {
          try {
            if (typeof win.setContentSize === 'function') {
              const neededW = Math.max(1600, meta.width + 100);
              const neededH = Math.max(1800, meta.height + 100);
              try {
                win.setContentSize(neededW, neededH);
              } catch {
                /* ignore */
              }
            }

            const fallbackRect = await win.webContents.executeJavaScript(`
              (() => {
                const el = document.querySelector('.page-protected-shell[data-page-index="${info.pageIndex}"]') ||
                           document.querySelector('[data-page-index="${info.pageIndex}"]');
                if (!el) return null;
                el.scrollIntoView({ behavior: 'instant', block: 'start' });
                const r = el.getBoundingClientRect();
                return {
                  x: Math.max(0, Math.round(r.x)),
                  y: Math.max(0, Math.round(r.y)),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                };
              })()
            `);

            const captureRect = fallbackRect || {
              x: meta.x,
              y: meta.y,
              width: meta.width,
              height: meta.height,
            };

            const image = await win.webContents.capturePage(captureRect);
            if (image && !image.isEmpty()) {
              imageBuffer = typeof image.toJPEG === 'function' ? image.toJPEG(92) : image.toPNG();
            }
          } catch (err) {
            log(`[MoeTruyen Capture] Lỗi capturePage fallback trang ${info.index} (lần ${attempt}): ${err.message}`, 'debug');
          }
        }

        if (imageBuffer && imageBuffer.length > 0) {
          return { ok: true, buffer: imageBuffer };
        }

        if (attempt < maxAttempts) {
          log(`[MoeTruyen Capture] Trang ${info.index} chụp chưa thành công, đang thử lại lần ${attempt + 1}/${maxAttempts}...`, 'warn');
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      return { ok: false };
    };

    /**
     * Helper to write the downloaded page to disk with automatic WebP/JPEG format detection,
     * cleaning up any stale alternate-extension files from previous buggy runs.
     */
    const saveDownloadedPage = (info, captureRes) => {
      const isWebp =
        captureRes.isDirectDecrypted ||
        (captureRes.buffer.length >= 12 &&
          captureRes.buffer.slice(0, 4).toString() === 'RIFF' &&
          captureRes.buffer.slice(8, 12).toString() === 'WEBP');

      const actualExt = isWebp ? 'webp' : 'jpg';
      const finalFileName = formatChapterPageFileName(chapterTitle, info.index, actualExt, chapterFolderFormat);
      const finalFilePath = path.join(chapterDir, finalFileName);

      fs.writeFileSync(finalFilePath, captureRes.buffer);

      // Clean up stale file with opposite extension if present (e.g. previous buggy .jpg)
      const altExt = isWebp ? 'jpg' : 'webp';
      const altFileName = formatChapterPageFileName(chapterTitle, info.index, altExt, chapterFolderFormat);
      const altFilePath = path.join(chapterDir, altFileName);
      if (altFilePath !== finalFilePath && fs.existsSync(altFilePath)) {
        try {
          fs.unlinkSync(altFilePath);
        } catch {
          /* ignore */
        }
      }

      db.markPageCompleted(dbChapterTitle, info.index, captureRes.buffer.length);
      successCount++;
      report({
        current: successCount,
        total: totalPages,
        percent: Math.round((successCount / totalPages) * 100),
      });
      if (typeof onPageDownloaded === 'function') {
        onPageDownloaded(finalFileName, info.index, totalPages);
      }
    };

    // Capture each page in sequence
    for (const info of pageInfos) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        log('[MoeTruyen Capture] Quá trình tải bị huỷ bởi người dùng.', 'info');
        return { ok: false, aborted: true, successCount, totalPages };
      }

      // Check if already downloaded on disk with valid content (.webp or .jpg)
      try {
        const webpName = formatChapterPageFileName(chapterTitle, info.index, 'webp', chapterFolderFormat);
        const webpPath = path.join(chapterDir, webpName);
        const jpgName = formatChapterPageFileName(chapterTitle, info.index, 'jpg', chapterFolderFormat);
        const jpgPath = path.join(chapterDir, jpgName);

        const existingPath = fs.existsSync(webpPath) ? webpPath : (fs.existsSync(jpgPath) ? jpgPath : null);
        if (existingPath) {
          const stat = fs.statSync(existingPath);
          if (stat.size > 1024) {
            db.markPageCompleted(dbChapterTitle, info.index, stat.size);
            successCount++;
            report({
              current: successCount,
              total: totalPages,
              percent: Math.round((successCount / totalPages) * 100),
            });
            if (typeof onPageDownloaded === 'function') {
              onPageDownloaded(path.basename(existingPath), info.index, totalPages);
            }
            continue;
          }
        }
      } catch {
        /* continue to capture */
      }

      log(`[MoeTruyen Capture] Đang giải mã & nạp trang ${info.index}/${totalPages}...`, 'info');

      const captureRes = await captureSinglePage(info, 3);
      if (captureRes.aborted) {
        log('[MoeTruyen Capture] Quá trình tải bị huỷ bởi người dùng.', 'info');
        return { ok: false, aborted: true, successCount, totalPages };
      }

      if (captureRes.ok && captureRes.buffer) {
        try {
          saveDownloadedPage(info, captureRes);
        } catch (err) {
          log(`[MoeTruyen Capture] Lỗi ghi file trang ${info.index}: ${err.message}`, 'error');
          failedPageIndices.push(info.index);
          db.markPageFailed(dbChapterTitle, info.index);
        }
      } else {
        failedPageIndices.push(info.index);
        db.markPageFailed(dbChapterTitle, info.index);
      }
    }

    // Post-loop retry pass: if any pages failed in the first pass, run a dedicated retry pass
    if (failedPageIndices.length > 0 && successCount < totalPages) {
      if (typeof shouldAbort === 'function' && shouldAbort()) {
        return { ok: false, aborted: true, successCount, totalPages };
      }

      const retryList = failedPageIndices.slice();
      failedPageIndices.length = 0;
      log(`[MoeTruyen Capture] Phát hiện ${retryList.length} trang chưa hoàn tất sau lượt 1. Tiến hành quét vét thử lại...`, 'warn');

      for (const failedIdx of retryList) {
        if (typeof shouldAbort === 'function' && shouldAbort()) {
          return { ok: false, aborted: true, successCount, totalPages };
        }

        const info = pageInfos.find((p) => p.index === failedIdx);
        if (!info) {
          failedPageIndices.push(failedIdx);
          continue;
        }

        log(`[MoeTruyen Capture] [Quét vét] Đang thử lại trang ${info.index}/${totalPages}...`, 'info');
        const retryRes = await captureSinglePage(info, 2);
        if (retryRes.aborted) {
          return { ok: false, aborted: true, successCount, totalPages };
        }

        if (retryRes.ok && retryRes.buffer) {
          try {
            saveDownloadedPage(info, retryRes);
          } catch (err) {
            log(`[MoeTruyen Capture] Lỗi ghi file trang ${info.index} ở lượt quét vét: ${err.message}`, 'error');
            failedPageIndices.push(info.index);
            db.markPageFailed(dbChapterTitle, info.index);
          }
        } else {
          failedPageIndices.push(info.index);
          db.markPageFailed(dbChapterTitle, info.index);
        }
      }
    }

    const allOk = successCount === totalPages;
    if (allOk) {
      db.markChapterCompleted(dbChapterTitle);
    } else {
      db.markChapterIncomplete(dbChapterTitle);
    }

    return {
      ok: allOk,
      successCount,
      totalPages,
      ...(failedPageIndices.length > 0 ? { failedPageIndices } : {}),
      ...(allOk ? {} : { error: `Tải thiếu ${totalPages - successCount}/${totalPages} trang.` }),
    };
  } catch (err) {
    const msg = String(err?.message || err);
    log(`[MoeTruyen Capture] Lỗi ngoại lệ trong quá trình chụp trang: ${msg}`, 'error');
    return { ok: false, error: msg };
  } finally {
    if (win && win.webContents && win.webContents.debugger && typeof win.webContents.debugger.isAttached === 'function') {
      try {
        if (win.webContents.debugger.isAttached()) {
          try {
            await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
          } catch {
            /* ignore */
          }
          win.webContents.debugger.detach();
        }
      } catch {
        /* ignore */
      }
    }
    if (win && typeof win.destroy === 'function' && !win.isDestroyed()) {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = {
  downloadChapterWithBrowserCapture,
  DEFAULT_USER_AGENT,
};
