import { useState, useEffect } from 'react';
import { useI18n } from '../../../context/I18nContext';

/** Cộng thêm sau thời gian fetch thực (viền tắt chậm hơn một nhịp ngắn). */
const FETCH_RING_EXTRA_MS = 280;
const FETCH_RING_MIN_MS = 480;
const FETCH_RING_MAX_MS = 15000;

export default function MangaInfo({
  manga,
  chapterCount = 0,
  /** Chương đã tải xong (đĩa); 0 → disable Đọc trong app & Đóng gói CBZ. */
  downloadedChapterCount = 0,
  isFavorite = false,
  onToggleFavorite,
  fetchSuccessTick = 0,
  /** Thời gian fetch vừa xong (ms); 0 = dùng mặc định an toàn. */
  fetchSuccessDurationMs = 0,
  onOpenChaptersPanel,
  /** Enqueue every fetched chapter and focus the Queue tab (Home). */
  onEnqueueAllToQueue,
  onOpenCbzExport,
  onOpenpdfExport,
  onOpenReader,
  onOpenEbookStudio,
}) {
  const { t } = useI18n();
  const title = manga?.title?.trim();
  const coverUrl = manga?.coverUrl || '';
  const sourceLabel = manga?.sourceLabel?.trim();
  const author = manga?.author?.trim() || '';
  const genres = Array.isArray(manga?.genres)
    ? manga.genres
    : manga?.genres
      ? [manga.genres]
      : [];
  const description = manga?.description?.trim() || '';

  const [coverSrc, setCoverSrc] = useState('');
  const [fetchSuccessRing, setFetchSuccessRing] = useState(false);

  useEffect(() => {
    if (!fetchSuccessTick) return undefined;
    setFetchSuccessRing(true);
    const base =
      fetchSuccessDurationMs > 0 ? fetchSuccessDurationMs : 800;
    const holdMs = Math.min(
      FETCH_RING_MAX_MS,
      Math.max(FETCH_RING_MIN_MS, base + FETCH_RING_EXTRA_MS)
    );
    const id = window.setTimeout(() => setFetchSuccessRing(false), holdMs);
    return () => window.clearTimeout(id);
  }, [fetchSuccessTick, fetchSuccessDurationMs]);

  useEffect(() => {
    if (!coverUrl) {
      setCoverSrc('');
      return undefined;
    }
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    const fetchFn = api?.fetchRemoteImageAsDataUrl;
    if (!fetchFn) {
      setCoverSrc(coverUrl);
      return undefined;
    }
    let cancelled = false;
    setCoverSrc('');
    fetchFn(coverUrl)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setCoverSrc(dataUrl);
        else setCoverSrc(coverUrl);
      })
      .catch(() => {
        if (!cancelled) setCoverSrc(coverUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  if (!manga) return null;

  const canEnqueueAll = chapterCount > 0;
  const enqueue_disabled_title = canEnqueueAll
    ? undefined
    : t('mangaInfo.enqueueDisabledNoChapters');
  const show_chapter_action_row =
    typeof onOpenChaptersPanel === 'function' ||
    typeof onEnqueueAllToQueue === 'function';

  return (
    <div className="w-full" data-testid="manga-info-card">
      <div
        className={`relative overflow-hidden rounded-2xl ${
          fetchSuccessRing
            ? 'motion-reduce:ring-2 motion-reduce:ring-primary motion-reduce:ring-offset-2 motion-reduce:ring-offset-background'
            : ''
        }`}
      >
        {fetchSuccessRing ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl motion-reduce:hidden"
            aria-hidden
          >
            <div
              className="absolute inset-[-55%] origin-center [backface-visibility:hidden] animate-[fetch-ring-spin_2.75s_linear_infinite]"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg 226deg, var(--color-primary) 252deg, var(--color-primary-container) 268deg, transparent 288deg)',
              }}
            />
          </div>
        ) : null}
        <div
          className={`relative z-[1] rounded-2xl border border-outline-variant/15 bg-surface-container-low p-3.5 shadow-xs space-y-3 ${
            fetchSuccessRing ? 'motion-safe:m-[2px] motion-safe:rounded-[14px] motion-safe:border-transparent' : ''
          }`}
        >
          {/* Hàng trên: Ảnh bìa bên trái + Cột thông tin bên phải */}
          <div className="flex gap-3.5 items-start">
            {/* Ảnh bìa */}
            <div className="group relative flex aspect-[2/3] w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-highest shadow-md sm:w-32">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant/50 text-[32px]">menu_book</span>
              )}
              {typeof onToggleFavorite === 'function' ? (
                <button
                  type="button"
                  aria-pressed={isFavorite}
                  aria-label={isFavorite ? t('mangaInfo.favoriteRemove') : t('mangaInfo.favoriteAdd')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                  }}
                  className={`absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${
                    isFavorite
                      ? 'bg-rose-500/85 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500'
                      : 'border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/55'
                  }`}
                  data-tooltip={
                    isFavorite
                      ? t('mangaInfo.favoriteRemove')
                      : t('mangaInfo.favoriteAdd')
                  }
                >
                  <span
                    className="material-symbols-outlined block text-[16px] leading-none"
                    style={
                      isFavorite
                        ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                        : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                    }
                  >
                    {isFavorite ? 'favorite' : 'favorite_border'}
                  </span>
                </button>
              ) : null}
            </div>

            {/* Cột thông tin chi tiết */}
            <div className="flex-1 min-w-0 space-y-1.5">
              {title ? (
                <h2 className="min-w-0 text-sm sm:text-base font-bold leading-snug text-on-surface line-clamp-2 tracking-tight">
                  {title}
                </h2>
              ) : null}

              {/* Badges: Nguồn & Số chương */}
              <div className="flex flex-wrap items-center gap-1.5">
                {sourceLabel ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0"
                    data-tooltip={`${t('mangaInfo.source')} ${sourceLabel}`}
                  >
                    <span className="material-symbols-outlined text-[13px]">public</span>
                    <span className="truncate max-w-[120px]">{sourceLabel}</span>
                  </span>
                ) : null}
                <span
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold tabular-nums shrink-0"
                  data-tooltip={`${t('mangaInfo.chapterCount')} ${chapterCount}`}
                >
                  <span className="material-symbols-outlined text-[14px]">auto_stories</span>
                  <span>{chapterCount} {t('mangaInfo.chapterSuffix', 'chương')}</span>
                </span>
              </div>

              {/* Tác giả */}
              {author ? (
                <div className="flex items-center gap-1.5 text-xs text-on-surface-variant min-w-0">
                  <span className="material-symbols-outlined text-[15px] shrink-0 text-on-surface-variant/70">person</span>
                  <span className="truncate">{author}</span>
                </div>
              ) : null}

              {/* Thể loại dạng pills gọn gàng (tối đa 3 thể loại) */}
              {genres.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="rounded-md bg-surface-container-highest/70 px-2 py-0.5 text-[11px] font-medium text-on-surface-variant"
                    >
                      {g}
                    </span>
                  ))}
                  {genres.length > 3 ? (
                    <span
                      className="rounded-md bg-surface-container-highest/70 px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant/70 cursor-default"
                      data-tooltip={genres.slice(3).join(', ')}
                    >
                      +{genres.length - 3}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Mô tả ngắn gọn line-clamp-2 */}
              {description ? (
                <p className="text-xs leading-relaxed text-on-surface-variant/85 line-clamp-2 pt-0.5">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {/* Hàng dưới: Cụm nút hành động 2 cột trải rộng toàn bộ card */}
          {show_chapter_action_row ? (
            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-outline-variant/15">
              {typeof onOpenChaptersPanel === 'function' ? (
                <button
                  type="button"
                  data-testid="open-drawer-btn"
                  onClick={() => onOpenChaptersPanel()}
                  data-tooltip={t('chapterList.openDrawer')}
                  aria-label={t('chapterList.openDrawerShort')}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/25 hover:border-primary/40 hover:text-primary active:scale-[0.98] px-3 text-center text-xs font-semibold shadow-2xs cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined shrink-0 select-none text-[18px] leading-none">
                    format_list_bulleted
                  </span>
                  <span className="truncate whitespace-nowrap">{t('chapterList.openDrawerShort')}</span>
                </button>
              ) : null}
              {typeof onEnqueueAllToQueue === 'function' ? (
                <button
                  type="button"
                  data-testid="enqueue-all-btn"
                  disabled={!canEnqueueAll}
                  onClick={() => onEnqueueAllToQueue()}
                  data-tooltip={enqueue_disabled_title ?? t('mangaInfo.enqueueAllTitle')}
                  aria-label={t('mangaInfo.enqueueAllShort')}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-center text-xs font-semibold text-on-primary shadow-xs hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined shrink-0 select-none text-[18px] leading-none">
                    playlist_add
                  </span>
                  <span className="truncate">{t('mangaInfo.enqueueAllShort')}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Thẻ thông tin truyện mặc định khi chưa fetch URL nào, giữ cân đối bố cục Sidebar.
 */
export function MangaInfoEmptyCard({ loading = false, selectedSiteLabel = '' }) {
  const { t } = useI18n();
  const siteText = String(selectedSiteLabel || '').trim() || t('mangaInfo.emptySourcePlaceholder');

  return (
    <div
      className="w-full"
      data-testid="manga-info-empty-card"
      aria-busy={loading || undefined}
    >
      <div className="rounded-2xl border border-dashed border-outline-variant/35 bg-surface-container-low/65 p-3.5 space-y-3">
        <div className="flex gap-3.5 items-start">
          <div
            className={`relative flex aspect-[2/3] w-28 shrink-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-highest/55 text-on-surface-variant/45 sm:w-32 ${
              loading ? 'animate-pulse' : ''
            }`}
          >
            {loading ? (
              <span
                className="material-symbols-outlined text-[26px] leading-none text-primary/70 animate-spin"
                style={{ animationDuration: '0.9s' }}
                aria-hidden="true"
              >
                sync
              </span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[28px] leading-none" aria-hidden="true">
                  menu_book
                </span>
                <span className="px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/55">
                  {t('mangaInfo.emptyCoverLabel')}
                </span>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <h2 className="min-w-0 text-sm sm:text-base font-bold leading-snug text-on-surface/80 line-clamp-2 tracking-tight">
              {loading ? t('mangaInfo.emptyLoadingTitle') : t('mangaInfo.emptyTitle')}
            </h2>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-highest/80 text-on-surface-variant/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0">
                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">public</span>
                <span className="truncate max-w-[120px]">{siteText}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-surface-container-highest/80 text-on-surface-variant/75 px-2 py-0.5 text-xs font-semibold tabular-nums shrink-0">
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">auto_stories</span>
                <span>0 {t('mangaInfo.chapterSuffix', 'chương')}</span>
              </span>
            </div>

            {loading ? (
              <div className="space-y-1.5 pt-0.5 animate-pulse">
                <div className="h-2.5 w-full rounded bg-outline-variant/25" />
                <div className="h-2.5 w-3/4 rounded bg-outline-variant/20" />
                <p className="pt-1 text-xs leading-relaxed text-on-surface-variant/75">
                  {t('mangaInfo.emptyLoadingDescription')}
                </p>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-on-surface-variant/75 pt-0.5">
                {t('mangaInfo.emptyDescription')}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-outline-variant/15">
          <span className="block w-full cursor-not-allowed" data-tooltip={t('mangaInfo.emptyActionDisabledTooltip')}>
            <button
              type="button"
              disabled
              aria-label={t('chapterList.openDrawerShort')}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-container-high text-on-surface border border-outline-variant/25 px-3 text-center text-xs font-semibold shadow-2xs opacity-45 cursor-not-allowed disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined shrink-0 select-none text-[18px] leading-none" aria-hidden="true">
                format_list_bulleted
              </span>
              <span className="truncate whitespace-nowrap">{t('chapterList.openDrawerShort')}</span>
            </button>
          </span>
          <span className="block w-full cursor-not-allowed" data-tooltip={t('mangaInfo.emptyActionDisabledTooltip')}>
            <button
              type="button"
              disabled
              aria-label={t('mangaInfo.enqueueAllShort')}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-center text-xs font-semibold text-on-primary shadow-xs opacity-45 cursor-not-allowed disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined shrink-0 select-none text-[18px] leading-none" aria-hidden="true">
                playlist_add
              </span>
              <span className="truncate">{t('mangaInfo.enqueueAllShort')}</span>
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
