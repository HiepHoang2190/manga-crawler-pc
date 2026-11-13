import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { ResizeSplitter, SearchableSelect, StudioLayout, useStudioLayout, ViewModeToggle } from '../../shared';
import {
  buildSessionAfterScan,
  filterBulkScanItems,
  loadBulkScanSessionsAsync,
  loadBulkScanSiteId,
  persistBulkScanSiteId,
  saveBulkScanSessionAsync,
} from './bulkScanSessionPrefs.mjs';
import { loadPanelUi, savePanelUi } from '../../utils/panelUiPrefs';

const BTN_ROW =
  'inline-flex items-center justify-center gap-2 min-h-9 px-3 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none cursor-pointer';
const BTN_SURFACE = `${BTN_ROW} bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20`;
const BTN_PRIMARY = `${BTN_ROW} bg-primary text-on-primary border border-primary hover:opacity-95 shadow-sm`;

const PAGE_SIZES = [24, 48, 96];

const BULK_SCAN_FILTERS = [
  { id: 'all', labelKey: 'bulkScan.filterAll', icon: 'filter_alt' },
  { id: 'selected', labelKey: 'bulkScan.filterSelected', icon: 'check_circle' },
  { id: 'unselected', labelKey: 'bulkScan.filterUnselected', icon: 'radio_button_unchecked' },
];

function connectorHost(domain) {
  try {
    return new URL(domain).hostname;
  } catch {
    return domain;
  }
}

function formatScannedWhen(scannedAt) {
  if (!scannedAt) return '';
  try {
    const d = new Date(scannedAt);
    if (Number.isNaN(d.getTime())) return String(scannedAt);
    return d.toLocaleString();
  } catch {
    return String(scannedAt);
  }
}

