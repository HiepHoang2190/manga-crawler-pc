import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/download/index.js keeps the public API and does not export setManga or reducer session writers', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/applyChapterResult/);
  expect(src).toMatch(/buildRetryLogMessage/);
  expect(src).toMatch(/DownloadProvider/);
  expect(src).toMatch(/useDownload/);
  expect(src).toMatch(/QueueRestoreModal/);
  expect(src).toMatch(/SiteCookieSection/);
  expect(src).toMatch(/QueuePanel/);
  expect(src).toMatch(/Sidebar/);
  expect(src).toMatch(/QueueCoverThumb/);
  expect(src).toMatch(/ChapterList/);
  expect(src).toMatch(/QUEUE_SNAPSHOT_KEY/);
  expect(src).not.toMatch(/\bsetManga\b/);
  expect(src).not.toMatch(/\bhydrateSession\b/);
  expect(src).not.toMatch(/\bclearSession\b/);
  expect(src).not.toMatch(/sessionReducers/);
  expect(src).not.toMatch(/prependHistory/);
  expect(src).not.toMatch(/historyStorage/);
});

test('DownloadProvider context value exposes queue runner and history writes', () => {
  const src = fs.readFileSync(path.join(dirname, 'DownloadProvider.jsx'), 'utf8');
  const public_return = src.slice(src.lastIndexOf('const value = useMemo'));
  expect(public_return).toMatch(/queueProcessing/);
  expect(public_return).toMatch(/startQueue: processQueue/);
  expect(public_return).toMatch(/stopQueue/);
  expect(public_return).toMatch(/downloadProgress/);
  expect(public_return).toMatch(/downloadHistory/);
  expect(public_return).toMatch(/appendDownloadHistoryEntry/);
  expect(public_return).toMatch(/clearDownloadHistory/);
  expect(public_return).toMatch(/queueTabFocusNonce/);
  expect(public_return).toMatch(/focusQueueTab/);
  expect(public_return).toMatch(/enqueueChapters/);
  expect(public_return).toMatch(/enqueueHistoryRows/);
  expect(public_return).not.toMatch(/\bsetQueue\b/);
  expect(public_return).not.toMatch(/\bsetManga\b/);
});

test('DownloadProvider focusQueueTab increments nonce and persists queue tab', () => {
  const src = fs.readFileSync(path.join(dirname, 'DownloadProvider.jsx'), 'utf8');
  expect(src).toMatch(/nextQueueTabFocusNonce/);
  expect(src).toMatch(/savePanelUi\(\{ queueTab: 'queue' \}\)/);
  expect(src).toMatch(/setQueueTabFocusNonce/);
});

test('useCurrentMangaSession public object writes via hydrateSession/clearSession, not setManga', () => {
  const src = fs.readFileSync(path.join(dirname, 'useCurrentMangaSession.js'), 'utf8');
  const public_return = src.slice(src.lastIndexOf('return useMemo'));
  expect(public_return).toMatch(/hydrateSession/);
  expect(public_return).toMatch(/clearSession/);
  expect(public_return).toMatch(/setSelectedChapterUrls:/);
  expect(public_return).not.toMatch(/\bsetManga\b/);
  expect(public_return).not.toMatch(/\bsetChapters\b/);
});
