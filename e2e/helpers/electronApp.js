// e2e/helpers/electronApp.js
const { _electron: electron } = require('@playwright/test');
const path = require('path');

/**
 * Launch the Electron app and return the first window.
 * 
 * IMPORTANT: Vite dev server must be running on http://localhost:5173 first!
 * Start it with `npm run dev` in a separate terminal, or use:
 *   npm run test:e2e  (which starts vite automatically via concurrently)
 * 
 * @returns {Promise<{ electronApp: import('@playwright/test').ElectronApplication, window: import('@playwright/test').Page }>}
 */
async function launchApp() {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../../electron/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Wait for first BrowserWindow
  const window = await electronApp.firstWindow();

  // Set consistent viewport for screenshots (1280×800 macOS standard)
  await window.setViewportSize({ width: 1280, height: 800 });

  // Ensure Vietnamese locale is persisted in localStorage on every page load
  await window.addInitScript(() => {
    try {
      localStorage.setItem('manga-crawler-locale', 'vi');
    } catch (_) {}
  });

  // Wait for the app to load — Electron loads from Vite dev server at localhost:5173
  // Wait for React to mount — the main menu nav is the first reliable indicator
  await window.waitForSelector('nav[aria-label="Main menu"]', { timeout: 45_000 });

  // If locale in storage was not 'vi', reload once to apply Vietnamese dictionary
  const needReload = await window.evaluate(() => {
    if (localStorage.getItem('manga-crawler-locale') !== 'vi') {
      localStorage.setItem('manga-crawler-locale', 'vi');
      return true;
    }
    return false;
  });
  if (needReload) {
    await window.reload();
    await window.waitForSelector('nav[aria-label="Main menu"]', { timeout: 45_000 });
  }

  return { electronApp, window };
}

/**
 * Close the Electron app gracefully.
 */
async function closeApp(electronApp) {
  await electronApp.close();
}

module.exports = { launchApp, closeApp };
