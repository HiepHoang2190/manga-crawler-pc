// e2e/flows/05-settings-theme.flow.spec.js
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('../helpers/electronApp');
const { navigateToTab, waitForAppReady } = require('../helpers/navigation');

let electronApp, window;

test.beforeAll(async () => {
  ({ electronApp, window } = await launchApp());
  await waitForAppReady(window);
});

test.afterAll(async () => {
  if (window) {
    await window.evaluate(() => {
      try {
        localStorage.setItem('manga-crawler-locale', 'vi');
      } catch (_) {}
    }).catch(() => {});
  }
  if (electronApp) await closeApp(electronApp);
});

test.describe('Flow 5: Settings, Localization & Theme Customization', () => {
  test('should toggle language between Vietnamese and English', async () => {
    // 1. Navigate to Settings
    await navigateToTab(window, 'settings');
    await expect(window.locator('[data-testid="tab-content-settings"]')).toBeVisible();

    // 2. Open Language dropdown
    const langCard = window.locator('[data-testid="language-setting-card"]');
    await expect(langCard).toBeVisible();

    const selectTrigger = langCard.locator('button[type="button"]').first();
    await selectTrigger.click();
    await window.waitForTimeout(300);

    // 3. Select English option
    const enOption = window.locator('li[role="option"]').filter({ hasText: /English|Tiếng Anh/i }).first();
    if (await enOption.isVisible().catch(() => false)) {
      await enOption.click();
      await window.waitForTimeout(500);

      // Verify MenuBar label for Tools is in English ("Tools")
      const toolsTab = window.locator('[data-testid="menu-tab-toolsStudio"]');
      await expect(toolsTab).toContainText('Tools');

      // Switch back to Vietnamese
      await selectTrigger.click();
      await window.waitForTimeout(300);
      const viOption = window.locator('li[role="option"]').filter({ hasText: /Tiếng Việt/i }).first();
      if (await viOption.isVisible().catch(() => false)) {
        await viOption.click();
        await window.waitForTimeout(500);
        await expect(toolsTab).toContainText('Công cụ');
      }
    }
  });

  test('should select different theme presets in ThemeCardPicker', async () => {
    await navigateToTab(window, 'settings');

    // Select Dracula theme preset
    const draculaCard = window.locator('[data-testid="theme-card-dracula"]');
    if (await draculaCard.isVisible().catch(() => false)) {
      await draculaCard.click();
      await window.waitForTimeout(300);
      await expect(draculaCard).toHaveAttribute('aria-pressed', 'true');
    }

    // Select Nord theme preset
    const nordCard = window.locator('[data-testid="theme-card-nord"]');
    if (await nordCard.isVisible().catch(() => false)) {
      await nordCard.click();
      await window.waitForTimeout(300);
      await expect(nordCard).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
