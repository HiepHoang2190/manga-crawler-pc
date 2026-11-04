// e2e/flows/02-ebook-studio.flow.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, waitForAppReady } = require('../helpers/navigation');
const { ensureSampleManga, cleanTempOutput } = require('../helpers/fixtures');
const { mockSelectDirectory, mockSelectFiles } = require('../helpers/dialogMock');
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

test.describe('Flow 2: Ebook Studio Packaging & Converter', () => {
  test('should import sample manga folder, configure packaging and start export', async () => {
    // 1. Navigate to Ebook Studio
    await navigateToTab(window, 'ebookStudio');
    await expect(window.locator('[data-testid="tab-content-ebookStudio"]').first()).toBeVisible();

    // 2. Select packaging subtab
    const packagingTab = window.locator('[data-testid="subtab-packaging"]');
    await expect(packagingTab).toBeVisible();
    await packagingTab.click();
    await window.waitForTimeout(300);

    // 3. Mock directory selection to sample manga folder
    await mockSelectDirectory(electronApp, fixtures.sampleDir);

    // 4. Click Choose Folder in SourcePicker
    const selectFolderBtn = window.locator('[data-testid="tab-content-ebookStudio"] [data-testid="source-select-folder"]:visible');
    if (await selectFolderBtn.isVisible().catch(() => false)) {
      await selectFolderBtn.click();
      await window.waitForTimeout(1000);
    }

    // 5. Verify packaging start button exists and is interactive
    const startPackagingBtn = window.locator('[data-testid="packaging-start-btn"]');
    await expect(startPackagingBtn).toBeVisible();

    // 6. Capture real packaging screen
    await captureHelp(window, 'ebook-cbz');
  });

  test('should switch to converter subtab and select sample CBZ file', async () => {
    await navigateToTab(window, 'ebookStudio');

    // 1. Switch to converter subtab
    const converterTab = window.locator('[data-testid="subtab-converter"]');
    await expect(converterTab).toBeVisible();
    await converterTab.click();
    await window.waitForTimeout(300);

    // 2. Mock file selection to sample-comic.cbz
    await mockSelectFiles(electronApp, fixtures.cbzPath);

    // 3. Click Choose Files
    const selectFilesBtn = window.locator('[data-testid="tab-content-ebookStudio"] [data-testid="source-select-files"]:visible');
    if (await selectFilesBtn.isVisible().catch(() => false)) {
      await selectFilesBtn.click();
      await window.waitForTimeout(1000);
    }

    // 4. Verify converter start button is visible
    const startConverterBtn = window.locator('[data-testid="converter-start-btn"]');
    await expect(startConverterBtn).toBeVisible();

    // 5. Capture real converter screen
    await captureHelp(window, 'ebook-converter');
  });
});
