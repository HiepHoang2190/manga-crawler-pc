import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import LatestUpdatesPanel from '../latest-updates';
import BulkScanPanel from '../bulk-scan';
import FollowedMangaPanel from './components/FollowedMangaPanel';

export const EXPLORE_SUBTAB_KEY = 'explore_subtab_v1';

function loadExploreSubtab(fallback = 'latest') {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(EXPLORE_SUBTAB_KEY);
    if (val === 'bulk' || val === 'latest' || val === 'followed') return val;
  } catch {
    /* ignore storage errors */
  }
  return fallback;
}

export default function ExplorePanel({
  connectors = [],
  mangaLoadOpts = null,
  onEnqueueLoadedManga = null,
  queue = [],
  queueProcessing = false,
  downloadProgress = null,
  onStartQueue = null,
  onStopQueue = null,
  onAddQueuedFromLatest = null,
  onDownloadMangadexCovers = null,
  savePath = '',
  prepareDrawerMangaForRead = null,
  onOpenReaderForDrawerChapter = null,
  onReadChapterOnlineForDrawerChapter = null,
  favorites = [],
  favoriteSyncById = {},
  onEnqueuePendingChapters = null,
  onToggleFavorite = null,
  initialSubtab = null,
}) {
  const { t } = useI18n();
  const [activeSubtab, setActiveSubtab] = useState(() => {
    if (initialSubtab === 'bulk' || initialSubtab === 'latest' || initialSubtab === 'followed') {
      return initialSubtab;
    }
    return loadExploreSubtab('latest');
  });

  useEffect(() => {
    if (initialSubtab === 'bulk' || initialSubtab === 'latest' || initialSubtab === 'followed') {
      setActiveSubtab(initialSubtab);
    }
  }, [initialSubtab]);

  const handleSelectSubtab = useCallback((subtab) => {
    if (subtab !== 'latest' && subtab !== 'bulk' && subtab !== 'followed') return;
    setActiveSubtab(subtab);
    try {
      localStorage.setItem(EXPLORE_SUBTAB_KEY, subtab);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const subtabsSlot = (
    <div
      role="tablist"
      aria-label={t('menu.explore')}
      className="inline-flex items-center p-0.5 rounded-xl bg-surface-container-high/70 border border-outline-variant/25 shrink-0"
    >
      <button
        type="button"
        role="tab"
        data-testid="subtab-latest"
        aria-selected={activeSubtab === 'latest'}
        onClick={() => handleSelectSubtab('latest')}
        data-tooltip={t('explore.subtab.latestTooltip')}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none ${
          activeSubtab === 'latest'
            ? 'bg-primary text-on-primary font-semibold shadow-xs'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
        }`}
      >
        <span className="material-symbols-outlined text-[16px] leading-none">update</span>
        <span>{t('explore.subtab.latest')}</span>
      </button>
      <button
        type="button"
        role="tab"
        data-testid="subtab-followed"
        aria-selected={activeSubtab === 'followed'}
        onClick={() => handleSelectSubtab('followed')}
        data-tooltip={t('explore.subtab.followedTooltip')}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none ${
          activeSubtab === 'followed'
            ? 'bg-primary text-on-primary font-semibold shadow-xs'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
        }`}
      >
        <span className="material-symbols-outlined text-[16px] leading-none">bookmarks</span>
        <span>{t('explore.subtab.followed')}</span>
        {favorites.length > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white/20 text-current tabular-nums">
            {favorites.length}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        data-testid="subtab-bulk"
        aria-selected={activeSubtab === 'bulk'}
        onClick={() => handleSelectSubtab('bulk')}
        data-tooltip={t('explore.subtab.bulkTooltip')}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none ${
          activeSubtab === 'bulk'
            ? 'bg-primary text-on-primary font-semibold shadow-xs'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
        }`}
      >
        <span className="material-symbols-outlined text-[16px] leading-none">document_scanner</span>
        <span>{t('explore.subtab.bulk')}</span>
      </button>
    </div>
  );

  return (
    <div className="w-full h-full relative overflow-hidden">
      <div className={`w-full h-full ${activeSubtab === 'latest' ? 'block' : 'hidden'}`}>
        <LatestUpdatesPanel
          connectors={connectors}
          mangaLoadOpts={mangaLoadOpts}
          onEnqueueLoadedManga={onEnqueueLoadedManga}
          queue={queue}
          onAddQueuedFromLatest={onAddQueuedFromLatest}
          onDownloadMangadexCovers={onDownloadMangadexCovers}
          savePath={savePath}
          prepareDrawerMangaForRead={prepareDrawerMangaForRead}
          onOpenReaderForDrawerChapter={onOpenReaderForDrawerChapter}
          onReadChapterOnlineForDrawerChapter={onReadChapterOnlineForDrawerChapter}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          subtabsSlot={subtabsSlot}
        />
      </div>
      <div className={`w-full h-full ${activeSubtab === 'followed' ? 'block' : 'hidden'}`}>
        <FollowedMangaPanel
          connectors={connectors}
          favorites={favorites}
          favoriteSyncById={favoriteSyncById}
          onToggleFavorite={onToggleFavorite}
          onEnqueuePendingChapters={onEnqueuePendingChapters}
          savePath={savePath}
          mangaLoadOpts={mangaLoadOpts}
          prepareDrawerMangaForRead={prepareDrawerMangaForRead}
          onOpenReaderForDrawerChapter={onOpenReaderForDrawerChapter}
          onReadChapterOnlineForDrawerChapter={onReadChapterOnlineForDrawerChapter}
          subtabsSlot={subtabsSlot}
          queue={queue}
          queueProcessing={queueProcessing}
          downloadProgress={downloadProgress}
          onStartQueue={onStartQueue}
          onStopQueue={onStopQueue}
          onAddQueuedFromLatest={onAddQueuedFromLatest}
          onDownloadMangadexCovers={onDownloadMangadexCovers}
        />
      </div>
      <div className={`w-full h-full ${activeSubtab === 'bulk' ? 'block' : 'hidden'}`}>
        <BulkScanPanel
          connectors={connectors}
          onEnqueueLoadedManga={onEnqueueLoadedManga}
          savePath={savePath}
          mangaLoadOpts={mangaLoadOpts}
          subtabsSlot={subtabsSlot}
        />
      </div>
    </div>
  );
}
