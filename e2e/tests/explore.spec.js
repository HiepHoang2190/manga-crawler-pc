// e2e/tests/explore.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, waitForAppReady } = require('../helpers/navigation');
const { captureHelp } = require('../helpers/screenshot');

let electronApp, window;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
});

test.describe('Explore Tab', () => {
  test('should display explore tab with latest updates sub-tab', async () => {
    await navigateToTab(window, 'explore');
    await expect(window.locator('[data-testid="tab-content-explore"]').first()).toBeVisible();

    // Click the "latest" sub-tab explicitly
    const latestTab = window.locator('[data-testid="subtab-latest"]').first();
    await expect(latestTab).toBeVisible({ timeout: 5_000 });
    await latestTab.click();
    await window.waitForTimeout(500);

    // Wait for latest updates manga cards to load into the grid
    const mangaCards = window.locator('[data-testid="tab-content-explore"] ul.grid li');
    await expect(mangaCards.first()).toBeVisible({ timeout: 30_000 });

    // Wait until cover images have finished loading (naturalWidth > 0)
    await window.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('[data-testid="tab-content-explore"] ul.grid li img'));
      if (imgs.length < 3) return false;
      const loaded = imgs.slice(0, 10).filter(img => img.complete && img.naturalWidth > 0);
      return loaded.length >= Math.min(imgs.length, 6);
    }, { timeout: 25_000 }).catch(() => {});

    // Allow images and transitions to render completely
    await window.waitForTimeout(4000);

    await captureHelp(window, 'explore-latest-updates');
  });

  test('should switch to bulk scan sub-tab and load catalog', async () => {
    await navigateToTab(window, 'explore');
    // Real sub-tab ID is "bulk" (not "bulkScan")
    const bulkScanTab = window.locator('[data-testid="subtab-bulk"]').first();
    await expect(bulkScanTab).toBeVisible({ timeout: 5_000 });
    await bulkScanTab.click();
    await window.waitForTimeout(500);

    // Click load button to fetch catalog
    const loadBtn = window.locator('[data-testid="bulk-load-btn"]');
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();

    // Wait for items to be loaded into grid
    const itemCards = window.locator('[data-testid="bulk-scan-card"]');
    await expect(itemCards.first()).toBeVisible({ timeout: 25_000 });

    // Wait for full catalog fetching to finish (button re-enabled and not busy)
    await expect(loadBtn).toBeEnabled({ timeout: 45_000 });

    // Tick first two manga to show active selection and active enqueue button
    const checkboxes = window.locator('[data-testid="bulk-scan-checkbox"]');
    await checkboxes.nth(0).click({ force: true }).catch(() => {});
    await checkboxes.nth(1).click({ force: true }).catch(() => {});

    // Wait until cover images in the cards finish loading (naturalWidth > 0)
    await window.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('[data-testid="bulk-scan-card"] img'));
      if (imgs.length < 4) return false;
      const loaded = imgs.slice(0, 10).filter(img => img.complete && img.naturalWidth > 0);
      return loaded.length >= Math.min(imgs.length, 8);
    }, { timeout: 30_000 }).catch(() => {});

    // Allow covers to load/render completely as requested by user
    await window.waitForTimeout(5000);

    await captureHelp(window, 'explore-bulk-scan');
  });
});
