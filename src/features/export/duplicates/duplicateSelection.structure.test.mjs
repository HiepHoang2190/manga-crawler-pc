import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tabPath = path.join(__dirname, 'DuplicateFinderTab.jsx');

describe('DuplicateFinder Smart Check All tests', () => {
  const src = fs.readFileSync(tabPath, 'utf8');

  test('Auto-selects all duplicate images after scan completes', () => {
    // Must add all duplicateImages into autoSelected (check all)
    expect(src).toMatch(/for\s*\(\s*const\s+img\s+of\s+duplicateImages\s*\)\s*\{\s*autoSelected\.add\(img\.fullPath\);?\s*\}/);
  });

  test('allDisplayedChecked checks displayedItems.every', () => {
    expect(src).toMatch(/allDisplayedChecked[\s\S]*?displayedItems\.every\(\(item\)\s*=>\s*selectedForDelete\.has\(item\.fullPath\)\)/);
  });

  test('Group header checkbox uses allItemsChecked for check_box state', () => {
    expect(src).toMatch(/group\.allItemsChecked[\s\S]*?\?\s*['"]check_box['"]/);
  });

  test('handleToggleSelectAll adds all displayedItems when not all checked', () => {
    expect(src).toMatch(/handleToggleSelectAll[\s\S]*?for\s*\(\s*const\s+item\s+of\s+displayedItems\s*\)\s*next\.add\(item\.fullPath\)/);
  });

  test('Auto-collapses all duplicate groups after scan completes', () => {
    expect(src).toMatch(/setCollapsedGroups\s*\(\s*collectAllGroupIds\s*\(\s*duplicateImages\s*\)\s*\)/);
  });
});

describe('DuplicateFinder UI & UX upgrade structure', () => {
  const src = fs.readFileSync(tabPath, 'utf8');
  const rootDir = path.resolve(__dirname, '../../../..');
  const vi = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/vi.js'), 'utf8');
  const en = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/en.js'), 'utf8');

  test('uses size="sm" and showPlaceholderOption={false} on both SearchableSelect controls in toolbar', () => {
    const selects = src.match(/<SearchableSelect[\s\S]*?\/>/g) || [];
    expect(selects.length).toBe(2);
    for (const sel of selects) {
      expect(sel).toContain('size="sm"');
      expect(sel).toContain('showPlaceholderOption={false}');
    }
  });

  test('consolidates selection actions into single-row toolbar and removes redundant status filter dropdown', () => {
    expect(src).toContain('resolveDuplicateSelectionPreset');
    expect(src).toContain('selectionPresetOptions');
    expect(src).toContain('data-testid="duplicate-delete-selected-btn"');
    expect(src).toContain("t('duplicateTab.deleteSelectedWithSize'");
    expect(src).toContain("t('duplicateTab.keepOneOriginal')");
    expect(src).not.toContain('filterStatus');
    expect(src).not.toContain('filterOptions');
    expect(src).not.toContain('duplicateTab.filterAllDuplicates');
    expect(src).not.toContain('duplicateTab.algorithmHint');
    expect(src).toMatch(/hasSource && hasItemsToDisplay[\s\S]{0,300}flex-nowrap/);
    expect(src).toContain('disabled={displayedItems.length === 0}');
  });

  test('renders amber warning badge when all originals in group are selected for deletion', () => {
    expect(src).toContain('allOriginalsChecked');
    expect(src).toContain('data-testid="duplicate-group-all-selected-warning"');
    expect(src).toContain("t('duplicateTab.allOriginalsSelectedWarning')");
  });

  test('imports and wires applyDuplicateRangeSelection & computeSelectedDuplicateStats with Shift+click', () => {
    expect(src).toContain('applyDuplicateRangeSelection');
    expect(src).toContain('computeSelectedDuplicateStats');
    expect(src).toContain('lastClickedIndexRef');
    expect(src).toContain('e.shiftKey');
  });

  test('uses EmptyState and renders slim bottom summary footer', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bEmptyState\b[^}]*\}\s*from\s*['"][^'"]*shared['"]/);
    expect(src).toContain('<EmptyState');
    expect(src).not.toContain("t('sourcePicker.selectFolder')");
    expect(src).toContain('data-testid="duplicate-summary-footer"');
  });

  test('uses uniform h-8 w-8 rounded-lg border row action buttons and close icon for handleRemoveItem', () => {
    expect(src).toContain('h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest');
    const removeBtnMatch = src.match(/<button[\s\S]{0,200}handleRemoveItem\(item\.fullPath\)[\s\S]{0,800}<\/button>/);
    expect(removeBtnMatch).not.toBeNull();
    expect(removeBtnMatch[0]).toContain('>close</span>');
    expect(removeBtnMatch[0]).not.toContain('>delete</span>');
  });

  test('renders Lightbox inline delete/keep toggle with Space shortcut', () => {
    const previewPathFile = path.join(__dirname, 'DuplicatePreviewModal.jsx');
    expect(fs.existsSync(previewPathFile)).toBe(true);
    const previewSrc = fs.readFileSync(previewPathFile, 'utf8');

    expect(previewSrc).toContain('data-testid="duplicate-preview-toggle-delete"');
    expect(src).toMatch(/e\.key\s*===\s*['"] ['"]/);
    expect(src).toContain('previewPath');
    expect(src).toContain('getVisibleSelectablePaths');
    expect(src).toContain('findNextPreviewPath');
    expect(src).toContain('totalGroupCount');
    expect(src).toMatch(/deleteConfirm',\s*\{\s*count:\s*selectedCount\s*\}/);
  });

  test('obeys UI standards: zero native title= and zero underline classes', () => {
    expect(/<(?:button|a|span|div|li|td|th|input|svg)\b[^>]*\btitle\s*=/.test(src)).toBe(false);
    expect(/\b(?:hover:)?underline\b/.test(src)).toBe(false);
  });

  test('syncs all new duplicateTab.* i18n keys between vi.js and en.js', () => {
    const keys = [
      "'duplicateTab.rescan':",
      "'duplicateTab.keepOneOriginal':",
      "'duplicateTab.allOriginalsSelectedWarning':",
      "'duplicateTab.deleteSelectedWithSize':",
      "'duplicateTab.resetFilters':",
      "'duplicateTab.clearSearch':",
      "'duplicateTab.footerGroupsSummary':",
      "'duplicateTab.footerSelectedSummary':",
      "'duplicateTab.footerPendingSummary':",
      "'duplicateTab.previewMarkedDelete':",
      "'duplicateTab.previewKeepImage':",
      "'duplicateTab.selectGroupCopies':",
      "'duplicateTab.unselectGroup':",
      "'duplicateTab.selectionCustom':",
      "'duplicateTab.selectionModeAria':",
      "'duplicateTab.overview.title':",
      "'duplicateTab.overview.totalImages':",
      "'duplicateTab.overview.duplicateGroups':",
      "'duplicateTab.overview.duplicateCopies':",
      "'duplicateTab.overview.reclaimable':",
      "'duplicateTab.overview.tip':",
      "'duplicateTab.previewShortcuts':",
    ];
    for (const locale of [vi, en]) {
      for (const k of keys) {
        expect(locale).toContain(k);
      }
    }
  });

  test('renders DuplicateFinderSkeleton with React.memo, aria-busy, role="status", and animate-pulse during scanning and loadingFiles', () => {
    const skeletonPath = path.join(__dirname, 'DuplicateFinderSkeleton.jsx');
    expect(fs.existsSync(skeletonPath)).toBe(true);
    const skeletonSrc = fs.readFileSync(skeletonPath, 'utf8');

    expect(skeletonSrc).toContain('React.memo');
    expect(skeletonSrc).toContain('data-testid="duplicate-finder-skeleton"');
    expect(skeletonSrc).toContain('aria-busy="true"');
    expect(skeletonSrc).toContain('role="status"');
    expect(skeletonSrc).toContain('animate-pulse');
    expect(skeletonSrc).toContain('w-12 h-12 sm:w-14 sm:h-14');
    expect(/<(?:button|a|span|div|li|ul|input|svg)\b[^>]*\btitle\s*=/.test(skeletonSrc)).toBe(false);
    expect(/\b(?:hover:)?underline\b/.test(skeletonSrc)).toBe(false);

    expect(src).toMatch(/import\s+DuplicateFinderSkeleton\s+from\s+['"]\.\/DuplicateFinderSkeleton(?:\.jsx)?['"]/);
    expect(src).toMatch(/<DuplicateFinderSkeleton[\s\S]*?mode="files"/);
    expect(src).toMatch(/<DuplicateFinderSkeleton[\s\S]*?mode="groups"/);
    expect(src).toMatch(/<DuplicateFinderSkeleton[\s\S]*?progress=\{scanProgress\}/);
    const guardMatches = src.match(/hasSource && hasItemsToDisplay && !scanning && !loadingFiles/g) || [];
    expect(guardMatches.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/hasSource && hasItemsToDisplay && !scanning && !loadingFiles[\s\S]{0,120}data-testid="duplicate-summary-footer"/);
  });

  test('renders sidebar Overview stats card matching Explore/OfflineLibrary pattern', () => {
    expect(src).toContain('data-testid="duplicate-overview-card"');
    expect(src).toContain('border-primary/15 bg-primary/5');
    expect(src).toContain('>bar_chart<');
    expect(src).toContain("t('duplicateTab.overview.title')");
    expect(src).toContain("t('duplicateTab.overview.totalImages')");
    expect(src).toContain("t('duplicateTab.overview.duplicateGroups')");
    expect(src).toContain("t('duplicateTab.overview.duplicateCopies')");
    expect(src).toContain("t('duplicateTab.overview.reclaimable')");
    expect(src).toContain("t('duplicateTab.overview.tip')");
  });

  test('group header unselect and select-copies buttons share uniform bordered style with active state highlight', () => {
    expect(src).toContain('onlyCopiesSelected');
    const copiesStart = src.indexOf('aria-pressed={group.onlyCopiesSelected}');
    const uncheckStart = src.indexOf('aria-pressed={!group.someItemsChecked}');
    expect(copiesStart).toBeGreaterThan(-1);
    expect(uncheckStart).toBeGreaterThan(-1);
    const copiesBtnStart = src.lastIndexOf('<button', copiesStart);
    const uncheckBtnStart = src.lastIndexOf('<button', uncheckStart);
    const copiesSlice = src.slice(copiesBtnStart, src.indexOf('</button>', copiesStart));
    const uncheckSlice = src.slice(uncheckBtnStart, src.indexOf('</button>', uncheckStart));
    for (const btn of [copiesSlice, uncheckSlice]) {
      expect(btn).toContain('border-primary/40 bg-primary/15 text-primary');
      expect(btn).toContain('border-outline-variant/25 bg-surface-container-highest');
    }
    expect(copiesSlice).toContain('selectOnlyGroupCopies(group)');
    expect(copiesSlice).toContain('disabled={group.copies.length === 0}');
    expect(uncheckSlice).toContain('uncheckGroup(group)');
    expect(src).toMatch(/selectOnlyGroupCopies\s*=\s*useCallback\(\(group\)\s*=>\s*\{\s*if\s*\(!group\?\.copies\?\.length\)\s*return;/);
  });

  test('renders theme-aware DuplicatePreviewModal without hardcoded black/white lightbox styles', () => {
    const previewFile = path.join(__dirname, 'DuplicatePreviewModal.jsx');
    expect(fs.existsSync(previewFile)).toBe(true);
    const previewSrc = fs.readFileSync(previewFile, 'utf8');

    expect(previewSrc).toContain('data-testid="duplicate-preview-modal"');
    expect(previewSrc).toContain('data-testid="duplicate-preview-toggle-delete"');
    expect(previewSrc).toContain('bg-surface text-on-surface');
    expect(previewSrc).toContain('bg-surface-container-low');
    expect(previewSrc).toContain("t('duplicateTab.previewShortcuts')");
    expect(previewSrc).toContain('modalRef');
    expect(previewSrc).toContain('broken_image');
    expect(previewSrc).toContain('min-h-0 min-w-0');
    expect((previewSrc.match(/data-tooltip=\{t\('duplicateTab\.prevImage'\)\}/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(previewSrc).not.toContain('bg-black/92');
    expect(previewSrc).not.toContain('text-white');
    expect(previewSrc).not.toContain('bg-white/10');
    expect(/<(?:button|a|span|div|li|ul|input|svg|img)\b[^>]*\btitle\s*=/.test(previewSrc)).toBe(false);
    expect(/\b(?:hover:)?underline\b/.test(previewSrc)).toBe(false);

    expect(src).toMatch(/import\s+DuplicatePreviewModal\s+from\s+['"]\.\/DuplicatePreviewModal(?:\.jsx)?['"]/);
    expect(src).toContain('<DuplicatePreviewModal');
    expect(src).toContain('previewError={previewError}');
    expect(src).toContain('setPreviewError(true)');
    expect(src).toMatch(/setStats\(\(prev\)\s*=>/);
    expect(src).not.toContain('bg-black/92');
  });
});
