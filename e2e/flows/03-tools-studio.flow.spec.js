// e2e/flows/03-tools-studio.flow.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, waitForAppReady } = require('../helpers/navigation');
const { ensureSampleManga, cleanTempOutput } = require('../helpers/fixtures');
const { mockSelectDirectory } = require('../helpers/dialogMock');
const { captureHelp } = require('../helpers/screenshot');

let electronApp, window, fixtures;

test.beforeAll(async () => {
  cleanTempOutput();
  fixtures = await ensureSampleManga();
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
  cleanTempOutput();
});

test.describe('Flow 3: Tools Studio Image Pipeline', () => {
  test('should import sample images into the image pipeline and verify controls', async () => {
    // 1. Navigate to Tools Studio
    await navigateToTab(window, 'toolsStudio');
    await expect(window.locator('[data-testid="tab-content-toolsStudio"]').first()).toBeVisible();

    // 2. Select image pipeline subtab
    const cropTab = window.locator('[data-testid="subtab-imagePipeline"]');
    await expect(cropTab).toBeVisible();
    await cropTab.click();
    await window.waitForTimeout(300);

    // 3. Mock directory selection to Chapter 01
    await mockSelectDirectory(electronApp, fixtures.chapterDir);

    // 4. Click Choose Folder in SourcePicker
    const selectFolderBtn = window.locator(
      '[data-testid="tab-content-toolsStudio"] [data-testid="source-select-folder"]:visible'
    );
    if (await selectFolderBtn.isVisible().catch(() => false)) {
      await selectFolderBtn.click();
      await window.waitForTimeout(1500);
    }

    // 5. Verify image pipeline start button is present
    const cropStartBtn = window.locator('[data-testid="image-pipeline-start-btn"]');
    await expect(cropStartBtn).toBeVisible();

    // 6. Capture image pipeline tab with loaded images
    await captureHelp(window, 'tools-image-pipeline');

    // 7. Open interactive preview modal and capture
    const previewEyeBtn = window.locator(
      '[data-testid="tab-content-toolsStudio"] button:has(span.material-symbols-outlined:text("visibility"))'
    ).first();
    if (await previewEyeBtn.isVisible().catch(() => false)) {
      await previewEyeBtn.click();
      await window.waitForTimeout(1200);
      await captureHelp(window, 'tools-image-pipeline-preview');
      await window.keyboard.press('Escape');
      await window.waitForTimeout(300);
    }
  });

  test('should switch to Upscale subtab, import sample images and verify controls', async () => {
    await navigateToTab(window, 'toolsStudio');

    // 1. Switch to upscale subtab
    const upscaleTab = window.locator('[data-testid="subtab-upscale"]');
    await expect(upscaleTab).toBeVisible();
    await upscaleTab.click();
    await window.waitForTimeout(400);

    // 2. Mock directory selection to Chapter 01 (real sample manga)
    await mockSelectDirectory(electronApp, fixtures.chapterDir);

    // 3. Click Choose Folder in SourcePicker
    const selectFolderBtn = window.locator(
      '[data-testid="tab-content-toolsStudio"] [data-testid="source-select-folder"]:visible'
    );
    if (await selectFolderBtn.isVisible().catch(() => false)) {
      await selectFolderBtn.click();
      await window.waitForTimeout(1500);
    }

    // 4. Verify upscale start button is present
    const upscaleStartBtn = window.locator('[data-testid="upscale-start-btn"]');
    await expect(upscaleStartBtn).toBeVisible();

    // 5. Verify sample images are loaded and listed in the table
    const upscaleImageItem = window.locator('[data-testid="tab-content-upscale"]').locator('text=01.jpg').first();
    await expect(upscaleImageItem).toBeVisible({ timeout: 5_000 });

    // 6. Capture full tab screenshot with real images for Help documentation
    await captureHelp(window, 'tools-upscale');
  });
});
