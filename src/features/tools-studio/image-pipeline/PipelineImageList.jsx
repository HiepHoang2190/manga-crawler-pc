import { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { SearchableSelect, EmptyState } from '../../../shared';
import { formatBytes, getImageStatus } from './imageListModel';

const FILTERS = ['all', 'needsWork', 'manual', 'stale', 'error'];
const BADGE = 'rounded px-1.5 py-0.5 text-[10px] font-bold border shrink-0';

function ProgressBar({ progress, label }) {
  if (!progress) return null;
  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div className="mb-3 space-y-1">
      <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="truncate text-[11px] text-on-surface-variant">
        {label} {progress.file ? `· ${progress.file}` : ''}
      </p>
    </div>
  );
}

export default function PipelineImageList({
  images,
  counts,
  view,
  onViewChange,
  selected,
  onToggleSelect,
  onToggleAll,
  activePath,
  onActivate,
  onOpenPreview,
  onRemove,
  statusCtx,
  scanning,
  analyzeProgress,
  runProgress,
  processing,
  hasSource,
  hasUnanalyzed = false,
  onAnalyzeAll,
  tabActive = true,
  disabledKeyboardNav = false,
}) {
  const { t } = useI18n();
  const listRef = useRef(null);
  const allSelected = images.length > 0 && images.every((img) => selected.has(img.absolutePath));
  const someSelected = images.some((img) => selected.has(img.absolutePath));
  const masterIcon = allSelected ? 'check_box' : someSelected ? 'indeterminate_check_box' : 'check_box_outline_blank';

  const filterOptions = useMemo(() => [
    { value: 'all', label: `${t('imagePipeline.filter.all')} (${counts?.all || 0})`, icon: 'filter_list' },
    { value: 'needsWork', label: `${t('imagePipeline.filter.needsWork')} (${counts?.needsWork || 0})`, icon: 'auto_fix_high' },
    { value: 'manual', label: `${t('imagePipeline.filter.manual')} (${counts?.manual || 0})`, icon: 'edit' },
    { value: 'stale', label: `${t('imagePipeline.filter.stale')} (${counts?.stale || 0})`, icon: 'history' },
    { value: 'error', label: `${t('imagePipeline.filter.error')} (${counts?.error || 0})`, icon: 'error' },
  ], [t, counts]);

  // Tự động cuộn phần tử active vào tầm nhìn khi activePath thay đổi
  useEffect(() => {
    if (!activePath || !listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activePath]);

  // Điều hướng danh sách ảnh bằng phím mũi tên Lên / Xuống và mở xem trước bằng Enter
  useEffect(() => {
    if (!tabActive || disabledKeyboardNav) return;

    const isTyping = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      if (!images || images.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = images.findIndex((img) => img.absolutePath === activePath);
        if (currentIndex < 0) {
          onActivate?.(images[0].absolutePath);
        } else if (currentIndex < images.length - 1) {
          onActivate?.(images[currentIndex + 1].absolutePath);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = images.findIndex((img) => img.absolutePath === activePath);
        if (currentIndex < 0) {
          onActivate?.(images[images.length - 1].absolutePath);
        } else if (currentIndex > 0) {
          onActivate?.(images[currentIndex - 1].absolutePath);
        }
      } else if (e.key === 'Enter') {
        if (activePath && onOpenPreview) {
          e.preventDefault();
          onOpenPreview(activePath);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tabActive, disabledKeyboardNav, images, activePath, onActivate, onOpenPreview]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {processing ? (
        <ProgressBar progress={runProgress} label={t('imagePipeline.processing', { current: runProgress?.current || 0, total: runProgress?.total || 0 })} />
      ) : (
        analyzeProgress && analyzeProgress.current < analyzeProgress.total && (
          <ProgressBar progress={analyzeProgress} label={t('imagePipeline.list.analyzing', { current: analyzeProgress.current, total: analyzeProgress.total })} />
        )
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAll}
            disabled={images.length === 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-container-highest/60 hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer disabled:opacity-40"
            aria-label={allSelected ? t('imagePipeline.list.deselectAll') : t('imagePipeline.list.selectAll')}
          >
            <span className="material-symbols-outlined text-[18px]">{masterIcon}</span>
          </button>
          <SearchableSelect
            value={view.filter}
            onChange={(filter) => onViewChange({ filter })}
            size="sm"
            showPlaceholderOption={false}
            className="min-w-[11.5rem]"
            options={filterOptions}
            disabled={images.length === 0}
          />
          {hasUnanalyzed && onAnalyzeAll && (
            <button
              type="button"
              onClick={onAnalyzeAll}
              disabled={Boolean(analyzeProgress) || processing || images.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer disabled:opacity-50"
              data-tooltip={t('imagePipeline.list.analyzeAllTooltip')}
              aria-label={t('imagePipeline.list.analyzeAll')}
            >
              <span className="material-symbols-outlined text-[16px]">
                {analyzeProgress ? 'hourglass_top' : 'manage_search'}
              </span>
              <span>{t('imagePipeline.list.analyzeAll')}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">search</span>
            <input
              value={view.search}
              onChange={(e) => onViewChange({ search: e.target.value })}
              placeholder={t('imagePipeline.list.search')}
              disabled={images.length === 0}
              className="h-8 w-40 rounded-lg bg-surface-container-highest/80 pl-7 pr-7 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {view.search && (
              <button
                type="button"
                onClick={() => onViewChange({ search: '' })}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                data-tooltip={t('imagePipeline.list.clearSearch')}
                aria-label={t('imagePipeline.list.clearSearch')}
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>
          <SearchableSelect
            value={view.sort}
            onChange={(sort) => onViewChange({ sort })}
            size="sm"
            showPlaceholderOption={false}
            className="min-w-[11.5rem]"
            disabled={images.length === 0}
            options={[
              { value: 'nameAsc', label: t('imagePipeline.sort.nameAsc'), icon: 'sort_by_alpha' },
              { value: 'nameDesc', label: t('imagePipeline.sort.nameDesc'), icon: 'sort_by_alpha' },
              { value: 'sizeDesc', label: t('imagePipeline.sort.sizeDesc'), icon: 'data_usage' },
            ]}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
        {images.length === 0 ? (
          <EmptyState
            icon={scanning ? 'hourglass_top' : hasSource ? 'filter_alt_off' : 'photo_library'}
            title={scanning ? t('imagePipeline.list.scanning') : hasSource ? t('imagePipeline.list.emptyFiltered') : t('imagePipeline.list.emptySource')}
          />
        ) : (
          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar">
            {images.map((img) => {
              const s = getImageStatus(img, statusCtx);
              const isSelected = selected.has(img.absolutePath);
              const isActive = img.absolutePath === activePath;
              return (
                <li
                  key={img.absolutePath}
                  data-active={isActive ? 'true' : undefined}
                  data-path={img.absolutePath}
                  onClick={() => onActivate(img.absolutePath)}
                  onDoubleClick={() => onOpenPreview(img.absolutePath)}
                  className={`mx-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-container-high cursor-pointer transition-colors group ${
                    isActive ? 'bg-primary/10' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(img.absolutePath);
                    }}
                    className="shrink-0 text-on-surface-variant hover:text-primary cursor-pointer"
                    aria-label={img.relativePath}
                  >
                    <span className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-primary' : ''}`}>
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                  </button>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50 group-hover:text-primary shrink-0">image</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-on-surface" data-tooltip={img.relativePath}>
                    {img.relativePath}
                  </span>
                  <span className="shrink-0 text-[11px] font-mono text-on-surface-variant/60">
                    {img.width}×{img.height} · {formatBytes(img.size)}
                  </span>
                  {s.outputWidth != null && (
                    <>
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/30">arrow_forward</span>
                      <span
                        className="shrink-0 text-[11px] font-mono font-semibold text-primary"
                        data-tooltip={
                          s.outputCount > 1
                            ? `${img.relativePath.replace(/\.[^/.]+$/, '')}-a + -b`
                            : undefined
                        }
                      >
                        {s.outputWidth}×{s.outputHeight}
                        {s.outputCount > 1 ? ` · ${t('imagePipeline.list.outputCount', { count: s.outputCount })}` : ''}
                      </span>
                    </>
                  )}
                  {s.badges.skewAngle !== null && (
                    <span className={`${BADGE} border-emerald-500/30 bg-emerald-500/10 text-emerald-400`}>
                      {t('imagePipeline.badge.skew', { angle: s.badges.skewAngle })}
                    </span>
                  )}
                  {s.badges.hasBorder && <span className={`${BADGE} border-emerald-500/30 bg-emerald-500/10 text-emerald-400`}>{t('imagePipeline.badge.border')}</span>}
                  {s.badges.isDoublePage && (
                    <span
                      className={`${BADGE} border-emerald-500/30 bg-emerald-500/10 text-emerald-400`}
                      data-tooltip={t('imagePipeline.badge.doubleHint')}
                    >
                      {t('imagePipeline.badge.double')}
                    </span>
                  )}
                  {s.manual && <span className={`${BADGE} border-cyan-500/30 bg-cyan-500/10 text-cyan-400`}>{t('imagePipeline.badge.custom')}</span>}
                  {s.stale && <span className={`${BADGE} border-amber-500/30 bg-amber-500/10 text-amber-400`}>{t('imagePipeline.badge.stale')}</span>}
                  {s.error && (
                    <span className={`${BADGE} border-error/30 bg-error/10 text-error`} data-tooltip={s.errorMessage}>
                      {t('imagePipeline.badge.error')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPreview(img.absolutePath);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-highest hover:text-primary cursor-pointer"
                    data-tooltip={t('imagePipeline.list.preview')}
                    aria-label={t('imagePipeline.list.preview')}
                  >
                    <span className="material-symbols-outlined text-[17px]">visibility</span>
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(img.absolutePath);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-40 cursor-pointer"
                    aria-label={t('imagePipeline.list.remove')}
                  >
                    <span className="material-symbols-outlined text-[17px]">delete</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
