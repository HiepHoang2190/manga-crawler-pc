import React from 'react';
import { SearchableSelect, ViewModeToggle } from '../../../../shared';
import { SORT_LABEL_KEYS } from './offlineLibraryUtils';

export function OfflineLibraryToolbar({
  viewMode,
  setViewMode,
  sortMode,
  cycleSort,
  query,
  setQuery,
  sourceFilter,
  setSourceFilter,
  t,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <ViewModeToggle
          viewMode={viewMode}
          onChange={setViewMode}
          size="lg"
        />
        <div className="h-6 w-px shrink-0 bg-outline-variant/30 mx-0.5 self-center" aria-hidden />
        <button
          type="button"
          onClick={cycleSort}
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
            sortMode !== 'titleAsc'
              ? 'border-primary/40 bg-primary/15 text-primary font-bold shadow-xs'
              : 'border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50'
          }`}
          data-tooltip={t('offlineLibrary.sortHint', {
            mode: t(SORT_LABEL_KEYS[sortMode] || SORT_LABEL_KEYS.titleAsc),
          })}
          aria-label={t('offlineLibrary.sortHint', {
            mode: t(SORT_LABEL_KEYS[sortMode] || SORT_LABEL_KEYS.titleAsc),
          })}
        >
          <span className="material-symbols-outlined text-[20px] leading-none">sort_by_alpha</span>
        </button>
      </div>

      <div className="flex-1 flex h-11 items-center gap-2 bg-surface-container-highest rounded-lg px-3 sm:px-4 max-w-xl border border-outline-variant/10 min-w-[200px]">
        <span className="material-symbols-outlined text-outline shrink-0 text-[20px] leading-none">
          filter_list
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('offlineLibrary.searchPlaceholder')}
          className="min-h-0 h-8 bg-transparent border-none text-sm leading-normal focus:ring-0 p-0 flex-1 min-w-0 text-on-surface outline-none placeholder:text-outline"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            data-tooltip={t('offlineLibrary.clearSearch')}
            aria-label={t('offlineLibrary.clearSearch')}
            className="cursor-pointer shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">close</span>
          </button>
        ) : null}
      </div>

      <div className="shrink-0">
        <SearchableSelect
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            { value: 'all', label: t('offlineLibrary.filterSourceAll') },
            { value: 'favorites', label: t('offlineLibrary.filterSourceFavorites'), icon: 'favorite' },
            { value: 'save', label: t('offlineLibrary.filterSourceSave'), icon: 'download' },
            { value: 'extra', label: t('offlineLibrary.filterSourceExtra'), icon: 'folder' },
            { value: 'archives', label: t('offlineLibrary.filterSourceArchives'), icon: 'archive' },
          ]}
          placeholder={t('offlineLibrary.filterSourceAll')}
          className="min-w-[11.5rem]"
        />
      </div>
    </div>
  );
}

export default OfflineLibraryToolbar;

