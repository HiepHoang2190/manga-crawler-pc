import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../../context/I18nContext';
import { SearchableSelect } from '../../../../shared';

/**
 * Modal bảng đối chiếu dịch thuật & soát lỗi toàn diện (So sánh chữ gốc, bản dịch, residual Japanese)
 */
export function MangaStudioComparisonModal({
  isOpen,
  onClose,
  comparisonScope = 'current',
  setComparisonScope,
  comparisonFilter = 'all',
  setComparisonFilter,
  comparisonSearchQuery = '',
  setComparisonSearchQuery,
  showComparisonPreview = false,
  setShowComparisonPreview,
  comparisonHoveredLayerId = null,
  setComparisonHoveredLayerId,
  allChapterLayersWithMeta = [],
  layers = [],
  allChapterResidualLayers = [],
  residualLayers = [],
  activePageIndex = 0,
  setActivePageIndex,
  activePage = null,
  pages = [],
  isLayerResidual,
  handleUpdateComparisonText,
  handleRetrySingleLayerInComparison,
  retryingSingleLayerId = null,
  handleRetryResidualBubbles,
  isRetryingResidual = false,
  onViewLayerOnCanvas,
}) {
  const { t } = useI18n();

  if (!isOpen || typeof document === 'undefined') return null;

  const isAllScope = comparisonScope === 'all';
  const totalScopeCount = isAllScope ? allChapterLayersWithMeta.length : layers.length;
  const residualScopeCount = isAllScope ? allChapterResidualLayers.length : residualLayers.length;
  const cleanScopeCount = Math.max(0, totalScopeCount - residualScopeCount);

  const checkResidual = typeof isLayerResidual === 'function' ? isLayerResidual : () => false;

  const sourceItems = isAllScope
    ? allChapterLayersWithMeta.map((item, idx) => ({
      layer: item.layer,
      globalIdx: idx,
      originalIdx: item.layerIndexOnPage,
      pageIndex: item.pageIndex,
      pageFilename: item.pageFilename,
      pageDataUrl: item.pageDataUrl,
    }))
    : layers.map((layer, idx) => ({
      layer,
      globalIdx: idx,
      originalIdx: idx,
      pageIndex: activePageIndex,
      pageFilename: activePage?.filename || t('translate.compare.pageBtn', { page: activePageIndex + 1 }),
      pageDataUrl: activePage?.dataUrl || activePage?.originalDataUrl,
    }));

  const filteredComparisonItems = sourceItems.filter(({ layer, pageFilename }) => {
    if (comparisonFilter === 'clean' && checkResidual(layer)) return false;
    if (comparisonFilter === 'residual' && !checkResidual(layer)) return false;
    if (comparisonSearchQuery.trim()) {
      const q = comparisonSearchQuery.toLowerCase();
      const orig = (layer.sourceText || '').toLowerCase();
      const trans = (layer.text || '').toLowerCase();
      const pageInfo = (pageFilename || '').toLowerCase();
      return orig.includes(q) || trans.includes(q) || pageInfo.includes(q);
    }
    return true;
  });

  // Ảnh hiển thị trong Preview panel
  const previewPage = pages[activePageIndex] || pages[0] || null;
  const previewImageUrl = previewPage?.dataUrl || previewPage?.originalDataUrl || '';
  const previewWidth = previewPage?.width || 800;
  const previewHeight = previewPage?.height || 1200;
  const previewLayers = previewPage?.layers || [];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="max-w-6xl w-full max-h-[92vh] rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-2xl p-4 sm:p-5 flex flex-col text-on-surface overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/20 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">table_chart</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-on-surface truncate">
                  {t('translate.compare.title')}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/25">
                  {isAllScope
                    ? t('translate.compare.allPagesBadge', { count: pages.length })
                    : t('translate.compare.pageBadge', { current: activePageIndex + 1, total: pages.length })}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant truncate">
                {isAllScope ? (
                  t('translate.compare.allSummary', { total: totalScopeCount, residual: residualScopeCount })
                ) : (
                  t('translate.compare.pageSummary', {
                    name: activePage?.filename || t('translate.compare.pageBtn', { page: activePageIndex + 1 }),
                    total: totalScopeCount,
                    residual: residualScopeCount,
                  })
                )}
              </p>
            </div>
          </div>

          {/* Top Right: Scope Switcher + Preview Toggle + Close */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Scope Switcher: [ 📄 Trang hiện tại ] [ 📚 Toàn bộ Chapter ] */}
            <div className="flex items-center p-0.5 rounded-xl bg-surface-container border border-outline-variant/20 shrink-0">
              <button
                type="button"
                onClick={() => setComparisonScope?.('current')}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${!isAllScope
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                data-tooltip={t('translate.compare.scopeCurrentTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">description</span>
                <span>{t('translate.compare.scopeCurrent')}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-container-high text-on-surface-variant font-mono">
                  {layers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setComparisonScope?.('all')}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${isAllScope
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                data-tooltip={t('translate.compare.scopeAllTitle')}
              >
                <span className="material-symbols-outlined text-[14px]">library_books</span>
                <span>{t('translate.compare.scopeAll')}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-container-high text-on-surface-variant font-mono">
                  {allChapterLayersWithMeta.length}
                </span>
              </button>
            </div>

            {/* Preview Page Toggle Button */}
            <button
              type="button"
              onClick={() => setShowComparisonPreview?.((prev) => !prev)}
              className={`h-7 px-2.5 rounded-lg border flex items-center gap-1 text-xs font-semibold transition-all cursor-pointer ${showComparisonPreview
                ? 'border-primary/30 bg-primary/10 text-primary shadow-2xs'
                : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              data-tooltip={showComparisonPreview ? t('translate.compare.previewHideTitle') : t('translate.compare.previewShowTitle')}
            >
              <span className="material-symbols-outlined text-[15px]">
                {showComparisonPreview ? 'visibility' : 'preview'}
              </span>
              <span className="hidden sm:inline">{t('translate.compare.previewToggle')}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer shrink-0"
              data-tooltip={t('translate.compare.closeTitle')}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Subheader: Filter tabs + Page Navigation (Next/Prev) + Search */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 shrink-0 border-b border-outline-variant/15">
          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 shrink-0">
            {[
              { id: 'all', label: t('translate.compare.filterAll', { count: totalScopeCount }) },
              { id: 'clean', label: t('translate.compare.filterClean', { count: cleanScopeCount }) },
              { id: 'residual', label: t('translate.compare.filterResidual', { count: residualScopeCount }) },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setComparisonFilter?.(tab.id)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${comparisonFilter === tab.id
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Page Navigation Controls: [ ◀ Trước ] [ Trang X/Y — name (N câu) ] [ Sau ▶ ] */}
          {pages.length > 1 && (
            <div className="flex items-center gap-1 bg-surface-container/70 p-0.5 rounded-xl border border-outline-variant/20 shrink-0">
              <button
                type="button"
                disabled={activePageIndex === 0}
                onClick={() => setActivePageIndex?.((prev) => Math.max(0, prev - 1))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                data-tooltip={t('translate.compare.prevPageTitle')}
                aria-label={t('translate.compare.prevPageTitle')}
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>

              <SearchableSelect
                value={activePageIndex}
                onChange={(val) => setActivePageIndex?.(Number(val))}
                options={pages.map((p, pIdx) => ({
                  value: pIdx,
                  label: t('translate.compare.pageOption', {
                    page: pIdx + 1,
                    total: pages.length,
                    name: p.filename || t('translate.compare.pageBtn', { page: pIdx + 1 }),
                    count: (p.layers || []).length,
                  }),
                  icon: 'description',
                }))}
                placeholder={t('translate.compare.selectPageTitle')}
                className="min-w-[14rem]"
                size="sm"
              />

              <button
                type="button"
                disabled={activePageIndex === pages.length - 1}
                onClick={() => setActivePageIndex?.((prev) => Math.min(pages.length - 1, prev + 1))}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                data-tooltip={t('translate.compare.nextPageTitle')}
                aria-label={t('translate.compare.nextPageTitle')}
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          )}

          {/* Search Query Input */}
          <div className="relative w-56 sm:w-64 max-w-full">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-on-surface-variant/60">
              search
            </span>
            <input
              type="text"
              value={comparisonSearchQuery}
              onChange={(e) => setComparisonSearchQuery?.(e.target.value)}
              placeholder={t('translate.compare.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1 rounded-xl border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Main Content Area: Table + Optional Image Preview side-by-side */}
        <div className="flex-1 min-h-0 flex gap-3 overflow-hidden py-1">
          {/* Table View */}
          <div className="flex-1 min-w-0 overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface-container/20 select-text">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-surface-container-high text-on-surface-variant text-[11px] uppercase tracking-wider font-semibold border-b border-outline-variant/20">
                <tr>
                  {isAllScope && <th className="py-2.5 px-3 w-28 text-center">{t('translate.compare.colPage')}</th>}
                  <th className="py-2.5 px-3 w-16 text-center">{t('translate.compare.colBubble')}</th>
                  <th className="py-2.5 px-3 w-32">{t('translate.compare.colCoords')}</th>
                  <th className="py-2.5 px-3 w-1/3">{t('translate.compare.colOcr')}</th>
                  <th className="py-2.5 px-3 w-1/3">{t('translate.compare.colTranslation')}</th>
                  <th className="py-2.5 px-3 w-28 text-center">{t('translate.compare.colStatus')}</th>
                  <th className="py-2.5 px-3 w-24 text-center">{t('translate.compare.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                {filteredComparisonItems.length === 0 ? (
                  <tr>
                    <td colSpan={isAllScope ? 7 : 6} className="py-12 text-center text-on-surface-variant text-xs italic">
                      {comparisonSearchQuery || comparisonFilter !== 'all'
                        ? t('translate.compare.noResultsFilter')
                        : t('translate.compare.noResultsEmpty')}
                    </td>
                  </tr>
                ) : (
                  filteredComparisonItems.map(({ layer, originalIdx, pageIndex }) => {
                    const hasRes = checkResidual(layer);
                    const [x, y, w, h] = (layer.bbox || [0, 0, 0, 0]).map(Math.round);
                    const isHovered = comparisonHoveredLayerId === layer.id;

                    return (
                      <tr
                        key={`${pageIndex}-${layer.id || originalIdx}`}
                        onMouseEnter={() => setComparisonHoveredLayerId?.(layer.id)}
                        onMouseLeave={() => setComparisonHoveredLayerId?.(null)}
                        className={`transition-colors ${isHovered
                          ? 'bg-primary/10 dark:bg-primary/15'
                          : hasRes
                            ? 'bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/15'
                            : 'hover:bg-surface-container-high/60'
                          }`}
                      >
                        {/* Cột Tên Trang (Chỉ hiện khi xem Toàn bộ Chapter) */}
                        {isAllScope && (
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setActivePageIndex?.(pageIndex)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${activePageIndex === pageIndex
                                ? 'bg-primary/20 text-primary border border-primary/30'
                                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                                }`}
                              data-tooltip={t('translate.compare.pageBtnTitle', { page: pageIndex + 1 })}
                            >
                              <span>{t('translate.compare.pageBtn', { page: pageIndex + 1 })}</span>
                            </button>
                          </td>
                        )}

                        {/* STT Khung */}
                        <td className="py-2 px-3 font-mono font-bold text-center text-on-surface-variant">
                          #{originalIdx + 1}
                        </td>

                        {/* BBox */}
                        <td className="py-2 px-3 text-[11px] font-mono text-on-surface-variant">
                          <div>X:{x}, Y:{y}</div>
                          <div className="text-[10px] text-on-surface-variant/70">{w}×{h}px</div>
                        </td>

                        {/* Chữ Gốc (Japanese) */}
                        <td className="py-2 px-3 font-sans text-xs text-on-surface leading-relaxed whitespace-pre-wrap">
                          {layer.sourceText ? (
                            <span className="bg-surface-container/60 px-1.5 py-0.5 rounded border border-outline-variant/20 inline-block max-w-full">
                              {layer.sourceText}
                            </span>
                          ) : (
                            <span className="italic text-on-surface-variant/50">{t('translate.compare.ocrEmpty')}</span>
                          )}
                        </td>

                        {/* Bản Dịch Tiếng Việt - Inline Editable */}
                        <td className="py-2 px-3">
                          <textarea
                            rows={2}
                            value={layer.text || ''}
                            onChange={(e) => handleUpdateComparisonText?.(pageIndex, layer.id, e.target.value)}
                            placeholder={t('translate.compare.transPlaceholder')}
                            className="w-full p-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-xs text-on-surface focus:outline-none focus:border-primary font-sans leading-relaxed resize-y"
                          />
                        </td>

                        {/* Trạng thái soát */}
                        <td className="py-2 px-3 text-center">
                          {hasRes ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold shrink-0">
                              <span className="material-symbols-outlined text-[13px]">warning</span>
                              <span>{t('translate.compare.statusResidual')}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shrink-0">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              <span>{t('translate.compare.statusClean')}</span>
                            </span>
                          )}
                        </td>

                        {/* Thao tác */}
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Nút Xem trên canvas: tự chuyển sang đúng trang và chọn layer */}
                            <button
                              type="button"
                              onClick={() => onViewLayerOnCanvas?.(pageIndex, layer.id)}
                              className="p-1 rounded-lg hover:bg-primary/15 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                              data-tooltip={t('translate.compare.actionCanvasTitle', { page: pageIndex + 1 })}
                            >
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                            </button>

                            {/* Nút Dịch lại AI câu này - Luôn hiển thị cho mọi khung thoại */}
                            <button
                              type="button"
                              disabled={retryingSingleLayerId === layer.id}
                              onClick={() => handleRetrySingleLayerInComparison?.(pageIndex, layer, originalIdx)}
                              className={`p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${hasRes
                                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400'
                                : 'hover:bg-primary/15 text-on-surface-variant hover:text-primary'
                              }`}
                              data-tooltip={t('translate.compare.actionRetryTitle')}
                            >
                              <span className={`material-symbols-outlined text-[16px] ${retryingSingleLayerId === layer.id ? 'animate-spin text-primary' : ''}`}>
                                {retryingSingleLayerId === layer.id ? 'sync' : 'restart_alt'}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Panel Xem Trước Ảnh (Preview Drawer / Split View) */}
          {showComparisonPreview && (
            <div className="w-72 sm:w-80 shrink-0 rounded-xl border border-outline-variant/20 bg-surface-container/60 p-2.5 flex flex-col gap-2 select-none overflow-hidden">
              <div className="flex items-center justify-between gap-1 pb-1 border-b border-outline-variant/20">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate">
                    {t('translate.compare.previewTitle', { page: activePageIndex + 1, name: previewPage?.filename || 'Preview' })}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-mono">
                    {t('translate.compare.previewDims', { width: previewWidth, height: previewHeight, count: previewLayers.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowComparisonPreview?.(false)}
                  className="w-6 h-6 rounded-md hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center cursor-pointer"
                  data-tooltip={t('translate.compare.previewHideTitle')}
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </div>

              {/* Image with Interactive SVG Bounding Box Overlays */}
              <div className="flex-1 min-h-0 relative bg-surface-container-lowest rounded-lg border border-outline-variant/20 flex items-center justify-center overflow-hidden">
                {previewImageUrl ? (
                  <div className="relative max-w-full max-h-full flex items-center justify-center">
                    <img
                      src={previewImageUrl}
                      alt={previewPage?.filename || 'Preview'}
                      className="max-w-full max-h-[60vh] object-contain rounded select-none pointer-events-none"
                    />
                    {/* SVG Overlay cho các khung thoại trên trang này */}
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${previewWidth} ${previewHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {previewLayers.map((l, lIdx) => {
                        if (!Array.isArray(l.bbox) || l.bbox.length < 4) return null;
                        const [bx, by, bw, bh] = l.bbox;
                        const isLHovered = comparisonHoveredLayerId === l.id;
                        const lHasRes = checkResidual(l);

                        return (
                          <g key={l.id || lIdx}>
                            <rect
                              x={bx}
                              y={by}
                              width={bw}
                              height={bh}
                              fill={
                                isLHovered
                                  ? 'rgba(236, 72, 153, 0.35)'
                                  : lHasRes
                                    ? 'rgba(245, 158, 11, 0.15)'
                                    : 'rgba(59, 130, 246, 0.1)'
                              }
                              stroke={
                                isLHovered
                                  ? '#ec4899'
                                  : lHasRes
                                    ? '#f59e0b'
                                    : '#3b82f6'
                              }
                              strokeWidth={isLHovered ? 4 : 2}
                              rx={4}
                              className="transition-all"
                            />
                            <text
                              x={bx + 6}
                              y={by + 16}
                              fill="#ffffff"
                              fontSize="14"
                              fontWeight="bold"
                              filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.9))"
                            >
                              #{lIdx + 1}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                ) : (
                  <div className="text-center p-4 text-xs text-on-surface-variant italic">
                    {t('translate.compare.previewNoImage')}
                  </div>
                )}
              </div>

              {/* Mini Caption */}
              <p className="text-[10px] text-on-surface-variant/80 text-center italic">
                {t('translate.compare.previewHint')}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-outline-variant/20 shrink-0">
          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
            <span>
              {t('translate.compare.footerTotal', {
                scope: isAllScope ? t('translate.compare.footerScopeAll') : t('translate.compare.footerScopeCurrent'),
                count: totalScopeCount,
              })}
            </span>
            <span>•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              <span>{t('translate.compare.footerClean', { count: cleanScopeCount })}</span>
            </span>
            {residualScopeCount > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span>{t('translate.compare.footerResidual', { count: residualScopeCount })}</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {residualScopeCount > 0 && (
              <button
                type="button"
                onClick={() => handleRetryResidualBubbles?.(comparisonScope)}
                disabled={isRetryingResidual}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:brightness-110 text-white dark:text-amber-950 text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
                <span>
                  {t('translate.compare.retryResidualBtn', {
                    count: residualScopeCount,
                    scope: isAllScope ? t('translate.compare.footerScopeAll') : t('translate.compare.footerScopeCurrent'),
                  })}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors cursor-pointer"
            >
              {t('translate.compare.close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

