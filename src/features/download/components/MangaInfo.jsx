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
  /** Ẩn nút xuất CBZ (guest). */
  showCbzExport = true,
  /** Guest: chặn yêu thích, gọi onGuestFavoriteBlocked thay vì onToggleFavorite. */
  guestFavoriteLocked = false,
  onGuestFavoriteBlocked,
}) {
  const { t } = useI18n();
  const title = manga?.title?.trim();
  const coverUrl = manga?.coverUrl || '';
  const sourceLabel = manga?.sourceLabel?.trim();
  const author = manga?.author?.trim() || '';
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

  const chapter_actions_enabled = chapterCount > 0;
  const chapter_actions_disabled_title = chapter_actions_enabled
    ? undefined
    : t('mangaInfo.chapterActionsDisabledTitle');
  const show_chapter_action_row =
    typeof onOpenChaptersPanel === 'function' ||
    typeof onEnqueueAllToQueue === 'function';

  return (
    <div className="px-2 py-4 sm:px-3" data-testid="manga-info-card">
      <div
        className={`relative overflow-hidden rounded-lg ${
          fetchSuccessRing
            ? 'motion-reduce:ring-2 motion-reduce:ring-primary motion-reduce:ring-offset-2 motion-reduce:ring-offset-background'
            : ''
        }`}
      >
        {fetchSuccessRing ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-lg motion-reduce:hidden"
            aria-hidden
          >
            {/*
              Conic-gradient xoay: không dùng stroke-dash nên không đứt tại góc (SVG dash hay lệch ở cung/bo).
              Khe 2px (motion-safe:m-[2px] ở card) để lộ vòng sáng quanh mép.
            */}
            <div
              className="absolute inset-[-55%] origin-center [backface-visibility:hidden] animate-[fetch-ring-spin_2.75s_linear_infinite]"
              style={{
                /* Một vệt: transparent → primary → container (đỉnh) → transparent — trước có primary ở cả hai phía container nên như 2 vệt. */
                background:
                  'conic-gradient(from 0deg, transparent 0deg 226deg, var(--color-primary) 252deg, var(--color-primary-container) 268deg, transparent 288deg)',
              }}
            />
          </div>
        ) : null}
        <div
          className={`relative z-[1] flex gap-2 sm:gap-2.5 items-start rounded-lg border border-outline-variant/10 bg-surface-container-low py-2 pl-2 pr-2.5 sm:pl-1.5 sm:pr-3 ${
            fetchSuccessRing ? 'motion-safe:m-[2px] motion-safe:rounded-[6px] motion-safe:border-transparent' : ''
          }`}
        >
          <div className="group relative flex aspect-[2/3] w-[5.75rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-outline-variant/20 bg-surface-container-highest sm:w-[6.75rem]">
            {coverSrc ? (
              <img src={coverSrc} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
            ) : (
              <span className="material-symbols-outlined text-on-surface-variant/50">menu_book</span>
            )}
            {typeof onToggleFavorite === 'function' ? (
              <button
                type="button"
                aria-pressed={isFavorite}
                onClick={(e) => {
                  e.stopPropagation();
                  if (guestFavoriteLocked && typeof onGuestFavoriteBlocked === 'function') {
                    onGuestFavoriteBlocked();
                    return;
                  }
                  onToggleFavorite();
                }}
                className={`absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${
                  isFavorite
                    ? 'bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90'
                    : 'border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/50'
                }`}
                data-tooltip={
                  guestFavoriteLocked
                    ? t('guestCredit.favoritePrompt')
                    : isFavorite
                      ? t('mangaInfo.favoriteRemove')
                      : t('mangaInfo.favoriteAdd')
                }
              >
                <span
                  className="material-symbols-outlined block text-[17px] leading-none"
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
            {title ? (
              <h2 className="min-w-0 truncate text-base font-bold leading-tight text-on-surface">{title}</h2>
            ) : null}
            <div className="space-y-1 rounded-md bg-surface-container-highest/40 px-2 py-1.5">
              {sourceLabel ? (
                <div className="flex items-center gap-2 text-[11px] leading-snug">
                  <span className="shrink-0 font-medium text-on-surface-variant">{t('mangaInfo.source')}</span>
                  <span className="min-w-0 truncate text-on-surface">{sourceLabel}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-[11px] leading-snug">
                <span className="shrink-0 font-medium text-on-surface-variant">{t('mangaInfo.chapterCount')}</span>
                <span className="tabular-nums text-on-surface">{chapterCount}</span>
              </div>
              {author ? (
                <div className="flex items-center gap-2 text-[11px] leading-snug">
                  <span className="shrink-0 font-medium text-on-surface-variant">{t('mangaInfo.author')}</span>
                  <span className="min-w-0 truncate text-on-surface">{author}</span>
                </div>
              ) : null}
              {description ? (
                <p className="text-[11px] leading-relaxed text-on-surface-variant/90 line-clamp-5 pt-0.5">
                  {description}
                </p>
              ) : null}
            </div>
            {show_chapter_action_row ? (
              <div className="flex flex-col gap-2">
                {typeof onOpenChaptersPanel === 'function' ? (
                  <button
                    type="button"
                    data-testid="open-drawer-btn"
                    disabled={!chapter_actions_enabled}
                    onClick={() => onOpenChaptersPanel()}
                    data-tooltip={chapter_actions_disabled_title ?? t('chapterList.openDrawer')}
                    aria-label={t('chapterList.openDrawerShort')}
                    className="inline-flex min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-md border border-primary/35 bg-primary/12 px-2 py-1.5 text-center text-xs font-semibold leading-tight text-primary shadow-sm hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                  >
                    <span className="material-symbols-outlined shrink-0 select-none text-[17px] leading-none [line-height:1]">
                      format_list_bulleted
                    </span>
                    <span className="min-w-0 truncate">{t('chapterList.openDrawerShort')}</span>
                  </button>
                ) : null}
                {typeof onEnqueueAllToQueue === 'function' ? (
                  <button
                    type="button"
                    data-testid="enqueue-all-btn"
                    disabled={!chapter_actions_enabled}
                    onClick={() => onEnqueueAllToQueue()}
                    data-tooltip={chapter_actions_disabled_title ?? t('mangaInfo.enqueueAllTitle')}
                    aria-label={t('mangaInfo.enqueueAllShort')}
                    className="inline-flex min-h-[2.25rem] w-full items-center justify-center gap-1.5 rounded-md border border-primary/25 bg-primary px-2 py-1.5 text-center text-xs font-semibold leading-tight text-on-primary shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
                  >
                    <span className="material-symbols-outlined shrink-0 select-none text-[17px] leading-none [line-height:1]">
                      playlist_add
                    </span>
                    <span className="min-w-0 truncate">{t('mangaInfo.enqueueAllShort')}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
