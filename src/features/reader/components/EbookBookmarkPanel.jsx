import { useI18n } from '../../../context/I18nContext';

/**
 * Format a timestamp into a locale date+time string.
 * @param {number} ts
 * @returns {string}
 */
function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/**
 * @param {{
 *   bookmarks: Array<{ id: string, index: number, createdAt: number }>,
 *   currentIndex: number,
 *   onNavigate: (index: number) => void,
 *   onDelete: (bookmarkId: string) => void,
 *   onClose: () => void,
 * }} props
 */
export default function EbookBookmarkPanel({ bookmarks, currentIndex, onNavigate, onDelete, onClose }) {
  const { t } = useI18n();

  return (
    /* Overlay backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full sm:w-96 max-h-[80dvh] rounded-t-2xl sm:rounded-2xl bg-surface text-on-surface shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 shrink-0">
          <h2 className="text-base font-semibold">{t('ebook.bookmarkPanelTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ebook.close')}
            className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {bookmarks.length === 0 ? (
            <p className="px-5 py-8 text-sm text-on-surface-variant text-center">
              {t('ebook.noBookmarks')}
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/15">
              {bookmarks.map((bm) => {
                const isActive = bm.index === currentIndex;
                return (
                  <li
                    key={bm.id}
                    className={[
                      'flex items-center gap-3 px-5 py-3 group',
                      isActive ? 'bg-primary/10' : 'hover:bg-surface-variant/40',
                    ].join(' ')}
                  >
                    {/* Navigate on row click */}
                    <button
                      type="button"
                      onClick={() => onNavigate(bm.index)}
                      className="flex-1 text-left min-w-0"
                    >
                      <span className={['text-sm font-medium block', isActive ? 'text-primary' : 'text-on-surface'].join(' ')}>
                        #{bm.index + 1}
                      </span>
                      <span className="text-xs text-on-surface-variant block truncate">
                        {formatTimestamp(bm.createdAt)}
                      </span>
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(bm.id); }}
                      aria-label={t('ebook.deleteBookmark')}
                      className="shrink-0 text-xs text-on-surface-variant hover:text-error transition-colors px-2 py-1 rounded"
                    >
                      {t('ebook.deleteBookmark')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
