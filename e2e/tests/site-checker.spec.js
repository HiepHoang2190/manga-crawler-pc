// e2e/tests/site-checker.spec.js
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

test.describe('Site Checker Tab', () => {
  test('should display site checker panel', async () => {
    await navigateToTab(window, 'siteChecker');
    await expect(window.locator('[data-testid="tab-content-siteChecker"]')).toBeVisible();
    await captureHelp(window, 'site-checker');
  });
});
