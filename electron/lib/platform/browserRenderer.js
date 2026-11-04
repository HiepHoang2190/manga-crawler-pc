/**
 * Browser renderer using Electron's BrowserWindow
 * Dùng để render JavaScript-heavy pages
 */
const { BrowserWindow } = require('electron');

/**
 * Render a page and extract data using JavaScript
 * @param {string} url - URL to render
 * @param {function} extractFn - Function to run in page context, returns data
 * @param {object} options - Options { timeout }
 * @returns {Promise<any>} Extracted data
 */
async function renderAndExtract(url, extractFn, options = {}) {
  const { timeout = 45000 } = options;

  let win = null;
  let timeoutId = null;

  try {
    // Create hidden browser window
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
      },
    });

    // Set user agent
    win.webContents.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout after ${timeout}ms`));
      }, timeout);
    });

    // Load page and wait for it to finish
    const loadPromise = new Promise((resolve, reject) => {
      // Handle load success
      win.webContents.on('did-finish-load', () => {
        // Wait a bit for dynamic content
        setTimeout(async () => {
          try {
            // Execute extraction function in page context
            const result = await win.webContents.executeJavaScript(`(${extractFn.toString()})()`);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, 3000); // Wait 3s for dynamic content
      });

      // Handle load failure
      win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        reject(new Error(`Failed to load: ${errorDescription}`));
      });

      // Start loading
      win.loadURL(url).catch(reject);
    });

    // Race between load and timeout
    const data = await Promise.race([loadPromise, timeoutPromise]);

    if (timeoutId) clearTimeout(timeoutId);

    return { ok: true, data };
  } catch (error) {
    console.error('[BrowserRenderer] Error rendering page:', error);
    return { ok: false, error: error.message };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
}

module.exports = {
  renderAndExtract,
};
