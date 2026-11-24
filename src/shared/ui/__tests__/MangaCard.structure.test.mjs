import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Shared MangaCard Component & Consumers', () => {
  test('MangaCard.jsx exists and is exported from src/shared/index.js', () => {
    const sharedIndex = read('src/shared/index.js');
    const cardSrc = read('src/shared/ui/MangaCard.jsx');

    expect(sharedIndex).toContain("export { default as MangaCard } from './ui/MangaCard.jsx';");
    expect(cardSrc).toMatch(/export\s+default\s+function\s+MangaCard/);
    expect(cardSrc).toContain('MangaCard.SourceBadge');
    expect(cardSrc).toContain('MangaCard.FavoriteButton');
    expect(cardSrc).toContain('MangaCard.ChapterButton');
    expect(cardSrc).toContain('MangaCard.QueueButton');
  });

  test('MangaCard enforces unified cover aspect ratio, fallback, loading overlay, non-overlapping header bar, a11y, and button polish', () => {
    const src = read('src/shared/ui/MangaCard.jsx');

    expect(src).toContain('aspect-[3/4.2]');
    expect(src).toContain('group-hover:scale-105 transition-transform duration-300');
    expect(src).toContain('referrerPolicy="no-referrer"');
    expect(src).toContain('setImgError(false)');
    expect(src).toContain('menu_book');
    expect(src).toContain('backdrop-blur-[1px]');
    expect(src).toContain('ring-2 ring-primary/40');
    expect(src).toContain('inset-x-2 top-2 z-[2] flex items-start justify-between gap-2');
    expect(src).toContain("role={isInteractive ? 'button' : undefined}");
    expect(src).toContain('tabIndex={isInteractive ? 0 : undefined}');
    expect(src).toContain("e.target.closest('button, a, input, textarea, select, [role=\"button\"]')");
    expect(src).toContain('focus-visible:ring-2');

    // Unified primary chapter button (clean centered text without redundant icon)
    const chapterBtnSection = src.match(/MangaCard\.ChapterButton[\s\S]*?(?=MangaCard\.QueueButton|$)/);
    expect(chapterBtnSection).not.toBeNull();
    expect(chapterBtnSection[0]).toContain(
      'flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-primary text-on-primary hover:opacity-90 text-xs font-semibold transition-all flex items-center justify-center',
    );
    expect(chapterBtnSection[0]).not.toContain('format_list_bulleted');
    expect(chapterBtnSection[0]).toContain('whitespace-nowrap');

    // Unified tonal queue button & favorite button
    expect(src).toContain('h-8 w-8 shrink-0 rounded-lg border border-primary/30 bg-primary/12 text-primary');
    expect(src).toContain('playlist_add');
    expect(src).toContain('aria-pressed');
    expect(src).toContain('favorite');
    expect(src).toContain('favorite_border');

    // UI compliance: no native title= or underline
    expect(src).not.toMatch(/<(?:button|a|span|div|p|img|li)\b[^>]*\btitle\s*=/);
    expect(src).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('all 4 grid card consumers import and render MangaCard', () => {
    const consumers = [
      'src/features/latest-updates/LatestUpdatesPanel.jsx',
      'src/features/bulk-scan/BulkScanPanel.jsx',
      'src/features/explore/components/FollowedMangaCard.jsx',
      'src/features/library/components/offline/OfflineGridCard.jsx',
    ];

    for (const rel of consumers) {
      const code = read(rel);
      expect({ rel, hasImport: /\bMangaCard\b/.test(code) }).toEqual({ rel, hasImport: true });
      expect({ rel, rendersComponent: code.includes('<MangaCard') }).toEqual({
        rel,
        rendersComponent: true,
      });
    }
  });
});
