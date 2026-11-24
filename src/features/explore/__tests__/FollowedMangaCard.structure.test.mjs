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
    expect(content).not.toMatch(/<(?:button|a)\b[^>]*\btitle\s*=/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });

  test('delegates card chrome to shared MangaCard and provides single-row actions', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('<MangaCard');
    expect(content).toContain('<MangaCard.SourceBadge');
    expect(content).toContain('<MangaCard.FavoriteButton');
    expect(content).toContain('<MangaCard.ChapterButton');
    expect(content).toContain('<MangaCard.QueueButton');
    expect(content).toContain('testId="followed-card-view-chapters"');
    expect(content).toContain('data-testid="followed-card-pause-resume"');
    expect(content).toContain('onOpenManga');
    expect(content).toContain('onEnqueueNew');
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

  test('pause/resume button has surrounding border and does not use border-transparent', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).not.toMatch(/<(?:button|a)\b[^>]*\bborder-transparent\b/);
    expect(content).toContain('border-outline-variant/20');
  });

  test('passes loading & enqueuing states plus cross-guard (isLoading || isEnqueuing)', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('loading={isLoading}');
    expect(content).toContain('loading={isEnqueuing}');
    expect(content).toContain('disabled={isLoading || isEnqueuing}');
    expect(content).toContain('disabled={isEnqueuing || isLoading}');
    expect(content).toContain('text-xs text-on-surface-variant');
    expect(content).not.toContain('text-[11px] text-on-surface-variant/70');
  });

  test('supports downloadState prop rendering exactly one progress bar directly on card', () => {
    const content = fs.readFileSync(cardPath, 'utf8');
    expect(content).toContain('downloadState = null');
    expect(content).toContain('downloadState.percent');
    expect(content).toContain('followedManga.progress.downloading');
    expect(content).toContain('followedManga.progress.pageDetail');

    const progressMatches = content.match(/style=\{\{\s*width:\s*`\$\{downloadState\.percent\}%`\s*\}\}/g);
    expect(progressMatches).toHaveLength(1);
  });
});
