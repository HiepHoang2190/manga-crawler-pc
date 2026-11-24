import React from 'react';
import { SearchableSelect } from '../../../../shared';

export function OfflineLibraryToolbar({
  query,
  setQuery,
  sourceFilter,
  setSourceFilter,
  t,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
      <div className="flex-1 flex h-10 items-center gap-2 bg-surface-container-highest rounded-xl px-3 sm:px-3.5 border border-outline-variant/25 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-colors min-w-[200px]">
        <span className="material-symbols-outlined text-outline shrink-0 text-[18px] leading-none">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('offlineLibrary.searchPlaceholder')}
          className="min-h-0 h-8 bg-transparent border-none text-xs sm:text-sm leading-normal focus:ring-0 p-0 flex-1 min-w-0 text-on-surface outline-none placeholder:text-outline"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            data-tooltip={t('offlineLibrary.clearSearch')}
            aria-label={t('offlineLibrary.clearSearch')}
            className="cursor-pointer shrink-0 rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
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
