// e2e/helpers/navigation.js

/**
 * Navigate to a main menu tab by clicking it.
 * Menu tab IDs match the VIEWS array in MenuBar.jsx:
 * explore, home, toolsStudio, ebookStudio, translate, workflow, plugins, siteChecker, settings, dashboard
 */
async function navigateToTab(window, tabId) {
  // If QueueRestoreModal is open, dismiss it
  const restoreModal = window.locator('div[role="dialog"][aria-labelledby="queue-restore-title"]');
  if (await restoreModal.isVisible().catch(() => false)) {
    const discardBtn = restoreModal.locator('button').first();
    await discardBtn.click().catch(() => {});
    await window.waitForTimeout(300);
  }

  const tabSelector = `[data-testid="menu-tab-${tabId}"]`;
  await window.click(tabSelector);
  // Wait for tab content — use .first() since persistent tabs have their own
  // data-testid on the wrapper div
  const contentSelector = `[data-testid="tab-content-${tabId}"]`;
  const el = window.locator(contentSelector).first();
  await el.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    // Some conditional tabs don't have data-testid wrapper — just wait for animation
  });
  // Give animations time to settle
  await window.waitForTimeout(500);
}

/**
 * Navigate to a sub-tab within a parent tab.
 * Used for Tools Studio sub-tabs, Ebook Studio sub-tabs, Explore sub-tabs, etc.
 */
async function navigateToSubTab(window, subTabId) {
  const subTabSelector = `[data-testid="subtab-${subTabId}"]`;
  await window.click(subTabSelector);
  await window.waitForTimeout(500);
}

/**
 * Navigate to a queue panel tab.
 * Queue tab IDs: queue, history, favorites, offlineRead, cbzExport, pdfExport,
 * imageConvert, rename, splitPage, deskew, cropImage, sendToKindle, duplicates
 */
async function navigateToQueueTab(window, queueTabId) {
  const tabSelector = `[data-testid="queue-tab-${queueTabId}"]`;
  await window.click(tabSelector);
  await window.waitForTimeout(500);
}

/**
 * Wait for the app to be fully loaded and idle.
 */
async function waitForAppReady(window) {
  await window.waitForSelector('nav[aria-label="Main menu"]', { timeout: 30_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1000);

  // If QueueRestoreModal is open, dismiss it
  const restoreModal = window.locator('div[role="dialog"][aria-labelledby="queue-restore-title"]');
  if (await restoreModal.isVisible().catch(() => false)) {
    const discardBtn = restoreModal.locator('button').first();
    await discardBtn.click().catch(() => {});
    await window.waitForTimeout(300);
  }
}

module.exports = { navigateToTab, navigateToSubTab, navigateToQueueTab, waitForAppReady };