export default function BulkScanPanel({
  connectors = [],
  onEnqueueLoadedManga,
  savePath = '',
  mangaLoadOpts = {},
  subtabsSlot = null,
}) {
  const { t } = useI18n();
  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'bulk_scan',
    defaultLeftWidth: 300,
    minLeftWidth: 260,
    maxLeftWidth: 480,
  });
  const supported = useMemo(
    () =>
      connectors
        .filter((c) => c && c.supportsBulkScan && c.id)
        .sort((a, b) =>
          String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, {
            sensitivity: 'base',
          }),
        ),
    [connectors],
  );

  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [listFilter, setListFilter] = useState('all');
  const [scannedAt, setScannedAt] = useState('');
  const [persistWarning, setPersistWarning] = useState(false);
  const [busyList, setBusyList] = useState(false);
  const [listProgress, setListProgress] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [enqueueBusy, setEnqueueBusy] = useState(false);
  const [enqueueProgress, setEnqueueProgress] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const m = loadPanelUi().bulkScan?.viewMode;
    return m === 'list' ? 'list' : 'grid';
  });
  const [pageSize, setPageSize] = useState(() => {
    const n = Number(loadPanelUi().bulkScan?.pageSize);
    return PAGE_SIZES.includes(n) ? n : 24;
  });
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const cancelRef = useRef(false);
  const selectedSiteIdRef = useRef('');
  /** Absolute index in `visibleItems` — shift+click range select (ChapterList pattern). */
  const lastClickedIndexRef = useRef(null);

  const hydrateSite = useCallback(async (siteId) => {
    const id = String(siteId || '').trim();
    if (!id) return;
    const all = await loadBulkScanSessionsAsync();
    const session = all[id] || {};
    const list = Array.isArray(session.items) ? session.items : [];
    setItems(list);
    setSelected(new Set(Array.isArray(session.selectedUrls) ? session.selectedUrls : []));
    setScannedAt(session.scannedAt || '');
    setFetchError('');
    setListFilter('all');
  }, []);

  // Pick site when bulk-scan connectors are available. Do NOT clear items when
  // supported is briefly empty (FALLBACK list used to omit supportsBulkScan).
  useEffect(() => {
    const ids = supported.map((c) => c.id);
    if (!ids.length) return;
    setSelectedSiteId((prev) => {
      if (prev && ids.includes(prev)) return prev;
      const next = loadBulkScanSiteId(ids);
      if (next) persistBulkScanSiteId(next);
      return next;
    });
  }, [supported]);

  // Restore per-site session whenever the active site is set (mount / site change).
  useEffect(() => {
    if (!selectedSiteId) return;
    let cancelled = false;
    (async () => {
      await hydrateSite(selectedSiteId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId, hydrateSite]);

  selectedSiteIdRef.current = selectedSiteId;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.subscribeBulkScanProgress) return undefined;
    const unsub = api.subscribeBulkScanProgress((p) => {
      if (!p || p.siteId !== selectedSiteIdRef.current) return;
      if (typeof p.page === 'number') setListProgress(p);
    });
    return () => unsub?.();
  }, []);

  const selectOptions = useMemo(
    () =>
      supported.map((c) => ({
        value: c.id,
        label: c.domain
          ? `${c.label || c.id} (${connectorHost(c.domain)})`
          : String(c.label || c.id),
        icon: c.icon,
      })),
    [supported],
  );

  const handleSiteChange = useCallback((nextId) => {
    const id = String(nextId || '').trim();
    if (!id) return;
    persistBulkScanSiteId(id);
    setSelectedSiteId(id);
  }, []);

  const persistSelection = useCallback(
    (nextSelected) => {
      if (!selectedSiteId) return;
      const session = {
        items,
        selectedUrls: [...nextSelected],
        scannedAt: scannedAt || new Date().toISOString(),
      };
      void (async () => {
        // Skip empty in-memory overwrite if file/local already has a list.
        if (!items.length) {
          const existing = (await loadBulkScanSessionsAsync())[selectedSiteId];
          if (Array.isArray(existing?.items) && existing.items.length) return;
        }
        const ok = await saveBulkScanSessionAsync(selectedSiteId, session);
        if (!ok) setPersistWarning(true);
      })();
    },
    [selectedSiteId, items, scannedAt],
  );

  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const visibleItems = useMemo(() => {
    let list = filterBulkScanItems(items, selected, listFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) => (item.title || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selected, listFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const pageItems = useMemo(
    () => visibleItems.slice(sliceStart, sliceStart + pageSize),
    [visibleItems, sliceStart, pageSize],
  );
  const fromRow = visibleItems.length ? sliceStart + 1 : 0;
  const toRow = Math.min(sliceStart + pageSize, visibleItems.length);

  const controlsBusy = busyList || enqueueBusy;

  useEffect(() => {
    savePanelUi({ bulkScan: { viewMode, pageSize } });
  }, [viewMode, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [selectedSiteId, listFilter, items, pageSize, searchQuery]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    lastClickedIndexRef.current = null;
  }, [selectedSiteId, listFilter, items, page]);

  const runLoad = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.fetchBulkScan) {
      setFetchError(t('bulkScan.needElectron'));
      return;
    }
    if (!selectedSiteId) {
      setFetchError(t('bulkScan.pickSource'));
      return;
    }
    const prevSelectedUrls = [...selected];
    const prevHadItems = items.length > 0;
    setBusyList(true);
    setFetchError('');
    setListProgress(null);
    try {
      const res = await api.fetchBulkScan({ siteId: selectedSiteId });
      if (!res?.ok) {
        // Keep previous in-memory session; only surface the error.
        setFetchError(res?.error || t('bulkScan.fetchFailed'));
        return;
      }
      const list = Array.isArray(res.items) ? res.items : [];
      // Empty ok must not wipe a prior non-empty session (memory or disk).
      if (!list.length && prevHadItems) {
        setFetchError(t('bulkScan.empty'));
        return;
      }
      const session = buildSessionAfterScan({ prevSelectedUrls, items: list });
      setItems(session.items);
      setSelected(new Set(session.selectedUrls));
      setScannedAt(session.scannedAt);
      const saved = await saveBulkScanSessionAsync(selectedSiteId, session);
      if (!saved) setPersistWarning(true);
      if (!list.length) {
        setFetchError(t('bulkScan.empty'));
      } else if (res.error) {
        setFetchError(t('bulkScan.partialWarning'));
      }
    } catch (e) {
      // Same non-destructive policy as !res?.ok — keep items/selected/scannedAt.
      setFetchError(String(e?.message || e || t('bulkScan.fetchFailed')));
    } finally {
      setBusyList(false);
      setListProgress(null);
    }
  }, [t, selectedSiteId, selected, items]);

  const checkAll = useCallback(() => {
    const next = new Set(items.map((i) => i.mangaUrl));
    setSelected(next);
    persistSelection(next);
  }, [items, persistSelection]);

  const uncheckAll = useCallback(() => {
    const next = new Set();
    setSelected(next);
    persistSelection(next);
  }, [persistSelection]);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) uncheckAll();
    else checkAll();
  }, [allSelected, checkAll, uncheckAll]);

  const applyRowSelection = useCallback(
    (e, item, pageIndex) => {
      if (controlsBusy) return;
      const absIndex = sliceStart + pageIndex;
      if (e.shiftKey && lastClickedIndexRef.current !== null) {
        const from = Math.min(lastClickedIndexRef.current, absIndex);
        const to = Math.max(lastClickedIndexRef.current, absIndex);
        const urls = visibleItems.slice(from, to + 1).map((row) => row.mangaUrl);
        const next = new Set(urls);
        setSelected(next);
        persistSelection(next);
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(item.mangaUrl)) next.delete(item.mangaUrl);
          else next.add(item.mangaUrl);
          persistSelection(next);
          return next;
        });
      }
      lastClickedIndexRef.current = absIndex;
    },
    [controlsBusy, visibleItems, persistSelection, sliceStart],
  );

  const stopEnqueue = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const runEnqueue = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.loadManga || typeof onEnqueueLoadedManga !== 'function') {
      setFetchError(t('bulkScan.needElectron'));
      return;
    }
    if (!selectedSiteId) {
      setFetchError(t('bulkScan.pickSource'));
      return;
    }
    if (!String(savePath || '').trim()) {
      setFetchError(t('app.log.needSavePathShort'));
      return;
    }
    const chosen = items.filter((i) => selected.has(i.mangaUrl));
    if (!chosen.length) {
      setFetchError(t('bulkScan.needSelection'));
      return;
    }

    cancelRef.current = false;
    setEnqueueBusy(true);
    setFetchError('');
    try {
      for (let i = 0; i < chosen.length; i += 1) {
        if (cancelRef.current) break;
        const row = chosen[i];
        setEnqueueProgress({
          current: i + 1,
          total: chosen.length,
          title: row.title || row.mangaUrl,
        });
        try {
          const loadResult = await api.loadManga(selectedSiteId, row.mangaUrl, mangaLoadOpts || {});
          if (cancelRef.current) break;
          await Promise.resolve(onEnqueueLoadedManga(loadResult));
        } catch (e) {
          console.warn('[bulkScan] enqueue item failed', e);
        }
      }
    } finally {
      setEnqueueBusy(false);
      setEnqueueProgress(null);
      cancelRef.current = false;
    }
  }, [items, selected, onEnqueueLoadedManga, savePath, selectedSiteId, mangaLoadOpts, t]);

  const listStatus = useMemo(() => {
    if (busyList && listProgress) {
      return t('bulkScan.loadingPage', {
        page: listProgress.page,
        total: listProgress.totalPages,
      });
    }
    if (busyList) return t('bulkScan.loading');
    if (enqueueBusy && enqueueProgress) {
      return t('bulkScan.enqueueProgress', enqueueProgress);
    }
    return '';
  }, [busyList, listProgress, enqueueBusy, enqueueProgress, t]);

  const cookieHint =
    selectedSiteId === 'comicvn' ? t('bulkScan.cookieHintComicvn') : null;

  const restoredHint =
    scannedAt && items.length && !busyList
      ? t('bulkScan.restoredHint', { when: formatScannedWhen(scannedAt) })
      : '';

  const filterOptions = useMemo(
    () =>
      BULK_SCAN_FILTERS.map((f) => {
        const count =
          f.id === 'all'
            ? items.length
            : f.id === 'selected'
              ? selectedCount
              : items.length - selectedCount;
        return {
          value: f.id,
          label: `${t(f.labelKey)} (${count})`,
          materialIcon: f.icon,
        };
      }),
    [items.length, selectedCount, t],
  );

  const pageSizeOptions = useMemo(
    () => PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) })),
    [],
  );

  const masterIcon = allSelected
    ? 'check_box'
    : someSelected
      ? 'indeterminate_check_box'
      : 'check_box_outline_blank';

  return (
    <StudioLayout className="w-full h-full">
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-2 min-w-0">
            {subtabsSlot}
            {items.length > 0 ? (
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={controlsBusy}
                  aria-label={allSelected ? t('bulkScan.uncheckAll') : t('bulkScan.checkAll')}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-highest/60 hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer border border-outline-variant/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none text-primary">
                    {masterIcon}
                  </span>
                </button>

                <SearchableSelect
                  value={listFilter}
                  onChange={(val) => setListFilter(val)}
                  size="sm"
                  showPlaceholderOption={false}
                  className="min-w-[11.5rem]"
                  options={filterOptions}
                  disabled={controlsBusy}
                />

                <div className="relative flex items-center min-w-[12rem] max-w-xs">
                  <span className="material-symbols-outlined absolute left-2.5 text-[17px] text-on-surface-variant/60 pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('bulkScan.filterPlaceholder') || 'Lọc truyện theo tên…'}
                    aria-label={t('bulkScan.filterPlaceholder') || 'Lọc truyện theo tên…'}
                    className="h-8 w-full rounded-lg bg-surface-container-high/60 pl-8 pr-7 text-xs text-on-surface outline-none border border-outline-variant/25 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                    autoComplete="off"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-on-surface-variant/60 hover:text-on-surface cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        }
        rightSlot={
          items.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tabular-nums text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-md border border-outline-variant/20 max-xl:hidden">
                {t('bulkScan.selectedCount', { count: selectedCount })}
                {items.length ? ` / ${items.length}` : ''}
              </span>

              <ViewModeToggle
                viewMode={viewMode}
                onChange={setViewMode}
                size="sm"
                disabled={controlsBusy}
              />
            </div>
          ) : null
        }
      />

      <StudioLayout.Body>
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 space-y-4">
            {/* Source Picker */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0 block">
                {t('bulkScan.pickSource')}
              </label>
              <SearchableSelect
                value={selectedSiteId}
                onChange={handleSiteChange}
                options={selectOptions}
                placeholder={t('bulkScan.pickSource')}
                showPlaceholderOption={false}
                className="w-full min-w-0"
                disabled={controlsBusy}
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                data-testid="bulk-sidebar-scan-btn"
                className={`w-full ${items.length > 0 ? BTN_SURFACE : BTN_PRIMARY}`}
                disabled={controlsBusy || !selectedSiteId}
                onClick={() => void runLoad()}
              >
                <span className={`material-symbols-outlined text-[18px] ${busyList ? 'animate-spin' : ''}`}>
                  sync
                </span>
                <span>
                  {busyList
                    ? t('bulkScan.loading')
                    : items.length > 0
                      ? t('bulkScan.rescanSource')
                      : t('bulkScan.scanSource')}
                </span>
              </button>

              <button
                type="button"
                data-testid="bulk-enqueue-btn"
                className={`w-full ${BTN_PRIMARY}`}
                disabled={!selectedCount || controlsBusy || !selectedSiteId}
                onClick={() => void runEnqueue()}
              >
                <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                {enqueueBusy ? t('bulkScan.enqueueBusy') : t('bulkScan.enqueueSelected')}
              </button>
              {enqueueBusy ? (
                <button type="button" className={`w-full ${BTN_SURFACE}`} onClick={stopEnqueue}>
                  <span className="material-symbols-outlined text-[18px]">cancel</span>
                  {t('bulkScan.stop')}
                </button>
              ) : null}
            </div>

            {/* Alerts & Hints */}
            {cookieHint ? (
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high/30 p-2.5 text-xs leading-relaxed text-on-surface-variant flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 text-on-surface-variant/70 mt-0.5">
                  vpn_key
                </span>
                <span className="leading-snug">{cookieHint}</span>
              </div>
            ) : null}

            {restoredHint || listStatus ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">info</span>
                <span className="leading-snug">{restoredHint || listStatus}</span>
              </div>
            ) : null}

            {persistWarning ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-100 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">warning</span>
                <span className="leading-snug">{t('bulkScan.persistWarning')}</span>
              </div>
            ) : null}

            {fetchError ? (
              <div className="rounded-xl border border-error/40 bg-error/10 p-2.5 text-xs text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                <span className="leading-snug">{fetchError}</span>
              </div>
            ) : null}

            {items.length > 0 ? (
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-high/25 p-2.5 text-[11px] text-on-surface-variant/80 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary/70 shrink-0 mt-0.5">
                  touch_app
                </span>
                <p className="leading-relaxed">
                  {t('bulkScan.shiftTip')}
                </p>
              </div>
            ) : null}
          </div>
        </StudioLayout.LeftSidebar>

        <StudioLayout.Content>
          {items.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-container-highest/60 text-outline border border-outline-variant/20 mb-4 shadow-inner">
                <span className="material-symbols-outlined text-4xl text-primary/70">
                  document_scanner
                </span>
              </div>
              <h3 className="text-base font-semibold text-on-surface mb-1.5">
                {t('bulkScan.pickSource')}
              </h3>
              <p className="max-w-md text-xs text-on-surface-variant leading-relaxed">
                {t('bulkScan.emptySubtitle') ||
                  t('bulkScan.hint1') ||
                  'Chọn nguồn truyện từ thanh bên trái và nhấn "Tải" để bắt đầu quét toàn bộ danh mục.'}
              </p>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
              <div className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {pageItems.map((item, index) => {
                      const checked = selected.has(item.mangaUrl);
                      return (
                        <div
                          key={item.mangaUrl}
                          data-testid="bulk-scan-card"
                          role="button"
                          tabIndex={0}
                          className={`group relative flex cursor-pointer select-none flex-col overflow-hidden rounded-xl border transition-all ${
                            checked
                              ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/25'
                              : 'border-outline-variant/20 hover:border-primary/35 hover:shadow-md'
                          } ${controlsBusy ? 'pointer-events-none opacity-60' : ''}`}
                          onClick={(e) => applyRowSelection(e, item, index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              applyRowSelection(e, item, index);
                            }
                          }}
                        >
                          <div className="absolute left-2 top-2 z-10">
                            <input
                              type="checkbox"
                              data-testid="bulk-scan-checkbox"
                              className="size-4 accent-primary"
                              checked={checked}
                              disabled={controlsBusy}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                applyRowSelection(e, item, index);
                              }}
                            />
                          </div>
                          <div className="relative aspect-[2/3] bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <span className="material-symbols-outlined text-[28px] text-on-surface-variant/40 leading-none select-none">
                              menu_book
                            </span>
                            {item.coverUrl ? (
                              <img
                                src={item.coverUrl}
                                alt=""
                                className="pointer-events-none absolute inset-0 size-full object-cover"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : null}
                          </div>
                          <div className="space-y-0.5 p-2">
                            <div className="line-clamp-2 text-xs font-medium text-on-surface sm:text-sm">
                              {item.title}
                            </div>
                            {item.latestChapterLabel ? (
                              <div className="truncate text-[10px] text-on-surface-variant sm:text-xs">
                                {item.latestChapterLabel}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/30 p-2 overflow-hidden">
                    <ul className="space-y-1">
                      {pageItems.map((item, index) => {
                        const checked = selected.has(item.mangaUrl);
                        return (
                          <li
                            key={item.mangaUrl}
                            className={`group flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border transition-all ${
                              checked
                                ? 'bg-primary/8 border-primary/25 shadow-xs'
                                : 'bg-surface-container-low/20 border-transparent hover:border-outline-variant/20 hover:bg-surface-container-high/60'
                            } ${controlsBusy ? 'pointer-events-none opacity-60' : ''}`}
                            onClick={(e) => applyRowSelection(e, item, index)}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 accent-primary cursor-pointer"
                                checked={checked}
                                disabled={controlsBusy}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  applyRowSelection(e, item, index);
                                }}
                              />
                              <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface-container-highest flex items-center justify-center shadow-xs sm:h-14 sm:w-10">
                                <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 leading-none select-none">
                                  menu_book
                                </span>
                                {item.coverUrl ? (
                                  <img
                                    src={item.coverUrl}
                                    alt=""
                                    className="pointer-events-none absolute inset-0 size-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                                  {item.title}
                                </div>
                                <div className="truncate text-[11px] text-on-surface-variant/60 font-mono">
                                  {item.mangaUrl ? connectorHost(item.mangaUrl) : ''}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {item.latestChapterLabel ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-highest px-3 py-1 text-xs font-medium text-on-surface-variant">
                                  <span className="material-symbols-outlined text-[15px] text-primary/70">
                                    bookmark
                                  </span>
                                  <span className="truncate max-w-[14rem] sm:max-w-[20rem]">
                                    {item.latestChapterLabel}
                                  </span>
                                </span>
                              ) : null}

                              <div className="flex items-center justify-center w-7 h-7">
                                {checked ? (
                                  <span className="material-symbols-outlined text-[20px] text-primary">
                                    check_circle
                                  </span>
                                ) : (
                                  <span className="material-symbols-outlined text-[20px] text-outline-variant/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                    radio_button_unchecked
                                  </span>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {/* Bottom pagination */}
              <div
                className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur px-4 py-2.5"
                role="region"
                aria-label={t('bulkScan.paginationAria')}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <label className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <span className="whitespace-nowrap font-medium text-on-surface/90">
                      {t('bulkScan.pageSize')}
                    </span>
                    <SearchableSelect
                      value={String(pageSize)}
                      onChange={(v) => setPageSize(Number(v))}
                      options={pageSizeOptions}
                      placeholder=""
                      className="min-w-[4.5rem]"
                      disabled={controlsBusy}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto" aria-live="polite">
                    <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums">
                      {t('bulkScan.pageStatus', {
                        page: safePage,
                        total: totalPages,
                        count: visibleItems.length,
                      })}
                    </span>
                    {visibleItems.length > 0 ? (
                      <span className="text-xs text-on-surface-variant tabular-nums sm:text-sm">
                        {t('bulkScan.showingRange', {
                          from: fromRow,
                          to: toRow,
                          total: visibleItems.length,
                        })}
                      </span>
                    ) : null}
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage(1)}
                        disabled={safePage <= 1 || controlsBusy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-bright text-on-surface shadow-sm transition hover:border-primary/30 hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        aria-label={t('latestUpdates.firstPage')}
                        data-tooltip={t('latestUpdates.firstPage')}
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                          first_page
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1 || controlsBusy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-bright text-on-surface shadow-sm transition hover:border-primary/30 hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        aria-label={t('bulkScan.pagePrev')}
                        data-tooltip={t('bulkScan.pagePrev')}
                      >
                        <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
                          chevron_left
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages || controlsBusy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-bright text-on-surface shadow-sm transition hover:border-primary/30 hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        aria-label={t('bulkScan.pageNext')}
                        data-tooltip={t('bulkScan.pageNext')}
                      >
                        <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
                          chevron_right
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage(totalPages)}
                        disabled={safePage >= totalPages || controlsBusy}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-bright text-on-surface shadow-sm transition hover:border-primary/30 hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        aria-label={t('latestUpdates.lastPage')}
                        data-tooltip={t('latestUpdates.lastPage')}
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                          last_page
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </StudioLayout.Content>
      </StudioLayout.Body>
    </StudioLayout>
  );
}
