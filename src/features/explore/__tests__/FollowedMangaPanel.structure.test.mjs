import fs from 'node:fs';
import path from 'node:path';

describe('FollowedMangaPanel structure and standards', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/explore/components/FollowedMangaPanel.jsx');

  test('file exists and exports default FollowedMangaPanel component', () => {
    expect(fs.existsSync(panelPath)).toBe(true);
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toMatch(/export\s+default\s+function\s+FollowedMangaPanel/);
  });

  test('uses StudioLayout and useStudioLayout', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('StudioLayout');
    expect(content).toContain('useStudioLayout');
    expect(content).toContain('ResizeSplitter');
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

  test('calls i18n interpolation properly and uses balanced responsive grid columns matching LatestUpdatesPanel', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toMatch(/t\(\s*['"]followedManga\.stats\.summary['"]\s*,\s*\{\s*total:\s*stats\.total/);
    expect(content).toContain('grid-cols-2');
    expect(content).toContain('sm:grid-cols-3');
    expect(content).toContain('xl:grid-cols-5');
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

  test('toolbar places main action button first and ViewModeToggle at the end of rightSlot', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const rightSlotMatch = content.match(/rightSlot=\{([\s\S]*?)\n\s*\}\s*\/>/);
    expect(rightSlotMatch).not.toBeNull();
    const rightSlotCode = rightSlotMatch[1];
    const checkAllIndex = rightSlotCode.indexOf('handleCheckAll');
    const viewModeIndex = rightSlotCode.indexOf('<ViewModeToggle');
    expect(checkAllIndex).toBeGreaterThan(-1);
    expect(viewModeIndex).toBeGreaterThan(-1);
    expect(viewModeIndex).toBeGreaterThan(checkAllIndex);
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
});
