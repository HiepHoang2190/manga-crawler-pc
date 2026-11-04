// e2e/tests/library.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, navigateToQueueTab, waitForAppReady } = require('../helpers/navigation');
const { captureHelp } = require('../helpers/screenshot');

let electronApp, window;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
});

test.describe('Library / Queue Panel Tabs', () => {
  test('should navigate to home first to access queue panel', async () => {
    await navigateToTab(window, 'home');
    await expect(window.locator('[data-testid="tab-content-home"]')).toBeVisible();

    const savePathInput = window.locator('[data-testid="save-path-input"]');
    if (await savePathInput.isVisible().catch(() => false)) {
      await savePathInput.fill('/tmp/crawler-pipeline-test');
      await window.waitForTimeout(300);
    }
  });

  const queueTabs = [
    { id: 'history', screenshot: 'library-history' },
    { id: 'favorites', screenshot: 'library-favorites' },
    { id: 'offlineRead', screenshot: 'library-offline-read' },
  ];

  for (const tab of queueTabs) {
    test(`should display ${tab.id} queue tab`, async () => {
      const tabEl = window.locator(`[data-testid="queue-tab-${tab.id}"]`);
      const isVisible = await tabEl.isVisible().catch(() => false);
      if (isVisible) {
        await tabEl.click();
        await window.waitForTimeout(500);
      }
      await captureHelp(window, tab.screenshot);
    });
  }
});
