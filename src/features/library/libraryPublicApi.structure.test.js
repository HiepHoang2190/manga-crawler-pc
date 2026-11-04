import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED_USE_LIBRARY_KEYS = [
  'favorites',
  'toggleFavorite',
  'favoriteSyncById',
  'fetchAllFavoritesBusy',
  'bellReadRemoteById',
  'bellPanelRemovedRemoteById',
  'favoriteAutoCheckEnabled',
  'favoriteAutoCheckIntervalMin',
  'localDownloadedChapterCount',
  'readChapterAllowedUrls',
];

test('src/features/library/index.js exports LibraryProvider, useLibrary, and tab/bell components', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/LibraryProvider/);
  expect(src).toMatch(/useLibrary/);
  expect(src).toMatch(/FavoritesTab/);
  expect(src).toMatch(/HistoryTab/);
  expect(src).toMatch(/OfflineLibraryTab/);
  expect(src).toMatch(/FavoriteUpdateBell/);
  expect(src).not.toMatch(/favoriteNotifyState/);
  expect(src).not.toMatch(/favoriteBellStorage/);
  expect(src).not.toMatch(/favoriteTabBadge/);
  expect(src).not.toMatch(/prependHistory/);
});

test('LibraryProvider context value exposes the useLibrary public API', () => {
  const src = fs.readFileSync(path.join(dirname, 'LibraryProvider.jsx'), 'utf8');
  const public_return = src.slice(src.lastIndexOf('const value = useMemo'));
  for (const key of REQUIRED_USE_LIBRARY_KEYS) {
    expect(public_return).toMatch(new RegExp(`\\b${key}\\b`));
  }
  expect(public_return).not.toMatch(/prependHistory/);
  expect(public_return).not.toMatch(/appendDownloadHistory/);
  expect(public_return).not.toMatch(/writeDownloadHistory/);
});

test('favorite auto-check keeps existing appSettings loaders and localStorage keys', () => {
  const src = fs.readFileSync(path.join(dirname, 'LibraryProvider.jsx'), 'utf8');
  expect(src).toMatch(/loadFavoriteAutoCheckEnabled/);
  expect(src).toMatch(/saveFavoriteAutoCheckEnabled/);
  expect(src).toMatch(/loadFavoriteAutoCheckIntervalMin/);
  expect(src).toMatch(/saveFavoriteAutoCheckIntervalMin/);
  expect(src).toMatch(/FAVORITES_KEY = 'mangaFavorites'/);
  expect(src).toMatch(/setInterval/);
  expect(src).not.toMatch(/mangaFavoriteAutoCheckEnabled/);
});

test('library IPC names stay countLocalChapters / loadMangaOfflineFromDisk / filterChaptersWithLocalImages', () => {
  const src = fs.readFileSync(path.join(dirname, 'LibraryProvider.jsx'), 'utf8');
  expect(src).toMatch(/countLocalChapters/);
  expect(src).toMatch(/loadMangaOfflineFromDisk/);
  expect(src).toMatch(/loadMangaOfflineFromAbsolutePath/);
  expect(src).toMatch(/filterChaptersWithLocalImages/);
  expect(src).toMatch(/computeFavoriteChapterSync/);
});

test('HistoryTab reads downloadHistory from useDownload and does not take a history prop', () => {
  const src = fs.readFileSync(path.join(dirname, 'HistoryTab.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\.\/download'/);
  expect(src).toMatch(/downloadHistory/);
  expect(src).toMatch(/useDownload\(\)/);
  expect(src).not.toMatch(/HistoryTab\(\{\s*history/);
});

test('HomeWorkspace mounts library tabs from the library barrel', () => {
  const home_src = fs.readFileSync(path.join(dirname, '../home/HomeWorkspace.jsx'), 'utf8');
  expect(home_src).toMatch(/from '\.\.\/library'/);
  expect(home_src).not.toMatch(/from '\.\/HistoryTab'/);
  expect(home_src).not.toMatch(/from '\.\/FavoritesTab'/);
  expect(home_src).not.toMatch(/from '\.\/OfflineLibraryTab'/);
  expect(home_src).not.toMatch(/history=\{downloadHistory\}/);
});

test('App wraps LibraryProvider inside ReaderProvider and imports the library barrel', () => {
  const app_src = fs.readFileSync(path.join(dirname, '../../app/App.jsx'), 'utf8');
  expect(app_src).toMatch(/from '\.\.\/features\/library'/);
  const reader_idx = app_src.indexOf('<ReaderProvider>');
  const library_idx = app_src.indexOf('<LibraryProvider>');
  const layout_idx = app_src.lastIndexOf('<ShellLayout />');
  expect(reader_idx).toBeGreaterThan(0);
  expect(library_idx).toBeGreaterThan(reader_idx);
  expect(layout_idx).toBeGreaterThan(library_idx);
});

test('OfflineLibraryTab supports onToggleFavorite and HomeWorkspace passes it', () => {
  const offline_src = fs.readFileSync(path.join(dirname, 'OfflineLibraryTab.jsx'), 'utf8');
  expect(offline_src).toMatch(/onToggleFavorite/);
  expect(offline_src).toMatch(/favorite_border/);
  expect(offline_src).toMatch(/mangaInfo\.favoriteAdd/);
  expect(offline_src).toMatch(/mangaInfo\.favoriteRemove/);

  const home_src = fs.readFileSync(path.join(dirname, '../home/HomeWorkspace.jsx'), 'utf8');
  expect(home_src).toMatch(/onToggleFavorite=\{handleToggleFavoriteRow\}/);
});

