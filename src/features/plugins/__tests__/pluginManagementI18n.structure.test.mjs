import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../../../..');

const panelPath = path.join(repoRoot, 'src/features/plugins/PluginManagementPanel.jsx');
const viPath = path.join(repoRoot, 'src/i18n/locales/vi.js');
const enPath = path.join(repoRoot, 'src/i18n/locales/en.js');

function extractLocaleKeys(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  const re = /^\s*['"]([a-zA-Z0-9_.-]+)['"]\s*:/gm;
  let match;
  while ((match = re.exec(src)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

function extractTranslationCalls(src) {
  const keys = new Set();
  const re = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    keys.add(match[1]);
  }
  return [...keys];
}

describe('PluginManagementPanel i18n & UI structure', () => {
  const panelSrc = fs.readFileSync(panelPath, 'utf8');
  const viKeys = extractLocaleKeys(viPath);
  const enKeys = extractLocaleKeys(enPath);

  test('every t(...) key used in PluginManagementPanel.jsx exists in both vi.js and en.js', () => {
    const usedKeys = extractTranslationCalls(panelSrc);
    expect(usedKeys.length).toBeGreaterThan(20);

    const missingInVi = usedKeys.filter((k) => !viKeys.has(k));
    const missingInEn = usedKeys.filter((k) => !enKeys.has(k));

    expect(missingInVi).toEqual([]);
    expect(missingInEn).toEqual([]);
    expect(viKeys.has('common.filter')).toBe(true);
    expect(enKeys.has('common.filter')).toBe(true);
  });

  test('PluginManagementPanel has zero hardcoded Vietnamese or English fallback UI strings', () => {
    const forbiddenLiterals = [
      'Không tìm thấy plugin phù hợp',
      'Thử thay đổi từ khóa',
      'Cài đặt plugin trực tiếp từ file',
      'Nhập đường link trực tiếp',
      'Đang tải code...',
      'Cập nhật plugin thất bại',
      'Could not load source',
      'Update failed',
      'Reload failed',
    ];

    for (const literal of forbiddenLiterals) {
      expect(panelSrc).not.toContain(literal);
    }
    expect(panelSrc).not.toMatch(/t\(\s*['"]common\.filter['"]\s*\)/);
  });

  test('Sidebar uses clean 2-column KPI grid without redundant segmented filter bar', () => {
    expect(panelSrc).toMatch(/className="grid grid-cols-2 gap-2"/);
    expect(panelSrc).not.toMatch(/grid-cols-3 gap-1 rounded-xl/);
    expect(panelSrc).toMatch(/statusFilter === 'url'/);
  });

  test('PluginSourceModal & confirmation dialogs meet accessibility and styling standards', () => {
    const roleDialogMatches = panelSrc.match(/role="dialog"/g) || [];
    expect(roleDialogMatches.length).toBeGreaterThanOrEqual(3);
    expect(panelSrc).toContain('aria-modal="true"');
    expect(panelSrc).not.toMatch(/<(?:[a-z][a-zA-Z0-9-]*|ResizeSplitter)\b[^>]*?\btitle=/);
    expect(panelSrc).not.toMatch(/\b(?:hover:)?underline\b/);
    expect(panelSrc).not.toContain('py-0.2');
  });
});
