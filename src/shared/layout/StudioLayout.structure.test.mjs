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


