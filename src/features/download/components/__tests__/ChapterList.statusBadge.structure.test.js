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
});
