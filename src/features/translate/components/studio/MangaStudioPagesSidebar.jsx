import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useI18n } from '../../../../context/I18nContext';

/**
 * MangaStudioPagesSidebar — Cột Left Rail hiển thị danh sách trang thumbnail & bộ lọc tìm kiếm
 */
export function MangaStudioPagesSidebar({
  pages = [],
  activePageIndex = 0,
  onSelectPage,
  onImportFiles,
  onImportFolder,
  onPromptRemoveAll,
  onPromptRemovePage,
}) {
  const { t } = useI18n();
  const [filterQuery, setFilterQuery] = useState('');
  const [showAddPageDropdown, setShowAddPageDropdown] = useState(false);
  const addPageDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAddPageDropdown) return;
    const handleClickOutside = (e) => {
      if (addPageDropdownRef.current && !addPageDropdownRef.current.contains(e.target)) {
        setShowAddPageDropdown(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showAddPageDropdown]);

  // Filter pages
  const filteredPages = useMemo(() => {
    if (!filterQuery.trim()) return pages;
    const q = filterQuery.toLowerCase();
    return pages.filter(
      (p) => p.filename.toLowerCase().includes(q) || String(p.index + 1).includes(q)
    );
  }, [pages, filterQuery]);

  return (
    <div className="flex flex-col flex-1 min-h-0 select-none">
      {/* Header Pages & Filter */}
      <div className="p-3 border-b border-outline-variant/20 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-on-surface">{t('translate.studio.pagesTitle')}</span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono text-[11px] font-semibold">
              {pages.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* + Button to import images */}
            <div ref={addPageDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setShowAddPageDropdown((prev) => !prev)}
                className="h-6.5 px-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container hover:border-primary text-on-surface flex items-center gap-1 text-xs font-medium shadow-2xs transition-all cursor-pointer"
                data-tooltip={t('translate.studio.pageAdd')}
                aria-label={t('translate.studio.pageAdd')}
              >
                <span className="material-symbols-outlined text-[16px] text-primary">add</span>
                <span>{t('translate.studio.pageAdd')}</span>
              </button>

              {showAddPageDropdown && (
                <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-xl p-1 z-[100] text-xs space-y-0.5 animate-fadeIn text-on-surface">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPageDropdown(false);
                      onImportFiles?.();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-surface-container-high text-on-surface cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">add_photo_alternate</span>
                    <div>
                      <div className="font-semibold text-on-surface">{t('translate.studio.pageAddFiles')}</div>
                      <div className="text-[10px] text-on-surface-variant">{t('translate.studio.pageAddFilesSub')}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPageDropdown(false);
                      onImportFolder?.();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-surface-container-high text-on-surface cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px] text-amber-500">create_new_folder</span>
                    <div>
                      <div className="font-semibold text-on-surface">{t('translate.studio.pageAddFolder')}</div>
                      <div className="text-[10px] text-on-surface-variant">{t('translate.studio.pageAddFolderSub')}</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {pages.length > 0 && (
              <button
                type="button"
                onClick={onPromptRemoveAll}
                className="h-6.5 px-1.5 text-[11px] text-on-surface-variant hover:text-error rounded-lg hover:bg-error/10 transition-colors flex items-center gap-0.5 cursor-pointer"
                data-tooltip={t('translate.studio.pageClearAllTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                <span>{t('translate.studio.pageClearAll')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <span className="material-symbols-outlined text-[15px] text-on-surface-variant/60 absolute left-2.5 top-2">
            search
          </span>
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={t('translate.studio.filterPagesPlaceholder')}
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest pl-8 pr-7 py-1 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-2 text-on-surface-variant hover:text-on-surface text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Thumbnail List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {pages.length > 0 && filteredPages.length === 0 ? (
          <div className="text-center py-8 text-xs text-on-surface-variant">
            {t('translate.studio.noPagesFound', { query: filterQuery })}
          </div>
        ) : (
          filteredPages.map((p) => {
            const isSelected = p.index === activePageIndex;
            const isTranslated = Array.isArray(p.layers) && p.layers.some((l) => l.text && l.text.trim());
            return (
              <div
                key={p.id}
                onClick={() => onSelectPage?.(p.index)}
                className={`cursor-pointer group flex items-center gap-2.5 p-2 rounded-2xl transition-all border ${isSelected
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-xs ring-1 ring-primary/20'
                  : 'border-outline-variant/15 bg-surface-container-lowest/80 hover:bg-surface-container hover:border-outline-variant/30 text-on-surface'
                  }`}
              >
                <div className="relative w-11 h-15 bg-surface-container-high rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-outline-variant/20 shadow-xs">
                  {(p.dataUrl || p.originalDataUrl || p.translatedImageDataUrl) ? (
                    <img
                      src={p.dataUrl || p.originalDataUrl || p.translatedImageDataUrl}
                      alt={p.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-on-surface-variant gap-0.5">
                      <span className="material-symbols-outlined text-[13px] animate-spin text-primary">sync</span>
                      <span className="text-[9px] font-mono">#{p.index + 1}</span>
                    </div>
                  )}
                  {/* Translation Status Dot Badge */}
                  <span
                    className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-surface-container-lowest shadow-xs ${isTranslated ? 'bg-emerald-500' : 'bg-outline-variant/60'
                      }`}
                    data-tooltip={isTranslated ? t('translate.studio.statusTranslated') : t('translate.studio.statusUntranslated')}
                  />
                </div>
                <div className="flex-1 min-w-0 pr-1">
                  <p className={`text-xs truncate ${isSelected ? 'font-bold text-primary' : 'font-semibold text-on-surface'}`}>
                    {p.filename}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-on-surface-variant">
                      {t('translate.studio.layersCount', { count: p.layers.length })}
                    </span>
                    <span className="text-[9px] text-outline-variant/50">•</span>
                    <span className={`text-[10px] font-medium flex items-center gap-1 ${isTranslated ? 'text-emerald-500' : 'text-on-surface-variant/60'}`}>
                      {isTranslated ? t('translate.studio.statusTranslated') : t('translate.studio.statusUntranslated')}
                    </span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant/70 font-mono mt-0.5">
                    {p.width && p.height ? `${p.width} × ${p.height}` : '...'}
                  </p>
                </div>

                {/* Nút xóa trang khỏi danh sách */}
                <button
                  type="button"
                  onClick={(e) => onPromptRemovePage?.(p, e)}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 ${isSelected
                    ? 'opacity-70 hover:opacity-100 text-primary hover:bg-primary/20'
                    : 'opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error hover:bg-error/10'
                    }`}
                  data-tooltip={t('translate.studio.removePagePrompt')}
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

