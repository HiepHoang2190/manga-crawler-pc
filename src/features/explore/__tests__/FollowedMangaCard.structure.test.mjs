import fs from 'node:fs';
import path from 'node:path';

describe('FollowedMangaCard structure and UI standards', () => {
  const cardPath = path.resolve(process.cwd(), 'src/features/explore/components/FollowedMangaCard.jsx');

  test('file exists and exports default FollowedMangaCard component', () => {
    expect(fs.existsSync(cardPath)).toBe(true);
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toMatch(/export\s+default\s+function\s+FollowedMangaCard/);
  });

  test('complies with UI standards: no native title attributes and no underline classes', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    // Ensure no native title on interactive buttons or anchors
    expect(content).not.toMatch(/<(?:button|a)\b[^>]*\btitle\s*=/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });

  test('provides single-row quick action buttons for view chapters, enqueue/pause-resume, and favorite remove', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('data-testid="followed-card-view-chapters"');
    expect(content).toContain('onOpenManga');
    expect(content).toContain('onEnqueueNew');
    expect(content).toContain('data-testid="followed-card-pause-resume"');
    expect(content).toContain('onRemove');
    expect(content).toContain('data-tooltip');
    expect(content).toContain('aria-label');
  });

  test('displays new chapter badge when sync.hasNew is true', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('hasNew');
    expect(content).toContain('followedManga.badge.new');
    expect(content).toContain('followedManga.badge.newChapters');
  });

  test('conforms to balanced card layout standards: vertical cover aspect ratio, line-clamp-2 title, h-8 buttons with whitespace-nowrap and shrink-0 icon', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('aspect-[3/4.2]');
    expect(content).toContain('line-clamp-2');
    expect(content).toContain('whitespace-nowrap');
    expect(content).toContain('shrink-0');
    expect(content).toContain('h-8');
  });

  test('action icon buttons have surrounding borders and do not use border-transparent', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).not.toMatch(/<(?:button|a)\b[^>]*\bborder-transparent\b/);
    expect(content).toContain('border-outline-variant/20');
  });

  test('uses unified format_list_bulleted icon for view chapters and does not use media player play_arrow icon for view chapters', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('format_list_bulleted');
    expect(content).not.toMatch(/viewChapters[\s\S]{0,100}play_arrow/);
  });

  test('supports loading state with progress spinner', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('isLoading');
    expect(content).toContain('progress_activity');
  });

  test('supports enqueuing state with progress spinner on download button', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('isEnqueuing');
  });

  test('primary action button is always unified to viewChapters without redundant tooltip', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('onOpenManga');
    expect(content).toContain('followedManga.actions.viewChapters');
    expect(content).not.toMatch(/<button\b[^>]*data-tooltip=\{[^}]*viewChapters[^}]*\}[^>]*>\s*\{?isLoading/);
  });

  test('supports downloadState prop rendering exactly one progress bar directly on card', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('downloadState = null');
    expect(content).toContain('downloadState.percent');
    expect(content).toContain('followedManga.progress.downloading');
    expect(content).toContain('followedManga.progress.pageDetail');

    // Verify there is only one progress bar rendered on the card (no duplicate bottom strip)
    const progressMatches = content.match(/style=\{\{\s*width:\s*`\$\{downloadState\.percent\}%`\s*\}\}/g);
    expect(progressMatches).toHaveLength(1);
  });

  test('action footer provides unified single-row action layout with flex-1 viewChapters and h-8 w-8 playlist_add matching LatestUpdates standard', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('onOpenManga');
    expect(content).toContain('format_list_bulleted');
    expect(content).toContain('playlist_add');
    expect(content).toContain('flex-1 min-w-0 h-8 rounded-lg bg-primary');
    expect(content).toContain('h-8 w-8 shrink-0 rounded-lg');
  });

  test('matches LatestUpdatesPanel & BulkScanPanel card polish (no px-2 truncation on viewChapters, non-overlapping header row, keyboard a11y, cover reset, no double title click)', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    const viewBtnBlock = content.match(
      /data-testid="followed-card-view-chapters"[\s\S]{0,400}className="([^"]+)"/,
    );
    expect(viewBtnBlock).not.toBeNull();
    expect(viewBtnBlock[1]).toContain(
      'flex-1 min-w-0 h-8 rounded-lg bg-primary text-on-primary hover:opacity-90 text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
    );
    expect(viewBtnBlock[1]).not.toMatch(/\bpx-2\b/);

    expect(content).toContain('inset-x-2 top-2 z-[1] flex items-start justify-between gap-2');
    expect(content).toContain('hover:shadow-md');
    expect(content).toContain('ring-2 ring-primary/40');
    expect(content).toContain('menu_book');
    expect(content).toContain("t('latestUpdates.noCover')");
    expect(content).toContain('backdrop-blur-[1px]');
    expect(content).toContain('role="button"');
    expect(content).toContain('tabIndex={0}');
    expect(content).toContain('onKeyDown={handleCardKeyDown}');
    expect(content).toContain('setImgError(false)');
    expect(content).toContain('if (isLoading || isEnqueuing) return');
    expect(content).not.toContain('text-[11px] text-on-surface-variant/70');
    expect(content).not.toMatch(/<p\b[^>]*onClick=/);
  });
});
