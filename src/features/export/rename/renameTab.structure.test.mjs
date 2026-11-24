import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const localeDir = path.join(dirname, '../../../i18n/locales');

describe('RenameTab structure tests', () => {
  const renameSrc = fs.readFileSync(path.join(dirname, 'RenameTab.jsx'), 'utf8');

  test('RenameTab sets filterStatus default state to "all" so all imported folders/files display immediately', () => {
    expect(renameSrc).toMatch(/const\s+\[filterStatus,\s*setFilterStatus\]\s*=\s*useState\(['"]all['"]\)/);
  });

  test('RenameTab resets filterStatus to "all" and searchQuery when importing, switching mode, or clearing source', () => {
    for (const fnName of ['handleSelectRoot', 'handleSelectFiles', 'handleClearRoot', 'handleModeChange']) {
      const fnMatch = renameSrc.match(new RegExp(`const\\s+${fnName}\\s*=\\s*[\\s\\S]*?\\n  \\};`));
      expect({ fnName, matched: Boolean(fnMatch) }).toEqual({ fnName, matched: true });
      expect(fnMatch[0]).toContain("setFilterStatus('all')");
      expect(fnMatch[0]).toContain("setSearchQuery('')");
    }
    const modeMatch = renameSrc.match(/const\s+handleModeChange\s*=\s*[\s\S]*?\n  \};/);
    expect(modeMatch[0]).toContain('clearPreviewResults()');
  });

  test('RenameTab changed/unchanged filter predicates classify opType === "delete" under changed', () => {
    expect(renameSrc).toContain("r.opType !== 'unchanged' && !r.blocked && (r.opType === 'delete' || r.fromRel !== r.toRel)");
    expect(renameSrc).toContain("r.opType === 'unchanged' || (!r.blocked && r.opType !== 'delete' && r.fromRel === r.toRel)");
  });

  test('RenameTab defines filterOptions with changed, all, unchanged, and blocked', () => {
    expect(renameSrc).toMatch(/value:\s*['"]all['"]/);
    expect(renameSrc).toMatch(/value:\s*['"]changed['"]/);
    expect(renameSrc).toMatch(/value:\s*['"]unchanged['"]/);
    expect(renameSrc).toMatch(/value:\s*['"]blocked['"]/);
  });

  test('RenameTab integrates SearchableSelect for filterStatus', () => {
    expect(renameSrc).toMatch(/<SearchableSelect[\s\S]*?value=\{filterStatus\}[\s\S]*?onChange=\{\(val\)\s*=>\s*setFilterStatus\(val\)\}/);
  });

  test('RenameTab renders bottom-pinned Overview card matching DuplicateFinderTab', () => {
    expect(renameSrc).toContain('flex-1 flex flex-col overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5');
    expect(renameSrc).toContain('mt-auto pt-2');
    expect(renameSrc).toContain('data-testid="rename-overview-card"');
    expect(renameSrc).toContain('rounded-xl border border-primary/15 bg-primary/5 p-3');
    expect(renameSrc).toContain('bar_chart');
    expect(renameSrc).toContain('touch_app');
    for (const key of ['title', 'totalItems', 'willChange', 'selected', 'unchanged', 'blocked', 'tip']) {
      expect(renameSrc).toContain(`renameTab.overview.${key}`);
    }
  });

  test('RenameTab uses unified theme-aware error/result notification cards matching DuplicateFinderTab', () => {
    expect(renameSrc).not.toContain('text-green-400/90');
    expect(renameSrc).toContain('data-testid="rename-result-message"');
    expect(renameSrc).toContain('text-xs text-on-surface whitespace-pre-wrap border border-outline-variant/20 rounded-xl p-3 bg-surface-container-highest/50');
    expect(renameSrc).toContain('role="status"');
    expect(renameSrc).toContain('text-xs text-error whitespace-pre-wrap');
    expect(renameSrc).toContain('role="alert"');
  });

  test('vi.js and en.js define all renameTab.overview.* keys', () => {
    const viSrc = fs.readFileSync(path.join(localeDir, 'vi.js'), 'utf8');
    const enSrc = fs.readFileSync(path.join(localeDir, 'en.js'), 'utf8');
    for (const key of ['title', 'totalItems', 'willChange', 'selected', 'unchanged', 'blocked', 'tip']) {
      expect(viSrc).toContain(`'renameTab.overview.${key}'`);
      expect(enSrc).toContain(`'renameTab.overview.${key}'`);
    }
  });
});
