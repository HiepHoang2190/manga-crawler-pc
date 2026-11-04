const fs = require('fs');
const path = require('path');

describe('SettingsPanel StudioLayout Structure & Compliance', () => {
  const settingsPanelSrc = fs.readFileSync(
    path.join(__dirname, 'SettingsPanel.jsx'),
    'utf8'
  );
  const backupSrc = fs.readFileSync(
    path.join(__dirname, '../../utils/userDataBackup.js'),
    'utf8'
  );

  test('uses StudioLayout and useStudioLayout with direct sidebar + content without toolbar header', () => {
    expect(settingsPanelSrc).toMatch(/import\s*\{[^}]*StudioLayout[^}]*\}\s*from/);
    expect(settingsPanelSrc).toMatch(/useStudioLayout\(/);
    expect(settingsPanelSrc).toMatch(/<StudioLayout>/);
    expect(settingsPanelSrc).not.toMatch(/<StudioLayout\.Toolbar/);
    expect(settingsPanelSrc).toMatch(/<StudioLayout\.LeftSidebar/);
    expect(settingsPanelSrc).toMatch(/<StudioLayout\.Content/);
  });

  test('does not use native browser dialogs (window.alert, window.confirm, window.prompt)', () => {
    expect(settingsPanelSrc).not.toMatch(/\bwindow\.alert\b/);
    expect(settingsPanelSrc).not.toMatch(/\bwindow\.confirm\b/);
    expect(settingsPanelSrc).not.toMatch(/\bwindow\.prompt\b/);
  });

  test('supports category selection and persistent storage key', () => {
    expect(settingsPanelSrc).toMatch(/settings_active_tab_v1/);
    expect(settingsPanelSrc).toMatch(/storagePrefix:\s*'settings'/);
  });

  test('registers settings layout keys in userDataBackup', () => {
    expect(backupSrc).toMatch(/'settings_left_width_v1'/);
    expect(backupSrc).toMatch(/'settings_left_open_v1'/);
    expect(backupSrc).toMatch(/'settings_active_tab_v1'/);
  });

  test('integrates ThemeCardPicker into appearance settings', () => {
    expect(settingsPanelSrc).toMatch(/import\s+ThemeCardPicker\s+from\s+['"]\.\/ThemeCardPicker\.jsx['"]/);
    expect(settingsPanelSrc).toMatch(/<ThemeCardPicker\s*\/>/);
  });
});

