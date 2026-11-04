// e2e/tests/settings.spec.js
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

test.describe('Settings Tab', () => {
  test('should display settings panel', async () => {
    await navigateToTab(window, 'settings');
    await expect(window.locator('[data-testid="tab-content-settings"]')).toBeVisible();
    await captureHelp(window, 'settings-general');
  });

  test('should display polished update changelog modal with proper icons and badges', async () => {
    await navigateToTab(window, 'settings');

    // Trigger update modal with v3.0.27 changelog
    await window.evaluate(() => {
      if (window.__openUpdateModalForTest) {
        window.__openUpdateModalForTest({
          hasUpdate: true,
          currentVersion: '3.0.26',
          remoteVersion: '3.0.27',
          releaseDate: '16/09/2026',
          changelog: [
            '- [Mới] Tính năng Nối Tự Động (Auto-Connect Ports) trong tab Workflow với 1 cú click',
            '- [Mới] Tự động tạo dây nối tương thích khi kéo thả hoặc thêm khối mới từ Palette',
            '- [Mới] Bổ sung khối "Phóng To Ảnh AI (Upscale)" vào Workflow (hỗ trợ waifu2x, Real-ESRGAN, Real-CUGAN)',
            '- [Mới] Bổ sung khối "Nén Tối Ưu Dung Lượng (Compress)" vào Workflow (tối ưu MozJPEG & PNG lossless)',
            '- [Cải tiến] Cơ chế chống chu trình DAG và ưu tiên cổng dữ liệu chính trước cổng tín hiệu',
            '- [Cải tiến] Hiển thị thông số nén, dung lượng tiết kiệm và tiến trình xử lý chi tiết theo thời gian thực',
            '- [Sửa lỗi] Khắc phục tình trạng xung đột cổng kết nối và dây nối thừa trên bảng vẽ Workflow',
            '- [Tối ưu] Tối ưu hóa hiệu năng render bảng vẽ và bộ điều hợp adapter pipeline',
          ].join('\n'),
        });
      }
    });

    const modal = window.locator('[aria-labelledby="app-update-modal-title"]');
    await expect(modal).toBeVisible();

    // Verify badges do not contain broken 'RKLES' text
    const modalText = await modal.innerText();
    expect(modalText).not.toContain('RKLES');

    await captureHelp(window, 'app-update-modal-preview');

    // Close modal via Remind Later
    const remindLaterBtn = modal.locator('text=Để sau').first();
    await remindLaterBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
