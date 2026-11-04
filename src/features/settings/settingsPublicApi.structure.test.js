const fs = require('fs');
const path = require('path');

test('src/features/settings/index.js exports SettingsProvider and useSettings', () => {
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/SettingsProvider/);
  expect(src).toMatch(/useSettings/);
  expect(src).toMatch(/SettingsPanel/);
  expect(src).toMatch(/UpdateBadge/);
});

test('SettingsPanel imports SiteCookieSection from download index, not components/SiteCookieSection', () => {
  const src = fs.readFileSync(path.join(__dirname, 'SettingsPanel.jsx'), 'utf8');
  expect(src).toMatch(/SiteCookieSection/);
  expect(src).toMatch(/from ['"]\.\.\/download['"]/);
  expect(src).not.toMatch(/components\/SiteCookieSection/);
  expect(src).not.toMatch(/from ['"].*features\/download\/(?!index)/);
});
