const fs = require('fs');
const path = require('path');

const modalPath = path.join(__dirname, '../AppUpdateModal.jsx');
const providerPath = path.join(__dirname, '../SettingsProvider.jsx');
const badgePath = path.join(__dirname, '../UpdateBadge.jsx');
const shellPath = path.join(__dirname, '../../shell/ShellLayout.jsx');
const checkerPath = path.join(__dirname, '../UpdateChecker.jsx');

describe('AppUpdateModal Component & Update Changelog System Architecture', () => {
  test('AppUpdateModal exists and implements rich interactive update & changelog modal', () => {
    expect(fs.existsSync(modalPath)).toBe(true);
    const code = fs.readFileSync(modalPath, 'utf8');

    // Default export
    expect(code).toMatch(/export\s+default\s+function\s+AppUpdateModal/);

    // React Portal into document.body
    expect(code).toMatch(/createPortal/);
    expect(code).toMatch(/document\.body/);

    // Keyboard Escape handler
    expect(code).toMatch(/e\.key\s*===\s*['"]Escape['"]/);

    // Uses parseChangelog utility
    expect(code).toMatch(/parseChangelog/);

    // 3 Decision options: Update Now, Remind Later, Skip Version
    expect(code).toMatch(/updateModal\.updateNow/);
    expect(code).toMatch(/updateModal\.remindLater/);
    expect(code).toMatch(/updateModal\.skipVersion/);

    // Skip confirmation dialog
    expect(code).toMatch(/confirmSkip/);
    expect(code).toMatch(/updateModal\.skipConfirmTitle/);

    // Adheres to app UI guidelines: no native title attributes, uses data-tooltip
    expect(code).not.toMatch(/\stitle=["'][^"']+["']/);
    expect(code).toMatch(/data-tooltip=/);

    // No native <select>
    expect(code).not.toMatch(/<select/);

    // No native browser dialogs (window.alert, window.confirm)
    expect(code).not.toMatch(/window\.alert|window\.confirm|window\.prompt/);
  });

  test('SettingsProvider manages skippedUpdateVersion, modal state, and centralized downloads', () => {
    expect(fs.existsSync(providerPath)).toBe(true);
    const code = fs.readFileSync(providerPath, 'utf8');

    // LocalStorage persistence for skipped update version
    expect(code).toMatch(/mangaSkippedUpdateVersion/);

    // State and methods
    expect(code).toMatch(/skippedUpdateVersion/);
    expect(code).toMatch(/isUpdateModalOpen/);
    expect(code).toMatch(/openUpdateModal/);
    expect(code).toMatch(/closeUpdateModal/);
    expect(code).toMatch(/skipUpdateVersion/);
    expect(code).toMatch(/startAppDownload/);
    expect(code).toMatch(/startAppInstall/);

    // Whitelist in context value
    expect(code).toMatch(/value\s*=\s*useMemo/);
  });

  test('UpdateBadge triggers openUpdateModal and ShellLayout mounts AppUpdateModal', () => {
    const badgeCode = fs.readFileSync(badgePath, 'utf8');
    expect(badgeCode).toMatch(/openUpdateModal/);

    const shellCode = fs.readFileSync(shellPath, 'utf8');
    expect(shellCode).toMatch(/import\s*\{[^}]*AppUpdateModal[^}]*\}\s*from\s*['"]\.\.\/settings['"]/);
    expect(shellCode).toMatch(/<AppUpdateModal\s*\/>/);
  });

  test('UpdateChecker in Settings tab displays changelog preview and open modal action', () => {
    const checkerCode = fs.readFileSync(checkerPath, 'utf8');
    expect(checkerCode).toMatch(/parseChangelog/);
    expect(checkerCode).toMatch(/openUpdateModal/);
    expect(checkerCode).toMatch(/updateModal\.viewChanges/);
  });
});
