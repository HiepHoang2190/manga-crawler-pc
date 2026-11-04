import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('ThemeContext.jsx exports AVAILABLE_THEMES with all 12 curated themes', () => {
  const src = fs.readFileSync(path.join(dirname, 'ThemeContext.jsx'), 'utf8');
  expect(src).toContain('export const AVAILABLE_THEMES');
  const themeIds = [
    'violet',
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
  for (const id of themeIds) {
    expect(src).toContain(`'${id}'`);
  }
});

test('ThemeContext.jsx handles data-theme attribute and preset persistence', () => {
  const src = fs.readFileSync(path.join(dirname, 'ThemeContext.jsx'), 'utf8');
  expect(src).toContain('manga-crawler-theme-preset');
  expect(src).toContain('setAttribute(\'data-theme\'');
  expect(src).toContain('presetTheme');
  expect(src).toContain('setPresetTheme');
});
