import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Crawler Tab Explore-First Unified UI Standard', () => {
  test('src/shared exposes StudioToolbarSlotProvider, StudioPrimaryActionSlot, and StudioRightToolbarSlot', () => {
    const slotFile = read('src/shared/layout/StudioToolbarSlot.jsx');
    const layoutIndex = read('src/shared/layout/index.js');
    const sharedIndex = read('src/shared/index.js');

    expect(slotFile).toContain('export function StudioToolbarSlotProvider');
    expect(slotFile).toContain('export function StudioPrimaryActionSlot');
    expect(slotFile).toContain('export function StudioRightToolbarSlot');
    expect(layoutIndex).toContain('StudioToolbarSlot');
    expect(sharedIndex).toContain('StudioToolbarSlotProvider');
    expect(sharedIndex).toContain('StudioPrimaryActionSlot');
    expect(sharedIndex).toContain('StudioRightToolbarSlot');
  });

  test('HomeWorkspace mounts StudioToolbarSlotProvider, home-primary-action-slot after HomeToolsDropdown, and home-right-toolbar-slot', () => {
    const home = read('src/features/home/HomeWorkspace.jsx');
    expect(home).toContain('StudioToolbarSlotProvider');
    expect(home).toContain('data-testid="home-primary-action-slot"');
    expect(home).toContain('pl-2.5 border-l border-outline-variant/25 ml-1');
    expect(home).toContain('data-testid="home-right-toolbar-slot"');

    const dropdownIdx = home.indexOf('<HomeToolsDropdown');
    const primarySlotIdx = home.indexOf('data-testid="home-primary-action-slot"');
    expect(dropdownIdx).toBeGreaterThan(-1);
    expect(primarySlotIdx).toBeGreaterThan(dropdownIdx);
  });

  test('Sidebar and MangaInfo follow Explore sidebar field, button, and badge standards', () => {
    const sidebar = read('src/features/download/components/Sidebar.jsx');
    const mangaInfo = read('src/features/download/components/MangaInfo.jsx');

    expect(sidebar).toMatch(/<SectionTitle[^>]*>\s*\{t\('sidebar\.sourceUrl'\)\}\s*<\/SectionTitle>/);
    const urlInputMatch = sidebar.match(/data-testid="url-input"[\s\S]{0,500}className="([^"]+)"/);
    expect(urlInputMatch).not.toBeNull();
    expect(urlInputMatch[1]).toContain('border border-outline-variant/25');
    expect(urlInputMatch[1]).not.toContain('border-none');

    const fetchBtnMatch = sidebar.match(/data-testid="fetch-button"[\s\S]{0,250}className=\{?["'`]([^"'`]+)["'`]\}?/);
    expect(fetchBtnMatch).not.toBeNull();
    expect(fetchBtnMatch[1]).toContain('bg-primary text-on-primary');

    expect(mangaInfo).not.toContain('bg-indigo-600');
    expect(mangaInfo).not.toContain('hover:bg-indigo-500');
    expect(mangaInfo).toContain('uppercase');
  });

  test('QueuePanel and QueueWorkflowSelector project toolbar CTAs, use h-10 filter bar, bordered h-8 w-8 row icons, and slim footer', () => {
    const queue = read('src/features/download/components/QueuePanel.jsx');
    const selector = read('src/features/download/components/QueueWorkflowSelector.jsx');

    expect(queue).toContain('StudioPrimaryActionSlot');
    expect(queue).toContain('StudioRightToolbarSlot');
    expect(queue).toContain('<StudioPrimaryActionSlot>');
    expect(queue).toContain('<StudioRightToolbarSlot>');
    expect(queue).not.toMatch(/\bh-11\b/);
    expect(selector).not.toMatch(/\bh-11\b/);
    expect(queue).toContain('h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest');
    expect(selector).toContain('h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest');
    expect(queue).toContain('border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md');
    expect(queue).toContain('rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums');
  });

  test('HistoryTab projects CTAs into StudioPrimaryActionSlot, uses h-10 filter bar, bordered h-8 w-8 row icons, and slim footer', () => {
    const history = read('src/features/library/HistoryTab.jsx');

    expect(history).toContain('StudioPrimaryActionSlot');
    expect(history).toContain('<StudioPrimaryActionSlot>');
    expect(history).not.toMatch(/\bh-11\b/);
    expect(history).toContain('h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest');
    expect(history).toContain('hover:border-error/30 hover:bg-error/10 hover:text-error');
    expect(history).toContain('border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md');
    expect(history).toContain('rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums');
  });

  test('OfflineLibraryTab and offline components match Explore toolbar, filter bar, bordered row actions, and slim footer', () => {
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const toolbar = read('src/features/library/components/offline/OfflineLibraryToolbar.jsx');
    const footer = read('src/features/library/components/offline/OfflineLibraryFooter.jsx');
    const listActions = read('src/features/library/components/offline/OfflineListActions.jsx');
    const bell = read('src/features/library/components/offline/FavoriteNotifyBell.jsx');

    expect(offlineTab).toContain('StudioPrimaryActionSlot');
    expect(offlineTab).toContain('StudioRightToolbarSlot');
    expect(offlineTab).toContain('ViewModeToggle');
    expect(offlineTab).toContain('size="md"');

    expect(toolbar).not.toContain('ViewModeToggle');
    expect(toolbar).not.toMatch(/\bh-11\b/);

    expect(footer).toContain('border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md');
    expect(footer).toContain('rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums');
    expect(footer).not.toContain('rounded-md');

    expect(listActions).toContain('h-8 w-8 rounded-lg border');
    expect(listActions).not.toContain('w-9 h-9 rounded-full');
    expect(bell).toContain('h-8 w-8 rounded-lg border');
    expect(bell).not.toContain('w-9 h-9 rounded-full');
  });

  test('touched Crawler files have zero native title= and zero underline classes', () => {
    const files = [
      'src/shared/layout/StudioToolbarSlot.jsx',
      'src/features/home/HomeWorkspace.jsx',
      'src/features/download/components/Sidebar.jsx',
      'src/features/download/components/MangaInfo.jsx',
      'src/features/download/components/QueuePanel.jsx',
      'src/features/download/components/QueueWorkflowSelector.jsx',
      'src/features/library/HistoryTab.jsx',
      'src/features/library/OfflineLibraryTab.jsx',
      'src/features/library/components/offline/OfflineLibraryToolbar.jsx',
      'src/features/library/components/offline/OfflineLibraryFooter.jsx',
      'src/features/library/components/offline/OfflineLibrarySidebar.jsx',
      'src/features/library/components/offline/OfflineLibrarySkeleton.jsx',
      'src/features/library/components/offline/OfflineCardActions.jsx',
      'src/features/library/components/offline/OfflineGridCard.jsx',
      'src/features/library/components/offline/OfflineListRow.jsx',
      'src/features/library/components/offline/OfflineListActions.jsx',
      'src/features/library/components/offline/OfflineChapterMeta.jsx',
      'src/features/library/components/offline/FavoriteNotifyBell.jsx',
      'src/features/download/components/ProgressPanel.jsx',
    ];
    for (const rel of files) {
      const code = read(rel);
      expect({
        rel,
        hasTitle: /<(?:button|a|span|div|td|th|input|svg)\b[^>]*\btitle\s*=/.test(code),
      }).toEqual({ rel, hasTitle: false });
      expect({ rel, hasUnderline: /\b(?:hover:)?underline\b/.test(code) }).toEqual({ rel, hasUnderline: false });
    }
  });

  test('Crawler UX polish: inline footer ProgressPanel, Sidebar 3-row alignment, adaptive Start/Pause, edge-to-edge filter bars, status pills', () => {
    const progress = read('src/features/download/components/ProgressPanel.jsx');
    const queue = read('src/features/download/components/QueuePanel.jsx');
    const selector = read('src/features/download/components/QueueWorkflowSelector.jsx');
    const sidebar = read('src/features/download/components/Sidebar.jsx');
    const history = read('src/features/library/HistoryTab.jsx');
    const offlineToolbar = read('src/features/library/components/offline/OfflineLibraryToolbar.jsx');

    expect(progress).toContain('compact = false');
    expect(progress).toContain('bg-outline-variant/25');

    // QueuePanel inline progress in slim bottom footer + adaptive CTA + contextual clearable + edge-to-edge search + status pills + unified expand
    expect(queue).toContain('<ProgressPanel');
    expect(queue).toContain('compact');
    expect(queue).toContain('clearableCount');
    expect(queue).toContain('hasClearable ?');
    expect(queue).not.toContain('max-w-xl');
    expect(queue).not.toContain('md:hidden');
    expect(queue).toContain('bg-outline-variant/25');
    expect(queue).toContain('border-amber-500/25 bg-amber-500/10');
    expect(queue).toMatch(/queueProcessing \|\| hasActiveDownload \?/);

    // QueueWorkflowSelector uses expand_more matching SearchableSelect
    expect(selector).toContain('expand_more');
    expect(selector).not.toContain('arrow_drop_down');

    // Sidebar 3-row 5.5rem alignment + neutral/amber Cookie button + Open Site Homepage button
    const siteMatches = sidebar.match(/grid-cols-\[minmax\(0,1fr\)_5\.5rem\]/g) || [];
    expect(siteMatches.length).toBeGreaterThanOrEqual(3);
    expect(sidebar).toContain("t('sidebar.openSiteHomepage')");
    expect(sidebar).toContain('open_in_new');
    expect(sidebar).toContain('selectedConnector?.requiresCookie');

    // Full-width filter bars in History & Offline Library
    expect(history).not.toContain('max-w-xl');
    expect(offlineToolbar).not.toContain('max-w-xl');
  });

  test('In-queue error tools & zero History UI: 2 primary Crawler tabs, Manga-level bug_report beside trash, and React Portal Error Modal', () => {
    const home = read('src/features/home/HomeWorkspace.jsx');
    const queue = read('src/features/download/components/QueuePanel.jsx');

    // HomeWorkspace has only 2 core primary tabs (queue, offlineRead), migrates saved history tab, and mounts zero History UI
    const tabsMatch = home.match(/const TABS = \[[\s\S]*?\];/);
    expect(tabsMatch).not.toBeNull();
    expect(tabsMatch[0]).toContain("id: 'queue'");
    expect(tabsMatch[0]).toContain("id: 'offlineRead'");
    expect(tabsMatch[0]).not.toContain("id: 'history'");
    expect(home).toMatch(/activeTab === 'history'/);
    expect(home).not.toContain('open-history-modal-btn');
    expect(home).not.toContain('history-modal-backdrop');
    expect(home).not.toContain('<HistoryTab');
    expect(home).toContain('chapterFolder={chapterFolder}');

    // QueuePanel error tools: portal modal, shared historyCsv helpers, export CTA, Manga-level bug_report beside delete
    expect(queue).toContain('createPortal');
    expect(queue).toContain("from '../../../utils/historyCsv'");
    expect(queue).toContain('buildErrorDetailText');
    expect(queue).toContain('exportErrorRowsToCsv');
    expect(queue).toContain('data-testid="queue-export-error-csv-btn"');
    expect(queue).toContain('w-64 min-w-[256px]');
    expect(queue).toContain('data-testid="queue-group-bug-btn"');
    expect(queue).toContain('bug_report');
    expect(queue).toContain('data-testid="queue-error-modal-backdrop"');
    expect(queue).toContain('id="queue-error-detail-title"');
  });

  test('OfflineLibraryTab renders dedicated contextual OfflineLibrarySidebar via StudioLeftSidebarSlot', () => {
    const slotFile = read('src/shared/layout/StudioToolbarSlot.jsx');
    const sharedIndex = read('src/shared/index.js');
    const home = read('src/features/home/HomeWorkspace.jsx');
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const offlineSidebar = read('src/features/library/components/offline/OfflineLibrarySidebar.jsx');

    expect(slotFile).toContain('export function StudioLeftSidebarSlot');
    expect(slotFile).toContain('export function useHasLeftSidebarSlot');
    expect(sharedIndex).toContain('StudioLeftSidebarSlot');
    expect(sharedIndex).toContain('useHasLeftSidebarSlot');

    expect(home).toContain('leftSidebarEl={leftSidebarEl}');
    expect(home).toContain('data-testid="home-left-sidebar-slot"');
    expect(home).toContain('onBrowseSavePath={handleBrowse}');

    expect(offlineTab).toContain('StudioLeftSidebarSlot');
    expect(offlineTab).toContain('useHasLeftSidebarSlot');
    expect(offlineTab).toContain('<OfflineLibrarySidebar');

    expect(offlineSidebar).toContain('data-testid="offline-library-sidebar"');
    expect(offlineSidebar).toContain('SectionTitle');
    expect(offlineSidebar).toContain('SearchableSelect');
    expect(offlineSidebar).toContain('role="group"');
    expect(offlineSidebar).toContain('h-10');
    expect(offlineSidebar).toContain('hasNew');
    expect(offlineSidebar).toContain('extraPaths');
    expect(offlineSidebar).toContain('stats');
  });

  test('OfflineLibraryTab opens reader on cover/row/card click and replaces read action icon with Fetch-to-Queue button', () => {
    const provider = read('src/features/library/LibraryProvider.jsx');
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const gridCard = read('src/features/library/components/offline/OfflineGridCard.jsx');
    const listRow = read('src/features/library/components/offline/OfflineListRow.jsx');
    const listActions = read('src/features/library/components/offline/OfflineListActions.jsx');
    const cardActions = read('src/features/library/components/offline/OfflineCardActions.jsx');

    expect(provider).toContain('focusQueueTab');
    expect(provider).toMatch(/fetchMangaFromFavorite\s*=\s*useCallback\([\s\S]*?focusQueueTab/);
    expect(provider).toMatch(/fetchMangaFromOfflineLibrary\s*=\s*useCallback\([\s\S]*?(?:focusQueueTab|fetchMangaFromFavorite)/);

    expect(offlineTab).toContain('<OfflineListRow');
    expect(offlineTab).toContain('onOpenRow={handleOpenRow}');
    expect(offlineTab).toContain('onFetchRow={handleFetchRow}');
    expect(listRow).toContain('onClick={() => onOpenRow?.(row)}');
    expect(listRow).toMatch(/<QueueCoverThumb[\s\S]*?\/>/);
    expect(listRow).not.toMatch(/<QueueCoverThumb[\s\S]*?onFetch=/);

    expect(gridCard).toContain('onClick=');
    expect(gridCard).toContain('onFetchRow=');
    expect(gridCard).not.toMatch(/<QueueCoverThumb[\s\S]*?onFetch=/);

    for (const actionsCode of [listActions, cardActions]) {
      expect(actionsCode).toContain('data-testid="offline-row-fetch-btn"');
      expect(actionsCode).toContain('>sync<');
      expect(actionsCode).not.toContain('cloud_download');
      expect(actionsCode).toContain("t('offlineLibrary.fetchToQueueTooltip')");
      expect(actionsCode).not.toContain('auto_stories');
    }
  });

  test('OfflineLibraryTab omits toolbar root folder button and keeps row/card open-folder button visible (disabled when not local)', () => {
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const listRow = read('src/features/library/components/offline/OfflineListRow.jsx');
    const chapterMeta = read('src/features/library/components/offline/OfflineChapterMeta.jsx');
    const gridCard = read('src/features/library/components/offline/OfflineGridCard.jsx');
    const listActions = read('src/features/library/components/offline/OfflineListActions.jsx');
    const cardActions = read('src/features/library/components/offline/OfflineCardActions.jsx');

    expect(offlineTab).not.toContain('data-testid="offline-open-library-folder-btn"');
    expect(listRow).toMatch(/offline-list-row-actions[\s\S]{0,120}stopPropagation/);
    expect(listRow).toContain("typeof onEnqueuePendingChapters === 'function'");
    expect(chapterMeta).toMatch(/stopPropagation\(\);[\s\S]{0,60}onEnqueuePending\(\)/);
    expect(gridCard).toContain('pointer-events-auto');
    expect(gridCard).toMatch(/pointer-events-auto[\s\S]{0,120}stopPropagation/);

    for (const actionsCode of [listActions, cardActions]) {
      expect(actionsCode).toContain('data-testid="offline-row-open-folder-btn"');
      expect(actionsCode).toContain('disabled={!canOpenFolder}');
      expect(actionsCode).toContain('disabled:pointer-events-none');
      expect(actionsCode).toContain("t('offlineLibrary.folderNotDownloadedTooltip')");
      expect(actionsCode).toContain('canOpenOfflineRowFolder');
      expect(actionsCode).toContain('openOfflineRowFolder');
    }
  });

  test('OfflineLibrary only shows local downloaded rows with chapters and never injects onlineOnlyFavorites', () => {
    const utils = read('src/features/library/components/offline/offlineLibraryUtils.js');
    const dataHook = read('src/features/library/components/offline/useOfflineLibraryData.js');
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');

    expect(utils).toContain('export function isDownloadedOfflineRow');
    expect(utils).toContain('export function buildOfflineDisplayRows');
    expect(utils).toContain('.filter(isDownloadedOfflineRow)');

    expect(dataHook).toContain('buildOfflineDisplayRows');
    expect(dataHook).not.toContain('onlineOnlyFavorites');
    expect(dataHook).not.toContain("source: 'favorite'");
    expect(dataHook).not.toContain('onRemoveFavorite');

    expect(offlineTab).toContain('stats.favorites > 0');
    expect(offlineTab).not.toContain('favorites.length > 0');
  });

  test('OfflineLibrary moves Reset Filters out of sidebar into filtered EmptyState action', () => {
    const offlineSidebar = read('src/features/library/components/offline/OfflineLibrarySidebar.jsx');
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');

    expect(offlineSidebar).not.toContain('offlineLibrary.sidebar.resetFilters');
    expect(offlineSidebar).not.toContain('filter_alt_off');
    expect(offlineSidebar).not.toContain('onResetFilters');

    expect(offlineTab).toContain("t('offlineLibrary.sidebar.resetFilters')");
    expect(offlineTab).toContain('filter_alt_off');
    expect(offlineTab).toContain('handleResetFilters');
  });

  test('OfflineLibraryTab renders Rescan Library as Explore-style primary CTA button', () => {
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const vi = read('src/i18n/locales/vi.js');
    const en = read('src/i18n/locales/en.js');

    expect(vi).toContain("'offlineLibrary.rescanLibrary'");
    expect(en).toContain("'offlineLibrary.rescanLibrary'");

    const primarySlot =
      offlineTab.match(/<StudioPrimaryActionSlot>([\s\S]*?)<\/StudioPrimaryActionSlot>/)?.[1] || '';
    expect(primarySlot).toContain('data-testid="offline-rescan-btn"');
    expect(primarySlot).toContain("t('offlineLibrary.rescanLibrary')");
    expect(primarySlot).toMatch(
      /data-testid="offline-rescan-btn"[\s\S]*h-8 px-3\.5[\s\S]*rounded-lg[\s\S]*bg-primary[\s\S]*text-xs font-semibold[\s\S]*text-on-primary[\s\S]*gap-1\.5[\s\S]*animate-spin[\s\S]*>[\s\S]*refresh[\s\S]*onClick=\{addFolder\}/
    );
    expect(primarySlot).toMatch(
      /onClick=\{addFolder\}[\s\S]{0,260}border-outline-variant\/25 bg-surface-container-highest/
    );
    expect(primarySlot).not.toMatch(/onClick=\{addFolder\}[\s\S]{0,260}bg-primary\b/);
    expect(offlineTab).not.toMatch(
      /<StudioRightToolbarSlot>[\s\S]*handleManualRefresh[\s\S]*<\/StudioRightToolbarSlot>/
    );
    expect(offlineTab.match(/handleManualRefresh\(/g)).toHaveLength(1);
  });

  test('OfflineLibraryTab main content matches FollowedMangaPanel list-card and grid layout (no StudioTable)', () => {
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const listRow = read('src/features/library/components/offline/OfflineListRow.jsx');

    expect(offlineTab).not.toContain('StudioTable');
    expect(offlineTab).toContain('custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6 bg-surface');
    expect(offlineTab).toContain('flex flex-col gap-2');
    expect(offlineTab).toContain('grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6');

    expect(listRow).toContain('px-3 py-2.5 sm:px-4 rounded-xl border');
    expect(listRow).toContain('h-14 w-10 sm:h-16 sm:w-11');
    expect(listRow).toContain('rounded-lg');
    expect(listRow).toContain(
      'text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0'
    );
  });

  test('OfflineLibraryTab renders Explore-style OfflineLibrarySkeleton during rescan, update check, and foreground loading', () => {
    const skeleton = read('src/features/library/components/offline/OfflineLibrarySkeleton.jsx');
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const dataHook = read('src/features/library/components/offline/useOfflineLibraryData.js');
    const provider = read('src/features/library/LibraryProvider.jsx');
    const vi = read('src/i18n/locales/vi.js');
    const en = read('src/i18n/locales/en.js');

    expect(vi).toContain("'offlineLibrary.rescanningStatus'");
    expect(en).toContain("'offlineLibrary.rescanningStatus'");

    expect(skeleton).toContain('React.memo');
    expect(skeleton).toContain('data-testid="offline-library-skeleton"');
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).toContain('role="status"');
    expect(skeleton).toContain('animate-pulse');
    expect(skeleton).toContain('h-14 w-10 sm:h-16 sm:w-11');
    expect(skeleton).toContain('px-3 py-2.5 sm:px-4 rounded-xl border');
    expect(skeleton).toContain(
      'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
    );

    expect(dataHook).toContain('isForegroundLoading');
    expect(dataHook).toContain('isRescanning');
    expect(dataHook).toMatch(/if\s*\(!isBackground\)[\s\S]{0,120}setIsForegroundLoading\(true\)/);
    expect(dataHook).toContain('foregroundRequestsRef.current = Math.max(0, foregroundRequestsRef.current - 1)');

    expect(provider).toContain('fetchAllFavoritesBusyRef.current = true');
    expect(provider).toMatch(/if\s*\(!fromBackground\)\s*\{\s*setFetchAllFavoritesBusy\(true\)/);
    expect(provider).toMatch(/if\s*\(!fromBackground\)\s*\{\s*setFetchAllFavoritesBusy\(false\)/);

    expect(offlineTab).toContain('showSkeleton');
    expect(offlineTab).toContain('<OfflineLibrarySkeleton');
    expect(offlineTab).toContain('disabled={isForegroundLoading || isRescanning || fetchAllFavoritesBusy || !base}');
    expect(offlineTab).toContain('disabled={fetchAllFavoritesBusy || isForegroundLoading || isRescanning}');
    expect(offlineTab).not.toMatch(/disabled=\{[^}]*\bloading\b/);
    const skelIdx = offlineTab.indexOf('<OfflineLibrarySkeleton');
    const emptyIdx = offlineTab.indexOf('{libraryEmptyState}');
    expect(skelIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(skelIdx);
  });
});
