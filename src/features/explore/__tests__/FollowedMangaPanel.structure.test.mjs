import fs from 'node:fs';
import path from 'node:path';

describe('FollowedMangaPanel structure and standards', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/explore/components/FollowedMangaPanel.jsx');

  test('file exists and exports default FollowedMangaPanel component', () => {
    expect(fs.existsSync(panelPath)).toBe(true);
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toMatch(/export\s+default\s+function\s+FollowedMangaPanel/);
  });

  test('uses StudioLayout and useStudioLayout without duplicate ResizeSplitter', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('StudioLayout');
    expect(content).toContain('useStudioLayout');
    expect(content).toContain('handleLeftResizeStart');
    expect(content).not.toContain('<ResizeSplitter');
  });

  test('uses shared EmptyState component without native title or underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('EmptyState');
    expect(content).not.toMatch(/<(?:button|a)\b[^>]*\btitle\s*=/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });

  test('provides search input and filter buttons for status and web sources', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('filterFavorites');
    expect(content).toContain('computeFavoritesStats');
    expect(content).toContain('runFavoriteCheckQueue');
  });

  test('uses balanced responsive grid columns matching LatestUpdatesPanel and clean leftSlot with primary action slot', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('{subtabsSlot}');
    expect(content).toContain('data-testid="explore-primary-action-slot"');
    expect(content).toContain('grid-cols-2');
    expect(content).toContain('sm:grid-cols-3');
    expect(content).toContain('xl:grid-cols-5');
  });

  test('scopes status filter counts and overview to active siteFilter via activeStats', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('activeStats');
    expect(content).toContain('activePendingChaptersCount');
    expect(content).toMatch(/activeStats\.total/);
    expect(content).toMatch(/activeStats\.hasNewCount/);
  });

  test('action icon buttons have surrounding borders and do not use border-transparent', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/<(?:button|a)\b[^>]*\bborder-transparent\b/);
  });

  test('uses unified format_list_bulleted icon for view chapters and does not use media player play_arrow icon for view chapters', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('format_list_bulleted');
    expect(content).not.toMatch(/viewChapters[\s\S]{0,100}play_arrow/);
  });

  test('toolbar places main action button right after subtabsSlot in leftSlot and keeps ViewModeToggle in rightSlot', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const leftSlotMatch = content.match(/leftSlot=\{([\s\S]*?)\}\s*\n\s*rightSlot=/);
    const rightSlotMatch = content.match(/rightSlot=\{([\s\S]*?)\n\s*\}\s*\/>/);
    expect(leftSlotMatch).not.toBeNull();
    expect(rightSlotMatch).not.toBeNull();
    const leftSlotCode = leftSlotMatch[1];
    const rightSlotCode = rightSlotMatch[1];
    const subtabsIndex = leftSlotCode.indexOf('{subtabsSlot}');
    const checkAllIndex = leftSlotCode.indexOf('handleCheckAll');
    const enqueueAllIndex = leftSlotCode.indexOf('handleEnqueueAllNew');
    const viewModeIndex = rightSlotCode.indexOf('<ViewModeToggle');
    expect(subtabsIndex).toBeGreaterThan(-1);
    expect(checkAllIndex).toBeGreaterThan(subtabsIndex);
    expect(enqueueAllIndex).toBeGreaterThan(checkAllIndex);
    expect(rightSlotCode).not.toContain('handleCheckAll');
    expect(viewModeIndex).toBeGreaterThan(-1);
  });

  test('mounts ChaptersDrawer and integrates reading and queue actions', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('ChaptersDrawer');
    expect(content).toContain('chapterDrawerOpen');
    expect(content).toContain('onReadChapterOnline');
    expect(content).toContain('onReadChapter');
    expect(content).toContain('onAddSelectedToQueue');
  });

  test('handles loading state when fetching manga chapters', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('loadingMangaId');
    expect(content).toContain('progress_activity');
  });

  test('handles enqueuing state and preserves pendingChapters in sync', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('enqueuingMangaId');
    expect(content).toContain('pendingChapters');
  });

  test('toolbar includes enqueue all new chapters button when new chapters exist', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('handleEnqueueAllNew');
    expect(content).toContain('isEnqueuingAll');
    expect(content).toContain('followedManga.actions.enqueueAll');
  });

  test('primary action button in list mode is unified to viewChapters with error feedback', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('handleOpenManga');
    expect(content).toContain('followedManga.actions.viewChapters');
    expect(content).toContain('followedManga.error.cannotLoadChapters');
  });

  test('handleOpenManga syncs chapter frontier so download button appears if new chapters exist', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('computeAndSaveSync');
    const openMangaMatch = content.match(/const handleOpenManga = useCallback\([\s\S]*?\[fetchMangaChapters, computeAndSaveSync/);
    expect(openMangaMatch).not.toBeNull();
  });

  test('passes downloadState to FollowedMangaCard in grid mode and does not render header download banner', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('downloadState={getDownloadState(item)}');
    expect(content).not.toContain('bg-emerald-500/10 border-b border-emerald-500/20');
  });

  test('toolbar and cards provide queue pause and resume controls', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('onStartQueue');
    expect(content).toContain('onStopQueue');
    expect(content).toContain('unfinishedQueueCount');
    expect(content).toContain('followedManga.actions.pauseQueue');
    expect(content).toContain('followedManga.actions.resumeQueue');
    expect(content).toMatch(/onStartQueue\?\.?\(\s*\{\s*unpauseAll:\s*true\s*\}\s*\)/);
    expect(content).toContain('onStartQueue={onStartQueue}');
    expect(content).toContain('onStopQueue={onStopQueue}');
  });

  test('hides check all button when queue is processing or has unfinished chapters', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toMatch(/!queueProcessing\s*&&\s*unfinishedQueueCount\s*===\s*0\s*\?\s*\(\s*<button[^>]*onClick=\{handleCheckAll\}/);
  });

  test('list view and toolbar provide playlist_add quick action button to enqueue chapters for all followed manga', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('playlist_add');
    expect(content).toContain('latestUpdates.addToQueue');
    expect(content).toMatch(/handleEnqueueNew\(item,\s*sync\)[\s\S]*?playlist_add/);
    expect(content).toMatch(/handleEnqueueAllNew[\s\S]*?playlist_add/);
  });

  test('left sidebar does not render static performance tip callout', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toContain('followedManga.perfTip');
  });

  test('left sidebar uses SearchableSelect for web sources and sort order', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('SearchableSelect');
    expect(content).toContain('siteOptions');
    expect(content).toContain('sortOptions');
    expect(content).toContain('mangaFollowedSortPref_v1');
    expect(content).toContain('followedManga.sort.title');
    expect(content).toContain('followedManga.sort.hasNewFirst');
    expect(content).toContain('followedManga.sort.titleAsc');
    expect(content).toContain('followedManga.sort.recentlyAdded');
  });

  test('left sidebar provides clean 2-row vertical status filter list matching BulkScan Mẫu 2 standard', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('rounded-xl border border-outline-variant/20 bg-surface-container-highest/60 p-1 space-y-0.5');
    expect(content).toContain('aria-pressed={isActive}');
    expect(content).toContain('statusFilter === opt.id');
    expect(content).toContain('followedManga.filter.status');
    expect(content).toContain('followedManga.filter.all');
    expect(content).toContain('followedManga.filter.hasNew');
    expect(content).not.toContain('grid grid-cols-2 gap-1.5');
  });

  test('search input is standardized with clear button and no inner search icon', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('followedManga.searchPlaceholder');
    expect(content).toContain('followedManga.searchClear');
    expect(content).toMatch(/setSearchTerm\(''\)/);
    // Check search input wrapper does not contain inner search icon before input
    expect(content).not.toMatch(/<div className="relative flex items-center">\s*<span className="material-symbols-outlined[^"]*">\s*search\s*<\/span>/);
  });

  test('implements in-memory pagination with page size [20, 50, 100] and bottom pagination bar', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('const PAGE_SIZES = [20, 50, 100];');
    expect(content).toContain('FOLLOWED_MANGA_PAGE_SIZE = 20');
    expect(content).toContain('displayedFavorites');
    expect(content).toContain('contentScrollRef');
    expect(content).toContain('handlePageJumpSubmit');
    expect(content).toContain('followedManga.pagination.summary');
    expect(content).toContain('bulkScan.pageSize');
    expect(content).toContain('latestUpdates.firstPage');
    expect(content).toContain('latestUpdates.lastPage');
    expect(content).toContain('latestUpdates.prevPage');
    expect(content).toContain('latestUpdates.nextPage');
  });

  test('userDataBackup whitelists mangaFollowedSortPref_v1', () => {
    const backupPath = path.resolve(process.cwd(), 'src/utils/userDataBackup.js');
    const content = fs.readFileSync(backupPath, 'utf8');
    expect(content).toContain("'mangaFollowedSortPref_v1'");
  });

  test('Stats Card renders overview tip matching explore family standard', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('followedManga.stats.tip');
    expect(content).toContain('touch_app');
  });

  test('does not render outer progress banner between Toolbar and Body, and unifies FollowedMangaSkeleton + progress bar during check-all', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const betweenToolbarAndBody = content.match(
      /<StudioLayout\.Toolbar[\s\S]*?\/>\s*([\s\S]*?)<StudioLayout\.Body>/,
    );
    expect(betweenToolbarAndBody).not.toBeNull();
    expect(betweenToolbarAndBody[1]).not.toContain('isCheckingAll');
    expect(betweenToolbarAndBody[1]).not.toContain('checkingProgress');

    expect(content).toContain('const FollowedMangaSkeleton = React.memo(');
    expect(content).toContain('data-testid="followed-manga-skeleton"');
    expect(content).toContain('data-testid="followed-manga-check-progress"');
    expect(content).toContain('role="status"');
    expect(content).toContain('w-32 sm:w-44 h-1.5');
    expect(content).toContain('checkingProgressPercent');
    expect(content).toContain('animate-pulse');
    expect(content).toContain('aspect-[3/4.2]');
    expect(content).toContain('h-14 w-10 sm:h-16 sm:w-11');
    expect(content).toMatch(/\{isCheckingAll\s*\?\s*[\s\S]{0,120}<FollowedMangaSkeleton/);
    expect(content).toContain('!isCheckingAll && favorites.length > 0 && sortedFavorites.length > 0');
  });

  test('toolbar Stop Check button matches BulkScanPanel style and uses i18n stopCheck / stopping keys', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const vi = fs.readFileSync(path.resolve(process.cwd(), 'src/i18n/locales/vi.js'), 'utf8');
    const en = fs.readFileSync(path.resolve(process.cwd(), 'src/i18n/locales/en.js'), 'utf8');

    expect(content).toContain('handleStopCheck');
    expect(content).toContain('isStoppingCheck');
    expect(content).toContain('stop_circle');
    expect(content).toContain('bg-error/15 text-error hover:bg-error/25 border border-error/30');
    expect(content).toContain("t('followedManga.actions.stopCheck')");
    expect(content).toContain("t('followedManga.actions.stopping')");
    expect(content).not.toContain('bg-error text-on-error');

    expect(vi).toContain("'followedManga.actions.stopCheck':");
    expect(vi).toContain("'followedManga.actions.stopping':");
    expect(en).toContain("'followedManga.actions.stopCheck':");
    expect(en).toContain("'followedManga.actions.stopping':");
  });
});
