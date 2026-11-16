import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const homeWorkspacePath = path.resolve(dirname, '../HomeWorkspace.jsx');
const latestUpdatesPath = path.resolve(dirname, '../../latest-updates/LatestUpdatesPanel.jsx');
const shellLayoutPath = path.resolve(dirname, '../../shell/ShellLayout.jsx');

describe('Download deduplication safeguards structure', () => {
  const homeContent = fs.readFileSync(homeWorkspacePath, 'utf8');
  const latestContent = fs.readFileSync(latestUpdatesPath, 'utf8');
  const shellContent = fs.readFileSync(shellLayoutPath, 'utf8');

  test('HomeWorkspace handleAddSelectedToQueue deduplicates selected chapters before enqueueing', () => {
    expect(homeContent).toMatch(/handleAddSelectedToQueue[\s\S]*?dedupeChaptersByNumber/);
  });

  test('LatestUpdatesPanel selectDrawerChaptersAll deduplicates drawer chapters', () => {
    expect(latestContent).toMatch(/selectDrawerChaptersAll[\s\S]*?dedupeChaptersByNumber/);
  });

  test('ShellLayout handleAddQueuedFromLatest deduplicates chapters before enqueueing', () => {
    expect(shellContent).toMatch(/handleAddQueuedFromLatest[\s\S]*?dedupeChaptersByNumber/);
  });

  test('ShellLayout handleEnqueueLoadedMangaFromLatest deduplicates chapters before enqueueing', () => {
    expect(shellContent).toMatch(/handleEnqueueLoadedMangaFromLatest[\s\S]*?dedupeChaptersByNumber/);
  });
});
