import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED_USE_READER_KEYS = [
  'readerOpen',
  'ebookOpen',
  'ebookPath',
  'readerChapterIndex',
  'setReaderChapterIndex',
  'readerStreamingRead',
  'cbzLoadProgress',
  'cbzError',
  'recentExtractedCbzEntries',
  'removeRecentExtractedCbzEntry',
  'openReader',
  'closeReader',
  'openEbook',
  'closeEbook',
  'openArchivePath',
];

test('src/features/reader/index.js exports ReaderProvider, useReader, and overlay components', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/ReaderProvider/);
  expect(src).toMatch(/useReader/);
  expect(src).toMatch(/MangaReader/);
  expect(src).toMatch(/EbookReader/);
  expect(src).toMatch(/ChaptersDrawer/);
  expect(src).not.toMatch(/loadRecentExtractedCbzEntries/);
  expect(src).not.toMatch(/ebookBookmarks/);
  expect(src).not.toMatch(/ebookProgress/);
  expect(src).not.toMatch(/ebookPrefs/);
  expect(src).not.toMatch(/\bsetManga\b/);
});

test('ReaderProvider context value exposes the useReader public API', () => {
  const src = fs.readFileSync(path.join(dirname, 'ReaderProvider.jsx'), 'utf8');
  const public_return = src.slice(src.lastIndexOf('const value = useMemo'));
  for (const key of REQUIRED_USE_READER_KEYS) {
    expect(public_return).toMatch(new RegExp(`\\b${key}\\b`));
  }
  expect(public_return).not.toMatch(/\bsetManga\b/);
  expect(public_return).not.toMatch(/readChapterAllowedUrls/);
});

test('recent extracted CBZ list keeps the existing localStorage key', () => {
  const src = fs.readFileSync(path.join(dirname, 'ReaderProvider.jsx'), 'utf8');
  expect(src).toMatch(/RECENT_EXTRACTED_CBZ_ENTRIES_KEY = 'recentExtractedCbzEntries'/);
});

test('closing a CBZ reader session calls download clearSession', () => {
  const src = fs.readFileSync(path.join(dirname, 'ReaderProvider.jsx'), 'utf8');
  expect(src).toMatch(/hadCbz/);
  expect(src).toMatch(/clearSession\(\)/);
  expect(src).toMatch(/subscribeCbzLoadProgress/);
});

test('App wraps ReaderProvider inside DownloadProvider and imports the reader barrel', () => {
  const app_src = fs.readFileSync(path.join(dirname, '../../app/App.jsx'), 'utf8');
  expect(app_src).toMatch(/from '\.\.\/features\/reader'/);
  const download_idx = app_src.indexOf('<DownloadProvider>');
  const reader_idx = app_src.indexOf('<ReaderProvider>');
  const layout_idx = app_src.lastIndexOf('<ShellLayout />');
  expect(download_idx).toBeGreaterThan(0);
  expect(reader_idx).toBeGreaterThan(download_idx);
  expect(layout_idx).toBeGreaterThan(reader_idx);
});
