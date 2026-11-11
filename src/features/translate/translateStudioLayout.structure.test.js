const fs = require('fs');
const path = require('path');

describe('MangaTranslateTab StudioLayout Structure & Compliance', () => {
  const tabPath = path.join(__dirname, 'MangaTranslateTab.jsx');
  const tabSrc = fs.readFileSync(tabPath, 'utf8');

  test('MangaTranslateTab integrates StudioLayout as top-level layout wrapper', () => {
    expect(tabSrc).toMatch(/import\s*\{[^}]*StudioLayout[^}]*\}\s*from/);
    expect(tabSrc).toMatch(/<StudioLayout/);
    expect(tabSrc).toMatch(/<\/StudioLayout>/);
  });
});
