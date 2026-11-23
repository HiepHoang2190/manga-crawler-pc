import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel Manga Card Actions and Placeholder', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');

  test('uses streamlined action button layout with playlist_add quick action', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('playlist_add');
    expect(content).toContain('menu_book');
    expect(content).toContain('noCover');
  });

  test('complies with UI standards: no native title attributes and no underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });

  test('primary refresh button is placed next to subtabsSlot in leftSlot while ViewModeToggle stays at far right end of rightSlot', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const leftSlotMatch = content.match(/leftSlot=\{([\s\S]*?)\}\s*\n\s*rightSlot=/);
    const rightSlotMatch = content.match(/rightSlot=\{([\s\S]*?)\n\s*\}\s*\/>/);
    expect(leftSlotMatch).not.toBeNull();
    expect(rightSlotMatch).not.toBeNull();
    const leftSlotContent = leftSlotMatch[1];
    const rightSlotContent = rightSlotMatch[1];
    expect(leftSlotContent.indexOf('onClick={handleManualRefresh}')).toBeGreaterThan(
      leftSlotContent.indexOf('{subtabsSlot}'),
    );
    expect(rightSlotContent).not.toContain('handleManualRefresh');
    const consoleIndex = rightSlotContent.indexOf('setPluginConsoleOpen');
    const viewModeIndex = rightSlotContent.indexOf('<ViewModeToggle');
    expect(viewModeIndex).toBeGreaterThan(-1);
    expect(viewModeIndex).toBeGreaterThan(consoleIndex);
  });

  test('Grid card is clickable to open chapter list drawer', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('handleOpenChapterListButton(row.siteId, row)');
    // Verifies card row has onClick with closest button check
    expect(content).toContain("e.target.closest('button')");
  });
});

