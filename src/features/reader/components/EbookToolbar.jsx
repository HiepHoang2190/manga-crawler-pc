import { useEffect } from 'react';
import { useI18n } from '../../../context/I18nContext';

/**
 * @param {{
 *   title: string,
 *   bookType: 'epub' | 'pdf',
 *   currentIndex: number,
 *   total: number,
 *   prefs: import('../utils/ebookPrefs').ReaderPreferences,
 *   isBookmarked: boolean,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   onSelectIndex: (index: number) => void,
 *   onToggleLayout: () => void,
 *   onToggleBookmark: () => void,
 *   onOpenChapterPanel: () => void,
 *   onOpenBookmarkPanel: () => void,
 *   onOpenSettings: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function EbookToolbar({
  title,
  bookType,
  currentIndex,
  total,
  prefs,
  isBookmarked,
  onPrev,
  onNext,
  onSelectIndex,
  onToggleLayout,
  onToggleBookmark,
  onOpenChapterPanel,
  onOpenBookmarkPanel,
  onOpenSettings,
  onClose,
}) {
  const { t } = useI18n();

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose]);

  const progressKey = bookType === 'epub' ? 'ebook.chapterOf' : 'ebook.pageOf';
  const progressText = t(progressKey, { current: currentIndex + 1, total });

  const isPaginated = prefs.layoutMode === 'paginated';

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-surface border-b border-outline-variant/20 shrink-0 min-w-0">
      {/* Title */}
      <span
        className="text-sm font-medium text-on-surface truncate min-w-0 flex-1 mr-2"
        data-tooltip={title}
      >
        {title}
      </span>

      {/* Progress indicator */}
      <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0 mr-1">
        {progressText}
      </span>

      {/* Chapter/page selector dropdown */}
      {total > 0 && (
        <select
          value={currentIndex}
          onChange={(e) => onSelectIndex(Number(e.target.value))}
          aria-label={bookType === 'epub' ? t('ebook.openChapterPanel') : t('ebook.pagesPanelTitle')}
          className="text-xs bg-surface-variant text-on-surface-variant rounded px-1 py-0.5 border border-outline-variant/30 shrink-0 max-w-[80px]"
        >
          {Array.from({ length: total }, (_, i) => (
            <option key={i} value={i}>
              {i + 1}
            </option>
          ))}
        </select>
      )}

      {/* Prev button */}
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        aria-label={t('ebook.prev')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        chevron_left
      </button>

      {/* Next button */}
      <button
        type="button"
        onClick={onNext}
        disabled={currentIndex === total - 1}
        aria-label={t('ebook.next')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        chevron_right
      </button>

      {/* Layout mode toggle */}
      <button
        type="button"
        onClick={onToggleLayout}
        aria-label={isPaginated ? t('ebook.toggleLayoutScroll') : t('ebook.toggleLayoutPaginated')}
        data-tooltip={isPaginated ? t('ebook.toggleLayoutScroll') : t('ebook.toggleLayoutPaginated')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
      >
        {isPaginated ? 'menu_book' : 'view_agenda'}
      </button>

      {/* Bookmark toggle */}
      <button
        type="button"
        onClick={onToggleBookmark}
        aria-label={isBookmarked ? t('ebook.removeBookmark') : t('ebook.addBookmark')}
        data-tooltip={isBookmarked ? t('ebook.removeBookmark') : t('ebook.addBookmark')}
        className={[
          'material-symbols-outlined text-[22px] transition-colors shrink-0',
          isBookmarked
            ? 'text-primary'
            : 'text-on-surface-variant hover:text-on-surface',
        ].join(' ')}
        style={isBookmarked ? { fontVariationSettings: "'FILL' 1" } : {}}
      >
        bookmark
      </button>

      {/* Chapter panel button */}
      <button
        type="button"
        onClick={onOpenChapterPanel}
        aria-label={t('ebook.openChapterPanel')}
        data-tooltip={t('ebook.openChapterPanel')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
      >
        toc
      </button>

      {/* Bookmark panel button */}
      <button
        type="button"
        onClick={onOpenBookmarkPanel}
        aria-label={t('ebook.openBookmarkPanel')}
        data-tooltip={t('ebook.openBookmarkPanel')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
      >
        bookmarks
      </button>

      {/* Settings button */}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label={t('ebook.openSettings')}
        data-tooltip={t('ebook.openSettings')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
      >
        settings
      </button>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('ebook.close')}
        data-tooltip={t('ebook.close')}
        className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
      >
        close
      </button>
    </div>
  );
}
