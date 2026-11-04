// e2e/tests/dashboard.spec.js
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

test.describe('Dashboard Tab', () => {
  test('should display dashboard panel', async () => {
    await navigateToTab(window, 'dashboard');
    await expect(window.locator('[data-testid="tab-content-dashboard"]')).toBeVisible();
    await captureHelp(window, 'dashboard-overview');
  });
});
