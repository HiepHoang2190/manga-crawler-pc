// e2e/tests/plugins.spec.js
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

test.describe('Plugins Tab', () => {
  test('should display plugins management panel', async () => {
    await navigateToTab(window, 'plugins');
    await expect(window.locator('[data-testid="tab-content-plugins"]')).toBeVisible();
    await captureHelp(window, 'plugins-manager');
  });
});
