import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { isFavoriteTabBadgeUnread } from './favoriteTabBadge';
import { loadPanelUi, savePanelUi } from '../../utils/panelUiPrefs';
import { QueueCoverThumb } from '../download';
import { SearchableSelect, EmptyState, StudioTable } from '../../shared';

const SORT_CYCLE = ['titleAsc', 'titleDesc', 'dateDesc', 'dateAsc'];

const SORT_LABEL_KEYS = {
  titleAsc: 'favorites.sort.titleAsc',
  titleDesc: 'favorites.sort.titleDesc',
  dateDesc: 'favorites.sort.dateDesc',
  dateAsc: 'favorites.sort.dateAsc',
};

/** Đồng nhất nét icon (không fill, wght 400) — Read / Folder / Delete cùng hệ. */
const FAV_MS_ICON_20 =
  "material-symbols-outlined leading-none shrink-0 block text-[20px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";
const FAV_MS_ICON_18 =
  "material-symbols-outlined leading-none shrink-0 block text-[18px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

function FavoriteNotifyBell({ active, onToggle, titleOn, titleOff, compact = false }) {
  const iconClass = compact ? FAV_MS_ICON_18 : FAV_MS_ICON_20;
  const box = compact ? 'h-9 w-9' : 'w-10 h-10';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`inline-flex items-center justify-center ${box} shrink-0 rounded-full border shadow-lg transition-[filter] cursor-pointer ${
        active
          ? 'bg-primary/25 text-primary border-primary/40 ring-1 ring-primary/30'
          : 'bg-surface-container-high/95 text-on-surface-variant border-outline-variant/30'
      } hover:brightness-110`}
      data-tooltip={active ? titleOn : titleOff}
      aria-label={active ? titleOn : titleOff}
      aria-pressed={active}
    >
      <span
        className={iconClass}
        style={
          active
            ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
            : undefined
        }
      >
        notifications
      </span>
    </button>
  );
}

function FavoriteCardActions({
  item,
  savePath,
  t,
  onReadFavorite,
  onFetchFavorite,
  onOpenMangaFolder,
  onRemoveFavorite,
  onToggleNotifyWatch,
}) {
  const hasOnlineMetadata = Boolean(item?.url && String(item.url).trim());
  return (
    <div className="flex flex-wrap items-center justify-center gap-7 sm:gap-8 w-full px-2">
      <button
        type="button"
        onClick={() => onReadFavorite?.(item)}
        className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
        data-tooltip={t('mangaInfo.openReader')}
        aria-label={t('mangaInfo.openReader')}
      >
        <span className={FAV_MS_ICON_20}>auto_stories</span>
      </button>
      <button
        type="button"
        disabled={!hasOnlineMetadata}
        onClick={() => (hasOnlineMetadata ? onFetchFavorite?.(item) : undefined)}
        className={`inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg transition-[filter,opacity] ${
          hasOnlineMetadata
            ? 'hover:brightness-110 cursor-pointer'
            : 'opacity-40 cursor-not-allowed pointer-events-auto'
        }`}
        data-tooltip={hasOnlineMetadata ? t('offlineLibrary.fetchOnline') : t('offlineLibrary.noMetadataToFetch')}
        aria-label={hasOnlineMetadata ? t('offlineLibrary.fetchOnline') : t('offlineLibrary.noMetadataToFetch')}
      >
        <span className={FAV_MS_ICON_20}>cloud_download</span>
      </button>
      <FavoriteNotifyBell
        active={Boolean(item.notifyWatch)}
        onToggle={() => onToggleNotifyWatch?.(item.id)}
        titleOn={t('favorites.notifyWatchOn')}
        titleOff={t('favorites.notifyWatchOff')}
      />
      <button
        type="button"
        onClick={() => onOpenMangaFolder?.(item.title, savePath)}
        className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
        data-tooltip={t('favorites.openFolderTitle')}
      >
        <span className={FAV_MS_ICON_20}>folder_open</span>
      </button>
      <button
        type="button"
        onClick={() => onRemoveFavorite?.(item.id)}
        className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-red-500/25 backdrop-blur-md text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
        data-tooltip={t('mangaInfo.favoriteRemove')}
      >
        <span className={FAV_MS_ICON_20}>delete</span>
      </button>
    </div>
  );
}

