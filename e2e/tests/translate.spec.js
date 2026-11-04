// e2e/tests/translate.spec.js
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

test.describe('Translate Tab', () => {
  test('should display translate studio', async () => {
    await navigateToTab(window, 'translate');
    await expect(window.locator('[data-testid="tab-content-translate"]').first()).toBeVisible();
    await captureHelp(window, 'translate-studio');
  });
});
