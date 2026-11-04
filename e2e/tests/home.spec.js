// e2e/tests/home.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, waitForAppReady } = require('../helpers/navigation');
const { captureHelp, captureElement } = require('../helpers/screenshot');

let electronApp, window;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
});

test.describe('Home Tab', () => {
  test('should display home tab with URL input', async () => {
    await navigateToTab(window, 'home');

    // Verify the main menu is visible
    await expect(window.locator('nav[aria-label="Main menu"]')).toBeVisible();

    // Verify URL input exists and is interactable
    const urlInput = window.locator('[data-testid="url-input"]');
    await expect(urlInput).toBeVisible({ timeout: 5_000 });

    // Verify fetch button exists
    const fetchBtn = window.locator('[data-testid="fetch-button"]');
    await expect(fetchBtn).toBeVisible();

    // Capture overview screenshot (full window)
    await captureHelp(window, 'home-overview');
  });

  test('should enter URL and trigger fetch', async () => {
    await navigateToTab(window, 'home');

    const urlInput = window.locator('[data-testid="url-input"]');
    await expect(urlInput).toBeVisible({ timeout: 5_000 });

    // Clear any existing URL and type a test URL
    await urlInput.fill('');
    await urlInput.fill('https://mangadex.org/title/a1c7c817-4e59-43b7-9365-09675a149a6f/one-piece');
    await window.waitForTimeout(500);

    // Verify the URL was typed
    await expect(urlInput).toHaveValue(/mangadex\.org/);

    // Capture sidebar controls screenshot with URL, site, cookie, save path filled with generous padding
    await captureElement(window, '[data-testid="sidebar-controls"]', 'home-sidebar', 16);

    // Click fetch button
    const fetchBtn = window.locator('[data-testid="fetch-button"]');
    await expect(fetchBtn).toBeEnabled();
    await fetchBtn.click();
  });

  test('should display manga info after fetch', async () => {
    // Wait for manga info to load (open-drawer-btn becomes visible when manga chapters are loaded)
    const openDrawerBtn = window.locator('[data-testid="open-drawer-btn"]');
    await openDrawerBtn.waitFor({ state: 'visible', timeout: 30_000 });

    // Wait for cover image to load completely
    await window.waitForFunction(() => {
      const card = document.querySelector('[data-testid="manga-info-card"]');
      if (!card) return false;
      const img = card.querySelector('img');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 20_000 }).catch(() => {});

    await window.waitForTimeout(1000);

    // Capture manga info area (isolated card)
    await captureElement(window, '[data-testid="manga-info-card"]', 'home-manga-info');
  });

  test('should open chapter list drawer and capture chapter list and cover art', async () => {
    const openDrawerBtn = window.locator('[data-testid="open-drawer-btn"]');
    await expect(openDrawerBtn).toBeVisible({ timeout: 15_000 });
    await expect(openDrawerBtn).toBeEnabled();

    // Click to open chapter drawer
    await openDrawerBtn.click();

    // Wait for drawer dialog to appear
    const dialog = window.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Wait for chapters to render
    await window.waitForTimeout(1500);

    // Capture chapter list screenshot
    await captureHelp(window, 'home-chapters');

    // Switch to covers tab if available (MangaDex manga)
    const coversTab = window.locator('[data-testid="drawer-covers-tab"]');
    if (await coversTab.isVisible().catch(() => false)) {
      await coversTab.click();

      // Wait for loading spinner to disappear and covers container to appear
      const coversContainer = window.locator('[data-testid="covers-container"]');
      await coversContainer.waitFor({ state: 'visible', timeout: 25_000 });
      await expect(window.locator('[data-testid="covers-loading"]')).toBeHidden({ timeout: 25_000 });

      // Wait for cover images to be present in DOM
      const firstCover = window.locator('[data-testid="cover-img"]').first();
      await expect(firstCover).toBeVisible({ timeout: 15_000 });

      // Wait until the visible cover images in the viewport have actually finished loading over the network
      await window.waitForFunction(() => {
        const imgs = Array.from(document.querySelectorAll('[data-testid="cover-img"]'));
        if (imgs.length === 0) return false;
        // Check first 4 covers (visible in grid view)
        const visibleImgs = imgs.slice(0, 4);
        return visibleImgs.every((img) => img.complete && img.naturalWidth > 0);
      }, { timeout: 25_000 }).catch(() => {});

      // Settle time for rendering
      await window.waitForTimeout(1200);

      await captureHelp(window, 'home-chapters-cover');
    }

    // Close drawer via Escape key
    await window.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('should enqueue chapters and capture download queue screenshot with data', async () => {
    // Click enqueue all button to populate the queue
    const enqueueBtn = window.locator('[data-testid="enqueue-all-btn"]');
    if (await enqueueBtn.isVisible().catch(() => false)) {
      await enqueueBtn.click();
      await window.waitForTimeout(1000);
    }

    // Switch to queue tab
    const queueTab = window.locator('[data-testid="queue-tab-queue"]');
    if (await queueTab.isVisible().catch(() => false)) {
      await queueTab.click();
      await window.waitForTimeout(1000);
    }

    // Verify Start queue button is visible
    const startBtn = window.locator('[data-testid="start-queue-btn"]');
    await expect(startBtn).toBeVisible({ timeout: 5_000 });

    // Capture vibrant download-queue screenshot with actual queued manga
    await captureHelp(window, 'download-queue');
  });
});
