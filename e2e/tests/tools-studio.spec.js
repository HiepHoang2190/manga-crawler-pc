// e2e/tests/tools-studio.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, navigateToSubTab, waitForAppReady } = require('../helpers/navigation');
const { captureHelp } = require('../helpers/screenshot');
const { ensureSampleManga } = require('../helpers/fixtures');
const { mockSelectDirectory } = require('../helpers/dialogMock');

let electronApp, window, fixtures;

test.beforeAll(async () => {
  fixtures = await ensureSampleManga();
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
});

test.describe('Tools Studio Tab', () => {
  test('should display tools studio', async () => {
    await navigateToTab(window, 'toolsStudio');
    await expect(window.locator('[data-testid="tab-content-toolsStudio"]').first()).toBeVisible();
  });

  // Real sub-tab IDs from TOOLS_TABS in ToolsStudio.jsx
  const subTabs = [
    { id: 'imagePipeline', screenshot: 'tools-image-pipeline' },
    { id: 'rename', screenshot: 'tools-rename' },
    { id: 'duplicates', screenshot: 'tools-duplicates' },
    { id: 'upscale', screenshot: 'tools-upscale' },
  ];

  for (const sub of subTabs) {
    test(`should navigate to ${sub.id} sub-tab and capture screenshot`, async () => {
      await navigateToTab(window, 'toolsStudio');
      const subTabEl = window.locator(`[data-testid="subtab-${sub.id}"]`);
      await expect(subTabEl).toBeVisible({ timeout: 5_000 });
      await subTabEl.click();
      await window.waitForTimeout(500);

      // Import real sample images for crop, upscale and compress so help screenshot displays actual loaded files
      if ((sub.id === 'crop' || sub.id === 'upscale' || sub.id === 'compress') && fixtures?.chapterDir) {
        await mockSelectDirectory(electronApp, fixtures.chapterDir);
        const selectFolderBtn = window.locator(
          '[data-testid="tab-content-toolsStudio"] [data-testid="source-select-folder"]:visible'
        );
        if (await selectFolderBtn.isVisible().catch(() => false)) {
          await selectFolderBtn.click();
          await window.waitForTimeout(1500);
        }
      }

      if (sub.id === 'compress') {
        const compressStartBtn = window.locator('[data-testid="compress-start-btn"]');
        await expect(compressStartBtn).toBeVisible({ timeout: 5_000 });
      }

      await captureHelp(window, sub.screenshot);
    });
  }
});
