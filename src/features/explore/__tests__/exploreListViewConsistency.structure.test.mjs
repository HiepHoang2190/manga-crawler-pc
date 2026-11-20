import fs from 'node:fs';
import path from 'node:path';

describe('Explore Subtabs List View Consistency Standards', () => {
  const latestPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');
  const followedPath = path.resolve(process.cwd(), 'src/features/explore/components/FollowedMangaPanel.jsx');
  const bulkPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

  const files = [
    { name: 'LatestUpdatesPanel', path: latestPath },
    { name: 'FollowedMangaPanel', path: followedPath },
    { name: 'BulkScanPanel', path: bulkPath },
  ];

  test('all 3 subtabs exist and have list mode implemented', () => {
    for (const f of files) {
      expect(fs.existsSync(f.path)).toBe(true);
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('viewMode');
    }
  });

  test('all 3 subtabs use identical list container <ul className="flex flex-col gap-2">', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('flex flex-col gap-2');
    }
  });

  test('all 3 subtabs use unified row padding and rounded-xl borders', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('px-3 py-2.5 sm:px-4 rounded-xl border');
    }
  });

  test('all 3 subtabs use unified thumbnail dimensions (h-14 w-10 sm:h-16 sm:w-11 rounded-lg)', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('h-14 w-10 sm:h-16 sm:w-11');
      expect(content).toContain('rounded-lg');
    }
  });

  test('all 3 subtabs use standard uppercase source badge styling', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0');
    }
  });

  test('all 3 subtabs adhere to UI standards: zero native title and zero underline', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).not.toMatch(/<(?:button|a|li)\b[^>]*\btitle\s*=/);
      expect(content).not.toMatch(/\bhover:underline\b/);
      expect(content).not.toMatch(/\bunderline\b/);
    }
  });

  test('all 3 subtabs provide unified action buttons in list mode: h-8 px-3 format_list_bulleted + h-8 w-8 playlist_add', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('h-8 px-3 rounded-lg');
      expect(content).toContain('format_list_bulleted');
      expect(content).toContain('playlist_add');
    }
  });
});
