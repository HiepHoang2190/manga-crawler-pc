/**
 * MoeTruyen IMGX v4 Decryption Interceptor Preload Script.
 *
 * Runs before any web page scripts in the renderer's main JS context (contextIsolation: false).
 * Intercepts __IMGX_RUNTIME__ to capture the raw, lossless decrypted WebP bytes as soon as
 * decodeImgxV4 decodes them, associating each page canvas with its original image bytes.
 * This completely bypasses compositor screenshotting, eliminating black boxes, narrow strips,
 * layout shifts, and display scaling issues.
 */

(function () {
  const bitmapToBytes = new WeakMap();
  const canvasToBytes = new WeakMap();
  const layerToShadowRoot = new WeakMap();
  const pageBytesMap = new Map();

  const origDefineProperty = Object.defineProperty;
  Object.defineProperty = function (target, prop, descriptor) {
    if (
      prop === '__IMGX_RUNTIME__' &&
      descriptor &&
      descriptor.value &&
      typeof descriptor.value.take === 'function'
    ) {
      const origTake = descriptor.value.take;

      descriptor.value = {
        take: function () {
          const runtime = origTake.apply(this, arguments);
          if (!runtime) return null;

          const wrapped = Object.assign({}, runtime);

          wrapped.attachShadow = function (element) {
            const shadowRoot = runtime.attachShadow(element);
            if (element && shadowRoot) {
              layerToShadowRoot.set(element, shadowRoot);
            }
            return shadowRoot;
          };

          wrapped.bitmapFromWebp = function (bytes) {
            // CRITICAL: Clone bytes SYNCHRONOUSLY before reader.js can wipe it with bytes.fill(0) in its finally block!
            const bytesClone = bytes && bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
            const promise = runtime.bitmapFromWebp(bytes);
            if (promise && typeof promise.then === 'function') {
              promise.then((bitmap) => {
                if (bitmap && bytesClone) {
                  bitmapToBytes.set(bitmap, bytesClone);
                }
              });
            }
            return promise;
          };

          wrapped.drawImage = function (context, ...args) {
            const bitmap = args[0];
            const canvas = context?.canvas;
            if (canvas && bitmap) {
              const bytes = bitmapToBytes.get(bitmap);
              if (bytes) {
                canvasToBytes.set(canvas, bytes);
                try {
                  const root = canvas.getRootNode && canvas.getRootNode();
                  const host = root?.host;
                  const shell = host?.closest?.('[data-page-index]');
                  if (shell) {
                    const idxStr = shell.getAttribute('data-page-index');
                    if (idxStr !== null && idxStr !== '') {
                      const num = parseInt(idxStr, 10);
                      if (Number.isFinite(num)) {
                        pageBytesMap.set(num, bytes);
                      }
                    }
                  }
                } catch {
                  /* ignore DOM tree lookup errors */
                }
              }
            }
            return runtime.drawImage(context, ...args);
          };

          return wrapped;
        },
      };
    }
    return origDefineProperty.apply(this, arguments);
  };

  /**
   * Safe Uint8Array to base64 converter preventing call stack overflow.
   */
  function uint8ToBase64(u8) {
    let binary = '';
    const len = u8.byteLength;
    const CHUNK_SIZE = 32768;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK_SIZE, len)));
    }
    return btoa(binary);
  }

  /**
   * Validates if a Uint8Array has a genuine WebP header (RIFF....WEBP).
   */
  function isValidWebp(u8) {
    if (!u8 || u8.byteLength < 12) return false;
    return (
      u8[0] === 0x52 &&
      u8[1] === 0x49 &&
      u8[2] === 0x46 &&
      u8[3] === 0x46 &&
      u8[8] === 0x57 &&
      u8[9] === 0x45 &&
      u8[10] === 0x42 &&
      u8[11] === 0x50
    );
  }

  /**
   * Helper exposed on window to extract the decrypted WebP image as base64 string.
   *
   * @param {number|string} pageIndex
   * @returns {string|null} Base64 encoded WebP data or null if not yet decrypted
   */
  window.__extractPageDecryptedBase64 = function (pageIndex) {
    const numIdx = parseInt(pageIndex, 10);

    // 1. Check quick index cache
    if (Number.isFinite(numIdx) && pageBytesMap.has(numIdx)) {
      const cached = pageBytesMap.get(numIdx);
      if (isValidWebp(cached)) {
        return uint8ToBase64(cached);
      }
    }

    // 2. Lookup via DOM hierarchy: shell -> layer -> shadowRoot -> canvas -> canvasToBytes
    const shell =
      document.querySelector(`.page-protected-shell[data-page-index="${pageIndex}"]`) ||
      document.querySelector(`[data-page-index="${pageIndex}"]`);
    if (!shell) return null;

    const layer =
      shell.querySelector('.page-protected-canvas-layer') ||
      shell.querySelector('[data-imgx-canvas-layer]');
    if (!layer) return null;

    const shadowRoot = layerToShadowRoot.get(layer);
    if (!shadowRoot) return null;

    const canvas = shadowRoot.querySelector('canvas');
    if (!canvas) return null;

    const bytes = canvasToBytes.get(canvas);
    if (!isValidWebp(bytes)) return null;

    if (Number.isFinite(numIdx)) {
      pageBytesMap.set(numIdx, bytes);
    }
    return uint8ToBase64(bytes);
  };

  /**
   * Helper returning list of all page indices currently decrypted in memory.
   */
  window.__getDecryptedPageIndices = function () {
    return Array.from(pageBytesMap.keys()).sort((a, b) => a - b);
  };
})();
