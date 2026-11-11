import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { ChapterList, MangadexCoversList } from '../../download';

export default function ChaptersDrawer({
  open,
  onClose,
  /** Overrides default «Chương có sẵn» title when viewing a manga from Latest updates, etc. */
  drawerHeading = null,
  /** Khi `chapters` rỗng — ghi đè copy mặc định «chưa fetch» (vd. đã fetch nhưng 0 chương). */
  emptyListMessage,
  coverUrl = '',
  description = '',
  chapters,
  queue = [],
  currentMangaUrl = '',
  selectedUrls,
  setSelectedUrls,
  onToggleChapter,
  onSelectAll,
  onUnselectAll,
  onAddSelectedToQueue,
  onReadChapter,
  onReadChapterOnline,
  readOnlineEnabled = true,
  readChapterAllowedUrls,
  /** MangaDex specific props */
  manga,
  onCoverChange,
  onAddCoversToQueue,
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelId = useId();
  const panelRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const [drawerWidth, setDrawerWidth] = useState(560); // 35rem = 560px
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState('chapters');

  // Check if this is MangaDex manga
  const isMangadex = manga?.siteId === 'mangadex';
  
  // Reset to chapters tab when drawer opens
  useEffect(() => {
    if (open) {
      setActiveTab('chapters');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timeoutId = window.setTimeout(() => panelRef.current?.focus?.(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  // Resize handler
  useEffect(() => {
    if (!isResizing) return undefined;

    const handleMouseMove = (e) => {
      const newWidth = Math.max(320, Math.min(e.clientX, window.innerWidth * 0.8));
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (!open) return null;
  /** Portal escapes main content stacking (`z-0`) so drawer is not clipped under `<header className="z-50">`. */
  const body = typeof document !== 'undefined' ? document.body : null;
  if (!body) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex justify-start"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/50 cursor-default"
        aria-label={t('chapterList.closeDrawer')}
        onClick={onClose}
      />
      <div
        id={panelId}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ width: `${drawerWidth}px` }}
        className="relative z-10 flex h-full flex-col bg-surface shadow-2xl border-r border-outline-variant/20 outline-none min-h-0"
      >
        {/* Resize handle */}
        <div
          ref={resizeHandleRef}
          onMouseDown={() => setIsResizing(true)}
          className={`absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/30 transition-colors ${isResizing ? 'bg-primary/50' : ''}`}
          style={{ zIndex: 30 }}
        />
        <div className="flex shrink-0 items-center border-b border-outline-variant/15 px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 text-sm font-bold text-on-surface truncate">
            {drawerHeading ?? t('chapterList.drawerTitle')}
          </h2>
        </div>

        {/* Tabs - Only show if MangaDex */}
        {isMangadex && (
          <div className="flex shrink-0 border-b border-outline-variant/15 bg-surface-container-low/30">
            <button
              type="button"
              data-testid="drawer-chapters-tab"
              onClick={() => setActiveTab('chapters')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'chapters'
                  ? 'text-primary bg-primary/8'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/40'
              }`}
            >
              {t('chapterList.chaptersTab', 'Danh sách chương')}
              {activeTab === 'chapters' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              type="button"
              data-testid="drawer-covers-tab"
              onClick={() => setActiveTab('covers')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'covers'
                  ? 'text-primary bg-primary/8'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/40'
              }`}
            >
              {t('chapterList.coversTab', 'Ảnh bìa')}
              {activeTab === 'covers' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>
        )}

        {(coverUrl || description || manga?.author || manga?.rating != null || manga?.genres?.length || manga?.altTitles?.length) && activeTab === 'chapters' ? (
          <div className="flex shrink-0 gap-4 border-b border-outline-variant/15 px-4 py-4">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="w-24 rounded-md object-cover shrink-0 bg-surface-variant self-start"
                style={{ aspectRatio: '2/3' }}
              />
            ) : null}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {(manga?.author || manga?.rating != null) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {manga?.author ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-medium text-on-surface-variant/70 shrink-0">{t('mangaInfo.author')}</span>
                      <span className="text-on-surface font-semibold truncate">{manga.author}</span>
                    </div>
                  ) : null}
                  {manga?.rating != null ? (
                    <div className="flex items-center gap-1 font-semibold text-amber-400 shrink-0">
                      <span
                        className="material-symbols-outlined text-[14px] leading-none text-amber-400"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        star
                      </span>
                      <span>{typeof manga.rating === 'number' ? manga.rating.toFixed(2) : manga.rating}</span>
                      <span className="text-[10px] text-on-surface-variant font-normal">/ 10</span>
                    </div>
                  ) : null}
                </div>
              )}

              {manga?.altTitles?.length ? (
                <div className="text-[11px] text-on-surface-variant/80 line-clamp-2">
                  <span className="font-medium text-on-surface-variant/60">{t('mangaInfo.altTitles')} </span>
                  <span>{Array.isArray(manga.altTitles) ? manga.altTitles.slice(0, 3).join(' • ') : manga.altTitles}</span>
                </div>
              ) : null}

              {manga?.genres?.length ? (
                <div className="flex flex-wrap gap-1 py-0.5">
                  {(Array.isArray(manga.genres) ? manga.genres : [manga.genres]).slice(0, 6).map((g, idx) => (
                    <span
                      key={idx}
                      className="inline-block rounded bg-surface-container-highest px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}

              {description ? (
                <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-4 pt-0.5">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab === 'chapters' && (
            <ChapterList
              showSectionTitle={false}
              emptyListMessage={emptyListMessage}
              chapters={chapters}
              queue={queue}
              currentMangaUrl={currentMangaUrl}
              selectedUrls={selectedUrls}
              setSelectedUrls={setSelectedUrls}
              onToggleChapter={onToggleChapter}
              onSelectAll={onSelectAll}
              onUnselectAll={onUnselectAll}
              onAddSelectedToQueue={onAddSelectedToQueue}
              onReadChapter={onReadChapter}
              onReadChapterOnline={onReadChapterOnline}
              readOnlineEnabled={readOnlineEnabled}
              readChapterAllowedUrls={readChapterAllowedUrls}
            />
          )}
          {activeTab === 'covers' && isMangadex && (
            <MangadexCoversList
              manga={manga}
              currentCoverUrl={coverUrl}
              onCoverSelect={(cover) => {
                if (onCoverChange) {
                  onCoverChange(cover);
                  setActiveTab('chapters'); // Switch back to chapters after selecting
                }
              }}
              onAddToQueue={(covers) => {
                if (onAddCoversToQueue) {
                  onAddCoversToQueue(covers);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>,
    body,
  );
}
