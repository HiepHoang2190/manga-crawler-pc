import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/shared/layout/index.js exports StudioLayout and useStudioLayout', () => {
  const indexSrc = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(indexSrc).toContain("export { default as StudioLayout } from './StudioLayout';");
  expect(indexSrc).toContain("export { useStudioLayout } from './useStudioLayout';");
});

test('src/shared/index.js re-exports StudioLayout and useStudioLayout', () => {
  const sharedIndexSrc = fs.readFileSync(path.join(dirname, '..', 'index.js'), 'utf8');
  expect(sharedIndexSrc).toContain("export { StudioLayout, useStudioLayout } from './layout';");
});

test('StudioLayout.jsx declares all standard compound subcomponents', () => {
  const layoutSrc = fs.readFileSync(path.join(dirname, 'StudioLayout.jsx'), 'utf8');
  expect(layoutSrc).toContain('StudioLayout.Toolbar = function StudioToolbar');
  expect(layoutSrc).toContain('StudioLayout.Body = function StudioBody');
  expect(layoutSrc).toContain('StudioLayout.LeftSidebar = function StudioLeftSidebar');
  expect(layoutSrc).toContain('StudioLayout.Content = function StudioContent');
  expect(layoutSrc).toContain('StudioLayout.RightSidebar = function StudioRightSidebar');
  expect(layoutSrc).toContain('StudioLayout.BottomDrawer = function StudioBottomDrawer');
});

test('StudioLayout sidebars enforce ResizeSplitter and Scrollbar Isolation (mr-1.5)', () => {
  const layoutSrc = fs.readFileSync(path.join(dirname, 'StudioLayout.jsx'), 'utf8');
  expect(layoutSrc).toContain('import ResizeSplitter from');
  expect(layoutSrc).toContain('variant="overlay"');
  expect(layoutSrc).toContain('side="right"');
  expect(layoutSrc).toContain('side="left"');
  // Scrollbar isolation rule: mr-1.5 on scrollable container
  expect(layoutSrc).toContain('custom-scrollbar min-h-0 mr-1.5');
});

test('src/index.css enforces unified slim theme-colored scrollbars (5px, 9999px pill, outline-variant)', () => {
  const cssSrc = fs.readFileSync(path.join(dirname, '..', '..', 'index.css'), 'utf8');
  expect(cssSrc).toContain('width: 5px;');
  expect(cssSrc).toContain('height: 5px;');
  expect(cssSrc).toContain('border-radius: 9999px;');
  expect(cssSrc).toContain('background-color: var(--color-outline-variant);');
  expect(cssSrc).toContain('background-color: var(--color-outline);');
  expect(cssSrc).toContain('background-color: var(--color-primary);');
});

test('src/index.css declares all 11 additional curated themes with Light and Dark tokens', () => {
  const cssSrc = fs.readFileSync(path.join(dirname, '..', '..', 'index.css'), 'utf8');
  const themes = [
    'catppuccin',
    'tokyonight',
    'nord',
    'sepia',
    'oled',
    'dracula',
    'github',
    'onedark',
    'rosepine',
    'emerald',
    'cyberpunk',
  ];
  for (const theme of themes) {
    expect(cssSrc).toContain(`[data-theme="${theme}"]`);
    expect(cssSrc).toContain(`html.dark[data-theme="${theme}"]`);
  }
});

test('StudioLayout.RightSidebar close button retains aria-label but has no data-tooltip', () => {
  const layoutSrc = fs.readFileSync(path.join(dirname, 'StudioLayout.jsx'), 'utf8');
  expect(layoutSrc).toContain("aria-label={t('studio.closeInspector')}");
  expect(layoutSrc).not.toContain("data-tooltip={t('studio.closeInspector')}");
});

test('left-sidebar toggle buttons use neutral ghost style when open and primary cue only when collapsed', () => {
  const layoutSrc = fs.readFileSync(path.join(dirname, 'StudioLayout.jsx'), 'utf8');
  const workflowToolbarSrc = fs.readFileSync(
    path.join(dirname, '../../features/workflow/components/WorkflowToolbar.jsx'),
    'utf8',
  );
  const mangaEditorSrc = fs.readFileSync(
    path.join(dirname, '../../features/translate/components/MangaStudioEditor.jsx'),
    'utf8',
  );

  expect(layoutSrc).toMatch(
    /w-8 h-8 rounded-lg[\s\S]{0,160}showLeftSidebar\s*\?\s*['"]text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high['"]\s*:\s*['"]text-primary bg-primary\/10/,
  );
  expect(workflowToolbarSrc).toMatch(
    /w-8 h-8 rounded-lg[\s\S]{0,160}showLeftSidebar\s*\?\s*['"]text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high['"]\s*:\s*['"]text-primary bg-primary\/10/,
  );
  expect(mangaEditorSrc).toMatch(
    /w-7 h-7 rounded-lg[\s\S]{0,220}showLeftSidebar\s*\?\s*['"]border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high['"]\s*:\s*['"]border-primary\/25 bg-primary\/10 text-primary/,
  );
});

test('non-canvas tabs omit onToggleLeftSidebar and keep LeftSidebar open with resize', () => {
  const studioLeftSidebarTabs = [
    '../../features/plugins/PluginManagementPanel.jsx',
    '../../features/site-checker/SiteCheckerPanel.jsx',
    '../../features/latest-updates/LatestUpdatesPanel.jsx',
    '../../features/bulk-scan/BulkScanPanel.jsx',
    '../../features/explore/components/FollowedMangaPanel.jsx',
    '../../features/home/HomeWorkspace.jsx',
  ];

  for (const rel of studioLeftSidebarTabs) {
    const src = fs.readFileSync(path.join(dirname, rel), 'utf8');
    expect(src).not.toContain('onToggleLeftSidebar');
    expect(src).not.toContain('showLeftSidebar');
    expect(src).toMatch(/<StudioLayout\.LeftSidebar[\s\S]{0,120}open=\{true\}/);
    expect(src).toContain('leftWidth');
    expect(src).toContain('handleLeftResizeStart');
  }

  for (const rel of [
    '../../features/tools-studio/ToolsStudio.jsx',
    '../../features/ebook-studio/EbookStudio.jsx',
  ]) {
    const src = fs.readFileSync(path.join(dirname, rel), 'utf8');
    expect(src).not.toContain('onToggleLeftSidebar');
    expect(src).not.toContain('showLeftSidebar');
    expect(src).toContain('showSidebar={true}');
    expect(src).toContain('sidebarWidth');
    expect(src).toContain('handleSplitPointerDown');
  }
});


