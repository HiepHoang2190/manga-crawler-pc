// e2e/flows/01-download-pipeline.flow.spec.js
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

test.describe('Flow 1: Download Pipeline, Queue & In-App Reader', () => {
  test('should fetch manga, add to queue, inspect queue controls and library', async () => {
    // 1. Navigate to Home
    await navigateToTab(window, 'home');
    const urlInput = window.locator('[data-testid="url-input"]');
    await expect(urlInput).toBeVisible({ timeout: 5_000 });

    // Set save folder path so download queue can run
    const savePathInput = window.locator('[data-testid="save-path-input"]');
    if (await savePathInput.isVisible().catch(() => false)) {
      await savePathInput.fill('/tmp/crawler-pipeline-test');
      await window.waitForTimeout(300);
    }

    // 2. Type URL
    const testUrl = 'https://mangadex.org/title/a1c7c817-4e59-43b7-9365-09675a149a6f/one-piece';
    await urlInput.fill(testUrl);
    await expect(urlInput).toHaveValue(testUrl);

    // 3. Trigger Fetch
    const fetchBtn = window.locator('[data-testid="fetch-button"]');
    await expect(fetchBtn).toBeEnabled();
    await fetchBtn.click();

    // 4. Wait for MangaInfo or open drawer button to appear
    const openDrawerBtn = window.locator('[data-testid="open-drawer-btn"]');
    const fetched = await openDrawerBtn
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (fetched) {
      // 5. Open chapter list drawer and test chapter selection
      await openDrawerBtn.click();
      const dialog = window.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await window.waitForTimeout(1000);

      // Select all chapters using the table header checkbox
      const selectAll = dialog.locator('[data-testid="select-all-chapters-chk"]');
      if (await selectAll.isVisible().catch(() => false)) {
        await selectAll.click();
        await window.waitForTimeout(500);
      }

      // Capture Step 1: Choosing chapter and adding to queue
      await captureHelp(window, 'download-queue-add');

      // Add selected to queue from drawer if button is ready
      const addQueueBtn = dialog.locator('[data-testid="add-selected-to-queue-btn"]');
      if (await addQueueBtn.isEnabled().catch(() => false)) {
        await addQueueBtn.click();
        await window.waitForTimeout(500);
      }

      // Close drawer
      await window.keyboard.press('Escape');
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    }

    // 6. Navigate to Queue tab
    const queueTab = window.locator('[data-testid="queue-tab-queue"]');
    if (await queueTab.isVisible().catch(() => false)) {
      await queueTab.click();
      await window.waitForTimeout(1000);

      // Verify Start queue button is present
      const startBtn = window.locator('[data-testid="start-queue-btn"]');
      await expect(startBtn).toBeVisible();

      // Capture Step 2: Queue ready to start with chapter queued
      await captureHelp(window, 'download-queue');

      // Click Start queue to initiate real download progress
      if (await startBtn.isEnabled().catch(() => false)) {
        await startBtn.click();
        // Wait for download to start and display active progress
        await window.waitForTimeout(2500);

        // Capture Step 3: Downloading in progress
        await captureHelp(window, 'download-queue-progress');

        // Let it run a bit
        await window.waitForTimeout(3000);
      }
    }

    // 7. Check Library / History tab
    const historyTab = window.locator('[data-testid="queue-tab-history"]');
    if (await historyTab.isVisible().catch(() => false)) {
      await historyTab.click();
      await window.waitForTimeout(800);
      await expect(window.locator('[data-testid="tab-content-home"]')).toBeVisible();

      // Capture populated Library / History record
      await captureHelp(window, 'library-history');
    }

    // 8. Check Offline Library tab with downloaded series
    const offlineReadTab = window.locator('[data-testid="queue-tab-offlineRead"]');
    if (await offlineReadTab.isVisible().catch(() => false)) {
      await offlineReadTab.click();
      await window.waitForTimeout(1500);
      await captureHelp(window, 'library-offline-read');
    }
  });
});
