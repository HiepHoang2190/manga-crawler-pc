// e2e/tests/ebook-studio.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, navigateToSubTab, waitForAppReady } = require('../helpers/navigation');
const { captureHelp } = require('../helpers/screenshot');

let electronApp, window;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
});

test.describe('Ebook Studio Tab', () => {
  test('should display ebook studio', async () => {
    await navigateToTab(window, 'ebookStudio');
    await expect(window.locator('[data-testid="tab-content-ebookStudio"]').first()).toBeVisible();
  });

  // Real sub-tab IDs from EbookStudio.jsx: packaging, converter, tools, kindle
  const subTabs = [
    { id: 'packaging', screenshot: 'ebook-cbz' },
    { id: 'converter', screenshot: 'ebook-converter' },
    { id: 'tools', screenshot: 'ebook-tools' },
    { id: 'kindle', screenshot: 'ebook-kindle' },
  ];

  for (const sub of subTabs) {
    test(`should navigate to ${sub.id} sub-tab and capture screenshot`, async () => {
      await navigateToTab(window, 'ebookStudio');
      const subTabEl = window.locator(`[data-testid="subtab-${sub.id}"]`);
      await expect(subTabEl).toBeVisible({ timeout: 5_000 });
      await subTabEl.click();
      await window.waitForTimeout(500);
      await captureHelp(window, sub.screenshot);
    });
  }

  test('should switch to PDF format in packaging subtab and capture ebook-pdf', async () => {
    await navigateToTab(window, 'ebookStudio');
    const subTabEl = window.locator('[data-testid="subtab-packaging"]');
    await expect(subTabEl).toBeVisible({ timeout: 5_000 });
    await subTabEl.click();
    await window.waitForTimeout(300);

    // Select PDF format button
    const pdfBtn = window.locator('button').filter({ hasText: 'PDF' }).first();
    if (await pdfBtn.isVisible().catch(() => false)) {
      await pdfBtn.click();
      await window.waitForTimeout(500);
    }
    await captureHelp(window, 'ebook-pdf');
  });
});