function FavoriteChapterMeta({ item, sync, t, onEnqueuePending }) {
  const pending =
    sync?.hasNew && typeof sync.remoteCount === 'number' ? sync.remoteCount : 0;
  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <div className="text-xs text-outline tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>{t('favorites.chaptersLine', { count: item.chapterCount ?? 0 })}</span>
        {sync?.error ? (
          <span className="text-error text-[10px] shrink-0" data-tooltip={sync.error}>
            {t('favorites.syncFailedShort')}
          </span>
        ) : null}
      </div>
      {pending > 0 ? (
        typeof onEnqueuePending === 'function' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnqueuePending();
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer border border-amber-500/25 rounded-md px-1.5 py-0.5 shadow-2xs"
            data-tooltip={t('favorites.enqueuePendingTooltip', { n: pending })}
            aria-label={t('favorites.enqueuePendingTooltip', { n: pending })}
          >
            <span className="material-symbols-outlined text-[12px] leading-none">download</span>
            <span className="tabular-nums font-semibold">{t('favorites.newChaptersPending', { n: pending })}</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-md px-1.5 py-0.5 tabular-nums">
            <span className="material-symbols-outlined text-[12px] leading-none">download</span>
            <span className="tabular-nums font-semibold">{t('favorites.newChaptersPending', { n: pending })}</span>
          </span>
        )
      ) : null}
    </div>
  );
}

function FavoriteListActions({ item, savePath, t, onReadFavorite, onFetchFavorite, onOpenMangaFolder, onRemoveFavorite, onToggleNotifyWatch }) {
  const hasOnlineMetadata = Boolean(item?.url && String(item.url).trim());
  return (
    <div className="inline-flex items-center justify-end gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onReadFavorite?.(item)}
        className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-surface-container-high text-primary border border-outline-variant/30 shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
        data-tooltip={t('mangaInfo.openReader')}
        aria-label={t('mangaInfo.openReader')}
      >
        <span className={FAV_MS_ICON_18}>auto_stories</span>
      </button>
      <button
        type="button"
        disabled={!hasOnlineMetadata}
        onClick={() => (hasOnlineMetadata ? onFetchFavorite?.(item) : undefined)}
        className={`inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-surface-container-high text-primary border border-outline-variant/30 shadow-sm transition-[filter,opacity] ${
          hasOnlineMetadata
            ? 'hover:brightness-110 cursor-pointer'
            : 'opacity-40 cursor-not-allowed pointer-events-auto'
        }`}
        data-tooltip={hasOnlineMetadata ? t('offlineLibrary.fetchOnline') : t('offlineLibrary.noMetadataToFetch')}
        aria-label={hasOnlineMetadata ? t('offlineLibrary.fetchOnline') : t('offlineLibrary.noMetadataToFetch')}
      >
        <span className={FAV_MS_ICON_18}>cloud_download</span>
      </button>
      <FavoriteNotifyBell
        active={Boolean(item.notifyWatch)}
        onToggle={() => onToggleNotifyWatch?.(item.id)}
        titleOn={t('favorites.notifyWatchOn')}
        titleOff={t('favorites.notifyWatchOff')}
        compact
      />
      <button
        type="button"
        onClick={() => onOpenMangaFolder?.(item.title, savePath)}
        className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-surface-container-high text-primary border border-outline-variant/30 shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
        data-tooltip={t('favorites.openFolderTitle')}
      >
        <span className={FAV_MS_ICON_18}>folder_open</span>
      </button>
      <button
        type="button"
        onClick={() => onRemoveFavorite?.(item.id)}
        className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-error/10 text-error hover:bg-error hover:text-on-error transition-colors cursor-pointer"
        data-tooltip={t('mangaInfo.favoriteRemove')}
      >
        <span className={FAV_MS_ICON_18}>delete</span>
      </button>
    </div>
  );
}

