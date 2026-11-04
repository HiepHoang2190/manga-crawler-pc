// e2e/tests/help.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, waitForAppReady } = require('../helpers/navigation');

let electronApp, window;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (electronApp) await closeApp(electronApp);
});

test.describe('Help Modal', () => {
  test('should open help modal from home tab', async () => {
    await navigateToTab(window, 'home');

    // Hover over the active home tab to reveal help icon
    const homeTab = window.locator('[data-testid="menu-tab-home"]');
    await homeTab.hover();
    await window.waitForTimeout(300);

    // Click the help button (visible when tab is active: opacity-60, hover:opacity-100)
    const helpBtn = window.locator('[data-testid="help-btn-home"]');
    await helpBtn.click({ force: true });
    await window.waitForTimeout(500);

    // Verify help modal/dialog is open
    const modal = window.locator('div[role="dialog"]');
    await expect(modal.first()).toBeVisible({ timeout: 5_000 });

    // Close modal
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });

  test('should open help modal from settings tab', async () => {
    await navigateToTab(window, 'settings');

    const settingsTab = window.locator('[data-testid="menu-tab-settings"]');
    await settingsTab.hover();
    await window.waitForTimeout(300);

    // Click the help button (visible when tab is active: opacity-60, hover:opacity-100)
    const helpBtn = window.locator('[data-testid="help-btn-settings"]');
    await helpBtn.click({ force: true });
    await window.waitForTimeout(500);

    const modal = window.locator('div[role="dialog"]');
    await expect(modal.first()).toBeVisible({ timeout: 5_000 });

    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  });
});
