import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('MenuTabCustomizeModal file exists with drag-and-drop, up/down, visibility, and reset support', () => {
  const code = fs.readFileSync(path.join(dirname, 'MenuTabCustomizeModal.jsx'), 'utf8');
  expect(code).toMatch(/onMoveTab/);
  expect(code).toMatch(/onReorderTab/);
  expect(code).toMatch(/onToggleHiddenTab/);
  expect(code).toMatch(/onResetPrefs/);
  expect(code).toMatch(/keyboard_arrow_up/);
  expect(code).toMatch(/keyboard_arrow_down/);
  expect(code).toMatch(/visibility/);
  expect(code).toMatch(/visibility_off/);
  expect(code).toMatch(/createPortal/);
});

test('MenuBar imports and mounts MenuTabCustomizeModal and renders customize button', () => {
  const code = fs.readFileSync(path.join(dirname, 'MenuBar.jsx'), 'utf8');
  expect(code).toMatch(/import MenuTabCustomizeModal from '\.\/MenuTabCustomizeModal\.jsx'/);
  expect(code).toMatch(/<MenuTabCustomizeModal/);
  expect(code).toMatch(/tune/);
  expect(code).toMatch(/menu\.customizeTabs\.button/);
  expect(code).toMatch(/onMoveMenu/);
  expect(code).toMatch(/onReorderMenu/);
  expect(code).toMatch(/onToggleHiddenMenu/);
  expect(code).toMatch(/onResetMenuPrefs/);
});

test('MenuBar renders icon on the left of tab title for every tab in VIEWS', () => {
  const code = fs.readFileSync(path.join(dirname, 'MenuBar.jsx'), 'utf8');
  expect(code).toMatch(/tab\.icon &&/);
  expect(code).toMatch(/material-symbols-outlined/);
});

test('ShellLayout passes customization handlers to MenuBar', () => {
  const code = fs.readFileSync(path.join(dirname, 'ShellLayout.jsx'), 'utf8');
  expect(code).toMatch(/onMoveMenu=\{handleMoveMenu\}/);
  expect(code).toMatch(/onReorderMenu=\{handleReorderMenu\}/);
  expect(code).toMatch(/onToggleHiddenMenu=\{toggleHiddenMenu\}/);
  expect(code).toMatch(/onResetMenuPrefs=\{handleResetMenuPrefs\}/);
});

test('ShellNavProvider exposes handleResetMenuPrefs', () => {
  const code = fs.readFileSync(path.join(dirname, 'ShellNavProvider.jsx'), 'utf8');
  expect(code).toMatch(/handleResetMenuPrefs/);
});

test('i18n defines all menu.customizeTabs keys in vi.js and en.js', () => {
  const viCode = fs.readFileSync(path.join(dirname, '../../i18n/locales/vi.js'), 'utf8');
  const enCode = fs.readFileSync(path.join(dirname, '../../i18n/locales/en.js'), 'utf8');

  const requiredKeys = [
    'menu.customizeTabs.button',
    'menu.customizeTabs.title',
    'menu.customizeTabs.hint',
    'menu.customizeTabs.fixed',
    'menu.customizeTabs.moveUp',
    'menu.customizeTabs.moveDown',
    'menu.customizeTabs.visible',
    'menu.customizeTabs.hidden',
    'menu.customizeTabs.minOneVisible',
    'menu.customizeTabs.reset',
    'menu.customizeTabs.done',
  ];

  for (const key of requiredKeys) {
    expect(viCode).toContain(`'${key}'`);
    expect(enCode).toContain(`'${key}'`);
  }
});

test('MenuTabCustomizeModal enforces at least one visible tab rule', () => {
  const code = fs.readFileSync(path.join(dirname, 'MenuTabCustomizeModal.jsx'), 'utf8');
  expect(code).toMatch(/visibleTabsCount/);
  expect(code).toMatch(/isLastVisible/);
});

test('ShellNavProvider prevents hiding all tabs and ensures at least one visible tab', () => {
  const code = fs.readFileSync(path.join(dirname, 'ShellNavProvider.jsx'), 'utf8');
  expect(code).toMatch(/visibleCount <= 1/);
});
