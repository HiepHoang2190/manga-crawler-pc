const fs = require('fs');
const path = require('path');

describe('BrandingSettings Integration & Compliance', () => {
  const settingsPanelSrc = fs.readFileSync(
    path.join(__dirname, 'SettingsPanel.jsx'),
    'utf8'
  );
  const brandingSectionSrc = fs.readFileSync(
    path.join(__dirname, 'BrandingSettingsSection.jsx'),
    'utf8'
  );
  const backupSrc = fs.readFileSync(
    path.join(__dirname, '../../utils/userDataBackup.js'),
    'utf8'
  );

  test('SettingsPanel imports and renders BrandingSettingsSection', () => {
    expect(settingsPanelSrc).toMatch(
      /import\s+BrandingSettingsSection\s+from\s+['"]\.\/BrandingSettingsSection\.jsx['"]/
    );
    expect(settingsPanelSrc).toMatch(/<BrandingSettingsSection[\s\S]*?\/>/);
  });

  test('BrandingSettingsSection never uses native browser dialogs', () => {
    expect(brandingSectionSrc).not.toMatch(/\bwindow\.alert\b/);
    expect(brandingSectionSrc).not.toMatch(/\bwindow\.confirm\b/);
    expect(brandingSectionSrc).not.toMatch(/\bwindow\.prompt\b/);
  });

  test('BrandingSettingsSection uses useBranding and useI18n', () => {
    expect(brandingSectionSrc).toMatch(/useBranding\(/);
    expect(brandingSectionSrc).toMatch(/useI18n\(/);
  });

  test('BrandingSettingsSection supports app, electron, and custom icon selections', () => {
    expect(brandingSectionSrc).toMatch(/draftIconType === 'app'/);
    expect(brandingSectionSrc).toMatch(/draftIconType === 'electron'/);
    expect(brandingSectionSrc).toMatch(/draftIconType === 'custom'/);
  });

  test('BrandingSettingsSection supports showTitleBarIcon toggle', () => {
    expect(brandingSectionSrc).toMatch(/draftShowTitleBarIcon/);
    expect(brandingSectionSrc).toMatch(/showTitleBarIconLabel/);
    expect(brandingSectionSrc).toMatch(/role="switch"/);
  });

  test('userDataBackup includes manga_branding keys in backup whitelist', () => {
    expect(backupSrc).toMatch(/'manga_branding_app_name'/);
    expect(backupSrc).toMatch(/'manga_branding_icon_type'/);
    expect(backupSrc).toMatch(/'manga_branding_show_titlebar_icon'/);
  });
});
