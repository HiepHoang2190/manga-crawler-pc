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
      'src/features/library/components/offline/OfflineListActions.jsx',
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
});
