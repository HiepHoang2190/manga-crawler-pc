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
    expect(queue).toContain('<StudioPrimaryActionSlot>');
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
    expect(queue).toContain('data-testid="queue-list-row-actions"');
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
    expect(chapterMeta).not.toContain('onEnqueuePending');
    expect(chapterMeta).not.toContain('newChaptersPending');
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

  test('OfflineLibraryTab renders Explore-style OfflineLibrarySkeleton during rescan and foreground loading', () => {
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
    expect(offlineTab).toContain('disabled={isForegroundLoading || isRescanning || !base}');
    expect(offlineTab).not.toMatch(/disabled=\{[^}]*\bloading\b/);
    const skelIdx = offlineTab.indexOf('<OfflineLibrarySkeleton');
    const emptyIdx = offlineTab.indexOf('{libraryEmptyState}');
    expect(skelIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(skelIdx);
  });

  test('OfflineLibraryTab focuses purely on offline library (no Check Updates, Notify Bell, or Has-New watchlist overlap)', () => {
    const offlineTab = read('src/features/library/OfflineLibraryTab.jsx');
    const offlineSidebar = read('src/features/library/components/offline/OfflineLibrarySidebar.jsx');
    const offlineToolbar = read('src/features/library/components/offline/OfflineLibraryToolbar.jsx');
    const listRow = read('src/features/library/components/offline/OfflineListRow.jsx');
    const gridCard = read('src/features/library/components/offline/OfflineGridCard.jsx');
    const listActions = read('src/features/library/components/offline/OfflineListActions.jsx');
    const cardActions = read('src/features/library/components/offline/OfflineCardActions.jsx');

    expect(offlineTab).toContain('onToggleFavorite');
    expect(offlineTab).toContain('FavoriteNotifyBell');
    expect(offlineTab).toContain('data-testid="offline-rescan-btn"');
    expect(offlineTab).not.toContain('onFetchAllFavorites');
    expect(offlineTab).not.toContain('fetchAllFavoritesBusy');
    expect(offlineTab).not.toContain('checkAllUpdates');
    expect(offlineTab).not.toContain('onToggleFavoriteNotifyWatch');
    expect(offlineTab).not.toContain('onEnqueuePendingChapters');
    expect(offlineTab).not.toContain('favoriteSyncById');
    expect(offlineTab).not.toContain('favoriteTabBadgeReadById');
    expect(offlineTab).not.toContain('connectors');

    expect(offlineSidebar).toContain('filterSourceAll');
    expect(offlineSidebar).toContain('filterSourceSave');
    expect(offlineSidebar).toContain('filterSourceExtra');
    expect(offlineSidebar).toContain('filterSourceArchives');
    expect(offlineSidebar).not.toContain('filterSourceFavorites');
    expect(offlineSidebar).not.toContain('filterSourceHasNew');
    expect(offlineSidebar).not.toContain('hasNewFirst');
    expect(offlineSidebar).not.toContain('favoritesCount');
    expect(offlineSidebar).not.toContain('newUpdatesCount');

    expect(offlineToolbar).not.toContain('filterSourceFavorites');
    expect(offlineToolbar).not.toContain('filterSourceHasNew');

    for (const actionsCode of [listActions, cardActions]) {
      expect(actionsCode).toContain('data-testid="offline-row-fetch-btn"');
      expect(actionsCode).not.toContain('FavoriteNotifyBell');
      expect(actionsCode).not.toContain('onToggleNotifyWatch');
    }

    for (const itemCode of [listRow, gridCard]) {
      expect(itemCode).not.toContain('onEnqueuePendingChapters');
      expect(itemCode).not.toContain('onToggleFavoriteNotifyWatch');
      expect(itemCode).not.toContain('sync=');
      expect(itemCode).not.toContain('onEnqueuePending');
      expect(itemCode).not.toContain('isBadgeUnread');
    }
  });

  test('OfflineLibrary grid cards reuse shared MangaCard and omit redundant local path text in both grid and list views', () => {
    const gridCard = read('src/features/library/components/offline/OfflineGridCard.jsx');
    const listRow = read('src/features/library/components/offline/OfflineListRow.jsx');

    expect(gridCard).toMatch(/import\s*\{[^}]*\bMangaCard\b[^}]*\}\s*from\s*['"][^'"]*shared['"]/);
    expect(gridCard).toContain('<MangaCard');

    for (const itemCode of [gridCard, listRow]) {
      expect(itemCode).not.toContain('row.absolutePath');
      expect(itemCode).not.toContain('row.sourceFile');
      expect(itemCode).not.toContain('offlineLibrary.lastExtractedSourceFile');
    }
  });

  test('QueuePanel replaces StudioTable with Explore/OfflineLibrary-style Task List Cards and clean EmptyState', () => {
    const queue = read('src/features/download/components/QueuePanel.jsx');
    const vi = read('src/i18n/locales/vi.js');
    const en = read('src/i18n/locales/en.js');

    expect(queue).not.toContain('StudioTable');
    expect(queue).not.toContain('QueueQueueMobileCard');
    expect(queue).toContain('data-testid="queue-list-cards"');
    expect(queue).toContain('space-y-2.5');
    expect(queue).toContain('data-testid="queue-task-card"');
    expect(queue).toContain('queueIndexById');
    expect(queue).not.toMatch(/data-testid="queue-task-card"[\s\S]{0,600}overflow-hidden/);
    expect(queue).toContain('data-testid="queue-selection-bar"');
    expect(queue).toContain('data-testid="queue-expanded-chapters"');
    expect(queue).toContain('rounded-b-xl');
    expect(queue).toContain('h-14 w-10 sm:h-16 sm:w-11');
    expect(queue).toContain('queue.emptyTitle');
    expect(queue).toContain('queue.resetFilters');
    expect(queue).toContain('queue.selectAll');
    expect(queue).toContain('queue.selectedCount');

    for (const locale of [vi, en]) {
      expect(locale).toContain("'queue.emptyTitle':");
      expect(locale).toContain("'queue.selectAll':");
      expect(locale).toContain("'queue.selectedCount':");
      expect(locale).toContain("'queue.resetFilters':");
    }
  });

  test('QueuePanel PA 1 compact header: workflow selector beside Start with createPortal, single inline selection+filter bar, no 3-tier sub-toolbar', () => {
    const queue = read('src/features/download/components/QueuePanel.jsx');
    const selector = read('src/features/download/components/QueueWorkflowSelector.jsx');
    const home = read('src/features/home/HomeWorkspace.jsx');

    expect(selector).toMatch(/size\s*=\s*['"]md['"]/);
    expect(selector).toContain("size === 'sm'");
    expect(selector).toContain('h-8 px-2.5 rounded-lg');
    expect(selector).toContain('max-w-[280px]');
    expect(selector).toContain('createPortal');
    expect(selector).toContain('document.body');

    expect(home).toMatch(/<StudioLayout\.Toolbar[\s\S]{0,120}className="z-50"/);

    expect(queue).not.toContain('border-b border-outline-variant/15 bg-surface-container-low/40');

    const primarySlot = queue.match(/<StudioPrimaryActionSlot>([\s\S]*?)<\/StudioPrimaryActionSlot>/);
    expect(primarySlot).not.toBeNull();
    expect(primarySlot[1]).not.toContain('queue.removeSelected');
    const startIdx = primarySlot[1].indexOf('queue.start');
    const wfIdx = primarySlot[1].indexOf('<QueueWorkflowSelector');
    expect(startIdx).toBeGreaterThan(-1);
    expect(wfIdx).toBeGreaterThan(startIdx);
    expect(primarySlot[1]).toContain('size="sm"');
    expect(queue).not.toContain('<StudioRightToolbarSlot>');

    const selBarMatch = queue.match(/data-testid="queue-selection-bar"[\s\S]*?<ul data-testid="queue-list-cards"/);
    expect(selBarMatch).not.toBeNull();
    expect(queue).toMatch(/function QueueDragHandle[\s\S]*?h-6 w-6/);
    expect(selBarMatch[0]).toContain('pl-[13px] sm:pl-[17px]');
    expect(selBarMatch[0]).toContain('w-6 shrink-0');
    expect(selBarMatch[0]).toContain('data-testid="queue-remove-selected-btn"');
    expect(selBarMatch[0]).toContain('<SearchableSelect');
    expect(selBarMatch[0]).toContain('size="sm"');
    expect(selBarMatch[0]).toMatch(/<SearchableSelect[\s\S]*?data-testid="queue-clear-completed-btn"/);
  });

  test('Sidebar renders default MangaInfoEmptyCard below divider when no manga is fetched yet', () => {
    const sidebar = read('src/features/download/components/Sidebar.jsx');
    const vi = read('src/i18n/locales/vi.js');
    const en = read('src/i18n/locales/en.js');

    expect(sidebar).toMatch(/import\s+MangaInfo\s*,\s*\{\s*MangaInfoEmptyCard\s*\}\s+from\s+['"]\.\/MangaInfo(?:\.jsx)?['"]/);
    expect(sidebar).toMatch(/<div className="h-px bg-outline-variant\/20"\s*\/>\s*\{manga\s*\?/);
    expect(sidebar).toContain('<MangaInfoEmptyCard');
    expect(sidebar).toMatch(/<MangaInfoEmptyCard[\s\S]*loading=\{Boolean\(loading\)\}/);
    expect(sidebar).toMatch(/<MangaInfoEmptyCard[\s\S]*selectedSiteLabel=\{selectedConnector\?\.label \|\| ''\}/);

    const emptyKeys = [
      "'mangaInfo.emptyTitle':",
      "'mangaInfo.emptyLoadingTitle':",
      "'mangaInfo.emptyCoverLabel':",
      "'mangaInfo.emptySourcePlaceholder':",
      "'mangaInfo.emptyDescription':",
      "'mangaInfo.emptyLoadingDescription':",
      "'mangaInfo.emptyActionDisabledTooltip':",
    ];
    for (const locale of [vi, en]) {
      for (const k of emptyKeys) {
        expect(locale).toContain(k);
      }
    }
  });
});
