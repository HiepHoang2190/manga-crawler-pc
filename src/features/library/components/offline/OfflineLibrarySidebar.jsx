import React, { useMemo } from 'react';
import { SearchableSelect, SectionTitle } from '../../../../shared';

function getPathBaseName(fullPath) {
  const s = String(fullPath || '').trim();
  if (!s) return '';
  const parts = s.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || s;
}

export function OfflineLibrarySidebar({
  query,
  setQuery,
  sourceFilter,
  setSourceFilter,
  sortMode,
  setSortMode,
  base,
  extraPaths = [],
  stats = {},
  onBrowseSavePath,
  onOpenFolder,
  onRemoveExtraPath,
  t,
}) {
  const normalizedFilter = sourceFilter || 'all';

  const collectionItems = useMemo(
    () => [
      {
        id: 'all',
        label: t('offlineLibrary.filterSourceAll'),
        count: Number(stats.total || 0),
        dotClass: 'bg-primary',
      },
      {
        id: 'save',
        label: t('offlineLibrary.filterSourceSave'),
        count: Number(stats.save || 0),
        dotClass: 'bg-sky-500',
      },
      {
        id: 'extra',
        label: t('offlineLibrary.filterSourceExtra'),
        count: Number(stats.extra || 0),
        dotClass: 'bg-amber-500',
      },
      {
        id: 'archives',
        label: t('offlineLibrary.filterSourceArchives'),
        count: Number(stats.archives || 0),
        dotClass: 'bg-violet-500',
      },
    ],
    [stats, t]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'titleAsc', label: t('favorites.sort.titleAsc'), materialIcon: 'sort_by_alpha' },
      { value: 'titleDesc', label: t('favorites.sort.titleDesc'), materialIcon: 'sort_by_alpha' },
      { value: 'chaptersDesc', label: t('offlineLibrary.sort.chaptersDesc'), materialIcon: 'format_list_numbered' },
    ],
    [t]
  );

  return (
    <div
      data-testid="offline-library-sidebar"
      className="p-3.5 space-y-4 flex flex-col flex-1 min-h-0"
    >
      {/* 1. Search */}
      <div>
        <SectionTitle className="mb-1.5 px-0.5">
          {t('offlineLibrary.sidebar.search')}
        </SectionTitle>
        <div className="relative flex items-center">
          <span className="material-symbols-outlined text-[18px] leading-none text-outline absolute left-3 pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('offlineLibrary.searchPlaceholder')}
            aria-label={t('offlineLibrary.searchPlaceholder')}
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest pl-9 pr-8 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              data-tooltip={t('offlineLibrary.clearSearch')}
              aria-label={t('offlineLibrary.clearSearch')}
              className="absolute right-2.5 text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5 rounded"
            >
              <span className="material-symbols-outlined text-[15px] leading-none">close</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Collections */}
      <div>
        <SectionTitle className="mb-1.5 px-0.5">
          {t('offlineLibrary.sidebar.collections')}
        </SectionTitle>
        <div
          role="group"
          aria-label={t('offlineLibrary.sidebar.collections')}
          className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/60 p-1 space-y-0.5 text-xs"
        >
          {collectionItems.map((opt) => {
            const isActive = normalizedFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isActive}
                aria-label={`${opt.label} (${opt.count})`}
                onClick={() => setSourceFilter(opt.id === 'all' ? '' : opt.id)}
                className={`w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-medium'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                  <span className="truncate">{opt.label}</span>
                </span>
                <span className="font-bold tabular-nums shrink-0">{opt.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Sort */}
      <div>
        <SectionTitle className="mb-1.5 px-0.5">
          {t('offlineLibrary.sidebar.sort')}
        </SectionTitle>
        <SearchableSelect
          value={sortMode}
          onChange={setSortMode}
          options={sortOptions}
          placeholder=""
          className="w-full"
          showPlaceholderOption={false}
        />
      </div>

      {/* 4. Library Folders */}
      <div className="space-y-2">
        <SectionTitle className="px-0.5">
          {t('offlineLibrary.sidebar.folders')}
        </SectionTitle>
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/50 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="material-symbols-outlined text-[17px] leading-none text-primary shrink-0">
                folder
              </span>
              <span
                className={`text-xs truncate ${
                  base ? 'text-on-surface font-medium' : 'text-error font-medium'
                }`}
                data-tooltip={base || t('offlineLibrary.needSavePath')}
              >
                {base || t('offlineLibrary.needSavePath')}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {typeof onBrowseSavePath === 'function' ? (
                <button
                  type="button"
                  onClick={() => onBrowseSavePath()}
                  data-tooltip={t('offlineLibrary.sidebar.changeSaveFolder')}
                  aria-label={t('offlineLibrary.sidebar.changeSaveFolder')}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">folder_open</span>
                </button>
              ) : null}
              {base && typeof onOpenFolder === 'function' ? (
                <button
                  type="button"
                  onClick={() => onOpenFolder(base)}
                  data-tooltip={t('offlineLibrary.sidebar.openFolder')}
                  aria-label={t('offlineLibrary.sidebar.openFolder')}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">open_in_new</span>
                </button>
              ) : null}
            </div>
          </div>

          {extraPaths.length > 0 ? (
            <div className="pt-2 border-t border-outline-variant/15 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/75 px-0.5">
                {t('offlineLibrary.sidebar.pinnedFolders', { count: extraPaths.length })}
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                {extraPaths.map((entry) => {
                  const p = String(entry?.path || '').trim();
                  if (!p) return null;
                  const icon = entry?.kind === 'cbz' ? 'archive' : 'create_new_folder';
                  return (
                    <div
                      key={p}
                      className="flex items-center justify-between gap-1.5 rounded-lg px-1.5 py-1 hover:bg-surface-container-high/70 transition-colors min-w-0"
                    >
                      <span
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-[11px] text-on-surface-variant"
                        data-tooltip={p}
                      >
                        <span className="material-symbols-outlined text-[14px] leading-none text-primary/80 shrink-0">
                          {icon}
                        </span>
                        <span className="truncate">{getPathBaseName(p)}</span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {typeof onOpenFolder === 'function' ? (
                          <button
                            type="button"
                            onClick={() => onOpenFolder(p)}
                            data-tooltip={t('offlineLibrary.sidebar.openFolder')}
                            aria-label={t('offlineLibrary.sidebar.openFolder')}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant/75 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[13px] leading-none">open_in_new</span>
                          </button>
                        ) : null}
                        {typeof onRemoveExtraPath === 'function' ? (
                          <button
                            type="button"
                            onClick={() => onRemoveExtraPath(p)}
                            data-tooltip={t('offlineLibrary.removePin')}
                            aria-label={t('offlineLibrary.removePin')}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant/75 hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 5. Overview Stats */}
      <div className="mt-auto pt-2">
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
          <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px]">bar_chart</span>
            <span>{t('offlineLibrary.sidebar.overview')}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <span className="text-on-surface-variant">{t('offlineLibrary.sidebar.totalSeries')}</span>
            <span className="font-bold text-on-surface text-right tabular-nums">{stats.total || 0}</span>
            <span className="text-on-surface-variant">{t('offlineLibrary.sidebar.totalChapters')}</span>
            <span className="font-bold text-on-surface text-right tabular-nums">{stats.totalChapters || 0}</span>
            <span className="text-on-surface-variant">{t('offlineLibrary.filterSourceSave')}</span>
            <span className="font-bold text-sky-600 dark:text-sky-400 text-right tabular-nums">{stats.save || 0}</span>
            <span className="text-on-surface-variant">{t('offlineLibrary.filterSourceArchives')}</span>
            <span className="font-bold text-violet-600 dark:text-violet-400 text-right tabular-nums">
              {stats.archives || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OfflineLibrarySidebar;
