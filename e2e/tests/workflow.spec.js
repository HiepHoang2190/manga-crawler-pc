// e2e/tests/workflow.spec.js
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

test.describe('Workflow Tab', () => {
  test('should display workflow studio', async () => {
    await navigateToTab(window, 'workflow');
    await expect(window.locator('[data-testid="tab-content-workflow"]').first()).toBeVisible();
    await captureHelp(window, 'workflow-automation');
  });

  test('should display image_upscale and image_compress nodes in palette', async () => {
    await navigateToTab(window, 'workflow');
    const upscaleItem = window.locator('[data-node-type="image_upscale"]').first();
    const compressItem = window.locator('[data-node-type="image_compress"]').first();
    await expect(upscaleItem).toBeVisible();
    await expect(compressItem).toBeVisible();
  });

  test('should add upscale and compress nodes to canvas and show inspector', async () => {
    await navigateToTab(window, 'workflow');

    // Double click to add upscale node
    const upscalePalette = window.locator('[data-node-type="image_upscale"]').first();
    await upscalePalette.dblclick();

    // Check node is rendered on canvas
    const upscaleCanvasNode = window.locator('[data-canvas-node-type="image_upscale"]').first();
    await expect(upscaleCanvasNode).toBeVisible();

    // Click it to select
    await upscaleCanvasNode.click();
    // Inspector should show engine/model/scale options
    await expect(window.locator('text=Bộ máy Upscale').first()).toBeVisible();

    // Double click to add compress node
    const compressPalette = window.locator('[data-node-type="image_compress"]').first();
    await compressPalette.dblclick();

    // Check node is rendered on canvas
    const compressCanvasNode = window.locator('[data-canvas-node-type="image_compress"]').first();
    await expect(compressCanvasNode).toBeVisible();

    // Click it to select
    await compressCanvasNode.click();
    // Inspector should show quality slider
    await expect(window.locator('text=Chất lượng nén').first()).toBeVisible();

    await captureHelp(window, 'workflow-upscale-compress');
  });

  test('should display auto-connect buttons and connect compatible nodes', async () => {
    await navigateToTab(window, 'workflow');

    // Auto-connect buttons should be visible
    const toolbarBtn = window.locator('[data-testid="workflow-autoconnect-btn"]').first();
    const canvasBtn = window.locator('[data-testid="workflow-canvas-autoconnect-btn"]').first();
    await expect(toolbarBtn).toBeVisible();
    await expect(canvasBtn).toBeVisible();

    // Click auto-connect toolbar button
    await toolbarBtn.click();

    // Verify edges exist on the canvas
    const edges = window.locator('[data-testid="workflow-edge"]');
    await expect(edges.first()).toBeVisible();
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThanOrEqual(1);

    await captureHelp(window, 'workflow-auto-connect-ports');
  });
});
