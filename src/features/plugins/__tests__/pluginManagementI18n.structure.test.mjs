import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../../../..');

const panelPath = path.join(repoRoot, 'src/features/plugins/PluginManagementPanel.jsx');
const matrixPath = path.join(repoRoot, 'src/features/plugins/AnalysisProgressMatrix.jsx');
const statePath = path.join(repoRoot, 'src/features/plugins/analysisProgressState.mjs');
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
  const matrixSrc = fs.readFileSync(matrixPath, 'utf8');
  const stateSrc = fs.readFileSync(statePath, 'utf8');
  const viKeys = extractLocaleKeys(viPath);
  const enKeys = extractLocaleKeys(enPath);

  test('every t(...) key used in PluginManagementPanel, AnalysisProgressMatrix, and analysisProgressState exists in both vi.js and en.js', () => {
    const usedKeys = new Set([
      ...extractTranslationCalls(panelSrc),
      ...extractTranslationCalls(matrixSrc),
    ]);
    const labelKeyMatches = [...stateSrc.matchAll(/labelKey:\s*['"]([a-zA-Z0-9_.-]+)['"]/g)].map((m) => m[1]);
    for (const lk of labelKeyMatches) usedKeys.add(lk);

    const keyList = [...usedKeys];
    expect(keyList.length).toBeGreaterThan(20);

    const missingInVi = keyList.filter((k) => !viKeys.has(k));
    const missingInEn = keyList.filter((k) => !enKeys.has(k));

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

  test('AutoGeneratorWizard exposes CMS template badge, advanced selector overrides, latest updates toggle, and dry-run testing', () => {
    expect(panelSrc).toContain('data.template?.label');
    expect(panelSrc).toContain("t('plugins.autoGen.includeLatestUpdates')");
    expect(panelSrc).toContain("t('plugins.autoGen.advancedSelectors')");
    expect(panelSrc).toContain('testGeneratedPlugin');
    expect(panelSrc).toContain('data-testid="autogen-test-result"');
    expect(panelSrc).toContain("t('plugins.autoGen.strategyApiJson')");
    expect(panelSrc).toContain("'plugins.autoGen.strategyHtmlPaginated'");
    expect(panelSrc).toContain("t('plugins.autoGen.spaRenderWarning')");
    expect(panelSrc).toContain('fixed bottom-12');
    expect(panelSrc).toContain('animate-in fade-in');
    expect(panelSrc).toContain('subscribePluginAnalyzeProgress');
    expect(panelSrc).toContain('prepareChapterRetryMatrix');
    expect(panelSrc).toContain('AnalysisProgressMatrix');
    expect(matrixSrc).toContain('role="progressbar"');
    expect(matrixSrc).not.toMatch(/<(?:[a-z][a-zA-Z0-9-]*)\b[^>]*?\btitle=/);
    expect(matrixSrc).not.toMatch(/\b(?:hover:)?underline\b/);
  });
});
