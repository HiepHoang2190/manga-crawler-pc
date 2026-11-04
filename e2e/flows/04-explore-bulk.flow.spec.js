// e2e/flows/04-explore-bulk.flow.spec.js
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

test.describe('Flow 4: Explore Catalog & Bulk Scan Flow', () => {
  test('should navigate between Explore subtabs and interact with bulk scan controls', async () => {
    // 1. Navigate to Explore
    await navigateToTab(window, 'explore');
    await expect(window.locator('[data-testid="tab-content-explore"]').first()).toBeVisible();

    // 2. Switch to Bulk Scan subtab
    const bulkTab = window.locator('[data-testid="subtab-bulk"]:visible');
    await expect(bulkTab).toBeVisible();
    await bulkTab.click();
    await window.waitForTimeout(500);

    // 3. Verify Bulk Scan load and enqueue buttons are visible
    const loadBtn = window.locator('[data-testid="bulk-load-btn"]');
    await expect(loadBtn).toBeVisible();

    const enqueueBtn = window.locator('[data-testid="bulk-enqueue-btn"]');
    await expect(enqueueBtn).toBeVisible();

    // 4. Switch back to Latest Updates subtab
    const latestTab = window.locator('[data-testid="subtab-latest"]:visible');
    await expect(latestTab).toBeVisible();
    await latestTab.click();
    await window.waitForTimeout(500);

    // 5. Verify Latest Updates panel is displayed
    const activeLatestTab = window.locator('[data-testid="subtab-latest"]:visible');
    await expect(activeLatestTab).toHaveAttribute('aria-selected', 'true');
  });
});
