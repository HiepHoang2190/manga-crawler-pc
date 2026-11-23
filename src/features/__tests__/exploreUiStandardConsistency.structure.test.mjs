import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Explore-First Unified UI Standard Across All Application Tabs', () => {
  const studioShells = [
    { name: 'ExplorePanel', path: 'src/features/explore/ExplorePanel.jsx' },
    { name: 'HomeWorkspace', path: 'src/features/home/HomeWorkspace.jsx' },
    { name: 'ToolsStudio', path: 'src/features/tools-studio/ToolsStudio.jsx' },
    { name: 'EbookStudio', path: 'src/features/ebook-studio/EbookStudio.jsx' },
    { name: 'PluginManagementPanel', path: 'src/features/plugins/PluginManagementPanel.jsx' },
    { name: 'SiteCheckerPanel', path: 'src/features/site-checker/SiteCheckerPanel.jsx' },
  ];

  test('all 6 multi-tab StudioLayout shells use canonical role="tablist" pill bar (gap-0.5 p-0.5 bg-surface-container-high/70 border-outline-variant/25)', () => {
    for (const s of studioShells) {
      const code = read(s.path);
      const tablistMatch = code.match(/role="tablist"[\s\S]{0,220}className="([^"]+)"/);
      expect({ file: s.name, matched: Boolean(tablistMatch) }).toEqual({
        file: s.name,
        matched: true,
      });
      const cls = tablistMatch[1];
      expect(cls).toContain('gap-0.5');
      expect(cls).toContain('p-0.5');
      expect(cls).toContain('rounded-xl');
      expect(cls).toContain('bg-surface-container-high/70');
      expect(cls).toContain('border-outline-variant/25');
    }
  });

  test('all 6 multi-tab StudioLayout shells render h-8 px-3 role="tab" buttons with aria-selected, whitespace-nowrap, and shrink-0 (no h-7/py-1/py-1.5)', () => {
    for (const s of studioShells) {
      const code = read(s.path);
      const tabButtons = code.match(/<button[\s\S]*?role="tab"[\s\S]*?<\/button>/g) || [];
      expect({ file: s.name, tabCount: tabButtons.length }).not.toEqual({
        file: s.name,
        tabCount: 0,
      });
      for (const btn of tabButtons) {
        expect(btn).toMatch(/aria-selected=/);
        expect(btn).toContain('h-8 px-3 rounded-lg text-xs font-medium');
        expect(btn).toContain('whitespace-nowrap');
        expect(btn).toContain('shrink-0');
        expect(btn).not.toMatch(/\bh-7\b|\bpy-1(?:\.5)?\b/);
      }
    }
  });

  test('HomeToolsDropdown uses canonical h-8 px-3 pill trigger outside tablist, theme tokens, and keyboard navigation without nested button', () => {
    const home = read('src/features/home/HomeWorkspace.jsx');
    const dropdown = read('src/features/home/HomeToolsDropdown.jsx');
    const tablistSection = home.match(/<div\s+role="tablist"[\s\S]*?<\/div>\s*\n\s*\{toolsTabs/);
    expect(tablistSection).not.toBeNull();
    expect(dropdown).toContain('h-8 px-3 rounded-lg text-xs font-medium');
    expect(dropdown).toContain('whitespace-nowrap');
    expect(dropdown).not.toContain('border-b-2 -mb-px');
    expect(dropdown).not.toContain('role="button"');
    expect(dropdown).not.toContain('dark:bg-zinc-900');
    expect(dropdown).toContain('ArrowDown');
    expect(dropdown).toContain('triggerRef.current?.focus()');
    expect(dropdown).not.toMatch(/\btitle\s*=\s*["'{]/);
  });

  test('PluginManagementPanel places primary toolbar actions in leftSlot next to tabs (plugins-primary-action-slot)', () => {
    const code = read('src/features/plugins/PluginManagementPanel.jsx');
    const toolbarMatch = code.match(/<StudioLayout\.Toolbar([\s\S]*?)<StudioLayout\.Body>/);
    expect(toolbarMatch).not.toBeNull();
    const toolbarCode = toolbarMatch[1];
    expect(toolbarCode).toContain('data-testid="plugins-primary-action-slot"');
    expect(toolbarCode).toContain('pl-2.5 border-l border-outline-variant/25 ml-1');
    expect(toolbarCode).not.toContain('rightSlot=');
    expect(code).not.toContain('py-0.2');
  });

  test('SiteCheckerPanel places Test All / Stop CTA in leftSlot beside tabs, Sort in rightSlot, and uses soft-error Stop button', () => {
    const code = read('src/features/site-checker/SiteCheckerPanel.jsx');
    const toolbarMatch = code.match(/<StudioLayout\.Toolbar([\s\S]*?)<StudioLayout\.Body>/);
    expect(toolbarMatch).not.toBeNull();
    const toolbarCode = toolbarMatch[1];
    expect(toolbarCode).toContain('data-testid="site-checker-primary-action-slot"');
    expect(toolbarCode).toContain('pl-2.5 border-l border-outline-variant/25 ml-1');
    expect(toolbarCode).toContain('startTestAll');
    expect(toolbarCode).toContain('cancelTestAll');
    expect(toolbarCode).toContain('bg-error/15 text-error');
    expect(toolbarCode).toContain('stop_circle');
    expect(toolbarCode).toMatch(/rightSlot=\{[\s\S]*SearchableSelect/);
    expect(code).not.toContain('py-0.2');
  });

  test('AGENTS.md and .agent/AGENTS.md codify the Explore-First unified UI standard', () => {
    const rootAgents = read('AGENTS.md');
    const localAgents = read('.agent/AGENTS.md');
    for (const doc of [rootAgents, localAgents]) {
      expect(doc).toContain('Explore-First Unified UI Standard');
      expect(doc).toContain('h-8 px-3 rounded-lg text-xs font-medium');
      expect(doc).toContain('bg-surface-container-high/70 border border-outline-variant/25');
      expect(doc).toContain('pl-2.5 border-l border-outline-variant/25 ml-1');
    }
  });
});
