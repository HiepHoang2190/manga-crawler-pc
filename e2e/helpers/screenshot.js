// e2e/helpers/screenshot.js
const fs = require('fs');
const path = require('path');

const HELP_DIR = path.join(__dirname, '../../public/help');

/**
 * Capture a full-page screenshot and save to public/help/.
 * Only saves when SCREENSHOTS env var is set.
 * @param {import('@playwright/test').Page} window
 * @param {string} name — filename without extension (e.g. 'home-overview')
 */
async function captureHelp(window, name) {
  if (!process.env.SCREENSHOTS) return;

  // Ensure directory exists
  if (!fs.existsSync(HELP_DIR)) {
    fs.mkdirSync(HELP_DIR, { recursive: true });
  }

  // Move mouse away to neutral corner to avoid triggering hover tooltips
  await window.mouse.move(0, 0);

  // Force hide any active tooltips before capturing screenshot
  await window.evaluate(() => {
    const tooltips = document.querySelectorAll('[role="tooltip"]');
    tooltips.forEach((el) => {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
    });
  }).catch(() => {});

  await window.waitForTimeout(300);

  const filePath = path.join(HELP_DIR, `${name}.png`);
  await window.screenshot({ path: filePath, fullPage: false });
  console.log(`📸 Screenshot saved: ${filePath}`);
}

/**
 * Capture a specific element's screenshot with optional padding.
 * @param {import('@playwright/test').Page} window
 * @param {string} selector — CSS selector
 * @param {string} name — filename without extension
 * @param {number} [padding=12] — extra padding (px) around the element bounding box
 */
async function captureElement(window, selector, name, padding = 12) {
  if (!process.env.SCREENSHOTS) return;

  if (!fs.existsSync(HELP_DIR)) {
    fs.mkdirSync(HELP_DIR, { recursive: true });
  }

  const locator = window.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: 15_000 });

  const filePath = path.join(HELP_DIR, `${name}.png`);

  if (padding > 0) {
    const box = await locator.boundingBox();
    if (box) {
      const viewport = window.viewportSize() || { width: 1280, height: 800 };
      const x = Math.max(0, Math.floor(box.x - padding));
      const y = Math.max(0, Math.floor(box.y - padding));
      const width = Math.min(viewport.width - x, Math.ceil(box.width + padding * 2));
      const height = Math.min(viewport.height - y, Math.ceil(box.height + padding * 2));
      await window.screenshot({
        path: filePath,
        clip: { x, y, width, height },
      });
      console.log(`📸 Element screenshot saved with padding ${padding}px: ${filePath}`);
      return;
    }
  }

  await locator.screenshot({ path: filePath });
  console.log(`📸 Element screenshot saved: ${filePath}`);
}

module.exports = { captureHelp, captureElement };
