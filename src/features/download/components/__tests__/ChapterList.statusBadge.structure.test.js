import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const chapterListPath = path.resolve(dirname, '../ChapterList.jsx');

describe('ChapterList status resolution with local files', () => {
  const content = fs.readFileSync(chapterListPath, 'utf8');

  test('rowStatusKey checks readChapterAllowedUrls to recognize downloaded chapters on local disk', () => {
    expect(content).toMatch(/readChapterAllowedUrls\s+instanceof\s+Set/);
    expect(content).toMatch(/has_local_file\s*\|\|\s*st\s*===\s*['"]done['"]/);
  });

  test('StatusBadge defines completed style with theme-driven tokens', () => {
    expect(content).toMatch(/completed:\s*['"][^'"]*bg-emerald-500\/15[^'"]*text-emerald-600/);
  });

  test('uses buildQueueChapterStatusMap, hides Chưa tải when overridden/completed, and provides contextual disabled tooltips', () => {
    const vi = fs.readFileSync(path.resolve(dirname, '../../../../i18n/locales/vi.js'), 'utf8');
    const en = fs.readFileSync(path.resolve(dirname, '../../../../i18n/locales/en.js'), 'utf8');

    expect(content).toContain('buildQueueChapterStatusMap');
    expect(content).toContain('showUndownloadedQuickSelect');
    expect(content).toContain("chapterStatusKeyOverride !== 'completed'");
    expect(content).toContain('!hideQueueFooter');
    expect(content).toContain('disabled:pointer-events-none');
    expect(content).toContain('chapterList.selectUndownloadedAllDownloaded');
    expect(content).toContain('chapterList.selectUndownloadedAllQueuedOrDone');

    for (const locale of [vi, en]) {
      expect(locale).toContain("'chapterList.selectUndownloadedAllDownloaded':");
      expect(locale).toContain("'chapterList.selectUndownloadedAllQueuedOrDone':");
    }
  });
});
