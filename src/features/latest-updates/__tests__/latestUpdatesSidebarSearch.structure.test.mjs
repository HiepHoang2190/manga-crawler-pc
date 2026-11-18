import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel Sidebar Search Structure', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');

  test('search box is placed inside LeftSidebar below searchScopeControl', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    const sidebarStart = code.indexOf('<StudioLayout.LeftSidebar');
    const sidebarEnd = code.indexOf('</StudioLayout.LeftSidebar>');
    expect(sidebarStart).toBeGreaterThan(-1);
    expect(sidebarEnd).toBeGreaterThan(sidebarStart);

    const sidebarCode = code.slice(sidebarStart, sidebarEnd);
    expect(sidebarCode).toContain('handleApplyLatestSearch');
    expect(sidebarCode).toContain('searchDraft');
    expect(sidebarCode).toContain('searchInputRef');

    // Verify it is below searchScopeControl in LeftSidebar
    const scopeIndex = sidebarCode.indexOf('searchScopeControl');
    const searchBoxIndex = sidebarCode.indexOf('searchInputRef');
    expect(scopeIndex).toBeGreaterThan(-1);
    expect(searchBoxIndex).toBeGreaterThan(scopeIndex);
  });

  test('has keyboard shortcut listener for Ctrl+F / Cmd+F to focus search input', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    expect(code).toMatch(/e\.key\s*===\s*['"]f['"]\s*&&\s*\(e\.ctrlKey\s*\|\|\s*e\.metaKey\)/i);
  });

  test('toolbar leftSlot cleanly renders subtabsSlot without duplicate search button', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    const toolbarStart = code.indexOf('<StudioLayout.Toolbar');
    const toolbarEnd = code.indexOf('/>\n\n      <StudioLayout.Body>');
    expect(toolbarStart).toBeGreaterThan(-1);
    expect(toolbarEnd).toBeGreaterThan(toolbarStart);

    const toolbarCode = code.slice(toolbarStart, toolbarEnd);
    expect(toolbarCode).toContain('leftSlot={subtabsSlot}');
  });
});