export default function FavoritesTab({
  favorites = [],
  savePath = '',
  onRemoveFavorite,
  onFetchFavorite,
  onReadFavorite,
  onOpenMangaFolder,
  favoriteSyncById = {},
  favoriteTabBadgeReadById = {},
  fetchAllFavoritesBusy = false,
  onFetchAllFavorites,
  onToggleFavoriteNotifyWatch,
  onEnqueuePendingChapters,
  connectors = [],
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState(() => loadPanelUi().favorites.siteFilter);
  const [viewMode, setViewMode] = useState(() => loadPanelUi().favorites.viewMode);
  const [sortMode, setSortMode] = useState(() => loadPanelUi().favorites.sortMode);

  useEffect(() => {
    savePanelUi({ favorites: { viewMode, siteFilter, sortMode } });
  }, [viewMode, siteFilter, sortMode]);

  const siteLabelById = useMemo(() => {
    const m = new Map();
    for (const c of connectors) {
      if (c?.id) m.set(String(c.id), String(c.label || c.id));
    }
    return m;
  }, [connectors]);

  const siteIconById = useMemo(() => {
    const m = new Map();
    for (const c of connectors) {
      if (c?.id && c?.icon) m.set(String(c.id), c.icon);
    }
    return m;
  }, [connectors]);

  const siteOptions = useMemo(() => {
    const ids = new Set();
    for (const c of connectors) {
      if (c?.id) ids.add(String(c.id));
    }
    for (const f of favorites) {
      if (f.siteId) ids.add(String(f.siteId));
    }
    return [...ids].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [connectors, favorites]);

  const resolveSiteLabel = useCallback(
    (siteId) => {
      const s = siteId ? String(siteId) : '';
      if (!s) return t('favorites.siteUnknown');
      return siteLabelById.get(s) || s;
    },
    [siteLabelById, t]
  );

  /** Truyện thuộc connector đang chọn (không lọc theo ô tìm kiếm) — dùng cho Fetch all + footer. */
  const favoritesForSiteOnly = useMemo(() => {
    if (!siteFilter) return favorites;
    return favorites.filter((item) => String(item.siteId || '') === siteFilter);
  }, [favorites, siteFilter]);

  const idsInSiteScope = useMemo(
    () => new Set(favoritesForSiteOnly.map((f) => f.id)),
    [favoritesForSiteOnly]
  );

  const hasNewCountInSiteScope = useMemo(
    () =>
      Object.entries(favoriteSyncById).filter(([id, v]) => v.hasNew && idsInSiteScope.has(id)).length,
    [favoriteSyncById, idsInSiteScope]
  );

  const filtered = useMemo(() => {
    let list = favorites;
    if (siteFilter) {
      list = list.filter((item) => String(item.siteId || '') === siteFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((item) => String(item.title || '').toLowerCase().includes(q));
    }
    return list;
  }, [favorites, query, siteFilter]);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    const titleCmp = (a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    const dateCmp = (a, b) => {
      const ta = new Date(a.addedAt || 0).getTime();
      const tb = new Date(b.addedAt || 0).getTime();
      return ta - tb;
    };
    switch (sortMode) {
      case 'titleAsc':
        arr.sort(titleCmp);
        break;
      case 'titleDesc':
        arr.sort((a, b) => -titleCmp(a, b));
        break;
      case 'dateDesc':
        arr.sort((a, b) => -dateCmp(a, b));
        break;
      case 'dateAsc':
        arr.sort(dateCmp);
        break;
      default:
        break;
    }
    return arr;
  }, [filtered, sortMode]);

  const cycleSort = useCallback(() => {
    setSortMode((prev) => {
      const i = SORT_CYCLE.indexOf(prev);
      const idx = i >= 0 ? i : 0;
      return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    });
  }, []);

  /** Cùng chiều cao với ô tìm kiếm / dropdown (h-11). */
  const viewToggleBtn = (mode, icon, labelKey) => {
    const active = viewMode === mode;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setViewMode(mode)}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
          active
            ? 'bg-primary/15 text-primary ring-1 ring-primary/35'
            : 'bg-surface-container-high text-outline hover:text-on-surface'
        }`}
        data-tooltip={t(labelKey)}
      >
        <span className="material-symbols-outlined text-[20px] leading-none">{icon}</span>
      </button>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 gap-4 sm:px-8 overflow-hidden min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-1 flex-wrap items-center gap-3 min-w-0">
            <div className="flex-1 flex h-11 items-center bg-surface-container-highest rounded-lg px-3 sm:px-4 max-w-xl border border-outline-variant/10 min-w-[200px]">
              <span className="material-symbols-outlined text-outline mr-2 sm:mr-3 shrink-0 text-[20px] leading-none">
                filter_list
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('favorites.searchPlaceholder')}
                className="min-h-0 h-8 bg-transparent border-none text-sm leading-normal focus:ring-0 p-0 w-full text-on-surface outline-none placeholder:text-outline"
              />
            </div>
            <div className="shrink-0">
              <SearchableSelect
                value={siteFilter}
                onChange={setSiteFilter}
                options={siteOptions.map((id) => ({
                  value: id,
                  label: siteLabelById.get(id) || id,
                  icon: siteIconById.get(id),
                }))}
                placeholder={t('favorites.filterSiteAll')}
                className="min-w-[10.5rem]"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {viewToggleBtn('grid', 'grid_view', 'favorites.viewGrid')}
            {viewToggleBtn('list', 'view_list', 'favorites.viewList')}
            <div className="h-6 w-px shrink-0 bg-outline-variant/30 mx-0.5 self-center" aria-hidden />
            <button
              type="button"
              onClick={cycleSort}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                sortMode !== 'titleAsc'
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/35'
                  : 'bg-surface-container-high text-outline hover:text-on-surface'
              }`}
              data-tooltip={t('favorites.sort.hint', { mode: t(SORT_LABEL_KEYS[sortMode] || SORT_LABEL_KEYS.titleAsc) })}
            >
              <span className="material-symbols-outlined text-[20px] leading-none">sort_by_alpha</span>
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div
            className={`min-h-0 min-w-0 flex-1 overflow-auto custom-scrollbar rounded-xl border border-outline-variant/20 bg-surface shadow-sm ${
              sortedFiltered.length > 0 ? 'p-5' : 'flex items-center justify-center'
            }`}
          >
            {sortedFiltered.length === 0 ? (
              <EmptyState
                icon={favorites.length === 0 ? 'favorite' : 'search_off'}
                title={favorites.length === 0 ? t('favorites.empty') : t('favorites.noResults')}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-2">
                {sortedFiltered.map((item) => (
                  <div
                    key={item.id}
                    className={`group bg-surface-container-low rounded-xl overflow-hidden flex flex-col transition-all hover:shadow-2xl hover:shadow-black/40 border ${
                      isFavoriteTabBadgeUnread(item.id, favoriteSyncById[item.id], favoriteTabBadgeReadById)
                        ? 'border-amber-500/70 ring-2 ring-amber-500/35 bg-amber-500/[0.06]'
                        : 'border-outline-variant/10'
                    }`}
                  >
                    <div className="aspect-[3/4.2] relative overflow-hidden bg-surface-container-highest">
                      <QueueCoverThumb
                        coverUrl={item.coverUrl || ''}
                        onFetch={
                          String(item.mangaUrl || '').trim()
                            ? () => onFetchFavorite?.(item)
                            : undefined
                        }
                        fetchTitle={t('favorites.fetchTitle')}
                        frameClassName="absolute inset-0 w-full h-full shrink-0 bg-surface-container-highest overflow-hidden border-0 flex items-center justify-center p-0 rounded-none"
                        placeholderIconClassName="text-5xl"
                      />
                      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 flex items-end justify-center p-4">
                        <div className="pointer-events-auto">
                          <FavoriteCardActions
                            item={item}
                            savePath={savePath}
                            t={t}
                            onReadFavorite={onReadFavorite}
                            onFetchFavorite={onFetchFavorite}
                            onOpenMangaFolder={onOpenMangaFolder}
                            onRemoveFavorite={onRemoveFavorite}
                            onToggleNotifyWatch={onToggleFavoriteNotifyWatch}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 space-y-1">
                      <h4 className="font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wide text-primary/90 truncate"
                        data-tooltip={resolveSiteLabel(item.siteId)}
                      >
                        {resolveSiteLabel(item.siteId)}
                      </p>
                      <FavoriteChapterMeta
                        item={item}
                        sync={favoriteSyncById[item.id]}
                        t={t}
                        onEnqueuePending={() => onEnqueuePendingChapters?.(item)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <StudioTable
            columns={[
              {
                key: 'cover',
                width: 'w-14',
                header: '',
                ariaLabel: t('favorites.col.cover'),
                headerClassName: 'p-3',
              },
              {
                key: 'manga',
                header: t('favorites.col.manga'),
                headerClassName: 'min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
              },
              {
                key: 'site',
                width: 'w-36',
                header: t('favorites.col.site'),
                headerClassName: 'w-36 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant whitespace-nowrap',
              },
              {
                key: 'chapters',
                width: 'w-32',
                header: t('favorites.col.chapters'),
                headerClassName: 'w-32 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant whitespace-nowrap',
              },
              {
                key: 'actions',
                width: 'w-56',
                header: '',
                ariaLabel: t('favorites.col.actionsAria'),
                align: 'right',
                headerClassName: 'w-56 p-3 pr-4 sm:pr-5',
              },
            ]}
            data={sortedFiltered}
            keyExtractor={(item) => item.id}
            emptyState={
              <EmptyState
                icon={favorites.length === 0 ? 'favorite' : 'search_off'}
                title={favorites.length === 0 ? t('favorites.empty') : t('favorites.noResults')}
              />
            }
            rowClassName={(item, i) =>
              isFavoriteTabBadgeUnread(item.id, favoriteSyncById[item.id], favoriteTabBadgeReadById)
                ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/[0.22]'
                : i % 2 === 0
                  ? 'bg-surface hover:bg-surface-container-high'
                  : 'bg-surface-container-low/30 hover:bg-surface-container-high'
            }
            renderRow={(item) => (
              <>
                <td className="p-2 sm:p-3 align-middle w-14">
                  <QueueCoverThumb
                    coverUrl={item.coverUrl || ''}
                    onFetch={
                      String(item.mangaUrl || '').trim()
                        ? () => onFetchFavorite?.(item)
                        : undefined
                    }
                    fetchTitle={t('favorites.fetchTitle')}
                    frameClassName="w-10 h-13 shrink-0 rounded overflow-hidden bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center"
                  />
                </td>
                <td className="min-w-0 overflow-hidden p-2 sm:p-3 align-middle font-medium text-on-surface">
                  <span className="line-clamp-2">
                    {item.title}
                  </span>
                </td>
                <td
                  className="w-36 min-w-0 overflow-hidden p-2 sm:p-3 align-middle text-on-surface-variant text-xs truncate"
                  data-tooltip={resolveSiteLabel(item.siteId)}
                >
                  {resolveSiteLabel(item.siteId)}
                </td>
                <td className="w-32 min-w-0 overflow-hidden p-2 sm:p-3 align-middle text-sm whitespace-nowrap">
                  <FavoriteChapterMeta
                    item={item}
                    sync={favoriteSyncById[item.id]}
                    t={t}
                    onEnqueuePending={() => onEnqueuePendingChapters?.(item)}
                  />
                </td>
                <td className="w-56 p-2 sm:p-3 pr-4 sm:pr-5 align-middle text-right">
                  <FavoriteListActions
                    item={item}
                    savePath={savePath}
                    t={t}
                    onReadFavorite={onReadFavorite}
                    onFetchFavorite={onFetchFavorite}
                    onOpenMangaFolder={onOpenMangaFolder}
                    onRemoveFavorite={onRemoveFavorite}
                    onToggleNotifyWatch={onToggleFavoriteNotifyWatch}
                  />
                </td>
              </>
            )}
          />
        )}

        <div className="mt-auto bg-surface-container-high rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 border border-outline-variant/20 shadow-sm shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-outline font-medium">
              {favoritesForSiteOnly.length} {t('queue.tab.favorites')}
              <span className="text-on-surface-variant font-normal">
                {' · '}
                {siteFilter ? resolveSiteLabel(siteFilter) : t('favorites.filterSiteAll')}
              </span>
            </span>
            {hasNewCountInSiteScope > 0 ? (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                {t('favorites.fetchAllHasNewSummary', {
                  n: hasNewCountInSiteScope,
                })}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={fetchAllFavoritesBusy || !savePath.trim() || favoritesForSiteOnly.length === 0}
            onClick={() => onFetchAllFavorites?.(siteFilter)}
            data-tooltip={!savePath.trim() ? t('favorites.fetchAllNeedSave') : t('favorites.fetchAllTitle')}
            className="flex items-center gap-2 px-6 py-2 text-xs font-bold bg-primary text-on-primary rounded-md shadow-md shadow-primary/20 hover:brightness-110 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <span
              className={`material-symbols-outlined text-sm ${fetchAllFavoritesBusy ? 'animate-spin' : ''}`}
            >
              sync
            </span>
            {t('favorites.fetchAll')}
          </button>
        </div>
      </div>
    </div>
  );
}
